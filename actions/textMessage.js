const { sciHub, downloadQueue, cache } = require('../utils/index.js');
const { recordDownload } = require('../utils/dataStore.js');
const { fetchMeta, formatCard, buildKeyboard } = require('../utils/paperMeta.js');
const { getFileSize, sizeStatus, formatSize } = require('../utils/pdfSize.js');
const { sendPDF } = require('../utils/sendPDF.js');
const { buildCaption } = require('../utils/caption.js');
const { parseMultipleDois } = require('../utils/parseDoi.js');
const { isPending, clearPending } = require('../utils/pendingSearch.js');
const { doSearch } = require('./searchCallback.js');
const { downloadFromAnySource, buildNotFoundKeyboard } = require('../utils/unifiedDownload.js');
const batchDownload = require('./batchDownload.js');
const ProgressMessage = require('../utils/progress.js');

module.exports = async (ctx) => {
  const message = ctx.message;
  const chat_id = message.chat.id;
  let text = message.text;

  // If user is in pending search mode (tapped "Search Document" button),
  // treat their message as keyword search input
  if (isPending(chat_id)) {
    clearPending(chat_id);
    const query = text.trim().replace(/\s\s+/g, ' ');
    if (query.length < 3) {
      return ctx.reply('🔍 Please enter at least 3 characters to search.').catch(() => {});
    }
    return doSearch(ctx, query);
  }

  // Check for multiple DOIs (batch mode)
  // Only if text has separators suggesting multiple DOIs
  const hasSeparators = text.includes(',') || text.includes('\n');
  if (hasSeparators) {
    const dois = parseMultipleDois(text);
    if (dois.length > 1) {
      console.log(`[TEXT] Batch mode: ${dois.length} DOIs`);
      return batchDownload(ctx, dois, chat_id, message.message_id);
    }
  }

  let doi;
  if (text.toLowerCase().includes('doi:')) {
    doi = text.toLowerCase().split('doi:').join('').trim();
  } else if (text.split(' ').length === 2 && text.split(' ')[0].toLowerCase().includes('doi')) {
    doi = text.toLowerCase().split('doi').join('').trim();
  } else if (text.includes('/') && text.includes('.') && text.split(' ').length === 1) {
    if (text[0] === '/') text = text.substring(1);
    doi = text;
  }

  if (!doi || doi.length <= 20 || doi.split(' ').length !== 1) {
    return ctx.reply(
      'Please drop a DOI or Publisher URL below. Use /help for examples.',
      { disable_web_page_preview: true }
    );
  }

  // Normalize DOI
  const normalizedDOI = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/\/+$/, '');
  const doiURL = `http://doi.org/${normalizedDOI}`;

  // Show loading indicator immediately
  const loadingMsg = await ctx.reply('🔍 Searching...').catch(() => null);

  // Try to show info card first
  const { meta } = await fetchMeta(normalizedDOI);
  if (meta) {
    // Pre-check file size via Sci-Hub
    let sizeInfo = null;
    try {
      const { data: scihubUrl } = await sciHub(doiURL);
      if (scihubUrl) {
        const { size } = await getFileSize(scihubUrl);
        sizeInfo = sizeStatus(size);
      }
    } catch (e) {
      // Non-fatal — show card without size
      console.log('[TEXT] Size pre-check failed:', e.message);
    }

    const card = formatCard(meta, sizeInfo);
    const keyboard = buildKeyboard(normalizedDOI, sizeInfo?.tooLarge || false);

    // Replace loading message with info card
    if (loadingMsg) {
      await ctx.telegram.editMessageText(chat_id, loadingMsg.message_id, null, card, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        disable_web_page_preview: true,
      }).catch(() => ctx.reply(card, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        disable_web_page_preview: true,
      }));
    } else {
      await ctx.reply(card, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        disable_web_page_preview: true,
      });
    }
    return;
  }

  // Fallback: no metadata — download using unified parallel approach

  // Reuse loading message or create progress message
  const progress = loadingMsg
    ? new ProgressMessage(ctx, chat_id, message.message_id, loadingMsg.message_id)
    : new ProgressMessage(ctx, chat_id, message.message_id);
  await progress.update('🕵️ Starting download...');

  // Run download through queue
  const result = await downloadQueue.enqueue(
    async () => {
      // Check cache first
      const cached = await cache.get(normalizedDOI);
      if (cached) {
        await progress.update('💾 Found in cache! Sending instantly...');
        return { data: cached, citation: null, source: 'cache', error: false };
      }

      return downloadFromAnySource(doiURL, normalizedDOI, '', async (text) => {
        await progress.update(text);
      });
    },
    async (position, total) => {
      console.log(`[TEXT] Queued: position ${position}/${total}`);
      await progress.update(`⏳ All download slots busy. You're #${position} in queue...`);
    }
  );

  // Delete progress message
  await progress.done();

  if (result.error || !result.data) {
    console.log('[TEXT] Error:', result.error);
    recordDownload({ userId: message.from?.id, doi: normalizedDOI, success: false, error: result.error });

    // Show smart redirect buttons with context-aware message
    const keyboard = buildNotFoundKeyboard(normalizedDOI, '', result.landingPages || []);
    const headline = result.sciHubNotFound
      ? '❌ *Paper not available*\n\nThis paper is not in Sci-Hub\'s database and no free PDF was found online.'
      : '❌ *PDF not available*\n\nCouldn\'t find a free PDF for this paper.';
    return ctx.reply(
      headline + '\n\n🏷️ `' + normalizedDOI + '`\n\nTry one of these:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        reply_to_message_id: message.message_id,
        disable_web_page_preview: true,
      }
    );
  }

  console.log('[TEXT] Sending PDF document...');
  const source = result.source || 'unknown';
  recordDownload({ userId: message.from?.id, doi: normalizedDOI, success: true, cached: false, source });

  const filename = `${normalizedDOI.replace(/\//g, '_')}.pdf`;
  const sourceLabel = source === 'Sci-Hub' || source === 'cache' ? '' : ` via ${source}`;
  const caption = buildCaption(result.citation, { cached: false }) + sourceLabel;
  await sendPDF(ctx, message.message_id, result.data, filename, caption, 'TEXT');
};
