# Gemini Chat Exporter

Chrome extension to export all your Google Gemini chats to JSON and Markdown files.

## Features

- **Bulk Export** — Export all chats with one click
- **Conversation Timestamps** — Captures creation dates from API responses
- **Incremental Caching** — Only fetches new chats (caches previously exported)
- **Auto-Scroll** — Optionally scroll sidebar to load more chats
- **Crash Protection** — Caches each chat immediately after extraction
- **Multiple Formats** — JSON, Markdown, or both
- **No Rate Limiting** — Uses single-tab click navigation
- **Progress Tracking** — Real-time export progress and cache counter

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the extension folder

## Usage

1. Open [Gemini](https://gemini.google.com)
2. Make sure the sidebar is visible (shows your chat list)
3. Click the extension icon in the toolbar
4. Configure options:
   - **Export Format**: JSON + Markdown, JSON only, or Markdown only
   - **Force Refresh**: Re-fetch all chats even if cached
   - **Auto-Scroll**: Scroll sidebar to load more chats (set max limit)
5. Click "Export All Chats"
6. Wait for the export to complete — a ZIP file will download

## Options

| Option | Description |
|--------|-------------|
| Export Format | JSON + Markdown, JSON only, or Markdown only |
| Force Refresh | Re-fetch all chats, ignoring cache |
| Auto-Scroll | Scroll sidebar to load more chats before export |
| Max Chats | Limit for auto-scroll (default: 100) |
| Clear Cache | Remove all cached data |

## How It Works

1. Injects a fetch interceptor to capture API responses (for timestamps)
2. Reads chat list from Gemini's sidebar
3. Optionally scrolls to load more chats
4. Clicks through each chat to load content
5. Extracts user prompts, model responses, and timestamps
6. Caches each chat immediately to IndexedDB (crash protection)
7. Creates a ZIP file with all chats

## Output Format

### Filenames

Files are named `{chat_id}_{title}.ext` for uniqueness:
```
f877b2fae00b938b_My_Chat_Title.json
f877b2fae00b938b_My_Chat_Title.md
```

### JSON
```json
{
  "id": "f877b2fae00b938b",
  "title": "My Chat Title",
  "url": "https://gemini.google.com/app/f877b2fae00b938b",
  "createdAt": "2025-12-09T19:22:07.000Z",
  "exportedAt": "2026-02-04T17:00:00.000Z",
  "messages": [
    { "role": "user", "content": "Hello!" },
    { "role": "model", "content": "Hi there!" }
  ]
}
```

### Markdown
```markdown
# My Chat Title

> Created: 2025-12-09T19:22:07.000Z
> Exported: 2026-02-04T17:00:00.000Z
> URL: https://gemini.google.com/app/f877b2fae00b938b

---

## 👤 User

Hello!

---

## 🤖 Gemini

Hi there!

---
```

### Combined Export

A `_all_chats.json` file is included with all chats in one array.

## Technical Details

- Uses Manifest V3
- Timestamps extracted by intercepting Gemini's `batchexecute` API responses
- Page context injection (`injected.js`) bypasses CSP for fetch interception
- IndexedDB for persistent caching across sessions
- Supports both `fetch` and `XMLHttpRequest` interception

## License

MIT
