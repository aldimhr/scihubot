# Sci-Hub Bot Improvements — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add download concurrency queue (max 5), PDF caching by DOI, and better publisher URL DOI extraction to the Sci-Hub Telegram bot.

**Architecture:**
- **Queue:** In-memory FIFO queue with max 5 concurrent slots. Users get queue position feedback. Uses a simple semaphore pattern — no external deps.
- **Cache:** Local filesystem cache at `./cache/` keyed by DOI hash. LRU eviction when cache exceeds 500MB. Serve cached PDFs instantly without hitting Sci-Hub.
- **Publisher URLs:** Better DOI extraction from publisher pages — follow doi.org redirects, parse `citation_doi` meta tags, handle major publishers (Elsevier, Springer, Wiley, Nature, IEEE, ACM).

**Tech Stack:** Node.js, Telegraf, axios, node-html-parser (all already installed)

**Repo:** `/opt/hermes/scihubot`

---

## Task 1: Create download queue module

**Objective:** Build an in-memory queue that limits concurrent Sci-Hub downloads to 5 and provides queue position feedback.

**Files:**
- Create: `utils/downloadQueue.js`

**Implementation:**

```javascript
// utils/downloadQueue.js
const MAX_CONCURRENT = 5;
let active = 0;
const waiting = [];

function getStatus() {
  return { active, waiting: waiting.length, max: MAX_CONCURRENT };
}

/**
 * Enqueue a download job.
 * @param {Function} fn - async function to execute (receives no args)
 * @param {Function} onQueue - called with (position, total) when queued
 * @returns {Promise} - resolves with fn()'s return value
 */
function enqueue(fn, onQueue) {
  return new Promise((resolve, reject) => {
    const job = { fn, resolve, reject };
    if (active < MAX_CONCURRENT) {
      active++;
      runJob(job);
    } else {
      waiting.push(job);
      if (onQueue) onQueue(waiting.length, active + waiting.length);
    }
  });
}

async function runJob(job) {
  try {
    const result = await job.fn();
    job.resolve(result);
  } catch (err) {
    job.reject(err);
  } finally {
    active--;
    if (waiting.length > 0) {
      active++;
      runJob(waiting.shift());
    }
  }
}

module.exports = { enqueue, getStatus };
```

**Verification:**
- `node -e "const q = require('./utils/downloadQueue'); console.log(q.getStatus())"` → `{ active: 0, waiting: 0, max: 5 }`
- Commit: `feat: add download queue with max 5 concurrent slots`

---

## Task 2: Create PDF cache module

**Objective:** Cache downloaded PDFs locally by DOI hash. Check cache before hitting Sci-Hub.

**Files:**
- Create: `utils/cache.js`
- Create: `cache/` directory (gitignored)

**Implementation:**

```javascript
// utils/cache.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
const MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500MB

// Ensure cache dir exists
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function hashDOI(doi) {
  return crypto.createHash('md5').update(doi.toLowerCase().trim()).digest('hex');
}

function getCachePath(doi) {
  return path.join(CACHE_DIR, hashDOI(doi) + '.pdf');
}

function get(doi) {
  const filePath = getCachePath(doi);
  if (fs.existsSync(filePath)) {
    // Update access time
    fs.utimesSync(filePath, new Date(), new Date());
    return fs.readFileSync(filePath);
  }
  return null;
}

function set(doi, buffer) {
  const filePath = getCachePath(doi);
  fs.writeFileSync(filePath, buffer);
  evictIfNeeded();
}

function evictIfNeeded() {
  const files = fs.readdirSync(CACHE_DIR)
    .filter(f => f.endsWith('.pdf'))
    .map(f => ({
      name: f,
      path: path.join(CACHE_DIR, f),
      size: fs.statSync(path.join(CACHE_DIR, f)).size,
      atime: fs.statSync(path.join(CACHE_DIR, f)).atimeMs,
    }));

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize <= MAX_CACHE_SIZE) return;

  // Sort by access time (oldest first), evict until under limit
  files.sort((a, b) => a.atime - b.atime);
  let currentSize = totalSize;
  for (const file of files) {
    if (currentSize <= MAX_CACHE_SIZE) break;
    fs.unlinkSync(file.path);
    currentSize -= file.size;
    console.log(`[CACHE] Evicted: ${file.name}`);
  }
}

function stats() {
  if (!fs.existsSync(CACHE_DIR)) return { files: 0, sizeMB: 0 };
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.pdf'));
  const totalSize = files.reduce((sum, f) => {
    return sum + fs.statSync(path.join(CACHE_DIR, f)).size;
  }, 0);
  return { files: files.length, sizeMB: (totalSize / 1024 / 1024).toFixed(1) };
}

module.exports = { get, set, stats };
```

