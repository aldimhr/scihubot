const { responseMessages } = require('../utils/constans');

const support = (ctx) => {
  ctx.reply(responseMessages.support);
};

const search = (ctx) => {
  ctx.reply(responseMessages.help, { parse_mode: 'HTML', disable_web_page_preview: true });
};

const donation = (ctx) => {
  ctx.reply(responseMessages.donation, {
    disable_web_page_preview: true,
  });
};

module.exports = { support, search, donation };
