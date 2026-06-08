const axios = require('axios');
const citation = require('./citation.js');
const contants = require('./constans.js');
const db = require('./database.js');
const downloadFile = require('./downloadFile.js');
const errorHandler = require('./errorHandler.js');
const searchKeyword = require('./keyword.js');
const sciHub = require('./sciHub.js');
const downloadQueue = require('./downloadQueue.js');
const cache = require('./cache.js');
const { fallbackChain, buildNotFoundKeyboard } = require('./fallbackChain.js');
const { downloadFromAnySource } = require('./unifiedDownload.js');

var HTMLParser = require('node-html-parser');

const notifyAdmin = ({ message, ctx }) => {
  if (!ctx) return;
  [519613720, 1392922267].forEach((chatId) => {
    ctx.telegram.sendMessage(chatId, message).catch(() => {});
  });
};

/**
 * Extract DOI from a publisher URL.
 * Strategy: follow doi.org redirect → parse meta tags → regex fallback.
 */
let getMetaDOI = async (url, ctx) => {
  try {
    // Step 1: If it's a doi.org URL, follow the redirect to get the publisher page
    let targetUrl = url;
    if (url.includes('doi.org')) {
      try {
        const redirect = await axios.get(url, {
          maxRedirects: 0,
          validateStatus: (status) => status >= 200 && status < 400,
          timeout: 10000,
        });
        if (redirect.headers.location) {
          targetUrl = redirect.headers.location;
        }
      } catch (redirectErr) {
        // If redirect fails, try to extract DOI from the URL itself
        const doiMatch = url.match(/doi\.org\/(.+)/);
        if (doiMatch) {
          return { data: 'https://doi.org/' + doiMatch[1], error: false };
        }
      }
    }

    // Step 2: Fetch the publisher page
    const response = await axios.get(targetUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const html = response.data;
    const document = HTMLParser.parse(html);

    // Step 3: Try multiple meta tag patterns
    const doiFromMeta = extractDOIFromMeta(document);
    if (doiFromMeta) {
      return { data: 'https://doi.org/' + doiFromMeta, error: false };
    }

    // Step 4: Try publisher-specific selectors
    const doiFromPublisher = extractDOIFromPublisher(document, targetUrl);
    if (doiFromPublisher) {
      return { data: 'https://doi.org/' + doiFromPublisher, error: false };
    }

    // Step 5: Regex fallback — find DOI pattern in page content
    const doiFromRegex = extractDOIRegex(html);
    if (doiFromRegex) {
      return { data: 'https://doi.org/' + doiFromRegex, error: false };
    }

    return { data: null, error: true };
  } catch (err) {
    console.error('[META-DOI] Error:', err.message);
    errorHandler({ err, name: 'helpers/index.js getMetaDOI()' });
    return { data: null, error: true };
  }
};

/**
 * Extract DOI from meta tags — tries multiple patterns.
 */
function extractDOIFromMeta(document) {
  const selectors = [
    'meta[name="citation_doi"]',
    'meta[property="citation_doi"]',
    'meta[name="DOI"]',
    'meta[property="og:doi"]',
    'meta[name="dc.identifier"]',
    'meta[property="dc.identifier"]',
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const content = el.getAttribute('content');
      if (content && isValidDOI(content)) {
        console.log(`[META-DOI] Found via ${sel}: ${content}`);
        return normalizeDOI(content);
      }
    }
  }

  // Try JSON-LD
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const json = JSON.parse(script.text);
      const doi = findDOIInObject(json);
      if (doi) {
        console.log(`[META-DOI] Found via JSON-LD: ${doi}`);
        return normalizeDOI(doi);
      }
    } catch (e) {
      // invalid JSON, skip
    }
  }

  return null;
}

/**
 * Publisher-specific DOI selectors.
 */
