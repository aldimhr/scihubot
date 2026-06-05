require('dotenv').config();
const https = require('https');
const http = require('http');
const { Telegraf } = require('telegraf');

const { support, search, donation } = require('./actions/menu.js');
const { broadcast, keyword, status, stats, users, history, ban, unban } = require('./actions/command.js');
const { handleDonateCallback, handleDonateCommand, handlePreCheckout, handleSuccessfulPayment } = require('./actions/donate.js');
const callbackQueryAction = require('./actions/callbackQuery.js');
const textMessageAction = require('./actions/textMessage.js');
const middlewareAction = require('./actions/middleware.js');
const linkEntityAction = require('./actions/linkEntity.js');
const startAction = require('./actions/start.js');
const mediaAction = require('./actions/media.js');
const helpAction = require('./actions/help.js');

const { errorHandler } = require('./utils/index.js');

// Create HTTP agent with keep-alive and IPv4 preference
const agent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  family: 4,  // Force IPv4 - avoids IPv6 timeout issues
  timeout: 60000,
});

const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: { agent },
});

const donationAction = donation;
const searchAction = search;
const supportAction = support;
const broadcastAction = broadcast;
const keywordAction = keyword;

bot.use((ctx, next) => middlewareAction(ctx, next));

bot.start((ctx) => startAction(ctx));
bot.help((ctx) => helpAction(ctx));

bot.hears('⚓️ Search Document', (ctx) => searchAction(ctx));
bot.hears('💰 Donate', (ctx) => handleDonateCommand(ctx));
bot.hears('🤠 Support', (ctx) => supportAction(ctx));

// Telegram Stars donation
bot.command('donate', async (ctx) => await handleDonateCommand(ctx));
bot.on('pre_checkout_query', async (ctx) => await handlePreCheckout(ctx));
bot.on('successful_payment', async (ctx) => await handleSuccessfulPayment(ctx));

bot.command('broadcast', async (ctx) => await broadcastAction(ctx));
bot.command('status', async (ctx) => await status(ctx));
bot.command('stats', async (ctx) => await stats(ctx));
bot.command('users', async (ctx) => await users(ctx));
bot.command('history', async (ctx) => await history(ctx));
bot.command('ban', async (ctx) => await ban(ctx));
bot.command('unban', async (ctx) => await unban(ctx));

bot.command('kw', async (ctx) => {
  ctx.reply('Search for articles based on keywords still under repair');
});

bot.on(['photo', 'document', 'voice', 'sticker'], (ctx) => mediaAction(ctx));

// Callback queries — route donate buttons vs keyword search results
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery?.data;
  if (data && data.startsWith('donate_')) {
    return handleDonateCallback(ctx);
  }
  return callbackQueryAction(ctx);
});

bot.entity(['url', 'text_link'], async (ctx) => await linkEntityAction(ctx));

bot.on('text', async (ctx) => await textMessageAction(ctx));

bot.catch((err, ctx) => {
  errorHandler({ name: 'app.js/bot.catch()', err });
  console.log(`Ooops, encountered an error for ${ctx.updateType}`, err);
});

// Prevent crashes on unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
});

// Register commands in Telegram menu
bot.telegram.setMyCommands([
  { command: 'start', description: '🚀 Start the bot' },
  { command: 'help', description: '📖 How to use this bot' },
  { command: 'donate', description: '⭐ Support with Telegram Stars' },
]).catch(() => {});

// Launch with long-polling
bot.launch();
console.log('🤖 Sci-Hub Bot started');

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
