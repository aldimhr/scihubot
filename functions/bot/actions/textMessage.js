const { sciHub, downloadFile, citation } = require('../utils');
const { keyboardMessage, responseMessages } = require('../utils/constans');

module.exports = async (ctx) => {
  const message = ctx.message;
  const chat_id = message.chat.id;

  let doi;
  let fileURL;
  let errorGettingFile;
  let text = message.text;

  if (text.toLowerCase().includes('doi:')) {
    doi = `http://doi.org/${text.toLowerCase().split('doi:').join('').trim()}`;
  } else if (text.includes('/') && text.includes('.') && text.split(' ').length === 1) {
    if (text[0] === '/') text = text.substring(1);

    doi = `http://doi.org/${text}`;
  }

  if (!doi || doi.length <= 20 || doi.split(' ').length !== 1) return ctx.reply(responseMessages.inputLink, { disable_web_page_preview: true });

  // wait message
  let { message_id } = await ctx.telegram.sendMessage(chat_id, responseMessages.wait, {
    reply_to_message_id: message.message_id,
  });

  // getting file
  await sciHub(doi).then(({ data, error }) => {
    fileURL = data;
    errorGettingFile = error;
  });

  // send error message
  if (errorGettingFile) {
    ctx.reply("Unfortunately, Sci-Hub doesn't have the requested document :-(", {
      reply_to_message_id: message.message_id,
    });
    return await ctx.telegram.deleteMessage(chat_id, message_id);
  }

  // download file
  const dFile = await downloadFile(fileURL);
  if (dFile.error) {
    ctx.reply("Unfortunately, Sci-Hub doesn't have the requested document :-(", {
      reply_to_message_id: message.message_id,
    });
    return await ctx.telegram.deleteMessage(chat_id, message_id);
  }

  // get citation
  let { data: citationData, error: citationError } = await citation(doi);
  console.log({ citationData, citationError });

  // delete wait message
  await ctx.telegram.deleteMessage(chat_id, message_id);

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
};
