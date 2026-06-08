/**
 * Unified Download — races all PDF sources in parallel for fastest result.
 *
 * Instead of: Sci-Hub (42s) → then fallback (4s) = 46s
 * We do:      Sci-Hub ∥ Unpaywall ∥ CrossRef ∥ Preprints → first wins
 *
 * For OA papers: Unpaywall/preprints win in ~2-4s
 * For paywalled: Sci-Hub wins in ~8-15s (one mirror, not all 5)
 * For neither:   Collects landing pages for smart buttons
 */

const { checkUnpaywall } = require('./unpaywall.js');
const { checkCrossRefLinks } = require('./crossrefLinks.js');
const { checkPreprints } = require('./preprints.js');
const sciHub = require('./sciHub.js');
const downloadFile = require('./downloadFile.js');

const PER_SOURCE_TIMEOUT = 20000; // 20s max per source download
const LOOKUP_TIMEOUT = 12000;     // 12s max per source lookup (API calls)
const SCIHUB_TIMEOUT = 60000;     // 60s for Sci-Hub (tries multiple mirrors sequentially)

/**
 * Try to download a PDF from a URL with timeout.
 * @param {string} url
 * @param {string} source - Label for logging
 * @returns {Promise<{data: Buffer|null, error: string|null}>}
 */
async function downloadWithTimeout(url, source) {
  return Promise.race([
    downloadFile(url),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${source} download timeout`)), PER_SOURCE_TIMEOUT)
    ),
  ]).catch((err) => {
    console.log(`[UNIFIED] ${source} download failed: ${err.message}`);
    return { data: null, error: err.message };
  });
}

/**
 * Wrap a lookup+download in a single promise with timeout.
 * @param {Function} lookupFn - async () => { url, source, error }
 * @param {string} label - Human label for logging/progress
 * @param {Function} progressCb
 * @param {number} timeout - Custom timeout in ms (default LOOKUP_TIMEOUT)
 * @returns {Promise<{data: Buffer|null, source: string|null, url: string|null, error: string|null}>}
 */
async function trySource(lookupFn, label, progressCb, timeout = LOOKUP_TIMEOUT) {
  try {
    const lookup = await Promise.race([
      lookupFn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} lookup timeout`)), timeout)
      ),
    ]);

    if (!lookup || !lookup.url || lookup.error) {
      return { data: null, source: null, url: null, landingPage: lookup?.landingPage, error: lookup?.error || 'no URL' };
    }

    progressCb(`📄 Found on ${lookup.source || label}! Downloading...`);
    const dl = await downloadWithTimeout(lookup.url, lookup.source || label);

    if (!dl.error && dl.data) {
      return { data: dl.data, source: lookup.source || label, url: lookup.url, error: null };
    }
    return { data: null, source: null, url: null, error: dl.error };
  } catch (err) {
    console.log(`[UNIFIED] ${label} failed: ${err.message}`);
    return { data: null, source: null, url: null, error: err.message };
  }
}

/**
 * Download PDF from the fastest available source.
 * Races Sci-Hub against all free sources in parallel.
 *
 * @param {string} doiURL - Full DOI URL (e.g. "https://doi.org/10.1234/test")
 * @param {string} doi - Normalized DOI
 * @param {string} title - Paper title (for preprint search)
 * @param {Function} progressCb - (text) => void
 * @returns {Promise<{data: Buffer|null, source: string|null, citation: string|null, landingPages: Array, error: string|null}>}
 */
async function downloadFromAnySource(doiURL, doi, title, progressCb = () => {}) {
  progressCb('🔍 Searching all sources...');

  // Race all sources in parallel
  const sources = [
    // Sci-Hub (main source for paywalled papers — needs longer timeout for mirror rotation)
    (async () => {
      let shResult = null;
      const result = await trySource(
        async () => {
          const sh = await sciHub(doiURL);
          shResult = sh; // capture for citation
          if (sh.error || !sh.data) return { url: null, error: sh.error };
          return { url: sh.data, source: 'Sci-Hub', error: null };
        },
        'Sci-Hub',
        progressCb,
        SCIHUB_TIMEOUT  // longer timeout — Sci-Hub tries mirrors sequentially
      );
      // Attach citation from Sci-Hub if available
      if (result.data && shResult?.citation) {
        result.citation = shResult.citation;
      }
      return result;
    })(),

    // Unpaywall (fastest for OA papers)
    trySource(
      async () => {
        const uw = await checkUnpaywall(doi);
        if (uw.url) return { url: uw.url, source: uw.source, error: null };
        return { url: null, error: null, landingPage: uw.landingPage };
      },
      'Unpaywall',
      progressCb
    ),

    // CrossRef links
    trySource(
      async () => {
        const cr = await checkCrossRefLinks(doi);
        if (cr.url) return { url: cr.url, source: cr.source, error: null };
        return { url: null, error: null, landingPage: cr.landingPage };
      },
      'CrossRef',
      progressCb
    ),

    // Preprint servers
    trySource(
      async () => {
        const pp = await checkPreprints(doi, title);
        if (pp.url) return { url: pp.url, source: pp.source, error: null };
        return { url: null, error: null };
      },
      'Preprints',
      progressCb
    ),
  ];

  // Wait for ALL to settle — pick first successful PDF
  const results = await Promise.allSettled(sources);

  let winner = null;
  let sciHubNotFound = false;
  const landingPages = [];

  for (const r of results) {
    const val = r.status === 'fulfilled' ? r.value : null;
    if (!val) continue;

    // Collect landing pages from failed lookups
    if (val.landingPage) {
      const label = val.source || 'Publisher';
      landingPages.push({ url: val.landingPage, label });
    }

    // Track if Sci-Hub explicitly said "not in database"
    if (val.error === 'not-found') {
      sciHubNotFound = true;
    }

    // First valid PDF wins
    if (!winner && val.data && val.error === null) {
      winner = val;
    }
  }

  if (winner) {
    return {
      data: winner.data,
      source: winner.source,
      citation: winner.citation || null,
      landingPages,
      error: null,
    };
  }

  return {
    data: null,
    source: null,
    citation: null,
    landingPages,
    sciHubNotFound,  // true if Sci-Hub explicitly doesn't have this paper
    error: 'Not found in any source',
  };
}

/**
 * Build inline keyboard for "not found" case with smart redirect buttons.
 * Re-exported from fallbackChain for convenience.
 */
const { buildNotFoundKeyboard } = require('./fallbackChain.js');

module.exports = { downloadFromAnySource, buildNotFoundKeyboard };
