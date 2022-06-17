const { getMetaDOI, getFile } = require('../helpers');

it('getMetaDOI(): should return string data and falsy error', async () => {
  const { data, error } = await getMetaDOI('https://www.nature.com/articles/laban.665');

  expect(data).toMatch('https://doi.org/10.1038/laban.665');
  expect(error).toBeFalsy();
});

it('getMetaDOI(): should return null data and truthy error', async () => {
  const { data, error } = await getMetaDOI('https://www.nature.com/articles/laban');

  expect(data).toBeNull();
  expect(error).toMatch("Unfortunately, Sci-Hub doesn't have the requested document :-(");
});
