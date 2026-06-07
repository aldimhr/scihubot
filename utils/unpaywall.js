const axios = require('axios');

const API_BASE = 'https://api.unpaywall.org/v2';
const TIMEOUT = 10000;
const EMAIL = process.env.UNPAYWALL_EMAIL || 'scihubot@users.noreply.github.com';

/**
 * Check Unpaywall for a free/open-access PDF of the given DOI.
 * @param {string} doi - Normalized DOI (e.g. "10.1038/nature12373")
 * @returns {{ url: string|null, source: string|null, isOa: boolean, error: string|null }}
 */
async function checkUnpaywall(doi) {
  try {
    const url = `${API_BASE}/${encodeURIComponent(doi)}?email=${encodeURIComponent(EMAIL)}`;
    const { data } = await axios.get(url, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': 'SciHubBot/2.0' },
      validateStatus: (s) => s >= 200 && s < 500,
    });

    if (data.statusCode === 404 || data.message) {
      // Unpaywall returns 200 with error body for unknown DOIs
      return { url: null, source: null, isOa: false, error: null };
    }

    if (!data.is_oa) {
      return { url: null, source: null, isOa: false, error: null };
    }

    // Try best_oa_location first, then any oa_locations with a url_for_pdf
    const best = data.best_oa_location;
    if (best?.url_for_pdf) {
      return {
        url: best.url_for_pdf,
        source: best.host_type === 'publisher' ? 'Publisher (OA)' : 'Open Access Repository',
        isOa: true,
        error: null,
      };
    }

    // Fallback: scan all OA locations for a direct PDF link
    const locations = data.oa_locations || [];
    for (const loc of locations) {
      if (loc.url_for_pdf) {
        return {
          url: loc.url_for_pdf,
          source: loc.host_type === 'publisher' ? 'Publisher (OA)' : 'Open Access Repository',
          isOa: true,
          error: null,
        };
      }
    }

    // OA but no direct PDF URL — return the landing page as fallback
    if (best?.url_for_landing_page) {
      return {
        url: null,
        source: best.url_for_landing_page,
        isOa: true,
        error: null,
        landingPage: best.url_for_landing_page,
      };
    }

    return { url: null, source: null, isOa: true, error: null };
  } catch (err) {
    if (err.response?.status === 404) {
      return { url: null, source: null, isOa: false, error: null };
    }
    console.error('[UNPAYWALL] Error:', err.message);
    return { url: null, source: null, isOa: false, error: err.message };
  }
}

module.exports = { checkUnpaywall };
