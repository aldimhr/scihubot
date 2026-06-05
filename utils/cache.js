/**
 * PDF Cache — stores downloaded PDFs locally keyed by DOI hash.
 * Serves cached PDFs instantly, evicts LRU when over 500MB.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
const MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500MB

// Ensure cache dir exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function hashDOI(doi) {
  return crypto.createHash('md5').update(doi.toLowerCase().trim()).digest('hex');
}

function getCachePath(doi) {
  return path.join(CACHE_DIR, hashDOI(doi) + '.pdf');
}

/**
 * Get cached PDF buffer for a DOI. Returns null if not cached.
 */
function get(doi) {
  const filePath = getCachePath(doi);
  if (fs.existsSync(filePath)) {
    // Update access time for LRU
    const now = new Date();
    fs.utimesSync(filePath, now, now);
    console.log(`[CACHE] Hit: ${doi}`);
    return fs.readFileSync(filePath);
  }
  return null;
}

/**
 * Cache a PDF buffer for a DOI.
 */
function set(doi, buffer) {
  const filePath = getCachePath(doi);
  fs.writeFileSync(filePath, buffer);
  console.log(`[CACHE] Stored: ${doi} (${(buffer.length / 1024).toFixed(0)}KB)`);
  evictIfNeeded();
}

/**
 * LRU eviction — remove oldest accessed files until under MAX_CACHE_SIZE.
 */
function evictIfNeeded() {
  const files = listCacheFiles();
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  if (totalSize <= MAX_CACHE_SIZE) return;

  // Sort by access time (oldest first)
  files.sort((a, b) => a.atime - b.atime);

  let currentSize = totalSize;
  for (const file of files) {
    if (currentSize <= MAX_CACHE_SIZE) break;
    try {
      fs.unlinkSync(file.path);
      currentSize -= file.size;
      console.log(`[CACHE] Evicted: ${file.name} (${(file.size / 1024).toFixed(0)}KB)`);
    } catch (e) {
      // File might have been removed already
    }
  }
}

function listCacheFiles() {
  if (!fs.existsSync(CACHE_DIR)) return [];
  return fs.readdirSync(CACHE_DIR)
    .filter(f => f.endsWith('.pdf'))
    .map(f => {
      try {
        const stats = fs.statSync(path.join(CACHE_DIR, f));
        return {
          name: f,
          path: path.join(CACHE_DIR, f),
          size: stats.size,
          atime: stats.atimeMs,
        };
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Get cache statistics.
 */
function stats() {
  const files = listCacheFiles();
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  return {
    files: files.length,
    sizeMB: (totalSize / 1024 / 1024).toFixed(1),
    maxSizeMB: (MAX_CACHE_SIZE / 1024 / 1024).toFixed(0),
  };
}

module.exports = { get, set, stats };
