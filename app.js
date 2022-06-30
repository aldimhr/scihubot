/*
@Sci_Hubot UPDATE:
[v] Search using keyword
[v] Add crypto address for donation
[v] Fixing error
[ ] Send error message to admin for monitoring
[ ] 403 forbidden / blocked ip / ddos-guard
*/
require('dotenv').config();
const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN);

const adminChatId = [519613720, 1392922267];

const {
  downloadFile,
  citation,
  sciHub,
  getMetaDOI,
  db,
  errorHandler,
  libraryGenesis,
  scihubold,
} = require('./helpers');

let keyboardMessage = {
  default: [['⚓️ Search Document'], ['💰 Donation', '🤠 Support']],
  search: [['by Publisher URL'], ['by DOI'], ['by Title'], ['by Author']],
};

let responseMessages = {
  welcome: `
Welcome to Sci-Hub Bot!

How it works? Simply drop a DOI or Publisher URL below or use "/kw" before the keyword you want to search for (by Title, by Subject, by Author, etc.)

Example:

[DOI-URL]
https://doi.org/10.1177/193229681300700321

[PUBLISHER]
https://www.nature.com/articles/laban.665

[DOI-PATH]
10.1177/193229681300700321
DOI:10.1177/193229681300700321
DOI 10.1177/193229681300700321

SOON:
[KEYWORD]
/kw computer science

Subscribe:
@x0projects`,
  inputLink: `
Send me a DOI or Publisher URL below or use "/kw" before the keyword you want to search for (by Title, by Subject, by Author, etc.)

Example:

[DOI-URL]
https://doi.org/10.1177/193229681300700321

[PUBLISHER]
https://www.nature.com/articles/laban.665

[DOI-PATH]
10.1177/193229681300700321
DOI:10.1177/193229681300700321
DOI 10.1177/193229681300700321

SOON:
[KEYWORD]
/kw computer science

Subscribe:
@x0projects`,
  donation: `
Your support matters. This project survives on the kindness & generosity of your contributions.

https://www.buymeacoffee.com/x0code

[ETH] [BNB]
0xC4cB89575A39Cb1A7066BB855B4FdA5Ce3cEE64a

[BTC]
bc1q3hg8p8sg54vade6fl02y55vlcqu2zyw4h93vc0

Thankyou!`,
  support: 'For any question or business inquiries please contact @x0code',
  wait: '🕵‍♀️ Searching your file...',
  null: 'null message',
};

const postpone = {
  status: false,
  start: async (ctx) => {
    let chat_id = ctx.message?.chat.id;
    let username = ctx.message?.chat?.username;
    let first_name = ctx.message?.chat?.first_name;

    if (ctx.message.text === '/start') {
      // get user from db
      let { data: getUser, error: getUserError } = await db.getUser({ chat_id });

      console.log({ getUser, getUserError });

      if (!getUser.length) {
        // add user from db
        await db.addUser({
          chat_id,
          username,
          first_name,
        });

        // notify admin
        adminChatId.forEach((item) => {
          ctx.telegram.sendMessage(
            item,
            `New user added \nUsername: ${username}\nFirst name: ${first_name}\nChat id: ${chat_id}`
          );
        });
      }
    }
    ctx.reply('THIS BOT UNDER MAINTENANCE\n\nSubscribe to @x0projects for the latest information');
  },
};

// middleware
bot.use(async (ctx, next) => {
  console.log('====================================================');
  try {
    let err = false;

    // print to console
    if (ctx?.message) {
      console.log(ctx?.message);

      // postpone
      if (postpone.status) {
        postpone.start(ctx);
        return;
      }
    } else if (ctx?.update?.my_chat_member) {
      console.log(ctx.update.my_chat_member);
    } else {
      console.log({ ctx });
    }

    // bot has been deleted by user
    if (ctx.update.my_chat_member) {
      adminChatId.forEach(async (item) => {
        ctx.telegram.sendMessage(
          item,
          `RESPONSE: ${responseMessages.delete} ${ctx.update.my_chat_member.chat.id}...`
        );
      });

      err = true;
    }

    // no message data / blocked
    if (!ctx?.message) {
      adminChatId.forEach(async (item) => ctx.telegram.sendMessage(item, responseMessages.null));

      err = true;
    }

    if (!err && !postpone.status) await next();
  } catch (err) {
    errorHandler({ err, name: 'Midleware telegraf', ctx });
  }
});

// menus
bot.hears('🤠 Support', (ctx) => ctx.reply(responseMessages.support));
bot.hears('⚓️ Search Document', (ctx) => {
  ctx.reply(responseMessages.inputLink, { disable_web_page_preview: true });
});
bot.hears('💰 Donation', (ctx) => {
  ctx.reply(responseMessages.donation, {
    disable_web_page_preview: true,
  });

  adminChatId.forEach((item) => {
    ctx.telegram.sendMessage(item, `Someone see donation\nChat id: ${ctx.message.chat.id}`);
  });
});

// commands
bot.start(async (ctx) => {
  try {
    let chat_id = ctx.message?.chat.id;
    let username = ctx.message?.chat?.username;
    let first_name = ctx.message?.chat?.first_name;

    ctx.reply(responseMessages.welcome, {
      disable_web_page_preview: true,
      reply_markup: {
        resize_keyboard: true,
        keyboard: keyboardMessage.default,
      },
    });

    // get user from db
    let { data: getUser, error: getUserError } = await db.getUser({ chat_id });

    console.log({ getUser, getUserError });

    if (!getUser.length) {
      // add user from db
      await db.addUser({
        chat_id,
        username,
        first_name,
      });

      // notify admin
      adminChatId.forEach((item) => {
        ctx.telegram.sendMessage(
          item,
          `New user added \nUsername: ${username}\nFirst name: ${first_name}\nChat id: ${chat_id}`
        );
      });
    } else if (getUserError) {
      // notify admin
      adminChatId.forEach((item) => {
        ctx.telegram.sendMessage(item, getUserError);
      });
    }
  } catch (err) {
    errorHandler({ err, name: 'app.js/bot.start()', ctx });
  }
});

