const axios = require('axios');
const errorHandler = require('./errorHandler.js');

const S2_API = 'https://api.semanticscholar.org/graph/v1/paper/search';
const CR_API = 'https://api.crossref.org/works';
const S2_FIELDS = 'title,authors,externalIds,citationCount,year,venue';
const TIMEOUT = 10000;
const RESULTS_PER_PAGE = 5;

/**
 * Search papers by keyword. Tries Semantic Scholar first, falls back to CrossRef.
 * @param {string} query - Search keywords
 * @param {Object} opts
 * @param {number} opts.offset - Pagination offset (0-based)
 * @param {number} opts.limit - Results per page (default 5)
 * @param {number|null} opts.yearFrom - Filter: year >= this
 * @param {number|null} opts.yearTo - Filter: year <= this
 * @returns {{ papers: Array, total: number, source: string, error: string|null }}
 */
async function searchPapers(query, opts = {}) {
  const { offset = 0, limit = RESULTS_PER_PAGE, yearFrom = null, yearTo = null } = opts;

  // Try Semantic Scholar first
  const s2Result = await searchSemanticScholar(query, { offset, limit, yearFrom, yearTo });
  if (s2Result.papers.length > 0) {
    return s2Result;
  }

  // Fallback to CrossRef
  console.log('[SEARCH] S2 failed or empty, falling back to CrossRef');
  const crResult = await searchCrossRef(query, { offset, limit, yearFrom, yearTo });
  return crResult;
}

/**
 * Search via Semantic Scholar API.
 */
async function searchSemanticScholar(query, { offset, limit, yearFrom, yearTo }) {
  try {
    const params = {
      query,
      offset,
      limit,
      fields: S2_FIELDS,
    };

    // S2 supports year filter natively
    const yearParts = [];
    if (yearFrom) yearParts.push(yearFrom);
    if (yearTo) yearParts.push(yearTo);
    if (yearParts.length > 0) {
      params.year = yearParts.join('-');
    }

    const { data } = await axios.get(S2_API, {
      params,
      timeout: TIMEOUT,
      headers: { 'User-Agent': 'SciHubBot/2.0' },
    });

    if (!data?.data || data.data.length === 0) {
      return { papers: [], total: data?.total || 0, source: 'semantic-scholar', error: null };
    }

    const papers = data.data
      .filter(item => item.externalIds?.DOI) // only papers with DOI
      .map(item => normalizeS2(item));

    return {
      papers,
      total: data.total || 0,
      source: 'semantic-scholar',
      error: null,
    };
  } catch (err) {
    if (err.response?.status === 429) {
      console.log('[SEARCH] Semantic Scholar rate limited');
      return { papers: [], total: 0, source: 'semantic-scholar', error: 'rate-limited' };
    }
    console.error('[SEARCH] S2 error:', err.message);
    errorHandler({ err, name: 'utils/keyword.js S2' });
    return { papers: [], total: 0, source: 'semantic-scholar', error: err.message };
  }
}

/**
 * Search via CrossRef API.
 */
async function searchCrossRef(query, { offset, limit, yearFrom, yearTo }) {
  try {
    const params = {
      query,
      rows: limit,
      offset,
      sort: 'relevance',
      select: 'DOI,title,author,container-title,published-print,is-referenced-by-count,abstract',
    };

    // CrossRef filter for year range
    const filters = [];
    if (yearFrom) filters.push(`from-pub-date:${yearFrom}`);
    if (yearTo) filters.push(`until-pub-date:${yearTo}`);
    if (filters.length > 0) {
      params.filter = filters.join(',');
    }

    const { data } = await axios.get(CR_API, {
      params,
      timeout: TIMEOUT,
      headers: { 'User-Agent': 'SciHubBot/2.0 (mailto:bot@scihubot.local)' },
    });

    const items = data?.message?.items || [];
    const total = data?.message?.['total-results'] || 0;

    const papers = items
      .filter(item => item.DOI)
      .map(item => normalizeCR(item));

    return {
      papers,
      total,
      source: 'crossref',
      error: null,
    };
  } catch (err) {
    if (err.response?.status === 429) {
      console.log('[SEARCH] CrossRef rate limited');
      return { papers: [], total: 0, source: 'crossref', error: 'rate-limited' };
    }
    console.error('[SEARCH] CrossRef error:', err.message);
    errorHandler({ err, name: 'utils/keyword.js CrossRef' });
    return { papers: [], total: 0, source: 'crossref', error: err.message };
  }
}

/**
 * Normalize Semantic Scholar result to common format.
 */
function normalizeS2(item) {
  return {
    doi: item.externalIds.DOI,
    title: cleanText(item.title || ''),
    authors: (item.authors || []).map(a => a.name).filter(Boolean),
    journal: item.venue || '',
    year: item.year || null,
    citations: item.citationCount || 0,
  };
}

/**
 * Normalize CrossRef result to common format.
 */
function normalizeCR(item) {
  const authors = (item.author || []).map(a => {
    const given = a.given || '';
    const family = a.family || '';
    const initials = given.split(/[\s-]/).map(p => p.charAt(0) + '.').join(' ');
    return family ? `${family} ${initials}` : given;
  }).filter(Boolean);

  const yearParts = item['published-print']?.['date-parts']?.[0] || [];
  const journal = (item['container-title'] || [])[0] || '';

  return {
    doi: item.DOI,
    title: cleanText((item.title || [])[0] || ''),
    authors,
    journal: cleanText(journal),
    year: yearParts[0] || null,
    citations: item['is-referenced-by-count'] || 0,
  };
}

function cleanText(str) {
  return str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

module.exports = { searchPapers, RESULTS_PER_PAGE };
