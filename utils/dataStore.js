/**
 * Data Store — JSON-backed storage for stats, downloads, and bans.
 * All files live in ./data/ directory.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const DOWNLOADS_FILE = path.join(DATA_DIR, 'downloads.json');
const BANS_FILE = path.join(DATA_DIR, 'bans.json');

const MAX_DOWNLOADS = 500; // rotating log

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// --- Helpers ---

function readJSON(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.error(`[DATA] Failed to read ${filePath}:`, e.message);
  }
  return defaultValue;
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`[DATA] Failed to write ${filePath}:`, e.message);
  }
}

function todayKey() {
  return new Date().toISOString().split('T')[0]; // "2026-06-05"
}

// --- Stats ---

function getStats() {
  return readJSON(STATS_FILE, {
    totalDownloads: 0,
    totalFailures: 0,
    uniqueUsers: [],
    daily: {},
  });
}

function saveStats(stats) {
  writeJSON(STATS_FILE, stats);
}

/**
 * Record a download attempt.
 */
function recordDownload({ userId, doi, success, cached, error }) {
  const stats = getStats();
  const day = todayKey();

  if (!stats.daily[day]) {
    stats.daily[day] = { downloads: 0, failures: 0, users: [] };
  }

  if (success) {
    stats.totalDownloads++;
    stats.daily[day].downloads++;
  } else {
    stats.totalFailures++;
    stats.daily[day].failures++;
  }

  // Track unique users
  if (!stats.uniqueUsers.includes(userId)) {
    stats.uniqueUsers.push(userId);
  }
  if (!stats.daily[day].users.includes(userId)) {
    stats.daily[day].users.push(userId);
  }

  saveStats(stats);

  // Also log to downloads history
  logDownload({ userId, doi, success, cached, error });
}

// --- Downloads Log ---

function getDownloads() {
  return readJSON(DOWNLOADS_FILE, []);
}

function logDownload({ userId, doi, success, cached, error }) {
  const downloads = getDownloads();
  downloads.unshift({
    userId,
    doi: doi || 'unknown',
    success,
    cached: cached || false,
    error: error || null,
    timestamp: new Date().toISOString(),
  });

  // Rotate — keep last MAX_DOWNLOADS
  if (downloads.length > MAX_DOWNLOADS) {
    downloads.length = MAX_DOWNLOADS;
  }

  writeJSON(DOWNLOADS_FILE, downloads);
}

// --- Bans ---

function getBans() {
  return readJSON(BANS_FILE, []);
}

function isBanned(userId) {
  const bans = getBans();
  return bans.includes(userId);
}

function banUser(userId) {
  const bans = getBans();
  if (!bans.includes(userId)) {
    bans.push(userId);
    writeJSON(BANS_FILE, bans);
    return true;
  }
  return false;
}

function unbanUser(userId) {
  let bans = getBans();
  const idx = bans.indexOf(userId);
  if (idx !== -1) {
    bans.splice(idx, 1);
    writeJSON(BANS_FILE, bans);
    return true;
  }
  return false;
}

module.exports = {
  getStats, recordDownload,
  getDownloads, logDownload,
  getBans, isBanned, banUser, unbanUser,
};
