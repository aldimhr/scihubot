const { sciHub, downloadFile, citation, downloadQueue, cache } = require('../utils/index.js');
const { recordDownload } = require('../utils/dataStore.js');
const { fetchMeta, formatCard, buildKeyboard } = require('../utils/paperMeta.js');
const { getFileSize, sizeStatus, formatSize, TELEGRAM_MAX_FILE } = require('../utils/pdfSize.js');
const { splitPDF } = require('../utils/pdfSplitter.js');
const { buildCaption } = require('../utils/caption.js');
const ProgressMessage = require('../utils/progress.js');

/**
 * Send PDF to user, splitting if it exceeds Telegram's limit.
 */
const sendPDF = async (ctx, messageId, fileData, filename, caption) => {
  if (fileData.length <= TELEGRAM_MAX_FILE) {
    return ctx.replyWithDocument(
      { source: fileData, filename },
      { caption, reply_to_message_id: messageId }
    ).catch(e => console.error('[TEXT] Failed to send PDF:', e.message));
  }

  // File too large — try splitting
  console.log(`[TEXT] File too large (${formatSize(fileData.length)}), attempting split...`);
  const baseName = filename.replace('.pdf', '');
  const { parts, error } = await splitPDF(fileData, baseName);

  if (error || parts.length === 0) {
    return ctx.reply(
      `⚠️ PDF is ${formatSize(fileData.length)} — too large for Telegram (max 50 MB) and couldn't split it.\n\nTry downloading directly from the DOI link.`,
      { reply_to_message_id: messageId }
    ).catch(() => {});
  }

  // Send each part
  await ctx.reply(
    `📦 PDF split into ${parts.length} parts (${formatSize(fileData.length)} total)`,
    { reply_to_message_id: messageId }
  ).catch(() => {});

  for (const part of parts) {
    await ctx.replyWithDocument(
      { source: part.data, filename: part.filename },
      {
        caption: `📄 Part ${part.index}/${parts.length} (pages ${part.pages})`,
        reply_to_message_id: messageId,
      }
    ).catch(e => console.error(`[TEXT] Failed to send part ${part.index}:`, e.message));
  }
};

module.exports = async (ctx) => {
  const message = ctx.message;
  const chat_id = message.chat.id;
  let text = message.text;

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
    return ctx.reply(card, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
      disable_web_page_preview: true,
    });
  }

  // Fallback: no metadata — direct download (original behavior)

  // Create progress message
  const progress = new ProgressMessage(ctx, chat_id, message.message_id);
  await progress.update('🕵️ Starting download...');

  // Run download through queue
  const result = await downloadQueue.enqueue(
    async () => {
      // Check cache first
      const cached = cache.get(normalizedDOI);
      if (cached) {
        await progress.update('💾 Found in cache! Sending instantly...');
        return { data: cached, citation: null, error: false, cached: true };
      }

      await progress.update('🔍 Searching Sci-Hub for your paper...');
      const { data: scihubData, citation: scihubCitation, error: scihubError } = await sciHub(doiURL);
      if (scihubError) return { data: null, citation: null, error: scihubError };

      await progress.update('📄 Found! Downloading PDF...');
      const dFile = await downloadFile(scihubData);
      if (dFile.error) return { data: null, citation: null, error: dFile.error };

      await progress.update(`✅ Downloaded ${formatSize(dFile.data.length)}. Sending...`);

      // Cache it
      cache.set(normalizedDOI, dFile.data);

      return { data: dFile.data, citation: scihubCitation, error: false };
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
    return ctx.reply("Unfortunately, Sci-Hub doesn't have the requested document :-(", {
      reply_to_message_id: message.message_id,
    });
  }

  console.log('[TEXT] Sending PDF document...');
  recordDownload({ userId: message.from?.id, doi: normalizedDOI, success: true, cached: result.cached });

  const filename = `${normalizedDOI.replace(/\//g, '_')}.pdf`;
  const caption = buildCaption(result.citation, { cached: result.cached });
  await sendPDF(ctx, message.message_id, result.data, filename, caption);
};
