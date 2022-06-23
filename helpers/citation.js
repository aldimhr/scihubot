const axios = require("axios");
const errorHandler = require("./errorHandler");

module.exports = async (doi) => {
  let { data, error } = await axios
    .get(`https://citation.crosscite.org/format?doi=${doi}&style=apa&lang=en-US`)
    .catch((err) => {
      errorHandler({ err, name: "helpers/citation.js" });
    });

  return { data, error };
};
