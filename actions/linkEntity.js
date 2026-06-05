const { sciHub, getMetaDOI, downloadFile, citation, errorHandler } = require('../utils/index.js');
const { responseMessages, keyboardMessage } = require('../utils/constans.js');
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

const getFileFromScihub = async ({ url }) => {
  try {
    // get file link
    const { data: scihubData, citation: scihubCitation, error: scihubError } = await sciHub(url);
    if (scihubError) return { data: null, citation: null, error: 'scihub()' };

    // download file
    const { data: downloadData, error: downloadError } = await downloadFile(scihubData);
    if (downloadError) return { data: null, citation: null, error: 'downloadFile()' };

    // get citation
    // let { data: citationData } = await citation(url);

    return { data: downloadData, citation: scihubCitation, error: false };
  } catch (error) {
    return { data: null, citation: null, error: 'getFileFromScihub()' };
  }
};

const getFileFromMetaDOI = async ({ url, ctx }) => {
  try {
    // get DOI from meta tag
    const { data: getMetaDOIData, error: getMetaDOIError } = await getMetaDOI(url, ctx);
    if (getMetaDOIError) return { data: null, citation: null, error: 'getMetaDOI()' };

    const { data: scihubData, citation: scihubCitation, error: scihubError } = await getFileFromScihub({ url: getMetaDOIData });
    if (scihubError) return { data: null, citation: null, error: 'getFileFromMetaDOI/getFileFromScihub()' };

    return { data: scihubData, citation: scihubCitation, error: false };
  } catch (error) {
    return { data: null, citation: null, error: 'getFileFromMetaDOI()' };
  }
};

const checkResponseData = async (url) => {
  try {
    const { data: responseData } = await axios({
      method: 'get',
      url: url,
      responseType: 'arraybuffer',
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

    let fileDocument;
    let hasError;
    let citationArticle = '';

    if (text.includes('doi.org')) {
      console.log('[LINK] Processing as doi.org link');
      const { data, citation, error } = await getFileFromScihub({ url: text });
      if (error) hasError = error;

      citationArticle = citation;
      fileDocument = data;
    } else {
      console.log('[LINK] Processing as publisher link (meta DOI)');
      const { data, citation, error: getFileFromMetaDOIError } = await getFileFromMetaDOI({ url: text, ctx });
      citationArticle = citation;
      fileDocument = data;

      if (getFileFromMetaDOIError) {
        let { data: responseData, error: responseError } = await checkResponseData(text);
        if (responseError) hasError = responseError;

        citationArticle = null;
        fileDocument = responseData;
      }
    }

    // delete wait message
    if (waitMsg) {
      try {
        await ctx.telegram.deleteMessage(chatId, waitMsg.message_id);
      } catch (e) {
        console.error('[LINK] Failed to delete wait msg:', e.message);
      }
    }

    if (hasError || !fileDocument) {
      console.log('[LINK] Error or no file:', hasError);
      return ctx.reply("Unfortunately, Sci-Hub doesn't have the requested document :-(", {
        reply_to_message_id: messageId,
      });
    }

    console.log('[LINK] Sending PDF document...');
    // send file to user
    ctx.replyWithDocument(
      {
        source: fileDocument,
        filename: `${text.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)}.pdf`,
      },
      {
        caption: citationArticle || '',
        reply_to_message_id: messageId,
      }
    ).then(() => console.log('[LINK] PDF sent successfully'))
     .catch(e => console.error('[LINK] Failed to send PDF:', e.message));
  } catch (err) {
    console.error('[LINK] Unhandled error:', err.message);
    errorHandler({ err, name: 'bot.entity()' });
  }
};
