/**
 * PDF Cache — stores downloaded PDFs locally keyed by DOI hash.
 * Serves cached PDFs instantly, evicts LRU when over 500MB.
 * All I/O is async to avoid blocking the event loop.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
const MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500MB

// Ensure cache dir exists (sync is OK at startup)
if (!fsSync.existsSync(CACHE_DIR)) {
  fsSync.mkdirSync(CACHE_DIR, { recursive: true });
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
async function get(doi) {
  const filePath = getCachePath(doi);
  try {
    await fs.access(filePath);
    // Update access time for LRU
    const now = new Date();
    await fs.utimes(filePath, now, now);
    console.log(`[CACHE] Hit: ${doi}`);
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

/**
 * Cache a PDF buffer for a DOI.
 */
async function set(doi, buffer) {
  const filePath = getCachePath(doi);
  await fs.writeFile(filePath, buffer);
  console.log(`[CACHE] Stored: ${doi} (${(buffer.length / 1024).toFixed(0)}KB)`);
  await evictIfNeeded();
}

/**
 * LRU eviction — remove oldest accessed files until under MAX_CACHE_SIZE.
 */
async function evictIfNeeded() {
  const files = await listCacheFiles();
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  if (totalSize <= MAX_CACHE_SIZE) return;

  // Sort by access time (oldest first)
  files.sort((a, b) => a.atime - b.atime);

  let currentSize = totalSize;
  for (const file of files) {
    if (currentSize <= MAX_CACHE_SIZE) break;
    try {
      await fs.unlink(file.path);
      currentSize -= file.size;
      console.log(`[CACHE] Evicted: ${file.name} (${(file.size / 1024).toFixed(0)}KB)`);
    } catch {
      // File might have been removed already
    }
  }
}

async function listCacheFiles() {
  try {
    const entries = await fs.readdir(CACHE_DIR);
    const pdfFiles = entries.filter(f => f.endsWith('.pdf'));

    const results = await Promise.all(
      pdfFiles.map(async (f) => {
        try {
          const stats = await fs.stat(path.join(CACHE_DIR, f));
          return {
            name: f,
            path: path.join(CACHE_DIR, f),
            size: stats.size,
            atime: stats.atimeMs,
          };
        } catch {
          return null;
        }
      })
    );

    return results.filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get cache statistics (sync — only used by admin commands).
 */
function stats() {
  try {
    const files = fsSync.readdirSync(CACHE_DIR).filter(f => f.endsWith('.pdf'));
    let totalSize = 0;
    for (const f of files) {
      try {
        const s = fsSync.statSync(path.join(CACHE_DIR, f));
        totalSize += s.size;
      } catch { /* skip */ }
    }
    return {
      files: files.length,
      sizeMB: (totalSize / 1024 / 1024).toFixed(1),
      maxSizeMB: (MAX_CACHE_SIZE / 1024 / 1024).toFixed(0),
    };
  } catch {
    return { files: 0, sizeMB: '0', maxSizeMB: '500' };
  }
}

module.exports = { get, set, stats };
