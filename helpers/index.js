require('dotenv').config();
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const db = require('./database');
const citation = require('./citation');
const request = require('./request');
const page = require('./page');
const libraryGenesis = require('./libraryGenesis');
const sciHub = require('./sciHub');
const scihubold = require('./scihubold');
const downloadFile = require('./downloadFile');
const errorHandler = require('./errorHandler');
const isPDF = require('./isPDF');
const searchKeyword = require('./keyword');

const errMsg = "Unfortunately, Sci-Hub doesn't have the requested document :-(";

let getMetaDOI = async (url, ctx) => {
  return await request
    .get(url)
    .then((res) => {
      const { document } = new JSDOM(res).window;
      let citationDOI =
        document.querySelector('meta[property="citation_doi"]')?.content ||
        document.querySelector('meta[name="citation_doi"]')?.content;
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

module.exports = {
  libraryGenesis,
  searchKeyword,
  downloadFile,
  errorHandler,
  getMetaDOI,
  scihubold,
  citation,
  request,
  sciHub,
  isPDF,
  page,
  db,
};
