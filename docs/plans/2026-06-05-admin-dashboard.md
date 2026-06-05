# Admin Dashboard Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add admin-only dashboard commands for monitoring downloads, managing users, and viewing stats — all via Telegram commands. No web UI.

**Architecture:**
- Local JSON file storage (no Supabase dependency)
- Admin commands: `/stats`, `/users`, `/history`, `/ban`, `/unban`
- Middleware ban check — blocked users get rejected
- Auto-track every download attempt (success/fail, DOI, user, timestamp)

**Storage:**
- `data/stats.json` — cumulative counters (total downloads, per-day)
- `data/downloads.json` — download log (last 500 entries, rotating)
- `data/bans.json` — array of banned user IDs

**Repo:** `/opt/hermes/scihubot`

---

## Task 1: Create data store module

**Objective:** Simple JSON-backed storage for stats, downloads, and bans.

**Files:**
- Create: `utils/dataStore.js`

---

## Task 2: Track downloads in linkEntity.js + textMessage.js

**Objective:** Record every download attempt to the data store.

**Files:**
- Modify: `actions/linkEntity.js`
- Modify: `actions/textMessage.js`

---

## Task 3: Add ban check in middleware

**Objective:** Banned users get a rejection message, their messages are ignored.

**Files:**
- Modify: `actions/middleware.js`

---

## Task 4: Add admin commands

**Objective:** `/stats`, `/users`, `/history`, `/ban <id>`, `/unban <id>` commands.

**Files:**
- Modify: `actions/command.js`
- Modify: `bot.js`

---

## Task 5: Restart, test, commit & push
