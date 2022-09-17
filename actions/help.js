const { responseMessages } = require('../utils/constans.js');

module.exports = (ctx) => {
  ctx
    .reply(responseMessages.help, {
      disable_web_page_preview: true,
      parse_mode: 'HTML',
    })
    .catch((err) => {
      console.log('ERROR bot.help', err);
    });
};
