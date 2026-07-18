# AI Story Generation

Turns a slice of the session log into narrative prose via an AI storyteller.
Opt-in. The API key lives **server-side, encrypted at rest** — the browser never
holds a provider key or calls a provider directly; it POSTs the prompt to our own
`/api/ai/generate`, which looks up the active provider + decrypted key and streams
normalized text back.

## Flow

1. **Choose a storyteller** (Settings → AI Storyteller): pick None / Claude /
   ChatGPT / Gemini. The selection is persisted server-side (`PUT /api/ai/active`).
2. **Configure it** (Settings → Configure…): a per-provider dialog for the API
   key and model. The key is encrypted at rest and never returned to the client
   (the config view only reports `hasKey`). **Test** sends a 1-token request
   server-side to validate the key. The **Setup Instructions** (the system
   prompt) are a single global preference — shared across storytellers, not
   per-provider — stored client-side in `localStorage`. The global default is
   edited in the main Settings. The Generate/Regenerate dialog also shows the
   Setup Instructions, seeded from that default, but edits there are a
   **per-story tweak** that applies to just that generation and never write back
   to the global default.
3. **Mark a section** (hover a log entry → ▲ / ▼, or type `/start` / `/end` in
   the command bar): two markers define the section — ▲ pins the oldest entry
   included, ▼ pins the newest. Semantics:
   - **Only ▲ set**: the section is open — it grows as new entries land at the
     top of the log (equivalent to the old "record forward" behavior).
   - **Both ▲ and ▼ set**: the section is a fixed range between them, inclusive.
     The two marker ids are persisted to `localStorage` so a reload keeps the
     selection.
4. **Generate** (Log toolbar → Generate, or the floating strip at the bottom of
   the log, or `/story`): the captured section is serialized to prompt text, an
   optional preface is prepended, and the prompt is streamed to the active
   storyteller via `/api/ai/generate`. Live markdown preview.
5. **Edit** (after streaming): toggle **Edit** on the output box to tweak the raw
   markdown before saving; **Preview** flips back to the rendered view.
6. **Save to Log**: the prose is stored as a Story log entry (rendered markdown
   in `html`, plus a payload in `source` — see below). You can name it first.
   Both markers are cleared on save — the section is consumed, and the user
   pins a fresh ▲ whenever they want to start the next one.
