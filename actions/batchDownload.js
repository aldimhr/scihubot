/**
 * Batch Download — process multiple DOIs in a single message.
 *
 * Flow:
 *   1. Parse all DOIs from message
 *   2. Send summary card with count
 *   3. Queue each DOI through download pipeline
 *   4. Send each PDF as it completes with "1/N" progress
 *   5. Final summary: successes + failures
 */

const { sciHub, downloadFile, downloadQueue, cache } = require('../utils/index.js');
const { recordDownload } = require('../utils/dataStore.js');
const { buildCaption } = require('../utils/caption.js');
const { sendPDF, formatSize } = require('../utils/sendPDF.js');
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
        results.success.push({ doi, cached: true });
        continue;
      }

      // Sci-Hub lookup
      await progress.update(`🔍 ${num}/${total} — Searching ${doi}...`);
      const doiURL = `http://doi.org/${doi}`;
      const { data: scihubUrl, citation, error: scihubError } = await sciHub(doiURL);

      if (scihubError || !scihubUrl) {
        results.failed.push({ doi, reason: 'Not found on Sci-Hub' });
        continue;
      }

      // Download
      await progress.update(`📄 ${num}/${total} — Downloading ${doi}...`);
      const { data: fileData, error: dlError } = await downloadFile(scihubUrl);

      if (dlError || !fileData) {
        results.failed.push({ doi, reason: 'Download failed' });
        continue;
      }

      // Cache
      await cache.set(doi, fileData);

      // Send
      await progress.update(`✅ ${num}/${total} — Sending ${formatSize(fileData.length)}...`);
      const filename = doi.replace(/\//g, '_') + '.pdf';
      const caption = buildCaption(citation, { cached: false });
      await sendPDF(ctx, replyToMsgId, fileData, filename, caption, 'BATCH');

      results.success.push({ doi });
      recordDownload({ userId: chatId, doi, success: true });

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