**Also:** Add `cache/` to `.gitignore`

**Verification:**
- `node -e "const c = require('./utils/cache'); c.set('test/123', Buffer.from('hello')); console.log(c.get('test/123').toString());"` → `hello`
- Commit: `feat: add PDF cache with LRU eviction (500MB max)`

---

## Task 3: Integrate queue + cache into linkEntity.js

**Objective:** Wire the queue and cache into the main URL handler so downloads are queued and cached.

**Files:**
- Modify: `actions/linkEntity.js`

**Changes:**
1. Import `cache` and `downloadQueue`
2. Before calling Sci-Hub, check cache first
3. Wrap the full download flow (sciHub + downloadFile) in `enqueue()`
4. After successful download, save to cache
5. Show queue position to user if queued

**Verification:**
- Send a DOI link → bot shows "🕵️ Searching..." → PDF arrives
- Send same DOI again → PDF arrives instantly (cached, no Sci-Hub hit)
- Send 6 DOIs rapidly → 6th shows queue position
- Commit: `feat: integrate download queue and PDF cache`

---

## Task 4: Integrate queue + cache into textMessage.js

**Objective:** Same queue/cache integration for the raw DOI text handler.

**Files:**
- Modify: `actions/textMessage.js`

**Changes:** Same pattern as Task 3.

**Verification:**
- Send `10.1038/s41586-020-2649-2` as text → works
- Send same DOI again → cached (instant)
- Commit: `feat: integrate queue and cache into text handler`

---

## Task 5: Improve publisher URL DOI extraction

**Objective:** Better DOI extraction from publisher pages — handle redirect chains, multiple meta tag patterns, and major publisher HTML structures.

**Files:**
- Modify: `utils/index.js` (update `getMetaDOI`)

**Changes:**

1. **Follow doi.org redirects:** If URL is `doi.org/...`, follow redirect to get the actual publisher URL, then extract DOI from there
2. **Better meta tag parsing:** Check these in order:
   - `meta[name="citation_doi"]`
   - `meta[property="citation_doi"]`
   - `meta[name="DOI"]`
   - `meta[property="og:doi"]`
   - `link[rel="canonical"]` URL containing doi.org
   - JSON-LD script tags with DOI
3. **URL pattern matching:** If meta tags fail, try regex extraction:
   - `10.\d{4,9}/[-._;()/:A-Z0-9]+` from page content
4. **Publisher-specific selectors:**
   - Nature/Springer: `.c-bibliographic-information__value` containing DOI
   - Elsevier: `#doi-link` or `dd` next to "DOI" label
   - Wiley: `.citation__DOI`
   - IEEE: `.stats-document-abstract-doi`

**Verification:**
- `https://www.nature.com/articles/laban.665` → extracts DOI → downloads PDF
- `https://www.sciencedirect.com/science/article/pii/S0304395999002342` → extracts DOI
- `https://doi.org/10.1038/s41586-020-2649-2` → follows redirect → extracts DOI
- Commit: `feat: improve publisher URL DOI extraction with fallbacks`

---

## Task 6: Add cache stats to /help and admin commands

**Objective:** Show cache stats in help text, add `/cache` admin command.

**Files:**
- Modify: `utils/constans.js` (update help text)
- Modify: `actions/command.js` (add `/cache` command)
- Modify: `bot.js` (register `/cache` command)

**Verification:**
- Send `/cache` as admin → shows "Cached: 5 files, 12.3MB"
- Commit: `feat: add cache stats command`

---

## Task 7: Restart, test end-to-end, commit & push

**Objective:** Full integration test.

**Steps:**
1. `systemctl restart scihubot`
2. Send a doi.org link → verify PDF arrives
3. Send same DOI again → verify instant (cached)
4. Send a publisher URL (Nature/Elsevier) → verify DOI extracted + PDF arrives
5. Send 6 rapid requests → verify queue behavior
6. `/cache` → verify stats shown
7. `git push origin main`

---

## Execution Order

```
Task 1 (queue)     → independent, can test standalone
Task 2 (cache)     → independent, can test standalone
Task 3 (linkEntity integration) → depends on 1, 2
Task 4 (textMessage integration) → depends on 1, 2
Task 5 (publisher URLs) → independent
Task 6 (admin/cache cmd) → depends on 2
Task 7 (e2e test)  → depends on all
```

Tasks 1, 2, and 5 can be done in parallel.
