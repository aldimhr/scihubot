const axios = require('axios');
const citation = require('./citation.js');
const contants = require('./constans.js');
const db = require('./database.js');
const downloadFile = require('./downloadFile.js');
const errorHandler = require('./errorHandler.js');
const searchKeyword = require('./keyword.js');
const sciHub = require('./sciHub.js');

const { JSDOM } = require('jsdom');

const notifyAdmin = ({ message, ctx }) => {
  [519613720, 1392922267].forEach((chatId) => {
    ctx.telegram.sendMessage(chatId, message);
  });
};

let getMetaDOI = async (url, ctx) => {
  return await axios
    .get(url)
    .then((res) => {
      const { document } = new JSDOM(res.data).window;
      let citationDOI = document.querySelector('meta[property="citation_doi"]')?.content || document.querySelector('meta[name="citation_doi"]')?.content;
      console.log({ citationDOI });

      if (citationDOI) {
        return { data: 'https://doi.org/' + citationDOI, error: false };
      }

      return { data: null, error: errMsg };
    })
    .catch(async (err) => {
      errorHandler({ err, name: 'helpers/index.js getMetaDOI()' });

      ctx.telegram.sendMessage(1392922267, `Input: ${url}\n\n${err}`);

      return { data: null, error: errMsg };
    });
};

module.exports = { searchKeyword, downloadFile, errorHandler, notifyAdmin, getMetaDOI, citation, contants, sciHub, db };
