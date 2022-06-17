const axios = require('axios');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

(async () => {
  let downloadFile = await axios({
    method: 'get',
    url: 'https://www.nature.com/articles/laban.665',
    // https://pubs.rsna.org/page/radiographics/rgteam/top10Home
    // responseType: 'arraybuffer',
  }).then((res) => {
    const { document } = new JSDOM(res.data).window;
    let getEl = document.querySelector('meta[name="DOI"]').content;

    console.log(getEl);
  });
})();
