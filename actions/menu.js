const { responseMessages } = require('../utils/constans.js');

exports.support = (ctx) => {
  ctx.reply(responseMessages.support);
};

exports.search = (ctx) => {
  ctx.reply(responseMessages.help, { parse_mode: 'HTML', disable_web_page_preview: true });
};

exports.donation = (ctx) => {
  ctx.reply(responseMessages.donation, {
    disable_web_page_preview: true,
  });
};
