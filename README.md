# Gemini Chat Exporter

Chrome extension to export all your Google Gemini chats to JSON and Markdown files.

## Features

- **Bulk Export** — Export all chats with one click
- **Incremental** — Only fetches new chats (caches previously exported)
- **Multiple Formats** — JSON, Markdown, or both
- **No Rate Limiting** — Uses single-tab click navigation
- **Progress Tracking** — See real-time export progress

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the extension folder

## Usage

1. Open [Gemini](https://gemini.google.com)
2. Make sure the sidebar is visible (shows your chat list)
3. Scroll down in the sidebar to load all chats you want to export
4. Click the extension icon in the toolbar
5. Choose your format and click "Export All Chats"
6. Wait for the export to complete — a ZIP file will download

## Options

- **Export Format**: JSON + Markdown, JSON only, or Markdown only
- **Force Refresh**: Re-fetch all chats even if cached
- **Clear Cache**: Remove cached data to start fresh

## How It Works

1. Reads chat list from Gemini's sidebar
2. Clicks through each chat (in the same tab) to load content
3. Extracts user prompts and model responses
4. Caches extracted data in IndexedDB
5. Creates a ZIP file with all chats

Subsequent exports only fetch new/uncached chats — much faster!

## Output Format

### JSON
```json
{
  "id": "abc123",
  "title": "Chat Title",
  "url": "https://gemini.google.com/app/abc123",
  "exportedAt": "2024-02-04T12:00:00.000Z",
  "messages": [
    { "role": "user", "content": "Hello!" },
    { "role": "model", "content": "Hi there!" }
  ]
}
```

### Markdown
```markdown
# Chat Title

> Exported: 2024-02-04T12:00:00.000Z
> URL: https://gemini.google.com/app/abc123

---

## 👤 User

Hello!

---

## 🤖 Gemini

Hi there!

---
```

## License

MIT
