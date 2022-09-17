const axios = require('axios');
const errorHandler = require('./errorHandler.js');

const errMsg = "Unfortunately, Sci-Hub doesn't have the requested document :-(";

module.exports = async function (url) {
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
