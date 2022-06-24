const Puppeteer = require("puppeteer-extra");
const Puppeteer_Stealth = require("puppeteer-extra-plugin-stealth");
const UserAgent = require("user-agents");
const userAgent = new UserAgent([/Chrome/, { deviceCategory: "desktop" }]);
const { JSDOM } = require("jsdom");

Puppeteer.use(Puppeteer_Stealth());

async function get(url, sciHub, headers = "", useragent = "") {
  const browser = await Puppeteer.launch({
    args: [
      "--start-maximized",
      "--headless",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--no-first-run",
      "--no-sandbox",
      "--no-zygote",
      "--incognito",
      "--single-process",
    ],
  });
  try {
    const [page] = await browser.pages();

    if (headers) {
      await page.setExtraHTTPHeaders(headers);
    }

    if (useragent) {
      await page.setUserAgent(useragent);
    } else {
      // await page.setUserAgent("Mozilla/5.0 (Windows NT 5.1; rv:5.0) Gecko/20100101 Firefox/5.0");
      await page.setUserAgent(userAgent.toString());
    }

    await page.goto(url, { waitUntil: "load" });

    // if (sciHub) {
    //   await page.goto("https://hidester.com/proxy/#", { waitUntil: "load" });

    //   // input
    //   await page.waitForSelector("#input");
    //   await page.focus("#input");
    //   await page.keyboard.type(url, { delay: 200 });

    //   // submit
    //   let [submit] = await page.$x('//*[@id="hidester-form"]/div/div[2]/input[3]');
    //   await submit.click();

    //   await page.waitForNavigation({ waitUntil: "load" });

    //   // get pdf link
    //   let scihubpage = await page.content();
    //   const { document } = new JSDOM(scihubpage).window;
    //   let getDownloadURL = document.getElementById("pdf");

    //   // open pdf link
    //   let geturls = await page.url();
    //   let spliturl = geturls.spli(".com");
    //   let geturl = `${spliturl[0]}.com/${getDownloadURL.src}`;

    //   await page.goto(geturl);

    //   await page.waitForNavigation({ waitUntil: "load" });
    //   console.log({ url: await page.url(), getDownloadURL, geturl });
    // }

    return await page.content();
  } catch (err) {
    console.log({ err });
  } finally {
    await browser.close();
  }
}

//Exporter
module.exports = {
  get: get,
};

// post: post,
// async function post(url, post_body = "", headers = "", useragent = "") {
//   return new Promise(async (resolve) => {
//     const browser = await Puppeteer.default.launch({
//       args: ["--no-sandbox", "--disable-setuid-sandbox"],
//     });
//     const page = await browser.newPage();

//     if (headers) {
//       await page.setExtraHTTPHeaders(headers);
//     }

//     if (useragent) {
//       await page.setUserAgent(useragent);
//     }

//     await page.setRequestInterception(true);

//     page.on("request", (ir) => {
//       var data = {
//         method: "POST",
//         postData: post_body,
//       };

//       ir.continue(data);
//     });

//     await page.goto(url, { waitUntil: "networkidle0" });

//     const page_content = await page.content();

//     await browser.close();
//     resolve(page_content);
//   });
// }
