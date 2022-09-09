const { searchKeyword, notifyAdmin, db } = require('../utils');

const broadcast = async (ctx) => {
  try {
    const message = ctx.message;
    const text = message.text;
    const chat_id = message.chat.id;

    // check if its an admin
    let { data } = await db.getUser({ chat_id });

    if (data[0].permission === 'admin') {
      console.log(`================ BROADCAST MODE ================`);
      let { data: users } = await db.getUsers();
      let filterText = text.split('/broadcast').join('').trim();

      let n = 1;
      users.forEach(async (item) => {
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
};

const keyword = async (ctx) => {
  try {
    const message = ctx.message;
    const text = message.text;

    // filter text
    const textTarget = text.split('/kw').join('').trim().replace(/\s\s+/g, ' ');

    // check text input length
    if (textTarget.length < 5) {
      return ctx.reply('Please enter the keyword at least 5 letters').catch((err) => console.log('ERROR bot.on kw', err));
    }

    // if input just number
    if (!isNaN(textTarget)) {
      return ctx.reply('Please input a keyword not a number').catch((err) => console.log('ERROR bot.on kw', err));
    }

    // search keyword
    const searchResult = await searchKeyword(textTarget);
    if (!searchResult) {
      return ctx.reply("This bot can't read your keywords. This can happen when your keywords are too long.");
    }

    // mapping array of search result to inline keyboard structure
    const resultKeyboard = searchResult.map((item) => {
      let arr = [];
      arr.push({
        text: item.title,
        callback_data: item.externalIds['DOI'],
      });
      return arr;
    });

    // reply with list of papers
    return ctx.reply(`Top 10 papers of the keywords entered \n\n<i>Note: not all files below are available in the Sci-Hub database</i>`, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: resultKeyboard,
      },
    });
  } catch (err) {
    notifyAdmin({ ctx, message: 'bot/action/command()' });
  }
};

module.exports = { broadcast, keyword };
