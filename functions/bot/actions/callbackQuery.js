const { sciHub, citation, downloadFile } = require('../utils');
const { responseMessages, keyboardMessage } = require('../utils/constans');

module.exports = async (ctx) => {
  const update = ctx.update;
  const callback_query = update.callback_query;
  const message = callback_query.message;
  const messageId = message.message_id;
  const doi = `http://doi.org/${callback_query.data}`;
  let fileURL;
  let errorGettingFile;
  let err;

  // wait message
  const { message_id: waitMessageId } = await ctx.reply(responseMessages.wait).catch((error) => {
    err = error;
  });

  if (err) return console.log('ERROR bot.on(callback_query)');

  // delete message
  await ctx.telegram.deleteMessage(message.chat.id, messageId).catch((error) => {
    err = error;
  });

  if (err) return console.log('ERROR bot.on(callback_query)');

  // getting file from Sci-Hub
  await sciHub(doi).then(({ data, error }) => {
    // await scihubold(doi).then(({ data, error }) => {
    fileURL = data;
    errorGettingFile = error;
  });

  // send error message
  if (errorGettingFile) {
    console.log({ fileURL, errorGettingFile });

    return ctx.editMessageText(`Unfortunately, Sci-Hub doesn't have the requested document :-(\n\n${doi}`, {
      disable_web_page_preview: true,
      chat_id: message.chat.id,
      message_id: waitMessageId,
    });
  }

  // download file
  const dFile = await downloadFile(fileURL);
  console.log({ dFile });

  if (dFile.error) {
    return ctx.editMessageText(`Unfortunately, Sci-Hub doesn't have the requested document :-(\n\n${doi}`, {
      disable_web_page_preview: true,
      chat_id: message.chat.id,
      message_id: waitMessageId,
    });
  }

  // get citation
  let { data: citationData, error: citationError } = await citation(doi);
  console.log({ citationData, citationError });

  // subscribe cahnnel
  ctx.editMessageText('I have this article!\n\nSubscribe to x0projects channel in Telegram: @x0projects', {
    chat_id: message.chat.id,
    message_id: waitMessageId,
  });

  // send file to user
  ctx.replyWithDocument(
    {
      source: dFile.data,
      filename: `${doi}.pdf`,
    },
    {
      caption: citationData || '',
      reply_markup: {
        resize_keyboard: true,
        keyboard: keyboardMessage.default,
      },
    }
  );

  return;
};