7. **Regenerate** (⟳ on a Story entry): re-runs the stored prompt against the
   active storyteller and replaces the entry in place. Markers are not touched
   by regenerate (there's no new section to consume).
8. **Export** (Hamburger → Export → Stories): writes all story entries' prose to
   `stories-<stamp>.md`.

> **Mobile.** The whole selection surface (▲ / ▼ marker buttons, the Generate
> button, and the floating strip) is hidden below `768px` (`mobile.md`'s
> canonical breakpoint) — hover-revealed marker buttons are awkward on touch
> and the log gets only 20% of the viewport by default (Adventure Split). The
> underlying `sectionStore` state is untouched, so if the user pins a section
> on desktop and then flips to mobile, the entries stay highlighted (read-only)
> but can't be mutated until they're back on a wider screen.

## Files

### Web (`apps/web`)

| File                                   | Responsibility                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `lib/aiSettings.svelte.ts`             | Server-config cache (providers, active, `hasKey`); mutations; global `setup` + `includePreface` prefs |
| `lib/sectionStore.svelte.ts`           | Two-marker section state (▲ start id / ▼ end id); `sectionEntries()`, `toggleStart/End`, persisted    |
| `lib/aiSerialize.ts`                   | Log → prompt text, entity scan, preface, `parseStorySource` (pure/testable)                           |
| `lib/aiStream.ts`                      | Client SSE reader for `/api/ai/generate` (unified `{text}`/`{done}`/`{error}`)                        |
| `lib/components/StoryDialog.svelte`    | Generate / regenerate UI + orchestration + editable output box + per-story setup-prompt tweak         |
| `lib/components/SettingsDialog.svelte` | AI Storyteller selector (None / Claude / ChatGPT / Gemini) + global Setup Instructions                |
| `lib/components/AiConfigDialog.svelte` | Per-provider key / model / Test dialog                                                                |
| `lib/components/LogPanel.svelte`       | ▲ / ▼ per-entry marker buttons, section highlight, Generate button + floating strip, ⟳ regenerate     |
| `routes/api/ai/[...path]/+server.ts`   | BFF proxy → Fastify `/api/v1/ai/*` (streams the generate SSE through)                                 |
| `routes/home/+page.svelte`             | `storiesToMarkdown()` + the Stories export                                                            |

### API (`apps/api`)

| File                                          | Responsibility                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `services/aiCrypto.ts`                        | AES-256-GCM encrypt/decrypt (key derived from `AI_KEY_ENC_SECRET`)                                  |
| `services/aiConfigService.ts`                 | Per-provider config CRUD; encrypts keys; decrypts only for test/generation                          |
| `services/aiProvider.ts`                      | Server-side provider calls + normalized text stream (Claude, ChatGPT, Gemini)                       |
| `routes/ai.ts`                                | `GET /config`, `PUT /active`, `PUT /provider/:p`, `DELETE …/key`, `POST /test/:p`, `POST /generate` |
| `db/migrations/0016_ai_config.sql`            | `ai_config` table (RLS, one-active-per-user index), keys stored as ciphertext                       |
| `db/migrations/0017_ai_config_gemini.sql`     | Widen the provider CHECK constraint to allow `gemini`                                               |
| `db/migrations/0018_ai_config_drop_setup.sql` | Drop the vestigial `setup` column (system prompt is now a client-side pref)                         |

## Preface — "Cast & setting"

`StoryDialog.open()` scans the current section for referenced entities
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
{ "kind": "story", "user": "…", "md": "…" }
```

- `user` — the exact user prompt sent (preface + serialized events), so
  **Regenerate** replays it verbatim against the active storyteller. The system
  prompt and model are **not** stored here — the model comes from the active
  provider's server-side config and the system prompt from the global client-side
  Setup Instructions, both read fresh at (re)generation time.
- `md` — the raw markdown the model produced, so **Export** is lossless.

`parseStorySource(source)` returns this (or `null`) and is the single gate for
the ⟳ button and the stories export. See also `docs/import-schema.md`.

## Security notes

- **Keys are server-side, encrypted at rest** (AES-256-GCM). The encryption key
  is derived from the `AI_KEY_ENC_SECRET` env var. This must be set in prod for
  AI to work; **rotating it invalidates all stored provider keys** (users must
  re-enter them). It is optional at boot — the app runs without AI until a key is
  configured.
- "Encrypted at rest" is **not** zero-knowledge: the server decrypts the key to
  call the provider. It protects against DB-dump exposure, not a compromised app
  server.
- Calling providers server-side also sidesteps the browser CORS restrictions that
  block OpenAI/Gemini from direct browser calls.

## Tests

- **Unit** (`apps/api/tests/unit/aiCrypto.test.ts`): encrypt/decrypt round-trip,
  ciphertext hides plaintext, unique IV, wrong-secret / tamper rejection.
- **Unit** (`apps/web/tests/unit/aiSerialize.test.ts`): serializer, scan helpers,
  preface, `parseStorySource`.
- **E2E** (`apps/web/tests/e2e/story.spec.ts`): `/api/ai/config` and
  `/api/ai/generate` are mocked with `page.route()` + a canned unified SSE body;
  story entries are injected via `window.__testLog.appendLog` and section
  markers are set via `window.__testSection.setStart` (both exposed by
  `hooks.client.ts`) to skip the hover-reveal on the ▲ button. Covers the
  regenerate gate, regenerate replace-in-place, mark section → name → generate
  → edit → save (including the editable output box), and the Stories export.
