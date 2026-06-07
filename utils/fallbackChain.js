/**
 * Fallback Chain — orchestrates alternative PDF sources when Sci-Hub fails.
 *
 * Chain order:
 *   1. Unpaywall (free OA PDFs from publishers/repos)
 *   2. CrossRef links (free full-text registered by publishers)
 *   3. Preprint servers (arXiv, bioRxiv, medRxiv)
 *   4. Smart redirect buttons (Google Scholar, publisher page)
 *
 * Each source returns { url, source, error } or null.
 * The chain stops at the first source that provides a direct PDF URL.
 */

const { checkUnpaywall } = require('./unpaywall.js');
const { checkCrossRefLinks } = require('./crossrefLinks.js');
const { checkPreprints } = require('./preprints.js');
const downloadFile = require('./downloadFile.js');

/**
 * Run the full fallback chain for a DOI.
 * @param {string} doi - Normalized DOI
 * @param {string} title - Paper title (used for preprint title search)
 * @param {function} progressCb - Optional callback to report progress: (text) => void
 * @returns {{ data: Buffer|null, source: string|null, landingPage: string|null, error: string|null }}
 */
async function fallbackChain(doi, title, progressCb = () => {}) {
  // ── Layer 1: Unpaywall ──
  progressCb('🔓 Checking Unpaywall (open access)...');
  const unpaywall = await checkUnpaywall(doi);

  if (unpaywall.url) {
    progressCb(`📄 Found on ${unpaywall.source}! Downloading...`);
    const result = await downloadFile(unpaywall.url);
    if (!result.error && result.data) {
      return { data: result.data, source: unpaywall.source, landingPage: null, error: null };
    }
    console.log('[FALLBACK] Unpaywall PDF download failed, trying next...');
  }

  // ── Layer 2: CrossRef links ──
  progressCb('🔗 Checking CrossRef free links...');
  const crossref = await checkCrossRefLinks(doi);

  if (crossref.url) {
    progressCb(`📄 Found via ${crossref.source}! Downloading...`);
    const result = await downloadFile(crossref.url);
    if (!result.error && result.data) {
      return { data: result.data, source: crossref.source, landingPage: null, error: null };
    }
    console.log('[FALLBACK] CrossRef link download failed, trying next...');
  }

  // ── Layer 3: Preprint servers ──
  progressCb('📚 Checking preprint servers (arXiv, bioRxiv)...');
  const preprint = await checkPreprints(doi, title);

  if (preprint.url) {
    progressCb(`📄 Found on ${preprint.source}! Downloading...`);
    const result = await downloadFile(preprint.url);
    if (!result.error && result.data) {
      return { data: result.data, source: preprint.source, landingPage: null, error: null };
    }
    console.log('[FALLBACK] Preprint download failed, trying next...');
  }

  // ── Layer 4: Collect landing pages for smart buttons ──
  const landingPages = collectLandingPages(unpaywall, crossref, preprint);

  return {
    data: null,
    source: null,
    landingPage: landingPages.length > 0 ? landingPages[0] : null,
    landingPages,
    error: 'Not found in any free source',
  };
}

/**
 * Collect all landing pages / partial results for smart redirect buttons.
 */
function collectLandingPages(unpaywall, crossref, preprint) {
  const pages = [];

  if (unpaywall.landingPage) {
    pages.push({ url: unpaywall.landingPage, label: '🔓 Open Access' });
  }
  if (crossref.landingPage) {
    pages.push({ url: crossref.landingPage, label: '📖 Publisher' });
  }
  if (preprint.url) {
    pages.push({ url: preprint.url, label: `📄 ${preprint.source}` });
  }

  return pages;
}

/**
 * Build inline keyboard for "not found" case with smart redirect buttons.
 * @param {string} doi - Paper DOI
 * @param {string} title - Paper title (for Google Scholar search)
 * @param {Array} landingPages - From fallbackChain result
 * @returns {Object} Telegram inline_keyboard markup
 */
function buildNotFoundKeyboard(doi, title, landingPages = []) {
  const row1 = [];

  // Google Scholar button (always available)
  const scholarQuery = title
    ? encodeURIComponent(title)
    : encodeURIComponent(`doi:${doi}`);
  row1.push({
    text: '🔍 Google Scholar',
    url: `https://scholar.google.com/scholar?q=${scholarQuery}`,
  });

  // Publisher DOI link
  row1.push({
    text: '📖 Publisher',
    url: `https://doi.org/${doi}`,
  });

  const keyboard = [row1];

  // Add landing pages from fallback sources if available
  if (landingPages.length > 0) {
    const row2 = landingPages.slice(0, 2).map(lp => ({
      text: lp.label,
      url: lp.url,
    }));
    keyboard.push(row2);
  }

  return { inline_keyboard: keyboard };
}

module.exports = { fallbackChain, buildNotFoundKeyboard };
