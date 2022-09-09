const axios = require('axios');

const errMsg = "Unfortunately, Sci-Hub doesn't have the requested document :-(";
const errorHandler = require('./errorHandler');

module.exports = async (url) => {
  return await axios({
    method: 'get',
    url,
    responseType: 'arraybuffer',
    // responseType: "buffer",
  })
    .then((res) => {
      return { data: res.data, error: false };
    })
    .catch((err) => {
      errorHandler({ err, name: 'helpers/downloadFile.js' });

      return { data: null, error: errMsg };
    });
};
