const request = require("./request");
const { JSDOM } = require("jsdom");

const errMessage = "Unfortunately, Sci-Hub doesn't have the requested document :-(";

const filterDOI = (DOI) => {
  let splitter = DOI.split("doi.org/");
  return splitter[splitter.length - 1];
};

module.exports = async (url) => {
  console.log("SCIHUB");

  let urls = [];
  try {
    let libgenpage = await request.get(`https://libgen.rs/scimag/?q=${url}`);
    console.log({ libgenpage });

    // filter html
    const { document } = new JSDOM(libgenpage).window;
    let getDownloadURL = document.querySelectorAll(".record_mirrors")[0];
    let ahref = getDownloadURL.querySelectorAll("a");
    ahref.forEach((item) => {
      urls.push(item.href);
    });

    // get download url
    let libgendownload = await request.get(urls[1]);

    // filter html
    const libgenhtml = new JSDOM(libgendownload).window.document;
    console.log({ libgenhtml });

    let libgenhtmlselector = libgenhtml.querySelectorAll("a");
    libgenhtmlselector.forEach((item) => {
      if (item.href.includes("get.php?md5=")) url = item.href;
    });
    return { data: `https://libgen.rocks/${url}`, error: false };
  } catch (err) {
    console.log({ "helpers/libraryGenesis.js": err });
    return {
      data: null,
      error: errMessage,
    };
  }
};
