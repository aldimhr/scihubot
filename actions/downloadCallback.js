const { sciHub, downloadFile, downloadQueue, cache } = require('../utils/index.js');
const { recordDownload } = require('../utils/dataStore.js');
const { buildCaption } = require('../utils/caption.js');
const { sendPDF } = require('../utils/sendPDF.js');
const { formatSize } = require('../utils/pdfSize.js');
const { fallbackChain, buildNotFoundKeyboard } = require('../utils/fallbackChain.js');
const { fetchMeta } = require('../utils/paperMeta.js');

/**
 * Handle "Download PDF" button press from the info card.
 * Callback data format: "dl:<doi>"
 */
module.exports = async (ctx) => {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith('dl:')) return;

  const doi = data.substring(3); // strip "dl:"
  const chatId = ctx.callbackQuery.message?.chat.id;
  const userId = ctx.callbackQuery.from?.id;
  const messageId = ctx.callbackQuery.message?.message_id;

  console.log(`[DL-CB] Download requested for DOI: ${doi} by user ${userId}`);

  // Answer the callback immediately so the button doesn't spin
  await ctx.answerCbQuery('⬇️ Starting download...').catch(() => {});

  // Edit the info card to show download progress
  let progressText = '⬇️ Starting download...';
  const editProgress = async (text) => {
    progressText = text;
    await ctx.telegram.editMessageText(chatId, messageId, null, text, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }).catch(() => {}); // ignore edit failures (message too old, etc.)
  };

  // Check cache first
  const cached = await cache.get(doi);
  if (cached) {
    await editProgress('💾 Found in cache! Sending PDF...');
    const filename = doi.replace(/\//g, '_') + '.pdf';
    recordDownload({ userId, doi, success: true, cached: true });

    await sendPDF(ctx, messageId, cached, filename, buildCaption(`📄 ${doi}`), 'DL-CB');

    // Restore info card
    await restoreInfoCard(ctx, chatId, messageId, doi);
    return;
  }

  // Fetch paper title for fallback search (arXiv title search)
  let paperTitle = '';
  const { meta } = await fetchMeta(doi);
  if (meta?.title) paperTitle = meta.title;

  // Download through queue
  const result = await downloadQueue.enqueue(
    async () => {
      // ── Step 1: Try Sci-Hub ──
      await editProgress('🔍 Searching Sci-Hub...');
      const doiURL = `https://doi.org/${doi}`;
      const { data: scihubData, citation: cit, error: scihubError } = await sciHub(doiURL);

      if (!scihubError && scihubData) {
        await editProgress('📄 Found on Sci-Hub! Downloading PDF...');
        const { data: fileData, error: dlError } = await downloadFile(scihubData);
        if (!dlError && fileData) {
          await editProgress(`✅ Downloaded ${formatSize(fileData.length)}. Sending...`);
          await cache.set(doi, fileData);
          return { data: fileData, citation: cit, source: 'Sci-Hub', error: false };
        }
      }

      // ── Step 2: Sci-Hub failed — run fallback chain ──
      console.log(`[DL-CB] Sci-Hub miss for ${doi}, running fallback chain...`);
      const fallbackResult = await fallbackChain(doi, paperTitle, async (text) => {
        await editProgress(text);
      });

      if (fallbackResult.data) {
        await editProgress(`✅ Downloaded from ${fallbackResult.source}! Sending...`);
        await cache.set(doi, fallbackResult.data);
        return {
          data: fallbackResult.data,
          citation: cit || `📄 ${doi}`,
          source: fallbackResult.source,
          error: false,
        };
      }

      // ── Step 3: All sources failed ──
      return {
        data: null,
        citation: null,
        source: null,
        landingPages: fallbackResult.landingPages || [],
        error: 'Not found in any source',
      };
    },
    async (position, total) => {
      await editProgress(`⏳ Queue position #${position}...`);
    }
  );

  if (result.error || !result.data) {
    console.log('[DL-CB] All sources failed for:', doi);
    recordDownload({ userId, doi, success: false, error: result.error });

    // Build smart redirect keyboard
    const keyboard = buildNotFoundKeyboard(doi, paperTitle, result.landingPages || []);

    await ctx.telegram.editMessageText(chatId, messageId, null,
      `❌ *PDF not available*\n\n` +
      `Couldn't find a free PDF for this paper.\n\n` +
      '🏷️ `' + doi + '`\n\n' +
      `Try one of these:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        disable_web_page_preview: true,
      }
    ).catch(() => {});
    return;
  }

  // Send PDF (with split handling for large files)
  const filename = doi.replace(/\//g, '_') + '.pdf';
  const sourceLabel = result.source === 'Sci-Hub' ? '' : ` via ${result.source}`;
  recordDownload({ userId, doi, success: true, cached: false, source: result.source });

  const caption = buildCaption(result.citation || `📄 ${doi}`) + sourceLabel;
  await sendPDF(ctx, messageId, result.data, filename, caption, 'DL-CB');

  // Restore info card
  await restoreInfoCard(ctx, chatId, messageId, doi);
};

/**
 * Restore the info card after sending the PDF.
 */
async function restoreInfoCard(ctx, chatId, messageId, doi) {
  const { formatCard, buildKeyboard } = require('../utils/paperMeta.js');
  const { meta } = await fetchMeta(doi);
  if (meta) {
    const card = formatCard(meta);
    const keyboard = buildKeyboard(doi);
    await ctx.telegram.editMessageText(chatId, messageId, null, card, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
      disable_web_page_preview: true,
    }).catch(() => {});
  }
}
