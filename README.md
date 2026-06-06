# Sci-Hub Telegram Bot 📚

> Quoted from the [Sci-Hub website](https://sci-hub.se/): *"The goal of Sci-Hub is to provide free and unrestricted access to all scientific knowledge ever published in a journal or book form."*

A Telegram bot that downloads academic papers from Sci-Hub using DOI links, publisher URLs, or keyword search.

**[@Sci_Hubot](https://t.me/Sci_Hubot)**

---

## Features

### 🔗 Multiple Input Types
- **DOI URL** — `https://doi.org/10.1177/193229681300700321`
- **Bare DOI** — `10.1177/193229681300700321`
- **DOI prefix** — `DOI:10.1177/193229681300700321`
- **Publisher URL** — `https://www.nature.com/articles/laban.665`
- **Keyword search** — `/kw machine learning` or `/search neural networks`

### 📥 Batch Download
Send multiple DOIs at once (max 10):
```
10.1177/193229681300700321, 10.3389/fsurg.2020.593367
```
Comma-separated, newline-separated, or multiple doi.org links.

### 📄 Paper Info Cards
Before downloading, see a formatted card with:
- Title, authors, journal, year, volume
- Citation count
- File size (with 50 MB limit warning)
- Abstract (truncated)
- Download button + DOI link

### 🔍 Keyword Search
- Powered by Semantic Scholar + CrossRef APIs
- Auto-fallback if one API is rate-limited
- Pagination with year filters
- 5 results per page

### 🚀 Performance
- **Download queue** — 5 concurrent slots, FIFO ordering
- **PDF cache** — repeat requests served instantly (500 MB LRU cache)
- **Mirror auto-discovery** — tests ~15 Sci-Hub mirrors on startup + every 30 min, sorts by speed
- **Async file I/O** — non-blocking cache operations

### 📊 Admin Dashboard
Admin-only commands (hidden from regular users):
- `/stats` — download counters + per-day breakdown
- `/users` — recent user activity
- `/history` — recent download log
- `/ban` / `/unban` — user management
- `/status` — queue status
- `/mirrors` — Sci-Hub mirror health

### 💰 Donations
- Telegram Stars ⭐ payment integration
- `/donate` — choose amount (25/50/100/250/500)

### 📢 Updates Channel
- [@x0projects](https://t.me/x0projects) — updates & new bots

---

## Installation

```bash
git clone git@github.com:aldimhr/scihubot.git
cd scihubot
pnpm install
```

## Configuration

Create `.env` file:

```env
BOT_TOKEN=your_telegram_bot_token
```

Optional (for user tracking):
```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

## Development

```bash
# Start with auto-reload
pnpm dev

# Run tests
npx jest

# Run tests with verbose output
npx jest --verbose
```

## Production

```bash
node bot.js
```

Or use the systemd service:
```bash
sudo systemctl enable scihubot
sudo systemctl start scihubot
```

---

## Architecture

```
scihubot/
├── bot.js                    # Main bot setup, command registration, middleware
├── actions/
│   ├── linkEntity.js         # DOI URL / publisher URL handler
│   ├── textMessage.js        # Bare DOI / DOI prefix handler
│   ├── batchDownload.js      # Multi-DOI batch processor
│   ├── downloadCallback.js   # "Download PDF" button handler
│   ├── keyword.js            # /kw and /search commands
│   ├── donate.js             # Telegram Stars donation flow
│   ├── help.js               # /help command
│   └── command.js            # Admin commands (/stats, /ban, etc.)
├── utils/
│   ├── sciHub.js             # Sci-Hub querying with mirror discovery
│   ├── mirrorDiscovery.js    # Auto-discover + health check mirrors
│   ├── downloadFile.js       # Download + 4-layer PDF validation
│   ├── downloadQueue.js      # 5-slot concurrent queue
│   ├── cache.js              # LRU PDF cache (async I/O)
│   ├── parseDoi.js           # Multi-DOI parser (comma, newline, URLs)
│   ├── paperMeta.js          # CrossRef metadata + info card formatter
│   ├── keyword.js            # Semantic Scholar + CrossRef search
│   ├── pdfSize.js            # File size pre-check (HEAD request)
│   ├── pdfSplitter.js        # Split PDFs > 50 MB using pdf-lib
│   ├── sendPDF.js            # Shared PDF sending logic
│   ├── caption.js            # PDF caption builder
│   ├── progress.js           # Progress message helper (edits in-place)
│   ├── isPDF.js              # PDF validation (magic bytes)
│   ├── dataStore.js          # JSON-based stats/downloads/bans
│   ├── constans.js           # Config constants + messages
│   ├── index.js              # Utility barrel export
│   ├── database.js           # Optional Supabase wrapper
│   ├── citation.js           # Citation formatting
│   └── errorHandler.js       # Error logging
├── data/                     # Runtime data (gitignored)
│   ├── stats.json
│   ├── downloads.json
│   ├── bans.json
│   └── mirrors.json
├── cache/                    # PDF cache (gitignored)
├── test/
│   └── helpers.test.js       # 75 tests covering all input types
└── .env                      # Environment variables
```

---

## Test Coverage

```bash
npx jest --verbose
```

| Category | Tests | Coverage |
|---|---|---|
| DOI URL parsing | 5 | regex extraction, trailing slashes, complex paths |
| Bare DOI parsing | 7 | slash handling, leading slash, special chars |
| DOI prefix parsing | 4 | case-insensitive DOI:/doi:/Doi: |
| Publisher URL detection | 3 | URL classification, normalization |
| CrossRef metadata | 4 | real API calls for 3 DOIs + error handling |
| Info card rendering | 10 | title, authors, journal, abstract, size |
| Keyboard buttons | 4 | download, DOI link, channel, too-large |
| Keyword search | 6 | API fallback, pagination, year filter |
| PDF validation | 6 | valid PDF, HTML, too-small, null |
| File size utilities | 11 | bytes/KB/MB, 50 MB limit boundary |
| Batch DOI parsing | 11 | comma, newline, URLs, dedup, mixed |
| Entity parsing | 4 | url entities, text_link, non-doi URLs |

**Total: 75 tests**

---

## Tech Stack

- **Runtime** — Node.js
- **Framework** — [Telegraf](https://github.com/telegraf/telegraf) (Telegram Bot API)
- **HTTP** — axios
- **PDF** — pdf-lib (splitting)
- **Search** — Semantic Scholar API, CrossRef API
- **Storage** — local JSON files (optional Supabase)
- **Testing** — Jest

---

## License

MIT

---

## Support

- [@x0codd](https://t.me/x0codd) — bug reports & feature requests
- [@x0projects](https://t.me/x0projects) — updates & new bots