// prevent photo, document and voice message
bot.on(['photo', 'document', 'voice', 'sticker'], (ctx) => {
  ctx.reply(responseMessages.inputLink, { disable_web_page_preview: true });
});

bot.entity(['url', 'text_link'], async (ctx) => {
  try {
    let message = ctx.message;
    let text = message?.text;
    let chat_id = message?.chat.id;
    let entities = message?.entities;

    // if many links in one message
    if (entities.length > 1) {
      return await ctx.telegram.sendMessage(chat_id, 'Please enter the links one by one', {
        reply_to_message_id: message.message_id,
      });
    }

    // wait message
    let { message_id } = await ctx.telegram.sendMessage(chat_id, responseMessages.wait, {
      reply_to_message_id: message.message_id,
    });

    let fileURL,
      errorGettingFile,
      doi = text;
    if (text.includes('://doi.org/') && text.includes('http')) {
      // get file link
      // await sciHub(text).then(({ data, error }) => {
      // await libraryGenesis(text).then(({ data, error }) => {
      await scihubold(text).then(({ data, error }) => {
        fileURL = data;
        errorGettingFile = error;
      });
    } else if (text.includes('doi.org/') && !text.includes('http')) {
      doi = `https://${text}`;
      // add http
      // await sciHub(`https://${text}`).then(({ data, error }) => {
      // await libraryGenesis(`https://${text}`).then(({ data, error }) => {
      await scihubold(`https://${text}`).then(({ data, error }) => {
        fileURL = data;
        errorGettingFile = error;
      });
    } else {
      // get meta
      await getMetaDOI(text, ctx).then(async ({ data, error }) => {
        errorGettingFile = error;

        if (data) {
          doi = data;
          // await sciHub(data).then(({ data, error }) => {
          // await libraryGenesis(data).then(({ data, error }) => {
          await scihubold(data).then(({ data, error }) => {
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
      return await ctx.telegram.deleteMessage(chat_id, message_id);
    }

    // download file
    const dFile = await downloadFile(fileURL);
    console.log({ dFile });
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
      }
    );
  } catch (err) {
    errorHandler({ err, name: 'app.js/bot.entity()' });
  }
});

// search by keyword
bot.command('kw', (ctx) => {
  // let text = ctx.message.text;
  // let textSplit = text.split('/kw').join('').trim();
  // console.log({ textSplit });

  ctx.reply('Searching document by keyword still under development');
});

// ADMIN ONLY
bot.command('cuar', async (ctx) => {
  try {
    const message = ctx.message;
    const text = message.text;
    const chat_id = message.chat.id;

    // check if its an admin
    let { data } = await db.getUser({ chat_id });

    if (data[0].permission === 'admin') {
      console.log(`================ CUAR MODE ================`);
      let { data: users } = await db.getUsers();
      let filterText = text.split('/cuar').join('').trim();
      // const dummyUsers = [
      //   { chat_id: 519613720, id: 1 },
      //   { chat_id: 139292226, id: 2 },
      //   { chat_id: 1392922267, id: 3 },
      //   { chat_id: 519613720, id: 4 },
      //   { chat_id: 139292226, id: 5 },
      //   { chat_id: 1392922267, id: 6 },
      // ];
      // console.log({ users });

      let n = 1;
      users.forEach(async (item) => {
        // dummyUsers.forEach(async (item) => {
        ctx.telegram
          .sendMessage(item.chat_id, filterText)
          .then((data) => {
            console.log(`================ ${item.id} ================`);
            n++;
          })
          .catch((err) => {
            console.log(`================ ERR:${item.id} ================`);
            n++;
          });
      });
    } else {
      return;
    }
  } catch (err) {
    console.log({ err });
  }
});

bot.on('text', async (ctx) => {
  const message = ctx.message,
    chat_id = message.chat.id;
  let doi,
    fileURL,
    errorGettingFile,
    text = message.text;

  if (text.toLowerCase().includes('doi:')) {
    doi = `http://doi.org/${text.toLowerCase().split('doi:').join('').trim()}`;
  } else if (text.toLowerCase().includes('doi')) {
    doi = `http://doi.org/${text.toLowerCase().split('doi').join('').trim()}`;
  } else if (text.includes('/') && text.includes('.') && text.split(' ').length === 1) {
    if (text[0] === '/') text = text.substring(1);
    doi = `http://doi.org/${text}`;
  }

  // nothing doi URL
  if (doi.length < 20 || (doi && doi.split(' ').length > 1)) {
    return ctx.reply(responseMessages.inputLink, { disable_web_page_preview: true });
  }

  if (doi) {
    // wait message
    let { message_id } = await ctx.telegram.sendMessage(chat_id, responseMessages.wait, {
      reply_to_message_id: message.message_id,
    });

    // getting file
    await scihubold(doi).then(({ data, error }) => {
      fileURL = data;
      errorGettingFile = error;
    });

    // send error message
    if (errorGettingFile) {
      return ctx.reply("Unfortunately, Sci-Hub doesn't have the requested document :-(", {
        reply_to_message_id: message.message_id,
      });
    }

    // download file
    const dFile = await downloadFile(fileURL);
    console.log({ dFile });
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
      }
    );
    return;
  }

  ctx.reply(responseMessages.inputLink, { disable_web_page_preview: true });
});

bot.launch();