function extractDOIFromPublisher(document, url) {
  // Nature / Springer
  if (url.includes('nature.com') || url.includes('springer.com')) {
    const doiEl = document.querySelector('.c-bibliographic-information__value');
    if (doiEl && isValidDOI(doiEl.text)) return normalizeDOI(doiEl.text);
  }

  // Elsevier / ScienceDirect
  if (url.includes('sciencedirect.com') || url.includes('elsevier.com')) {
    const doiLink = document.querySelector('a[href*="doi.org"]');
    if (doiLink) {
      const href = doiLink.getAttribute('href');
      const doiMatch = href.match(/doi\.org\/(.+)/);
      if (doiMatch) return normalizeDOI(doiMatch[1]);
    }
    // DOI in definition list
    const dts = document.querySelectorAll('dt');
    for (const dt of dts) {
      if (dt.text.toLowerCase().includes('doi')) {
        const dd = dt.nextElementSibling;
        if (dd && isValidDOI(dd.text)) return normalizeDOI(dd.text);
      }
    }
  }

  // Wiley
  if (url.includes('wiley.com')) {
    const doiEl = document.querySelector('.citation__DOI');
    if (doiEl) {
      const doiText = doiEl.text.replace('DOI:', '').trim();
      if (isValidDOI(doiText)) return normalizeDOI(doiText);
    }
  }

  // IEEE
  if (url.includes('ieee.org')) {
    const doiEl = document.querySelector('.stats-document-abstract-doi');
    if (doiEl) {
      const doiText = doiEl.text.replace('DOI:', '').trim();
      if (isValidDOI(doiText)) return normalizeDOI(doiText);
    }
  }

  // ACM
  if (url.includes('acm.org')) {
    const doiLink = document.querySelector('a[href*="doi.org"]');
    if (doiLink) {
      const href = doiLink.getAttribute('href');
      const doiMatch = href.match(/doi\.org\/(.+)/);
      if (doiMatch) return normalizeDOI(doiMatch[1]);
    }
  }

  return null;
}

/**
 * Regex fallback — find DOI pattern in raw HTML.
 */
function extractDOIRegex(html) {
  // Standard DOI pattern: 10.XXXX/...
  const matches = html.match(/10\.\d{4,9}\/[-._;()\/:A-Z0-9]+/gi);
  if (matches && matches.length > 0) {
    // Return the first valid-looking DOI
    for (const match of matches) {
      if (isValidDOI(match)) {
        return normalizeDOI(match);
      }
    }
  }
  return null;
}

/**
 * Recursively search a JSON-LD object for a DOI value.
 */
function findDOIInObject(obj) {
  if (!obj || typeof obj !== 'object') return null;

  // Check common DOI fields
  for (const key of ['doi', 'DOI', 'sameAs', 'identifier']) {
    if (obj[key] && typeof obj[key] === 'string' && isValidDOI(obj[key])) {
      return obj[key];
    }
  }

  // Check @id field
  if (obj['@id'] && typeof obj['@id'] === 'string' && obj['@id'].includes('doi.org')) {
    const doiMatch = obj['@id'].match(/doi\.org\/(.+)/);
    if (doiMatch) return doiMatch[1];
  }

  // Recurse into arrays and objects
  for (const key of Object.keys(obj)) {
    if (Array.isArray(obj[key])) {
      for (const item of obj[key]) {
        const found = findDOIInObject(item);
        if (found) return found;
      }
    } else if (typeof obj[key] === 'object') {
      const found = findDOIInObject(obj[key]);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Check if a string looks like a valid DOI.
 */
function isValidDOI(str) {
  if (!str || typeof str !== 'string') return false;
  str = str.trim();
  // Must start with 10. and have a slash separator
  return /^10\.\d{4,9}\/.+$/.test(str);
}

/**
 * Normalize a DOI — strip URL prefix, whitespace, trailing slashes.
 */
function normalizeDOI(doi) {
  if (!doi) return doi;
  doi = doi.trim();
  // Strip doi.org URL prefix if present
  doi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
  // Strip trailing whitespace and slashes
  doi = doi.replace(/\/+$/, '').trim();
  return doi;
}

module.exports = {
  searchKeyword, downloadFile, errorHandler, notifyAdmin, getMetaDOI,
  citation, contants, sciHub, db, downloadQueue, cache,
  fallbackChain, buildNotFoundKeyboard, downloadFromAnySource,
};
