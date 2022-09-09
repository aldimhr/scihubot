const constants = require('../utils/constans');
const utils = require('../utils');

const { errorHandler, downloadFile, notifyAdmin, citation, keyword, sciHub, db } = utils;
const { adminChatId, responseMessages, keyboardMessage } = constants;

module.exports = async (ctx) => {
  try {
    console.log('start');
    const { id: chat_id, first_name, username } = ctx?.from ?? ctx?.chat;
    let err;

    ctx
      .reply(responseMessages.welcome, {
        disable_web_page_preview: true,
        reply_markup: {
          resize_keyboard: true,
          keyboard: keyboardMessage.default,
        },
      })
      .catch((error) => (err = error));

    if (err) return console.log('ERROR bot.start()');

    // get user from db
    const { data: userData, error: getUserError } = await db.getUser({ chat_id });

    const USER_NOT_FOUND = !userData.length;
    if (USER_NOT_FOUND) {
      // add user to db
      await db.addUser({ chat_id, username, first_name });

      notifyAdmin({
        ctx,
        message: `New user added \nUsername: ${username}\nFirst name: ${first_name}\nChat id: ${chat_id}`,
      });
    } else if (getUserError) {
      notifyAdmin({ ctx, message: getUserError });
    }
  } catch (err) {
    errorHandler({ err, name: 'app.js/bot.start()', ctx });
  }
};
