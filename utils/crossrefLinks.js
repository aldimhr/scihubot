const axios = require('axios');

const CR_API = 'https://api.crossref.org/works';
const TIMEOUT = 8000;

/**
 * Extract free/full-text links from CrossRef metadata for a DOI.
 * CrossRef's `link` field contains full-text URLs when publishers register them.
 * @param {string} doi - Normalized DOI
 * @returns {{ url: string|null, source: string|null, error: string|null }}
 */
async function checkCrossRefLinks(doi) {
  try {
    const url = `${CR_API}/${encodeURIComponent(doi)}`;
    const { data } = await axios.get(url, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': 'SciHubBot/2.0 (mailto:bot@scihubot.local)' },
      validateStatus: (s) => (s >= 200 && s < 400) || s === 404,
    });

    const item = data?.message;
    if (!item?.link || item.link.length === 0) {
      return { url: null, source: null, error: null };
    }

    // Priority: unspecified (often free PDF) > full-text > published
    // Some links are "text/xml" or "text/html" — prefer anything with pdf
    const links = item.link;

    // First: look for direct PDF links
    for (const link of links) {
      if (link['content-type'] === 'application/pdf' && link.URL) {
        return {
          url: link.URL,
          source: `CrossRef (${link['content-version'] || 'full-text'})`,
          error: null,
        };
      }
    }

    // Second: accept "unspecified" content-type (some publishers use this for free PDFs)
    for (const link of links) {
      if (link['content-type'] === 'unspecified' && link.URL) {
        return {
          url: link.URL,
          source: 'CrossRef (full-text)',
          error: null,
        };
      }
    }

    // Third: return any HTML full-text link as landing page
    for (const link of links) {
      if (link['content-version'] === 'vor' && link.URL) {
        return {
          url: null,
          source: link.URL, // landing page, not direct PDF
          landingPage: link.URL,
          error: null,
        };
      }
    }

    return { url: null, source: null, error: null };
  } catch (err) {
    if (err.response?.status === 404 || err.response?.status === 400) {
      return { url: null, source: null, error: null };
    }
    console.error('[CROSSREF-LINKS] Error:', err.message);
    return { url: null, source: null, error: err.message };
  }
}

module.exports = { checkCrossRefLinks };
