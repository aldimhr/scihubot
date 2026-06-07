const axios = require('axios');

const TIMEOUT = 10000;

/**
 * Search for a preprint version of a paper on arXiv, bioRxiv, or medRxiv.
 * @param {string} doi - Normalized DOI
 * @param {string} title - Paper title (used as fallback search)
 * @returns {{ url: string|null, source: string|null, error: string|null }}
 */
async function checkPreprints(doi, title) {
  // Try arXiv first
  const arxiv = await checkArxiv(doi, title);
  if (arxiv.url) return arxiv;

  // Try bioRxiv/medRxiv
  const biorxiv = await checkBioRxiv(doi);
  if (biorxiv.url) return biorxiv;

  return { url: null, source: null, error: null };
}

/**
 * Check arXiv for a preprint. Tries DOI lookup first, then title search.
 * @param {string} doi
 * @param {string} title
 * @returns {{ url: string|null, source: string|null, error: string|null }}
 */
async function checkArxiv(doi, title) {
  try {
    // Method 1: Search by DOI (arXiv stores DOIs in the metadata)
    const doiQuery = `doi:"${doi}"`;
    let result = await arxivSearch(doiQuery);
    if (result) return result;

    // Method 2: Search by title (fuzzy match)
    if (title && title.length > 10) {
      const titleQuery = `ti:"${title.replace(/"/g, '')}"`;
      result = await arxivSearch(titleQuery);
      if (result) return result;
    }

    return { url: null, source: null, error: null };
  } catch (err) {
    console.error('[ARXIV] Error:', err.message);
    return { url: null, source: null, error: err.message };
  }
}

/**
 * Execute an arXiv API search and return the first PDF result.
 * @param {string} query - arXiv search query
 * @returns {{ url: string|null, source: string|null, error: string|null }}
 */
async function arxivSearch(query) {
  try {
    const { data } = await axios.get('http://export.arxiv.org/api/query', {
      params: {
        search_query: query,
        start: 0,
        max_results: 1,
      },
      timeout: TIMEOUT,
      headers: { 'User-Agent': 'SciHubBot/2.0' },
    });

    if (!data || !data.includes('<entry>')) {
      return null;
    }

    // Parse the XML response (simple regex — no XML parser needed)
    const entryMatch = data.match(/<entry>([\s\S]*?)<\/entry>/);
    if (!entryMatch) return null;

    const entry = entryMatch[1];

    // Extract PDF link
    const pdfLinkMatch = entry.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/);
    if (pdfLinkMatch) {
      // arXiv returns /abs/ URLs — convert to /pdf/
      const pdfUrl = pdfLinkMatch[1].replace('/abs/', '/pdf/') + '.pdf';
      return { url: pdfUrl, source: 'arXiv', error: null };
    }

    // Fallback: extract arXiv ID and build PDF URL
    const idMatch = entry.match(/<id>([^<]+)<\/id>/);
    if (idMatch) {
      const absUrl = idMatch[1];
      const pdfUrl = absUrl.replace('/abs/', '/pdf/') + '.pdf';
      return { url: pdfUrl, source: 'arXiv', error: null };
    }

    return null;
  } catch (err) {
    console.error('[ARXIV-SEARCH] Error:', err.message);
    return null;
  }
}

/**
 * Check bioRxiv and medRxiv for a preprint by DOI.
 * @param {string} doi
 * @returns {{ url: string|null, source: string|null, error: string|null }}
 */
async function checkBioRxiv(doi) {
  for (const server of ['biorxiv', 'medrxiv']) {
    try {
      const apiUrl = `https://api.${server}.org/details/${encodeURIComponent(doi)}`;
      const { data } = await axios.get(apiUrl, {
        timeout: TIMEOUT,
        headers: { 'User-Agent': 'SciHubBot/2.0' },
        validateStatus: (s) => s >= 200 && s < 500,
      });

      if (data?.collection?.length > 0) {
        const paper = data.collection[0];
        if (paper.jats_xml_full_url) {
          // bioRxiv has PDF at a predictable URL
          const pdfUrl = `https://www.${server}.org/content/${paper.doi}v${paper.version || 1}.full.pdf`;
          return { url: pdfUrl, source: server.charAt(0).toUpperCase() + server.slice(1), error: null };
        }
      }
    } catch (err) {
      // 404 = not found, expected
      if (err.response?.status !== 404) {
        console.error(`[${server.toUpperCase()}] Error:`, err.message);
      }
    }
  }

  return { url: null, source: null, error: null };
}

module.exports = { checkPreprints };
