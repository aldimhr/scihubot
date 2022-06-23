const axios = require("axios");

const errMsg = "Unfortunately, Sci-Hub doesn't have the requested document :-(";

module.exports = async (url) => {
  return await axios({
    method: "get",
    url,
    responseType: "arraybuffer",
    // responseType: "buffer",
  })
    .then((res) => {
      return { data: res.data, error: false };
    })
    .catch((err) => {
      return { data: null, error: errMsg };
    });
};
