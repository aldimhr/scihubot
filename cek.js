const axios = require('axios');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const { parser } = require('html-metadata-parser');

(async () => {
  var result = await parser('https://www.nature.com/articles/laban.665');
  console.log(JSON.stringify(result, null, 3));

  // let downloadFile = await axios({
  //   method: 'get',
  //   url: 'https://www.nature.com/articles/laban.665',
  // https://pubs.rsna.org/page/radiographics/rgteam/top10Home
  // responseType: 'arraybuffer',
  // }).then((res) => {
  //   const { document } = new JSDOM(res.data).window;
  //   let getEl = document.querySelector('meta[name="DOI"]').content;
  //   console.log(getEl);
  // });
})();
