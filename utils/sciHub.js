const axios = require('axios');
const errorHandler = require('./errorHandler.js');
var HTMLParser = require('node-html-parser');

const errMessage = "Unfortunately, Sci-Hub doesn't have the requested document :-(";

const FormData = require('form-data');

module.exports = async (doi) => {
  try {
    let data = new FormData();

    data.append('request', doi);

    let config = {
      method: 'post',
      url: 'https://sci-hub.se/',
      headers: {
        Cookie: '__ddg1_=LDjve9X61F4WnkyKKOlH; refresh=1662608614.5827; session=a0d7535c5f0fc45c27efd9a11d044951',
        ...data.getHeaders(),
      },
      data: data,
    };

    const { data: requestPDF } = await axios(config, { withCredentials: true });

    // get pdf linnk
    const document = HTMLParser.parse(requestPDF);
    const elementPDF = document?.getElementById('pdf');
    const elementSrc = elementPDF?.getAttribute('src');
    if (!elementSrc) throw new Error('File not found');

    // get citation
    const citationDiv = document.getElementById('citation');
    const citation = citationDiv.innerText;

    if (elementSrc.includes('sci-hub')) {
      return { data: 'https:' + elementSrc, citation: citation, error: false };
    }

    return { data: 'https://sci-hub.ru' + elementSrc, citation: citation, error: false };
  } catch (err) {
    errorHandler({ err, name: 'helpers/sciHub.js' });
    return {
      data: null,
      citation: null,
      error: errMessage,
    };
  }
};
