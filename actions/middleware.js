const { notifyAdmin, errorHandler, db } = require('../utils/index.js');
const { responseMessages } = require('../utils/constans.js');

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
    console.log('===== ===== ===== ===== =====');
    let err = false;

    if (postpone.status) {
      postpone.start(ctx);
      return;
    }

    // bot has been deleted by user
    if (ctx.update.my_chat_member) {
      notifyAdmin({
        ctx,
        message: `RESPONSE: ${responseMessages.delete} ${ctx.update.my_chat_member.chat.id}...`,
      });

      err = true;
    }

    if (!err && !postpone.status) await next();
  } catch (err) {
    errorHandler({ err, name: 'Midleware telegraf', ctx });
  }
};
