const { responseMessages } = require('../utils/constans.js');

module.exports = (ctx) => {
  ctx.reply(responseMessages.inputLink, { disable_web_page_preview: true }).catch((err) => {
    console.log('ERROR bot.on(MEDIA)');
  });
};
