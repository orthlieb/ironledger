# AI Story Generation

Turns a slice of the session log into narrative prose via the Claude API,
directly from the browser. Opt-in, per-browser API key, no server involvement.

## Flow

1. **Configure** (Settings → Claude AI): API key, model, setup instructions,
   and an "include cast & setting" default. Stored in `localStorage`.
2. **Record** (Log toolbar → ● Story → Begin Recording): drops a marker at the
   current top of the log. Every entry prepended until ■ Stop becomes the
   section.
3. **Generate** (■ Stop opens the dialog): the captured section is serialized to
   prompt text, an optional preface is prepended, and the prompt is streamed to
   Claude. Live markdown preview.
4. **Save to Log**: the prose is stored as a Story log entry (rendered markdown
   in `html`, plus a payload in `source` — see below). You can name it first.
5. **Regenerate** (⟳ on a Story entry): re-runs the stored prompt and replaces
   the entry in place.
6. **Export** (Hamburger → Export → Stories): writes all story entries' prose to
   `stories-<stamp>.md`.

## Files

| File                                   | Responsibility                                                              |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `lib/aiSettings.svelte.ts`             | Key / model / setup / `includePreface` store + `testApiKey()`               |
| `lib/storyRecorder.svelte.ts`          | Recording state, marker, `captureSection()`                                 |
| `lib/aiSerialize.ts`                   | Log → prompt text, entity scan, preface, `parseStorySource` (pure/testable) |
| `lib/aiStream.ts`                      | SSE reader for the Anthropic Messages API + `AbortController`               |
| `lib/components/StoryDialog.svelte`    | Setup / generate / regenerate UI + orchestration                            |
| `lib/components/SettingsDialog.svelte` | Claude AI settings section                                                  |
| `lib/components/LogPanel.svelte`       | ● Story toggle, ⟳ regenerate button                                         |
| `routes/home/+page.svelte`             | `storiesToMarkdown()` + the Stories export                                  |

## Preface — "Cast & setting"

`StoryDialog.openGenerate()` scans the captured section for referenced entities
and prepends a curated (narrative, not mechanical) preface so the model isn't
inferring identity from dice rolls. Governed by the include toggle.

- **Characters**: matched by id (`roll.charId` + `data-char-id`) and by name.
  Each block carries background, resolved asset names, and vows (name,
  difficulty, threat).
- **Foes / expeditions**: matched by id (`roll.foeId` / `roll.expeditionId`,
  recorded by combat and journey/delve action rolls) with **name-matching as a
  fallback** for older entries and progress rolls.

The scan helpers (`sectionText`, `mentions`, `referencedCharIds`,
`referencedRollIds`, `buildStoryPreface`) are pure and unit-tested; the
component just gathers store data and passes plain objects in.

## Story entry `source` payload

A Story entry is identified by a JSON payload in `source` (not by its title, so
a user-chosen title works):

```json
{ "kind": "story", "system": "…", "user": "…", "model": "claude-…", "md": "…" }
```

- `system` / `user` / `model` — the exact prompt, so **Regenerate** re-runs it.
- `md` — the raw markdown the model produced, so **Export** is lossless.

`parseStorySource(source)` returns this (or `null`) and is the single gate for
the ⟳ button and the stories export. See also `docs/import-schema.md`.

## Provider & security notes

- Direct browser → `api.anthropic.com` works because we send
  `anthropic-dangerous-direct-browser-access: true`. Adding OpenAI would hit
  CORS and needs a server proxy — see the discussion in git history.
- The API key lives in `localStorage`: any code with execution on the origin can
  read it. Acceptable for a single-user creative tool; a server-side proxy is
  the v2 hardening path.

## Tests

- **Unit** (`tests/unit/aiSerialize.test.ts`): serializer, scan helpers,
  preface, `parseStorySource`.
- **E2E** (`tests/e2e/story.spec.ts`): the Anthropic endpoint is mocked with
  `page.route()` + a canned SSE body; story entries are injected via
  `window.__testLog.appendLog`. Covers the regenerate gate, regenerate
  replace-in-place, record → name → generate → save, and the Stories export.
