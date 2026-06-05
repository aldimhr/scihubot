const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Sci-Hub Mirror Auto-Discovery
 * 
 * - Maintains a seed list of known Sci-Hub domains
 * - Tests each mirror with a known DOI on startup + periodically
 * - Caches working mirrors sorted by response time
 * - Runtime failure tracking: marks mirrors unhealthy after consecutive failures
 */

// --- Configuration ---
const CACHE_PATH = path.join(__dirname, '..', 'data', 'mirrors.json');
const HEALTH_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes
const REQUEST_TIMEOUT = 15000;
const MAX_CONSECUTIVE_FAILURES = 3;
const KNOWN_TEST_DOI = '10.1038/nature12373'; // well-known paper

// --- Seed list of known Sci-Hub mirrors ---
const SEED_MIRRORS = [
  'https://sci-hub.ru',
  'https://sci-hub.st',
  'https://sci-hub.se',
  'https://sci-hub.ren',
  'https://sci-hub.ee',
  'https://sci-hub.do',
  'https://sci-hub.wf',
  'https://sci-hub.shop',
  'https://sci-hub.tf',
  'https://sci-hub.nz',
  'https://sci-hub.mksa.top',
  'https://sci-hub.gup.life',
  'https://sci-hub.41610.org',
  'https://sci-hub.3lib.net',
  'https://sci-hub.libgen.is',
];

// --- State ---
let mirrors = new Map(); // domain -> { url, status, responseTime, lastChecked, failures }
let lastHealthCheck = 0;
let healthCheckTimer = null;

/**
 * Initialize mirror discovery. Loads cache, starts background health checks.
 */
function init() {
  loadCache();
  // Run health check on startup (after a short delay to not block bot launch)
  setTimeout(() => runHealthCheck(), 5000);
  // Schedule periodic health checks
  healthCheckTimer = setInterval(() => runHealthCheck(), HEALTH_CHECK_INTERVAL);
  console.log('[MIRROR] Initialized with', mirrors.size, 'mirrors from cache');
}

/**
 * Get working mirrors sorted by response time (fastest first).
 * @returns {string[]} Array of mirror URLs
 */
function getMirrors() {
  const working = [];
  for (const [domain, info] of mirrors) {
    if (info.status === 'working') {
      working.push({ url: info.url, responseTime: info.responseTime });
    }
  }
  // Sort by response time (fastest first)
  working.sort((a, b) => a.responseTime - b.responseTime);
  return working.map(m => m.url);
}

/**
 * Get all mirrors with their status (for admin display).
 * @returns {Object[]} Array of mirror info objects
 */
function getMirrorStatus() {
  const result = [];
  for (const [domain, info] of mirrors) {
    result.push({
      url: info.url,
      status: info.status,
      responseTime: info.responseTime,
      lastChecked: info.lastChecked,
      failures: info.failures || 0,
    });
  }
  // Sort: working first, then by response time
  result.sort((a, b) => {
    if (a.status === 'working' && b.status !== 'working') return -1;
    if (a.status !== 'working' && b.status === 'working') return 1;
    return a.responseTime - b.responseTime;
  });
  return result;
}

/**
 * Report a mirror failure at runtime. After MAX_CONSECUTIVE_FAILURES, marks unhealthy.
 * @param {string} mirrorUrl - The mirror URL that failed
 */
function reportFailure(mirrorUrl) {
  const domain = extractDomain(mirrorUrl);
  const info = mirrors.get(domain);
  if (!info) return;

  info.failures = (info.failures || 0) + 1;
  if (info.failures >= MAX_CONSECUTIVE_FAILURES) {
    info.status = 'unhealthy';
    console.log(`[MIRROR] ${domain} marked unhealthy after ${info.failures} consecutive failures`);
  }
  mirrors.set(domain, info);
  saveCache();
}

/**
 * Report a mirror success at runtime. Resets failure counter.
 * @param {string} mirrorUrl - The mirror URL that succeeded
 * @param {number} responseTime - Response time in ms
 */
