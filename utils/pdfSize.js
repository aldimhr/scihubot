const axios = require('axios');

const TELEGRAM_MAX_FILE = 50 * 1024 * 1024; // 50 MB

/**
 * Send a HEAD request to get the Content-Length of a file.
 * @param {string} url - The PDF URL
 * @returns {{ size: number|null, error: string|null }}
 */
async function getFileSize(url) {
  try {
    const res = await axios.head(url, {
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      validateStatus: (s) => s >= 200 && s < 400,
    });

    const contentLength = parseInt(res.headers['content-length'], 10);
    if (!isNaN(contentLength) && contentLength > 0) {
      return { size: contentLength, error: null };
    }
    return { size: null, error: null }; // Server didn't provide size
  } catch (err) {
    console.error('[PDF-SIZE] HEAD request failed:', err.message);
    return { size: null, error: null }; // Non-fatal — proceed without size info
  }
}

/**
 * Format bytes into human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
function formatSize(bytes) {
  if (!bytes || bytes <= 0) return 'unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Check if a file size exceeds Telegram's send limit.
 * @param {number|null} size - File size in bytes (null = unknown)
 * @returns {{ tooLarge: boolean, label: string }}
 */
function sizeStatus(size) {
  if (size === null) {
    return { tooLarge: false, label: '📦 Size: unknown' };
  }
  const label = `📦 Size: ${formatSize(size)}`;
  if (size > TELEGRAM_MAX_FILE) {
    return {
      tooLarge: true,
      label: `${label} ⚠️ _exceeds 50 MB limit_`,
    };
  }
  return { tooLarge: false, label };
}

module.exports = { getFileSize, formatSize, sizeStatus, TELEGRAM_MAX_FILE };
