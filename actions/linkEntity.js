const { sciHub, getMetaDOI, downloadFile, citation, errorHandler } = require('../utils/index.js');
const { responseMessages, keyboardMessage } = require('../utils/constans.js');

module.exports = async (ctx) => {
  try {
    let message = ctx.message;
    let text = message?.text;
    let chat_id = message?.chat.id;
    let entities = message?.entities;

    // if many links in one message
    if (entities.length > 1) {
      return ctx.reply('Please enter the links one by one', {
        reply_to_message_id: message.message_id,
      });
    }

    // wait message
    let { message_id } = await ctx.telegram.sendMessage(chat_id, responseMessages.wait, {
      reply_to_message_id: message.message_id,
    });

    let fileURL;
    let errorGettingFile;
    let doi = text;

    //filter text
    if (text.includes('://doi.org/') && text.includes('http')) {
      // get file link
      await sciHub(text).then(({ data, error }) => {
        fileURL = data;
        errorGettingFile = error;
      });
    } else if (text.includes('doi.org/') && !text.includes('http')) {
      doi = `https://${text}`;
      // add http
      await sciHub(`https://${text}`).then(({ data, error }) => {
        fileURL = data;
        errorGettingFile = error;
      });
    } else {
      // get meta
      await getMetaDOI(text, ctx).then(async ({ data, error }) => {
        errorGettingFile = error;

        if (data) {
          doi = data;
          await sciHub(data).then(({ data, error }) => {
            fileURL = data;
            errorGettingFile = error;
          });
        }
      });
    }

    console.log({ fileURL, errorGettingFile });
    if (errorGettingFile) {
      ctx.reply("Unfortunately, Sci-Hub doesn't have the requested document :-(", {
        reply_to_message_id: message.message_id,
      });
      return await ctx.telegram.deleteMessage(chat_id, message_id).catch((err) => console.log('ERROR bot.entity', err));
    }

    // download file
    const dFile = await downloadFile(fileURL);
    console.log({ dFile });
    if (dFile.error) {
      ctx.reply("Unfortunately, Sci-Hub doesn't have the requested document :-(", {
        reply_to_message_id: message.message_id,
      });
      return await ctx.telegram.deleteMessage(chat_id, message_id).catch((err) => console.log('ERROR bot.entity', err));
    }

    // get citation
    let { data: citationData, error: citationError } = await citation(doi);
    console.log({ citationData, citationError });

    // delete wait message
    await ctx.telegram.deleteMessage(chat_id, message_id);

    // send error message
    if (errorGettingFile) {
      return ctx.reply("Unfortunately, Sci-Hub doesn't have the requested document :-(", {
        reply_to_message_id: message.message_id,
      });
    }

    // subscribe cahnnel
    ctx.reply('I have this article!\n\nSubscribe to x0projects channel in Telegram: @x0projects');

    // send file to user
    ctx.replyWithDocument(
      {
        source: dFile.data,
        filename: `${doi}.pdf`,
      },
      {
        caption: citationData || '',
        reply_to_message_id: message.message_id,
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
