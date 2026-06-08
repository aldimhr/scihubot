const { sciHub, getMetaDOI, downloadQueue, cache } = require('../utils/index.js');
const { isPDF } = require('../utils/isPDF.js');
const { recordDownload } = require('../utils/dataStore.js');
const { fetchMeta, formatCard, buildKeyboard } = require('../utils/paperMeta.js');
const { getFileSize, sizeStatus } = require('../utils/pdfSize.js');
const { sendPDF } = require('../utils/sendPDF.js');
const { buildCaption } = require('../utils/caption.js');
const { parseDoisFromEntities } = require('../utils/parseDoi.js');
const { downloadFromAnySource, buildNotFoundKeyboard } = require('../utils/unifiedDownload.js');
const batchDownload = require('./batchDownload.js');
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
 * Full download pipeline: extract DOI → check cache → unified parallel download → cache.
 * @param {Function} progress - async (text) => void, updates the progress message
 */
const downloadPipeline = async ({ url, progress }) => {
  let doi = null;

  if (url.includes('doi.org')) {
    // Direct DOI link
    const doiMatch = url.match(/doi\.org\/(.+)/);
    if (doiMatch) doi = doiMatch[1].replace(/\/+$/, '');

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
  }

  // Check cache
  if (doi) {
    const cached = await cache.get(doi);
    if (cached) {
      await progress('💾 Found in cache! Sending instantly...');
      return { data: cached, citation: null, source: 'cache', error: false };
    }
  }

  // Unified parallel download (Sci-Hub + Unpaywall + CrossRef + Preprints)
  const doiURL = doi ? `https://doi.org/${doi}` : url;
  return downloadFromAnySource(doiURL, doi || '', '', async (text) => {
    await progress(text);
  });
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

    // Multiple links? Try batch DOI download
    if (entities.length > 1) {
      const dois = parseDoisFromEntities(entities, text);
      if (dois.length > 1) {
        console.log(`[LINK] Batch mode: ${dois.length} DOIs`);
        return batchDownload(ctx, dois, chatId, messageId);
      }
      // Not all doi.org — can't batch publisher URLs yet
      if (dois.length === 0) {
        return ctx.reply('Multiple links detected. Please send DOI links (doi.org) one by one, or use:\n\n`10.xxx/yyy, 10.zzz/aaa`\n\nfor batch mode.', {
          reply_to_message_id: messageId,
          parse_mode: 'Markdown',
        });
      }
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

      // Show smart redirect buttons with context-aware message
      const keyboard = buildNotFoundKeyboard(doi || text, '', result.landingPages || []);
      const headline = result.sciHubNotFound
        ? '❌ *Paper not available*\n\nThis paper is not in Sci-Hub\'s database and no free PDF was found online.'
        : '❌ *PDF not available*\n\nCouldn\'t find a free PDF for this paper.';
      return ctx.reply(
        headline + '\n\nTry one of these:',
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
          reply_to_message_id: messageId,
          disable_web_page_preview: true,
        }
      );
    }

    console.log('[LINK] Sending PDF document...');
    const filename = text.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50) + '.pdf';

    const source = result.source || 'unknown';
    recordDownload({ userId: ctx.message?.from?.id, doi: text, success: true, source });

    const sourceLabel = (result.source && result.source !== 'Sci-Hub' && result.source !== 'cache') ? ` via ${result.source}` : '';
    const caption = buildCaption(result.citation, { cached: false }) + sourceLabel;
    await sendPDF(ctx, messageId, result.data, filename, caption, 'LINK');
    console.log('[LINK] PDF sent successfully');
  } catch (err) {
    console.error('[LINK] Unhandled error:', err.message);
    errorHandler({ err, name: 'bot.entity()' });
  }
};
