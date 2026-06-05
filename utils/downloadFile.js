const axios = require('axios');
const errorHandler = require('./errorHandler.js');

const errMsg = "Unfortunately, Sci-Hub doesn't have the requested document :-(";

module.exports = async function (url) {
  return await axios({
    method: 'get',
    url,
    responseType: 'arraybuffer',
    timeout: 60000,  // 60s timeout
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  })
    .then((res) => {
      return { data: res.data, error: false };
    })
    .catch((err) => {
      console.error('[DOWNLOAD] Error:', err.message);
      errorHandler({ err, name: 'helpers/downloadFile.js' });
      return { data: null, error: errMsg };
    });
};
