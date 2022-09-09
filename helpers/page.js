const Puppeteer = require('puppeteer-extra');
const Puppeteer_Stealth = require('puppeteer-extra-plugin-stealth');

Puppeteer.default.use(Puppeteer_Stealth());

const errorHandler = require('../functions/bot/utils/errorHandler');

module.exports = async () => {
  try {
    const browser = await Puppeteer.default.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    return { page, browser };
  } catch (err) {
    errorHandler({ err, name: 'helpers/page.js' });
  }
};
