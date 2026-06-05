# Progress Feedback Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Show real-time step-by-step progress to users during download instead of a static "Searching..." message.

**UX Flow:**
```
User sends DOI link
→ 🕵️ Searching Sci-Hub for your paper...
→ 📄 Found! Downloading PDF (1.2MB)...
→ ✅ Sending your PDF...
→ [PDF arrives]
```

If queued:
```
→ ⏳ All download slots busy. You're #2 in queue...
→ 🕵️ Processing your request...
→ 📄 Found! Downloading PDF (856KB)...
→ ✅ Sending your PDF...
```

If cached:
```
→ 🕵️ Searching Sci-Hub for your paper...
→ 💾 Found in cache! Sending instantly...
→ [PDF arrives]
```

**Architecture:**
- Create a `ProgressMessage` helper that edits a single Telegram message as steps progress
- Call progress updates at key points: search start, found, downloading, sending
- Works with the existing queue — queue position feedback already exists, just add more steps

**Repo:** `/opt/hermes/scihubot`

---

## Task 1: Create progress message helper

**Objective:** Reusable helper that manages a Telegram message and edits it with progress updates.

**Files:**
- Create: `utils/progress.js`

---

## Task 2: Add progress feedback to download pipeline (linkEntity.js)

**Objective:** Show progress steps during URL-based downloads.

**Files:**
- Modify: `actions/linkEntity.js`

---

## Task 3: Add progress feedback to textMessage.js

**Objective:** Show progress steps during DOI text downloads.

**Files:**
- Modify: `actions/textMessage.js`

---

## Task 4: Restart, test, commit & push
