const axios = require('axios');
const errorHandler = require('./errorHandler.js');

module.exports = async function (doi) {
  return await axios
    .get(`https://citation.crosscite.org/format?doi=${doi}&style=apa&lang=en-US`)
    .then(({ data }) => {
      return { data, error: null };
    })
    .catch((err) => {
      if (err.response.status !== 404) {
        errorHandler({ err, name: 'helpers/citation.js' });
      }
      return { data: '', error: err };
    });
};
