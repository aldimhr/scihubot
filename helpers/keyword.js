const axios = require('axios');
const errorHandler = require('./errorHandler');

/**
 *
 * @param {String} query
 *
 * @return {String[]}
 */
module.exports = async (query) => {
  return await axios
    .get(
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${query}&offset=10&limit=1000&fields=title,authors,externalIds`
    )
    .then(({ data }) => {
      // filter just journal that have a DOI
      const list = data.data.filter((item) => item.externalIds['DOI']);

      // just return top 10 papers
      return list.filter((item, index) => index < 10);
    })
    .catch((err) => {
      errorHandler({ err, name: 'helpers/keyword.js' });
      return false;
    });
};
