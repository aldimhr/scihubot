const { sciHub, downloadFile, downloadQueue, cache } = require('../utils/index.js');
const { recordDownload } = require('../utils/dataStore.js');
const { buildCaption } = require('../utils/caption.js');
const { sendPDF } = require('../utils/sendPDF.js');

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

  // Download through queue
  const result = await downloadQueue.enqueue(
    async () => {
      await editProgress('🔍 Searching Sci-Hub...');
      const doiURL = `https://doi.org/${doi}`;
      const { data: scihubData, citation: cit, error: scihubError } = await sciHub(doiURL);
      if (scihubError) return { data: null, citation: null, error: scihubError };

      await editProgress('📄 Found! Downloading PDF...');
      const { data: fileData, error: dlError } = await downloadFile(scihubData);
      if (dlError) return { data: null, citation: null, error: dlError };

      await editProgress(`✅ Downloaded ${formatSize(fileData.length)}. Sending...`);
      await cache.set(doi, fileData);
      return { data: fileData, citation: cit, error: false };
    },
    async (position, total) => {
      await editProgress(`⏳ Queue position #${position}...`);
    }
  );

  if (result.error || !result.data) {
    console.log('[DL-CB] Error:', result.error);
    recordDownload({ userId, doi, success: false, error: result.error });
    await editProgress(`❌ Download failed.\n\nSci-Hub doesn't have this paper.\n\n\`${doi}\``);
    return;
  }

  // Send PDF (with split handling for large files)
  const filename = doi.replace(/\//g, '_') + '.pdf';
  recordDownload({ userId, doi, success: true, cached: false });

  await sendPDF(ctx, messageId, result.data, filename, buildCaption(result.citation || `📄 ${doi}`), 'DL-CB');

  // Restore info card
  await restoreInfoCard(ctx, chatId, messageId, doi);
};

/**
 * Restore the info card after sending the PDF.
 */
async function restoreInfoCard(ctx, chatId, messageId, doi) {
  const { fetchMeta, formatCard, buildKeyboard } = require('../utils/paperMeta.js');
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
