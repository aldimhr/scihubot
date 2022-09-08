const { sciHub } = require('../helpers');

class Entity {
  constructor(ctx) {
    this.message = ctx.message;
    this.text = message?.text;
    this.chat_id = message?.chat.id;
    this.entities = message?.entities;
  }

  async app() {
    const LINK_MORE_THAN_ONE = this.entities.length > 1;
    let fileURL;
    let errorGettingFile;
    let doi = this.text;

    if (LINK_MORE_THAN_ONE) {
      return ctx.reply('Please enter the links one by one', {
        reply_to_message_id: message.message_id,
      });
    }

    // send wait message
    let { message_id } = await ctx.telegram.sendMessage(chat_id, responseMessages.wait, {
      reply_to_message_id: message.message_id,
    });

    //filter text
    if (text.includes('://doi.org/') && text.includes('http')) {
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

    if (errorGettingFile) {
      ctx
        .reply("Unfortunately, Sci-Hub doesn't have the requested document :-(", {
          reply_to_message_id: message.message_id,
        })
        .catch((err) => console.log('EROR bot.entity', err));
      return await ctx.telegram
        .deleteMessage(chat_id, message_id)
        .catch((err) => console.log('ERROR bot.entity', err));
    }

    // download file
    const dFile = await downloadFile(fileURL);
    console.log({ dFile });
    if (dFile.error) {
      ctx
        .reply("Unfortunately, Sci-Hub doesn't have the requested document :-(", {
          reply_to_message_id: message.message_id,
        })
        .catch((err) => console.log('ERROR bot.entity', err));
      return await ctx.telegram
        .deleteMessage(chat_id, message_id)
        .catch((err) => console.log('ERROR bot.entity', err));
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
  }
}

module.exports = Entity;
