require('dotenv').config();

const { Telegraf } = require('telegraf');

const { support: supportAction, search: searchAction, donation: donationAction } = require('./actions/menu');
const { broadcast: broadcastAction, keyword: keywordAction } = require('./actions/command');
const callbackQueryAction = require('./actions/callbackQuery');
const textMessageAction = require('./actions/textMessage');
const middlewareAction = require('./actions/middleware');
const linkEntityAction = require('./actions/linkEntity');
const startAction = require('./actions/start');
const mediaAction = require('./actions/media');
const helpAction = require('./actions/help');

const { errorHandler } = require('./utils');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use((ctx, next) => middlewareAction(ctx, next));

bot.start((ctx) => startAction(ctx));
bot.help((ctx) => helpAction(ctx));

bot.hears('⚓️ Search Document', (ctx) => searchAction(ctx));
bot.hears('💰 Donation', (ctx) => donationAction(ctx));
bot.hears('🤠 Support', (ctx) => supportAction(ctx));

bot.command('broadcast', async (ctx) => await broadcastAction(ctx));
bot.command('kw', async (ctx) => await keywordAction(ctx));

bot.on(['photo', 'document', 'voice', 'sticker'], (ctx) => mediaAction(ctx));
bot.on('callback_query', async (ctx) => await callbackQueryAction(ctx));

bot.entity(['url', 'text_link'], async (ctx) => await linkEntityAction(ctx));

bot.on('text', async (ctx) => await textMessageAction(ctx));

bot.catch((err, ctx) => {
  errorHandler({ name: 'app.js/bot.catch()', err });
  return console.log(`Ooops, encountered an error for ${ctx.updateType}`, err);
});

// development
// bot.launch();

// AWS event handler syntax (https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html)
exports.handler = async (event) => {
  // console.log({ event, eventBody: event.body });

  try {
    if (event.body) {
      await bot.handleUpdate(JSON.parse(event.body));
      return { statusCode: 200, body: '' };
    } else {
      return { statusCode: 400, body: 'This endpoint is meant for bot and telegram communication' };
    }
  } catch (e) {
    console.error('error in handler:', e);
    return { statusCode: 400, body: 'This endpoint is meant for bot and telegram communication' };
  }
};
