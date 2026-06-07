/**
 * Batch Download — process multiple DOIs in a single message.
 *
 * Flow:
 *   1. Parse all DOIs from message
 *   2. Send summary card with count
 *   3. Queue each DOI through download pipeline (Sci-Hub → fallback chain)
 *   4. Send each PDF as it completes with "1/N" progress
 *   5. Final summary: successes + failures
 */

const { sciHub, downloadFile, downloadQueue, cache } = require('../utils/index.js');
const { recordDownload } = require('../utils/dataStore.js');
const { buildCaption } = require('../utils/caption.js');
const { sendPDF } = require('../utils/sendPDF.js');
const { formatSize } = require('../utils/pdfSize.js');
const { fallbackChain } = require('../utils/fallbackChain.js');
const { fetchMeta } = require('../utils/paperMeta.js');
const ProgressMessage = require('../utils/progress.js');

const MAX_BATCH = 10;

/**
 * Process a batch of DOIs.
 * @param {Object} ctx - Telegraf context
 * @param {string[]} dois - List of DOIs to download
 * @param {number} chatId
 * @param {number} replyToMsgId - Message to reply to
 */
async function batchDownload(ctx, dois, chatId, replyToMsgId) {
  if (dois.length === 0) return;

  // Cap batch size
  if (dois.length > MAX_BATCH) {
    return ctx.reply(
      `⚠️ Max ${MAX_BATCH} DOIs per batch. You sent ${dois.length}.\n\nPlease split into smaller batches.`,
      { reply_to_message_id: replyToMsgId }
    );
  }

  const total = dois.length;
  const results = { success: [], failed: [] };

  // Summary message
  const progress = new ProgressMessage(ctx, chatId, replyToMsgId);
  await progress.update(`📥 *Batch download*\nFound ${total} DOIs. Starting...`);

  for (let i = 0; i < total; i++) {
    const doi = dois[i];
    const num = i + 1;

    try {
      // Check cache
      const cached = await cache.get(doi);
      if (cached) {
        await progress.update(`💾 ${num}/${total} — Cached! Sending ${doi}...`);
        const filename = doi.replace(/\//g, '_') + '.pdf';
        await sendPDF(ctx, replyToMsgId, cached, filename, `📦 ${num}/${total} (cached)`, 'BATCH');
        results.success.push({ doi, cached: true, source: 'cache' });
        continue;
      }

      // Fetch title for fallback search
      let paperTitle = '';
      const { meta } = await fetchMeta(doi);
      if (meta?.title) paperTitle = meta.title;

      // ── Step 1: Try Sci-Hub ──
      await progress.update(`🔍 ${num}/${total} — Searching Sci-Hub for ${doi}...`);
      const doiURL = `http://doi.org/${doi}`;
      const { data: scihubUrl, citation, error: scihubError } = await sciHub(doiURL);

      if (!scihubError && scihubUrl) {
        await progress.update(`📄 ${num}/${total} — Downloading from Sci-Hub...`);
        const { data: fileData, error: dlError } = await downloadFile(scihubUrl);

        if (!dlError && fileData) {
          await cache.set(doi, fileData);
          await progress.update(`✅ ${num}/${total} — Sending ${formatSize(fileData.length)}...`);
          const filename = doi.replace(/\//g, '_') + '.pdf';
          const caption = buildCaption(citation, { cached: false });
          await sendPDF(ctx, replyToMsgId, fileData, filename, caption, 'BATCH');
          results.success.push({ doi, source: 'Sci-Hub' });
          recordDownload({ userId: chatId, doi, success: true });
          continue;
        }
      }

      // ── Step 2: Sci-Hub failed — run fallback chain ──
      await progress.update(`🔄 ${num}/${total} — Trying free sources for ${doi}...`);
      const fallbackResult = await fallbackChain(doi, paperTitle);

      if (fallbackResult.data) {
        await cache.set(doi, fallbackResult.data);
        await progress.update(`✅ ${num}/${total} — Found via ${fallbackResult.source}! Sending...`);
        const filename = doi.replace(/\//g, '_') + '.pdf';
        const caption = buildCaption(citation, { cached: false }) + ` via ${fallbackResult.source}`;
        await sendPDF(ctx, replyToMsgId, fallbackResult.data, filename, caption, 'BATCH');
        results.success.push({ doi, source: fallbackResult.source });
        recordDownload({ userId: chatId, doi, success: true, source: fallbackResult.source });
        continue;
      }

      // ── All sources failed ──
      results.failed.push({ doi, reason: 'Not found in any source' });
      recordDownload({ userId: chatId, doi, success: false, error: 'not-found-all-sources' });

    } catch (err) {
      console.error(`[BATCH] Error on ${doi}:`, err.message);
      results.failed.push({ doi, reason: err.message });
      recordDownload({ userId: chatId, doi, success: false, error: err.message });
    }
  }

  // Final summary
  await progress.done();

  const lines = [`📊 *Batch complete*`];
  lines.push(`✅ ${results.success.length}/${total} downloaded`);

  if (results.failed.length > 0) {
    lines.push(`❌ ${results.failed.length} failed:`);
    for (const f of results.failed) {
      lines.push(`  • \`${f.doi}\` — ${f.reason}`);
    }
  }

  await ctx.reply(lines.join('\n'), {
    parse_mode: 'Markdown',
    reply_to_message_id: replyToMsgId,
    disable_web_page_preview: true,
  });
}

module.exports = batchDownload;
