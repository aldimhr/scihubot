const { Telegraf } = require('telegraf');

const { support, search, donation } = require('./actions/menu.js');
const { broadcast, keyword } = require('./actions/command.js');
const callbackQueryAction = require('./actions/callbackQuery.js');
const textMessageAction = require('./actions/textMessage.js');
const middlewareAction = require('./actions/middleware.js');
const linkEntityAction = require('./actions/linkEntity.js');
const startAction = require('./actions/start.js');
const mediaAction = require('./actions/media.js');
const helpAction = require('./actions/help.js');

const { errorHandler } = require('./utils/index.js');

const bot = new Telegraf(process.env.BOT_TOKEN);

// set webhook
// bot.telegram.setWebhook(process.env.BOT_WEBHOOK);

const donationAction = donation;
const searchAction = search;
const supportAction = support;
const broadcastAction = broadcast;
const keywordAction = keyword;

bot.use((ctx, next) => middlewareAction(ctx, next));

bot.start((ctx) => startAction(ctx));
bot.help((ctx) => helpAction(ctx));

bot.hears('⚓️ Search Document', (ctx) => searchAction(ctx));
bot.hears('💰 Donate', (ctx) => donationAction(ctx));
bot.hears('🤠 Support', (ctx) => supportAction(ctx));

bot.command('broadcast', async (ctx) => await broadcastAction(ctx));

// ==============================================================
bot.command('kw', async (ctx) => {
  ctx.reply('Search for articles based on keywords still under repair');
  // await keywordAction(ctx)
});
// bot.on('callback_query', async (ctx) => await callbackQueryAction(ctx));
// ==============================================================

bot.on(['photo', 'document', 'voice', 'sticker'], (ctx) => mediaAction(ctx));

bot.entity(['url', 'text_link'], async (ctx) => await linkEntityAction(ctx));

bot.on('text', async (ctx) => await textMessageAction(ctx));

bot.catch((err, ctx) => {
  errorHandler({ name: 'app.js/bot.catch()', err });
  return console.log(`Ooops, encountered an error for ${ctx.updateType}`, err);
});

// bot.launch();

/* AWS Lambda handler function */
exports.handler = (event, context, callback) => {
  try {
    const body = JSON.parse(event.body); // get data passed to us

    if (body.message) {
      bot.handleUpdate(body); // make Telegraf process that data
    }
  } catch (error) {
    console.log({ name: 'Error: aws handler', error });
  } finally {
    // return something for webhook, so it doesn't try to send same stuff again
    return callback(null, {
      statusCode: 200,
      body: 'OK',
    });
  }
};
