const axios = require('axios');
const citation = require('./citation.js');
const contants = require('./constans.js');
const db = require('./database.js');
const downloadFile = require('./downloadFile.js');
const errorHandler = require('./errorHandler.js');
const searchKeyword = require('./keyword.js');
const sciHub = require('./sciHub.js');

var HTMLParser = require('node-html-parser');

const notifyAdmin = ({ message, ctx }) => {
  [519613720, 1392922267].forEach((chatId) => {
    ctx.telegram.sendMessage(chatId, message);
  });
};

let getMetaDOI = async (url, ctx) => {
  return await axios
    .get(url)
    .then((res) => {
      const document = HTMLParser.parse(res.data);
      let citationDOI = document.querySelector('meta[property="citation_doi"]')?.getAttribute('content') || document.querySelector('meta[name="citation_doi"]')?.getAttribute('content');

      if (citationDOI) {
        return { data: 'https://doi.org/' + citationDOI, error: false };
      }

      return { data: null, error: true };
    })
    .catch(async (err) => {
      errorHandler({ err, name: 'helpers/index.js getMetaDOI()' });

      ctx.telegram.sendMessage(1392922267, `Input: ${url}\n\n${err}`);

      return { data: null, error: true };
    });
};

module.exports = { searchKeyword, downloadFile, errorHandler, notifyAdmin, getMetaDOI, citation, contants, sciHub, db };
