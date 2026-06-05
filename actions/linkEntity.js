const { sciHub, getMetaDOI, downloadFile, citation, errorHandler, downloadQueue, cache } = require('../utils/index.js');
const { isPDF } = require('../utils/isPDF.js');
const { recordDownload } = require('../utils/dataStore.js');
const { fetchMeta, formatCard, buildKeyboard } = require('../utils/paperMeta.js');
const { getFileSize, sizeStatus, formatSize, TELEGRAM_MAX_FILE } = require('../utils/pdfSize.js');
const { splitPDF } = require('../utils/pdfSplitter.js');
const { buildCaption } = require('../utils/caption.js');
const ProgressMessage = require('../utils/progress.js');
const axios = require('axios');

const checkInputText = (text) => {
  if (text.includes('://doi.org/') && text.includes('http')) {
    return text;
  } else if (text.includes('doi.org/') && !text.includes('http')) {
    return `https://${text}`;
  }
  return text;
};

/**
 * Full download pipeline: extract DOI → check cache → Sci-Hub → download → cache.
 * @param {Function} progress - async (text) => void, updates the progress message
 */
const downloadPipeline = async ({ url, progress }) => {
  let doi = null;

  if (url.includes('doi.org')) {
    // Direct DOI link
    const doiMatch = url.match(/doi\.org\/(.+)/);
    if (doiMatch) doi = doiMatch[1].replace(/\/+$/, '');

    await progress('🔍 Searching Sci-Hub for your paper...');
    const { data, citation: cit, error } = await sciHub(url);
    if (error) return { data: null, citation: null, error };

    await progress('📄 Found! Downloading PDF...');
    const { data: fileData, error: dlError } = await downloadFile(data);
    if (dlError) return { data: null, citation: null, error: dlError };

    await progress(`✅ Downloaded ${(fileData.length / 1024 / 1024).toFixed(1)}MB. Sending...`);

    if (doi) cache.set(doi, fileData);
    return { data: fileData, citation: cit, error: false };

  } else {
    // Publisher URL — extract DOI first
    await progress('🔍 Extracting DOI from publisher page...');
    const { data: metaDOI, error: metaError } = await getMetaDOI(url);
    if (metaError) {
      await progress('🔍 Trying direct download...');
      const { data: responseData, error: responseError } = await checkResponseData(url);
      return { data: responseData, citation: null, error: responseError };
    }

    doi = metaDOI ? metaDOI.replace(/https?:\/\/doi\.org\//, '').replace(/\/+$/, '') : null;

    // Check cache
    if (doi) {
      const cached = cache.get(doi);
      if (cached) {
        await progress('💾 Found in cache! Sending instantly...');
        return { data: cached, citation: null, error: false, cached: true };
      }
    }

    await progress('🔍 Searching Sci-Hub for your paper...');
    const { data, citation: cit, error } = await sciHub(metaDOI);
    if (error) return { data: null, citation: null, error };

    await progress('📄 Found! Downloading PDF...');
    const { data: fileData, error: dlError } = await downloadFile(data);
    if (dlError) return { data: null, citation: null, error: dlError };

    await progress(`✅ Downloaded ${(fileData.length / 1024 / 1024).toFixed(1)}MB. Sending...`);

    if (doi) cache.set(doi, fileData);
    return { data: fileData, citation: cit, error: false };
  }
};

const checkResponseData = async (url) => {
  try {
    const { data: responseData } = await axios({
      method: 'get', url, responseType: 'arraybuffer', timeout: 30000,
    });
    if (isPDF(responseData)) return { data: responseData, error: false };
    return { data: null, error: 'response data is not PDF file' };
  } catch (error) {
    return { data: null, error: 'checkResponseData()' };
  }
};

/**
 * Send PDF to user, splitting if it exceeds Telegram's limit.
 */
const sendPDF = async (ctx, messageId, fileData, filename, caption) => {
  if (fileData.length <= TELEGRAM_MAX_FILE) {
    return ctx.replyWithDocument(
      { source: fileData, filename },
      { caption, reply_to_message_id: messageId }
    );
  }

  // File too large — try splitting
  console.log(`[LINK] File too large (${formatSize(fileData.length)}), attempting split...`);
  const baseName = filename.replace('.pdf', '');
  const { parts, error } = await splitPDF(fileData, baseName);

  if (error || parts.length === 0) {
    return ctx.reply(
      `⚠️ PDF is ${formatSize(fileData.length)} — too large for Telegram (max 50 MB) and couldn't split it.\n\nTry downloading directly from the DOI link.`,
      { reply_to_message_id: messageId }
    );
  }

  // Send each part
  await ctx.reply(
    `📦 PDF split into ${parts.length} parts (${formatSize(fileData.length)} total)`,
    { reply_to_message_id: messageId }
  );

  for (const part of parts) {
    await ctx.replyWithDocument(
      { source: part.data, filename: part.filename },
      {
        caption: `📄 Part ${part.index}/${parts.length} (pages ${part.pages})`,
        reply_to_message_id: messageId,
      }
    ).catch(e => console.error(`[LINK] Failed to send part ${part.index}:`, e.message));
  }
};

module.exports = async (ctx) => {
  try {
    const text = checkInputText(ctx.message?.text);
    const chatId = ctx.message?.chat.id;
    const entities = ctx.message?.entities;
    const messageId = ctx.message?.message_id;

    console.log(`[LINK] Received: ${text}`);

    if (entities.length > 1) {
      return ctx.reply('Please enter the links one by one', {
        reply_to_message_id: messageId,
      });
    }

    // Extract DOI
    let doi = null;
    if (text.includes('doi.org')) {
      const doiMatch = text.match(/doi\.org\/(.+)/);
      if (doiMatch) doi = doiMatch[1].replace(/\/+$/, '');
    }

    // If no DOI from URL, try publisher extraction
    if (!doi) {
      const { data: metaDOI } = await getMetaDOI(text);
      if (metaDOI) {
        doi = metaDOI.replace(/https?:\/\/doi\.org\//, '').replace(/\/+$/, '');
      }
    }

    // If we have a DOI, show info card with download button
    if (doi) {
      const { meta } = await fetchMeta(doi);
      if (meta) {
        // Pre-check file size via Sci-Hub
        let sizeInfo = null;
        try {
          const { data: scihubUrl } = await sciHub(`https://doi.org/${doi}`);
          if (scihubUrl) {
            const { size } = await getFileSize(scihubUrl);
            sizeInfo = sizeStatus(size);
          }
        } catch (e) {
          // Non-fatal — show card without size
          console.log('[LINK] Size pre-check failed:', e.message);
        }

        const card = formatCard(meta, sizeInfo);
        const keyboard = buildKeyboard(doi, sizeInfo?.tooLarge || false);
        return ctx.reply(card, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
          reply_to_message_id: messageId,
          disable_web_page_preview: true,
        });
      }
    }

    // Fallback: no DOI or no metadata — direct download (original behavior)
    const progress = new ProgressMessage(ctx, chatId, messageId);
    await progress.update('🕵️ Starting download...');

    const result = await downloadQueue.enqueue(
      () => downloadPipeline({ url: text, progress: (text) => progress.update(text) }),
      async (position, total) => {
        console.log(`[LINK] Queued: position ${position}/${total}`);
        await progress.update(`⏳ All download slots busy. You're #${position} in queue...`);
      }
    );

    await progress.done();

    if (result.error || !result.data) {
      console.log('[LINK] Error or no file:', result.error);
      recordDownload({ userId: ctx.message?.from?.id, doi: text, success: false, error: result.error });
      return ctx.reply("Unfortunately, Sci-Hub doesn't have the requested document :-(", {
        reply_to_message_id: messageId,
      });
    }

    console.log('[LINK] Sending PDF document...');
    const filename = text.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50) + '.pdf';

    recordDownload({ userId: ctx.message?.from?.id, doi: text, success: true, cached: result.cached });

    const caption = buildCaption(result.citation, { cached: result.cached });
    await sendPDF(ctx, messageId, result.data, filename, caption);
    console.log('[LINK] PDF sent successfully');
  } catch (err) {
    console.error('[LINK] Unhandled error:', err.message);
    errorHandler({ err, name: 'bot.entity()' });
  }
};
