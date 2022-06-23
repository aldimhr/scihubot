const Puppeteer = require("puppeteer-extra");
const Puppeteer_Stealth = require("puppeteer-extra-plugin-stealth");

Puppeteer.default.use(Puppeteer_Stealth());

module.exports = async () => {
  const browser = await Puppeteer.default.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  return { page, browser };
};