function reportSuccess(mirrorUrl, responseTime) {
  const domain = extractDomain(mirrorUrl);
  const info = mirrors.get(domain) || { url: mirrorUrl };
  info.failures = 0;
  info.status = 'working';
  info.responseTime = responseTime;
  mirrors.set(domain, info);
  saveCache();
}

/**
 * Run a health check on all seed mirrors + cached mirrors.
 */
async function runHealthCheck() {
  console.log('[MIRROR] Running health check...');
  const domains = new Set([...SEED_MIRRORS.map(extractDomain), ...mirrors.keys()]);
  const results = await Promise.allSettled(
    [...domains].map(domain => testMirror(domain))
  );

  let working = 0;
  let failed = 0;
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      working++;
    } else {
      failed++;
    }
  }

  lastHealthCheck = Date.now();
  saveCache();
  console.log(`[MIRROR] Health check done: ${working} working, ${failed} failed`);
}

/**
 * Test a single mirror with a known DOI.
 * @param {string} domain - Domain to test (e.g. "sci-hub.ru")
 * @returns {boolean} Whether the mirror is working
 */
async function testMirror(domain) {
  const url = `https://${domain}`;
  const testUrl = `${url}/${KNOWN_TEST_DOI}`;
  const startTime = Date.now();

  try {
    const response = await axios.get(testUrl, {
      timeout: REQUEST_TIMEOUT,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      validateStatus: (s) => s >= 200 && s < 400,
    });

    const elapsed = Date.now() - startTime;
    const html = response.data || '';

    // Check if it looks like a Sci-Hub page (has PDF embed or citation)
    const isSciHub = html.includes('application/pdf') ||
                     html.includes('citation_pdf_url') ||
                     html.includes('sci-hub') ||
                     (html.includes('embed') && html.includes('.pdf'));

    if (isSciHub) {
      mirrors.set(domain, {
        url,
        status: 'working',
        responseTime: elapsed,
        lastChecked: new Date().toISOString(),
        failures: 0,
      });
      console.log(`[MIRROR] ✅ ${domain} — ${elapsed}ms`);
      return true;
    } else {
      // Got a response but doesn't look like Sci-Hub
      mirrors.set(domain, {
        ...(mirrors.get(domain) || {}),
        url,
        status: 'not-scihub',
        responseTime: elapsed,
        lastChecked: new Date().toISOString(),
      });
      console.log(`[MIRROR] ⚠️ ${domain} — responded but not Sci-Hub`);
      return false;
    }
  } catch (err) {
    const elapsed = Date.now() - startTime;
    const existing = mirrors.get(domain) || {};
    mirrors.set(domain, {
      ...existing,
      url,
      status: 'down',
      responseTime: existing.responseTime || elapsed,
      lastChecked: new Date().toISOString(),
    });
    console.log(`[MIRROR] ❌ ${domain} — ${err.code || err.message}`);
    return false;
  }
}

/**
 * Extract domain from a full URL.
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
}

/**
 * Load mirror cache from disk.
 */
function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const data = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      mirrors = new Map(Object.entries(data));
    }
  } catch (err) {
    console.error('[MIRROR] Failed to load cache:', err.message);
  }

  // Ensure all seed mirrors are in the map (even if not cached)
  for (const seedUrl of SEED_MIRRORS) {
    const domain = extractDomain(seedUrl);
    if (!mirrors.has(domain)) {
      mirrors.set(domain, {
        url: seedUrl,
        status: 'unknown',
        responseTime: 99999,
        lastChecked: null,
        failures: 0,
      });
    }
  }
}

/**
 * Save mirror cache to disk.
 */
function saveCache() {
  try {
    const data = Object.fromEntries(mirrors);
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[MIRROR] Failed to save cache:', err.message);
  }
}

module.exports = {
  init,
  getMirrors,
  getMirrorStatus,
  reportFailure,
  reportSuccess,
  runHealthCheck,
  HEALTH_CHECK_INTERVAL,
};
