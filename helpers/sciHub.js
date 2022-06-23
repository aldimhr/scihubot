const request = require("./request");
const { JSDOM } = require("jsdom");

const errMessage = "Unfortunately, Sci-Hub doesn't have the requested document :-(";

module.exports = async (url, puppeteer) => {
  console.log("SCIHUB");

  try {
    scihubPage = await request.get(`https://sci-hub.se/${url}`);

    const { document } = new JSDOM(scihubPage).window;
    let getDownloadURL = document.getElementById("pdf");

    if (!getDownloadURL) console.log({ SCIHUBDATA: scihubPage });

    if (!getDownloadURL) return { data: null, error: errMessage };

    if (getDownloadURL.src.includes("sci-hub")) {
      return { data: "https:" + getDownloadURL.src, error: false };
    }

    return { data: "https://sci-hub.ru" + getDownloadURL.src, error: false };
  } catch (err) {
    console.log({ "scihub.js": err });
    return {
      data: null,
      error: errMessage,
    };
  }
};
