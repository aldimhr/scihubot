require('dotenv').config();
const { Telegraf } = require('telegraf');

const adminChatId = [519613720, 1392922267];
const bot = new Telegraf(process.env.BOT_TOKEN);

module.exports = ({ err, name, ctx }) => {
  console.log(`ERROR: ${name}`, { err });

  const headers = JSON.stringify(err?.response?.headers, null, '-  ') || null;
  const request = JSON.stringify(err?.request, null, '-  ') || null;
  const config = JSON.stringify(err?.config, null, '-  ') || null;
  const message = err?.message || null;
  const status = err?.status || null;
  const data = err?.data || null;

  let stringMessage;

  if (err.response) {
    stringMessage = `Data: ${data}\n\nStatus: ${status}\n\nHeaders: ${headers}\n\nConfig: ${config}`;
  } else if (err.request) {
    stringMessage = `Request: ${request}\n\nConfig: ${config}`;
  } else {
    stringMessage = `Message: ${message}\n\nConfig: ${config}`;
  }

  // notify user
  if (ctx) ctx.reply('ERROR: reporting to admin ...');

  // notify admin
  adminChatId.forEach((chat_id) => {
    bot.telegram.sendMessage(chat_id, `==== ${name} ====\n${stringMessage}`);
  });
};
