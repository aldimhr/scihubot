const { sciHub, getMetaDOI, downloadFile, citation, errorHandler, downloadQueue, cache } = require('../utils/index.js');
const { isPDF } = require('../utils/isPDF.js');
const { recordDownload } = require('../utils/dataStore.js');
const { fetchMeta, formatCard, buildKeyboard } = require('../utils/paperMeta.js');
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

    const sizeHint = data ? '' : '';
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
      const { meta, error } = await fetchMeta(doi);
      if (meta) {
        const card = formatCard(meta);
        const keyboard = buildKeyboard(doi);
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

    ctx.replyWithDocument(
      { source: result.data, filename },
      {
        caption: result.citation || (result.cached ? '💾 From cache' : ''),
        reply_to_message_id: messageId,
      }
    ).then(() => console.log('[LINK] PDF sent successfully'))
     .catch(e => console.error('[LINK] Failed to send PDF:', e.message));
  } catch (err) {
    console.error('[LINK] Unhandled error:', err.message);
    errorHandler({ err, name: 'bot.entity()' });
  }
};
