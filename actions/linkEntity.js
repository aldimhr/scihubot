const { sciHub, getMetaDOI, downloadFile, citation, errorHandler, downloadQueue, cache } = require('../utils/index.js');
const { responseMessages } = require('../utils/constans.js');
const { isPDF } = require('../utils/isPDF.js');
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
 * Runs inside the download queue.
 */
const downloadPipeline = async ({ url }) => {
  let doi = null;
  let pdfUrl = null;

  if (url.includes('doi.org')) {
    // Direct DOI link — extract DOI for caching
    const doiMatch = url.match(/doi\.org\/(.+)/);
    if (doiMatch) doi = doiMatch[1].replace(/\/+$/, '');

    const { data, citation: cit, error } = await sciHub(url);
    if (error) return { data: null, citation: null, error };

    pdfUrl = data;
    // Verify download
    const { data: fileData, error: dlError } = await downloadFile(pdfUrl);
    if (dlError) return { data: null, citation: null, error: dlError };

    // Cache by DOI
    if (doi) cache.set(doi, fileData);

    return { data: fileData, citation: cit, error: false };
  } else {
    // Publisher URL — extract DOI first
    const { data: metaDOI, error: metaError } = await getMetaDOI(url);
    if (metaError) {
      // Fallback: try direct download
      const { data: responseData, error: responseError } = await checkResponseData(url);
      return { data: responseData, citation: null, error: responseError };
    }

    doi = metaDOI ? metaDOI.replace(/https?:\/\/doi\.org\//, '').replace(/\/+$/, '') : null;

    // Check cache by DOI
    if (doi) {
      const cached = cache.get(doi);
      if (cached) {
        console.log(`[LINK] Cache hit for DOI: ${doi}`);
        return { data: cached, citation: null, error: false, cached: true };
      }
    }

    const { data, citation: cit, error } = await sciHub(metaDOI);
    if (error) return { data: null, citation: null, error };

    const { data: fileData, error: dlError } = await downloadFile(data);
    if (dlError) return { data: null, citation: null, error: dlError };

    // Cache by DOI
    if (doi) cache.set(doi, fileData);

    return { data: fileData, citation: cit, error: false };
  }
};

const checkResponseData = async (url) => {
  try {
    const { data: responseData } = await axios({
      method: 'get',
      url,
      responseType: 'arraybuffer',
      timeout: 30000,
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

    // check if many links in one message
    if (entities.length > 1) {
      return ctx.reply('Please enter the links one by one', {
        reply_to_message_id: messageId,
      });
    }

    // send wait message
    let waitMsg;
    try {
      waitMsg = await ctx.telegram.sendMessage(chatId, responseMessages.wait, {
        reply_to_message_id: messageId,
      });
    } catch (e) {
      console.error('[LINK] Failed to send wait message:', e.message);
    }

    // Run download through queue
    const result = await downloadQueue.enqueue(
      () => downloadPipeline({ url: text }),
      (position, total) => {
        // User got queued — notify them
        console.log(`[LINK] Queued: position ${position}/${total}`);
        if (waitMsg) {
          ctx.telegram.editMessageText(chatId, waitMsg.message_id, undefined,
            `⏳ All download slots busy. You're #${position} in queue...`
          ).catch(() => {});
        }
      }
    );

    // delete wait message
    if (waitMsg) {
      try {
        await ctx.telegram.deleteMessage(chatId, waitMsg.message_id);
      } catch (e) {
        console.error('[LINK] Failed to delete wait msg:', e.message);
      }
    }

    if (result.error || !result.data) {
      console.log('[LINK] Error or no file:', result.error);
      return ctx.reply("Unfortunately, Sci-Hub doesn't have the requested document :-(", {
        reply_to_message_id: messageId,
      });
    }

    console.log('[LINK] Sending PDF document...');
    const filename = text.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50) + '.pdf';

    ctx.replyWithDocument(
      { source: result.data, filename },
      {
        caption: result.citation || (result.cached ? '(cached)' : ''),
        reply_to_message_id: messageId,
      }
    ).then(() => console.log('[LINK] PDF sent successfully'))
     .catch(e => console.error('[LINK] Failed to send PDF:', e.message));
  } catch (err) {
    console.error('[LINK] Unhandled error:', err.message);
    errorHandler({ err, name: 'bot.entity()' });
  }
};
