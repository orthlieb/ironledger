# Notes

Provides a quick way to add session notes to the log with markdown formatting.

---

## Purpose

During gameplay, players need to jot down observations, reminders, or narrative beats. The Notes dialog lets them type markdown-formatted text and insert it directly into the session log.

---

## UI

The **Notes** button in the GlobalContextBar opens a centered modal dialog:
- Textarea with placeholder text and markdown hint
- **Add to Log** button (disabled when empty)
- Ctrl/Cmd+Enter keyboard shortcut to submit
- Dialog stays open after adding a note for quick multi-note entry
- Close via X button or Escape

Notes appear in the session log as entries with title "Note" and the markdown rendered as HTML.

---

## Markdown Support

The textarea supports the same markdown as per-entry notes in the log:

| Syntax | Renders As |
|--------|-----------|
| `**bold**` | **bold** |
| `*italic*` or `_italic_` | *italic* |
| `# Heading` | h3 |
| `## Heading` | h4 |
| `### Heading` | h5 |
| `- item` or `* item` | bullet list |
| `1. item` | numbered list |
| blank line | line break |

---

## Architecture

Notes use the existing session log infrastructure — no new stores or API endpoints:
- `renderNote(text)` from `$lib/markdown.js` converts markdown to safe HTML
- `appendLog(SESSION_LOG_ID, 'Note', html)` from `$lib/log.svelte.js` adds the entry
- LogPanel renders the entry like any other log entry

---

## Components

| Component | File | Purpose |
|-----------|------|---------|
| NotesDialog | `components/NotesDialog.svelte` | Modal dialog for typing notes |
| GlobalContextBar | `components/GlobalContextBar.svelte` | Notes button triggers `onNotesClick` callback |
| LogPanel | `components/LogPanel.svelte` | Renders note entries in the session log |

## Old App Reference

The old app (yrt/IronLedger.html) had an identical feature: a "Notes" toolbar button opening a dialog with a textarea and "Add to Log" button. Notes were session-global and persisted in localStorage as part of the log entries array.
