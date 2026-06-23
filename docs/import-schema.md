# Iron Ledger Import / Export Schema

This document describes the JSON files that Iron Ledger produces from the
**Hamburger → Export…** dialog and accepts via **Hamburger → Import…**. It
covers the export of **characters**, **expeditions**, **connections**
(communities + NPCs), the **session log**, and the combined **everything**
bundle.

> This is the **user-data** format. For the read-only **catalogue/content**
> data (moves, assets, oracles, foes, delve tables) shipped under `data/`,
> see [data-schema.md](data-schema.md).

The export/import logic lives in
[`apps/web/src/routes/home/+page.svelte`](../apps/web/src/routes/home/+page.svelte);
the import hardening lives in
[`apps/web/src/lib/importSanitizer.ts`](../apps/web/src/lib/importSanitizer.ts).

---

## The envelope

Every JSON export (except a bare single-character file — see
[Backwards compatibility](#backwards-compatibility)) is a wrapper object with
two top-level keys:

```json
{
  "manifest": {
    "app": "Iron Ledger",
    "version": "1.0.0",
    "exportedAt": "2026-06-18T15:04:05.000Z",
    "type": "everything",
    "count": 42
  },
  "data": { "...": "shape depends on manifest.type" }
}
```

### Manifest fields

| Field        | Type   | Notes                                                                         |
| ------------ | ------ | ----------------------------------------------------------------------------- |
| `app`        | string | Always `"Iron Ledger"`.                                                       |
| `version`    | string | Export-format version. Currently the literal `"1.0.0"` (not the app version). |
| `exportedAt` | string | ISO-8601 timestamp (`new Date().toISOString()`).                              |
| `type`       | string | Selects how `data` is shaped and routed on import (see table below).          |
| `count`      | number | Item count — informational only; import does not rely on it.                  |

Import dispatches **solely on `manifest.type`**. If `manifest` and `data` are
both present, the type is honored; otherwise the file is treated as a bare
character (below).

### Export types

| `type`           | Export menu item  | `data` shape                                                                            | Default filename                 |
| ---------------- | ----------------- | --------------------------------------------------------------------------------------- | -------------------------------- |
| `character`      | Current Character | `{ name, data }`                                                                        | `<slug-of-name>.json`            |
| `all-characters` | All Characters    | `Array<{ name, data }>`                                                                 | `all-characters-<stamp>.json`    |
| `log`            | Session Log       | `Array<LogEntry>` (oldest-first)                                                        | `session-log-<stamp>.json`       |
| `communities`    | Communities       | `{ communities: Community[], npcs: Npc[] }`                                             | `communities-<stamp>.json`       |
| `expeditions`    | Expeditions       | `Array<Expedition>` (Journey \| Site)                                                   | `expeditions-<stamp>.json`       |
| `everything`     | Everything        | `{ characters, log, communities, npcs, expeditions, session }` (foes are Markdown-only) | `ironledger-export-<stamp>.json` |

`<stamp>` is local time formatted `YYYY-MM-DD_HHmm` (e.g. `2026-06-18_1504`).

This document covers the **JSON** format only — the JSON exports are the
re-importable form and the contract this doc defines. (A separate
human-readable Markdown export exists in the UI but is out of scope here.)

---

## Characters

A character is exported as `{ name, data }`, where `name` is the display name
and `data` is the full per-character saved state (stats, momentum/health/
spirit/supply, experience, initiative, vows, owned assets, debilities, etc.).
The inner `data` object is the character's persisted blob; its fields mirror
the runtime `Character.data` type (see `apps/web/src/lib/types.ts`).

**Current Character** (`type: "character"`):

```json
{
  "manifest": {
    "app": "Iron Ledger",
    "version": "1.0.0",
    "exportedAt": "…",
    "type": "character",
    "count": 1
  },
  "data": {
    "name": "Mr. Pibbles",
    "data": { "stats": { "edge": 2, "heart": 2, "iron": 2, "shadow": 3, "wits": 1 }, "...": "…" }
  }
}
```

**All Characters** (`type: "all-characters"`) — `data` is an array of the same
`{ name, data }` entries.

On import each entry is created as a **new** character (a fresh id is
allocated; nothing is overwritten). Imported character data is run through
`reconcileImportedChar()` so stale/unknown fields are normalized before save.

---

## Expeditions

`type: "expeditions"` — `data` is an array of `Expedition` objects. An
expedition is either a **Journey** or a **Site** (discriminated by its `type`
field); Sites additionally carry `theme`, `domain`, `difficulty`, a `denizens`
array, and the rolled `currentFeature` / `currentDanger`. See the `Journey`
and `Site` interfaces in `apps/web/src/lib/types.ts` for the full field list.

```json
{
  "manifest": { "…": "…", "type": "expeditions", "count": 2 },
  "data": [
    {
      "id": "…",
      "type": "journey",
      "name": "To Whitebridge",
      "difficulty": "dangerous",
      "ticks": 8,
      "...": "…"
    },
    {
      "id": "…",
      "type": "site",
      "name": "Frozen Cavern",
      "theme": "…",
      "domain": "…",
      "denizens": ["…"],
      "...": "…"
    }
  ]
}
```

---

## Connections (communities + NPCs)

The **Connections** deck exports under `type: "communities"`. The payload holds
both lists side by side:

```json
{
  "manifest": { "…": "…", "type": "communities", "count": 3 },
  "data": {
    "communities": [
      {
        "id": "…",
        "name": "Stonehall",
        "region": "",
        "location": "",
        "trouble": "",
        "notes": "",
        "...": "…"
      }
    ],
    "npcs": [
      {
        "id": "…",
        "name": "Bayara",
        "role": "",
        "goal": "",
        "relationship": "neutral",
        "deceased": false,
        "...": "…"
      }
    ]
  }
}
```

Field lists for `Community` and `Npc` are in `apps/web/src/lib/types.ts`. Two
NPC fields are worth calling out:

- **`deceased?: boolean`** — alive when absent or `false`, deceased when `true`.
  Drives the alive/deceased status toggle on the NPC card and the red
  **Deceased** pill in the Connections list. Communities have no equivalent
  flag.
- **`portraitEtag?: string`** — references the NPC's portrait held in the blob
  store (the image's content hash); the portrait is no longer inlined. The
  legacy **`imageUrl`** base64 data URL is **deprecated** and accepted only for
  back-compat when importing older exports.

---

## Session log

`type: "log"` — `data` is an array of `LogEntry` objects. The store keeps
entries **newest-first**; the export **reverses** them so the file reads
**oldest-first** (chronological).

```json
{
  "manifest": { "…": "…", "type": "log", "count": 2 },
  "data": [
    {
      "id": "uuid",
      "title": "FEATURES: FORTIFIED + FROZEN CAVERN",
      "html": "<div>…</div>",
      "ts": "2026-06-15T…Z"
    },
    {
      "id": "uuid",
      "title": "Strike",
      "html": "<div class=\"roll-outcome\">…</div>",
      "ts": "2026-06-15T…Z",
      "note": "optional user note",
      "source": "optional markdown source",
      "roll": { "moveId": "move/strike", "actionScore": 7, "c1": 3, "c2": 9, "charId": "…" }
    }
  ]
}
```

`LogEntry` fields: `id`, `title`, `html`, `ts` (required); `note`, `source`,
`roll` (optional). See `apps/web/src/lib/log.svelte.ts`. Each entry's `html` is
sanitized on import (see [Import sanitization](#import-sanitization)).

---

## Everything

`type: "everything"` bundles all of the above plus session UI state:

```json
{
  "manifest": { "…": "…", "type": "everything", "count": 42 },
  "data": {
    "characters": [{ "name": "…", "data": { "…": "…" } }],
    "log": [{ "id": "…", "title": "…", "html": "…", "ts": "…" }],
    "communities": [{ "id": "…", "name": "…" }],
    "npcs": [{ "id": "…", "name": "…" }],
    "expeditions": [{ "id": "…", "type": "journey" }],
    "session": { "activeCharId": "…", "activeFoeId": "…", "activeExpeditionId": "…" }
  }
}
```

`count` is the sum of `characters + log + communities + npcs + expeditions`
lengths. `session` records which entities were active at export time (not
re-applied on import).

> **Foes are Markdown-only.** Foe encounters are transient — they vary from
> campaign and session to session and are routinely deleted — so they are
> **excluded from the JSON export** entirely (and were never restored on
> import). They appear only in the **Markdown** export, as `foes.md` in the
> `everything` Markdown ZIP, as a human-readable record.

---

## Import behavior

Import dispatches by `manifest.type` (see the export-types table). Every
section that carries user-visible rows participates in collision detection
(see below); only the session log entries are always appended (deduplicated
internally by entry id).

### Collision resolution

Imports are scanned up front against the current data, **matching by
lower-cased, trimmed `name`** (not by `id`). Matching by name lets a file
exported from one user be imported by another — IDs are minted independently
per user, so an `id`-based match would never fire on a cross-user transfer.

The collision dialog covers five categories:

| Category        | Detected against                                      |
| --------------- | ----------------------------------------------------- |
| **Characters**  | existing `Character.name`                             |
| **Communities** | existing `Community.name`                             |
| **NPCs**        | existing `Npc.name`                                   |
| **Journeys**    | existing `Expedition.name` where `type === "journey"` |
| **Sites**       | existing `Expedition.name` where `type === "site"`    |

If **any** incoming row's name matches an existing row's name (in the same
category), the **`ImportCollisionDialog`** opens, lists the colliding names
grouped by category, and asks for one strategy that applies to every
collision in the file:

| Strategy    | Effect on a **colliding** row                                                                                                                                          | Effect on a **non-colliding** row |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Skip**    | Keep the existing row; drop the incoming one.                                                                                                                          | Added.                            |
| **New**     | Give the incoming row a fresh `id` and add it as a copy (both kept).                                                                                                   | Added.                            |
| **Replace** | The existing row's `id` is preserved; its content is overwritten with the incoming payload. (Characters: via `persistCharacterNow`; everything else: via `updateXxx`.) | Added.                            |
| **Cancel**  | Abort the entire import — nothing is changed.                                                                                                                          | Nothing is changed.               |

Non-colliding rows are always added regardless of strategy. When there are
no collisions at all, the dialog is skipped and every row is simply added
(the implicit `new` path). The strategy is chosen once and applied
uniformly across every category in the file.

Session log entries never trigger the collision dialog — `appendSafeLog()`
mints a fresh entry id on insert, so re-imported logs append (with their
existing id; duplicates are ignored by the per-id append guard).

### Backwards compatibility

A file with **no `manifest`/`data` envelope** is accepted as a single
character — i.e. a bare `{ name, data }` object imports as one new character.
This keeps older single-character exports importable.

---

## Mini-markdown fields

A handful of free-form user-authored fields are rendered through Iron
Ledger's lightweight Markdown renderer (`apps/web/src/lib/markdown.ts`).
On export the raw Markdown source is stored verbatim in the JSON; on
import the same source is preserved and the app re-renders it on read.
**No other field is parsed as Markdown** — string fields like
`Community.region` or `Npc.role` are treated as literal text.

The supported syntax is documented in [`notes.md`](notes.md#markdown-support):
`**bold**`, `*italic*` / `_italic_`, `# / ## / ### heading`, `- item` /
`* item`, `1. item` ordered list, blank line for paragraph break.

The fields that accept it:

| Entity                 | Field              | Notes                                                                                                                 |
| ---------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `Character` (`data`)   | `background`       | Character sheet → background                                                                                          |
| `Character` (`data`)   | `bondsFormed`      | Character sheet → Bonds → notes column                                                                                |
| `Character` (`data`)   | `lessonsLearned`   | Character sheet → Failures → notes column                                                                             |
| `Vow` (in `data.vows`) | `notes`            | Per-vow notes block                                                                                                   |
| `Community`            | `notes`            | Long-form description (Description tab)                                                                               |
| `Community`            | `situationalNotes` | Short situational notes (Core tab)                                                                                    |
| `Npc`                  | `notes`            | Long-form description (Description tab)                                                                               |
| `Npc`                  | `situationalNotes` | Short situational notes (Core tab)                                                                                    |
| `Journey`              | `notes`            | Per-journey notes block                                                                                               |
| `Site`                 | `notes`            | Per-site notes block                                                                                                  |
| `LogEntry`             | `note`             | Optional per-entry note appended below an entry                                                                       |
| `LogEntry`             | `source`           | Markdown source for entries created by the Notes dialog (`title === "Note"`); the rendered output is stored in `html` |

In a character's `data.assets[].customValues`, any value keyed by a
`customField` whose `type` is `"markdown"` (see
[data-schema.md → CustomFieldDef](data-schema.md#customfielddef-schema))
is also rendered as Markdown. The catalogue defines the field type; the
import format just preserves the stored string.

---

## Portraits

Portraits (community / npc / expedition `imageUrl`, character `data.portrait`)
are **not** stored inline in the live data anymore. The bytes live in a
content-addressed blob store on the server and the entity carries only a
lightweight reference:

- **`portraitEtag?: string`** on `Community`, `Npc`, `Journey`, `Site`, and in a
  character's `data` — the portrait's content hash (md5). The card renders
  `<img src="/api/.../portrait?v=<etag>">`; an absent/empty value means no
  portrait.
- The legacy inline fields (**`imageUrl`** on entities, **`data.portrait`** on
  characters) are **deprecated**. They are still accepted on import for
  back-compat, and re-emitted on export (below), but the app never writes them
  to live storage.

The import/export format stays **self-contained and portable** by bridging
between the two representations:

- **Export** fetches each portrait's bytes from the blob endpoint and
  **re-embeds** them as a base64 `data:` URL under the legacy field
  (`imageUrl` / `data.portrait`), dropping `portraitEtag` from the exported
  copy. A single export file therefore carries its own images, exactly like a
  pre-blob-store export.
- **Import** detects any inline base64 `imageUrl` / `data.portrait`, **uploads**
  it to the blob store via `PUT /api/session/:kind/:id/portrait` (or
  `/api/characters/:id/portrait`), sets the entity's `portraitEtag` to the
  returned hash, and strips the inline field before the row is saved.

Because the blob store is keyed by content hash, importing the same image
across several entities — or re-importing an export — **stores the bytes once**
and the duplicates collapse to references. The markdown (`.md` zip) export is
unaffected in shape: it still writes each portrait as a separate file under
`images/`, fetching the bytes from the blob endpoint.

---

## Import sanitization

Every imported file is run through `parseImportJson()` in `importSanitizer.ts`
**before any data is applied** — the raw file is never trusted. An uploaded
JSON file (whatever its `manifest.type`, including a bare character) goes
through this pipeline:

1. **Size check** — reject the file up front if it exceeds the byte limit.
2. **Parse** — `JSON.parse`; a parse error is reported as a friendly import
   error, not a crash.
3. **Recursive sanitize** — walk the entire parsed structure, enforcing the
   depth / array-length / string-length limits and stripping prototype-
   pollution keys at every level.
4. **Log-HTML scrub** — each log entry's `html` is passed through
   `sanitizeLogHtml()` (and added via `appendSafeLog()`) so no active content
   can reach the renderer.

### Limits and filters

| Guard               | Limit / behavior                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| File size           | **5 MB** max (`MAX_BYTES`).                                                                                               |
| Nesting depth       | **12** levels max (`MAX_DEPTH`).                                                                                          |
| Array length        | **1000** items max per array (`MAX_ARRAY_ITEMS`).                                                                         |
| String length       | Capped at the file-size limit (`MAX_STR_LEN = MAX_BYTES`, 5 MB) — large enough for inline base64 `data:` image URLs.      |
| Prototype pollution | Keys `__proto__`, `constructor`, `prototype` are stripped from every object (the `POISON_KEYS` set).                      |
| Log HTML            | `sanitizeLogHtml()` strips `<script>` blocks, `on*=` event handlers, and `javascript:` URLs before any entry is rendered. |

Any violated limit throws an `ImportError`. That is caught at the import call
site, surfaced to the user as a readable message, and **aborts the import with
no mutation of existing state** — a malformed or hostile file can never
partially apply.

The end-to-end behavior here (happy-path round-trips, collision strategies,
and the security limits) is covered by
[`apps/web/tests/e2e/import-export.spec.ts`](../apps/web/tests/e2e/import-export.spec.ts)
and [`apps/web/tests/e2e/import-collision.spec.ts`](../apps/web/tests/e2e/import-collision.spec.ts).
