# Gemini Chat Exporter

Chrome extension to export all your Gemini conversations to local files.

## Installation

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select this folder: `/Users/danielheyman/.openclaw/workspace/chrome-extensions/gemini-export`

## Usage

1. Go to [gemini.google.com](https://gemini.google.com/app)
2. You'll see a blue **📥 Export All Chats** button in the bottom-right corner
3. Click it to start the export
4. The extension will:
   - Loop through each chat in your sidebar
   - Extract the conversation content
   - Download two files:
     - `gemini-export-YYYY-MM-DD.json` (structured data)
     - `gemini-export-YYYY-MM-DD.md` (readable markdown)

## Output Format

### JSON
```json
{
  "exportedAt": "2026-02-04T...",
  "totalChats": 50,
  "chats": [
    {
      "title": "Chat Title",
      "exportedAt": "...",
      "rawContent": "Full conversation text...",
      "messages": [...]
    }
  ]
}
```

### Markdown
```markdown
# Gemini Chat Export

## Chat Title 1
[conversation content]

---

## Chat Title 2
[conversation content]
```

## Notes

- Export can take a while if you have many chats (~2-3 seconds per chat)
- The extension clicks through each chat to load it, so don't interact with the page during export
- Raw content extraction may not perfectly preserve formatting (Gemini's DOM is complex)
- For best results, make sure your sidebar shows all chats (scroll to load more if needed)

## Troubleshooting

If the export button doesn't appear:
1. Refresh the Gemini page
2. Check that the extension is enabled in `chrome://extensions`
3. Check the browser console for errors

---
*Created by Bob 🎩 for Daniel*
