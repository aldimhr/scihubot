/*
@Sci_Hubot UPDATE:
[v] Search using keyword
[v] Add crypto address for donation
[v] Fixing error
[ ] Send error message to admin for monitoring

*/
require("dotenv").config();
const { Telegraf } = require("telegraf");
const bot = new Telegraf(process.env.BOT_TOKEN);

const adminChatId = [519613720, 1392922267];

const { downloadFile, citation, sciHub, getMetaDOI, db, errorHandler } = require("./helpers");

let keyboardMessage = {
  default: [["⚓️ Search Document"], ["💰 Donation", "🤠 Support"]],
  search: [["by Publisher URL"], ["by DOI"], ["by Title"], ["by Author"]],
};

let responseMessages = {
  welcome: `
Welcome to Sci-Hub Bot!

How it works? Simply drop a DOI or Publisher URL below or use "/kw" before the keyword you want to search for (by Title, by Subject, by Author, by DOI Path etc.)

Example:

[DOI-URL]
https://doi.org/10.1177/193229681300700321

[PUBLISHER]
https://www.nature.com/articles/laban.665

SOON:

[DOI-PATH]
/kw 10.1177/193229681300700321

[KEYWORD]
/kw computer science


Subscribe:
@x0projects`,
  inputLink: `
Send me a DOI or Publisher URL below or use "/kw" before the keyword you want to search for (by Title, by Subject, by Author, by DOI path etc.)

Example:

[DOI-URL]
https://doi.org/10.1177/193229681300700321

[PUBLISHER]
https://www.nature.com/articles/laban.665

SOON:

[DOI-PATH]
/kw 10.1177/193229681300700321

[KEYWORD]
/kw computer science


Subscribe:
@x0projects`,
  donation: `
Your support matters. This project survives on the kindness & generosity of your contributions.

https://www.buymeacoffee.com/x0code

[ETH] [BSC]
0xC4cB89575A39Cb1A7066BB855B4FdA5Ce3cEE64a

Thankyou!`,
  support: "For any question or business inquiries please contact @x0code",
  wait: "🕵‍♀️ Searching your file...",
};

// middleware
bot.use(async (ctx, next) => {
  console.log("====================================================");
  try {
    let err = false;

    // print to console
    if (ctx?.message) {
      console.log(ctx?.message);
    } else if (ctx?.update?.my_chat_member) {
      console.log(ctx?.update.my_chat_member);
    } else {
      console.log({ ctx });
    }
    //

    // bot has been deleted by user
    if (ctx.update.my_chat_member) {
      adminChatId.forEach(async (item) => {
        ctx.telegram.sendMessage(item, `${responseMessages.delete} ${body.my_chat_member.chat.id}`);
      });

      err = true;
    }

    // no message data / blocked
    if (!ctx?.message) {
      adminChatId.forEach(async (item) => ctx.telegram.sendMessage(item, responseMessages.null));

      err = true;
    }

    if (!err) await next();
  } catch (err) {
    errorHandler({ err, name: "Midleware telegraf", ctx });
  }
});

// menus
bot.hears("🤠 Support", (ctx) => ctx.reply(responseMessages.support));
bot.hears("⚓️ Search Document", (ctx) => {
  ctx.reply(responseMessages.inputLink, { disable_web_page_preview: true });
});
bot.hears("💰 Donation", (ctx) => {
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
    errorHandler({ err, name: "app.js/bot.start()", ctx });
  }
});

// prevent photo, document and voice message
bot.on(["photo", "document", "voice", "sticker"], (ctx) => {
  ctx.reply(responseMessages.inputLink, { disable_web_page_preview: true });
});

bot.entity(["url", "text_link"], async (ctx) => {
  try {
    let message = ctx.message;
    let text = message?.text;
    let chat_id = message?.chat.id;
    let entities = message?.entities;

    // if many links in one message
    if (entities.length > 1) {
      return await ctx.telegram.sendMessage(chat_id, "Please enter the links one by one", {
        reply_to_message_id: message.message_id,
      });
    }

    // wait message
    let { message_id } = await ctx.telegram.sendMessage(chat_id, responseMessages.wait, {
      reply_to_message_id: message.message_id,
    });

    let fileURL, errorGettingFile;
    let doi = text;
    if (text.includes("://doi.org/") && text.includes("http")) {
      // get file link
      await sciHub(text).then(({ data, error }) => {
        fileURL = data;
        errorGettingFile = error;
      });
    } else if (text.includes("doi.org/") && !text.includes("http")) {
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
    if (errorGettingFile) {
      return ctx.reply("Unfortunately, Sci-Hub doesn't have the requested document :-(", {
        reply_to_message_id: message.message_id,
      });
    }

    // send file to user
    ctx.replyWithDocument(
      {
        source: dFile.data,
        filename: `${doi}.pdf`,
      },
      {
        caption: citationData || "",
        reply_to_message_id: message.message_id,
      }
    );
  } catch (err) {
    errorHandler({ err, name: "app.js/bot.entity()", ctx });
  }
});

// search by keyword
bot.command("kw", (ctx) => {
  ctx.reply("Searching document by keyword still under development");
});

bot.on("text", (ctx) => {
  ctx.reply(responseMessages.inputLink, { disable_web_page_preview: true });
});

bot.launch();
