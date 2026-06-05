const { notifyAdmin, errorHandler, db } = require('../utils/index.js');
const { responseMessages } = require('../utils/constans.js');
const { isBanned } = require('../utils/dataStore.js');

const postpone = {
  status: false,
  start: async (ctx) => {
    const { id: chat_id, first_name, username } = ctx?.from ?? ctx?.chat;

    if (ctx.message.text === '/start') {
      let { data: userData } = await db.getUser({ chat_id });

      const USER_NOT_FOUND = !userData.length;
      if (USER_NOT_FOUND) {
        await db.addUser({
          chat_id,
          username,
          first_name,
        });

        notifyAdmin({
          ctx,
          message: `New user added \nUsername: ${username}\nFirst name: ${first_name}\nChat id: ${chat_id}`,
        });
      }
    }

    ctx.reply('THIS BOT UNDER MAINTENANCE\n\nSubscribe to @x0projects for the latest information');
  },
};

module.exports = async (ctx, next) => {
  try {
    const userId = ctx.from?.id;
    const text = ctx.message?.text || '';
    console.log(`[MSG] type=${ctx.updateType} user=${userId} text=${text.substring(0, 80)}`);

    if (postpone.status) {
      postpone.start(ctx);
      return;
    }

    // Ban check — reject banned users (except /start so they know they're banned)
    if (userId && isBanned(userId)) {
      if (text === '/start') {
        ctx.reply('🚫 You have been blocked from using this bot.').catch(() => {});
      }
      return; // silently ignore other messages from banned users
    }

    // bot has been deleted by user
    if (ctx.update.my_chat_member) {
      notifyAdmin({
        ctx,
        message: `RESPONSE: ${responseMessages.delete} ${ctx.update.my_chat_member.chat.id}...`,
      });
      return;
    }

    await next();
  } catch (err) {
    errorHandler({ err, name: 'Midleware telegraf', ctx });
  }
};
