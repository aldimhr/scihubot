const { JSDOM } = require('jsdom');
const axios = require('axios');
const errorHandler = require('./errorHandler');
const request = require('./request');

const errMessage = "Unfortunately, Sci-Hub doesn't have the requested document :-(";

var FormData = require('form-data');

module.exports = async (doi) => {
  try {
    let data = new FormData();

    data.append('request', doi);

    let config = {
      method: 'post',
      url: 'https://sci-hub.se/',
      headers: {
        Cookie:
          '__ddg1_=LDjve9X61F4WnkyKKOlH; refresh=1662608614.5827; session=a0d7535c5f0fc45c27efd9a11d044951',
        ...data.getHeaders(),
      },
      data: data,
    };

    const requestPDF = await axios(config)
      .then((response) => {
        return response.data;
      })
      .catch((error) => {
        return null;
      });

    // get pdf linnk
    const { document } = new JSDOM(requestPDF).window;
    let elementPDF = document.getElementById('pdf');

    if (elementPDF.src.includes('sci-hub')) {
      return { data: 'https:' + elementPDF.src, error: false };
    }

    return { data: 'https://sci-hub.ru' + elementPDF.src, error: false };
  } catch (err) {
    errorHandler({ err, name: 'helpers/sciHub.js' });
    return {
      data: null,
      error: errMessage,
    };
  }
};

// module.exports = async (url, puppeteer) => {
//   console.log('SCIHUB');

//   try {
//     scihubPage = await request.get(`https://sci-hub.se/${url}`, true);

//     const { document } = new JSDOM(scihubPage).window;
//     let getDownloadURL = document.getElementById('pdf');

//     if (!getDownloadURL) {
//       let smile = document.getElementById('smile');
//       if (!smile) console.log({ SCIHUBDATA: scihubPage });
//       return { data: null, error: errMessage };
//     }

//     if (getDownloadURL.src.includes('sci-hub')) {
//       return { data: 'https:' + getDownloadURL.src, error: false };
//     }

//     return { data: 'https://sci-hub.ru' + getDownloadURL.src, error: false };
//     // return { data: "https://us.hidester.com" + getDownloadURL.src, error: false };
//   } catch (err) {
//     console.log({ 'scihub.js': err });
//     errorHandler({ err, name: 'helpers/sciHub.js' });
//     return {
//       data: null,
//       error: errMessage,
//     };
//   }
// };
