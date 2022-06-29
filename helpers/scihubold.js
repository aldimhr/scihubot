const request = require('./request');
const { JSDOM } = require('jsdom');

const errMessage = "Unfortunately, Sci-Hub doesn't have the requested document :-(";
const errorHandler = require('./errorHandler');

module.exports = async (url) => {
  console.log('SCIHUB');

  try {
    let urlsplit = url.split('doi.org/');
    scihubPage = await request.get(`https://sci-hub.wf/${urlsplit[1]}`, true);

    const { document } = new JSDOM(scihubPage).window;
    let getDownloadURL = document.getElementById('pdf');

    if (!getDownloadURL) {
      if (scihubPage.includes('Sorry, sci-hub has not included this article yet')) {
        return { data: null, error: errMessage };
      } else {
        console.log({ SCIHUBDATA: scihubPage });
      }
      // let smile = document.getElementById('smile');
      // let getTag = document.getElementsByTagName
      // if (!smile) console.log({ SCIHUBDATA: scihubPage });
      return { data: null, error: errMessage };
    }

    if (!getDownloadURL.src.includes('http')) getDownloadURL.src = `http:${getDownloadURL.src}`;

    // if (getDownloadURL.src.includes('sci-hub')) {
    //   return { data: 'https:' + getDownloadURL.src, error: false };
    // }

    return { data: getDownloadURL.src, error: false };
    // return { data: 'https://sci-hub.ru' + getDownloadURL.src, error: false };
    // return { data: "https://us.hidester.com" + getDownloadURL.src, error: false };
  } catch (err) {
    console.log({ 'scihubold.js': err });
    errorHandler({ err, name: 'helpers/scihubold.js' });
    return {
      data: null,
      error: errMessage,
    };
  }
};
