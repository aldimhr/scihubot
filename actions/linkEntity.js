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

    // check if many links in one message
    if (entities.length > 1) {
      return ctx.reply('Please enter the links one by one', {
        reply_to_message_id: messageId,
      });
    }

    // send wait message
    let { message_id: waitMessageId } = await ctx.telegram.sendMessage(chatId, responseMessages.wait, {
      reply_to_message_id: messageId,
    });

    let fileDocument;
    let hasError;
    let citationArticle = '';

    if (text.includes('doi.org')) {
      const { data, citation, error } = await getFileFromScihub({ url: text });
      if (error) hasError = error;

      citationArticle = citation;
      fileDocument = data;
    } else {
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
    await ctx.telegram.deleteMessage(chatId, waitMessageId);

    if (hasError || !fileDocument) {
      return ctx.reply("Unfortunately, Sci-Hub doesn't have the requested document :-(", {
        reply_to_message_id: messageId,
      });
    }

    // subscribe cahnnel
    ctx.reply('I have this article!\n\nSubscribe to x0projects channel in Telegram: @x0projects');

    // send file to user
    ctx.replyWithDocument(
      {
        source: fileDocument,
        filename: `${text}.pdf`,
      },
      {
        caption: citationArticle || '',
        reply_to_message_id: messageId,
        reply_markup: {
          resize_keyboard: true,
          keyboard: keyboardMessage.default,
        },
      }
    );
  } catch (err) {
    errorHandler({ err, name: 'bot.entity()' });
  }
};
