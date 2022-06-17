const axios = require("axios");

module.exports = async (doi) => {
  let { data, error } = await axios.get(
    `https://citation.crosscite.org/format?doi=${doi}&style=apa&lang=en-US`
  );

  return { data, error };
};
