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

| `type`           | Export menu item  | `data` shape                                                         | Default filename                 |
| ---------------- | ----------------- | -------------------------------------------------------------------- | -------------------------------- |
| `character`      | Current Character | `{ name, data }`                                                     | `<slug-of-name>.json`            |
| `all-characters` | All Characters    | `Array<{ name, data }>`                                              | `all-characters-<stamp>.json`    |
| `log`            | Session Log       | `Array<LogEntry>` (oldest-first)                                     | `session-log-<stamp>.json`       |
| `communities`    | Communities       | `{ communities: Community[], npcs: Npc[] }`                          | `communities-<stamp>.json`       |
| `expeditions`    | Expeditions       | `Array<Expedition>` (Journey \| Site)                                | `expeditions-<stamp>.json`       |
| `everything`     | Everything        | `{ characters, log, communities, npcs, foes, expeditions, session }` | `ironledger-export-<stamp>.json` |

`<stamp>` is local time formatted `YYYY-MM-DD_HHmm` (e.g. `2026-06-18_1504`).

`Session Log` and `Everything` also offer a **Markdown** format; the
`Everything` Markdown export is a `.zip` (`ironledger-export-<stamp>.zip`).
Markdown is human-readable only and is **not re-importable** — only the JSON
forms below round-trip.

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
      { "id": "…", "name": "Bayara", "role": "", "goal": "", "relationship": "neutral", "...": "…" }
    ]
  }
}
```

Field lists for `Community` and `Npc` are in `apps/web/src/lib/types.ts`.

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
sanitized on import (see [Security](#security--hardening)).

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
    "foes": [{ "id": "…", "foeId": "…", "effectiveRank": 3 }],
    "expeditions": [{ "id": "…", "type": "journey" }],
    "session": { "activeCharId": "…", "activeFoeId": "…", "activeExpeditionId": "…" }
  }
}
```

`count` is the sum of `characters + log + communities + npcs + foes +
expeditions` lengths. `foes` is the list of `FoeEncounter` objects; `session`
records which entities were active at export time.

> **Round-trip caveat.** The `everything` **export** writes a `foes` array and
> a `session` object, but the `everything` **import** currently restores only
> `characters`, `log`, `communities`, `npcs`, and `expeditions` — the `foes`
> and `session` sections are **not** re-applied. To restore foe encounters,
> they would need their own import path. (Exported foes are still useful as a
> record / for manual recovery.)

---

## Import behavior

- **Routing** is by `manifest.type` (see the export-types table).
- **Characters / log**: always **appended** — characters get fresh ids; log
  entries are added via the sanitizing `appendSafeLog()`.
- **Communities / NPCs / expeditions** are id-keyed and may **collide** with
  existing rows. When any incoming id matches an existing one, the
  **ImportCollisionDialog** asks for a strategy:
  - **skip** — keep existing, drop the incoming row;
  - **new** — assign the incoming row a fresh id and add it as a copy;
  - **replace** — overwrite the existing row in place;
  - **cancel** — abort the whole import.
    Non-colliding rows are always added.

### Backwards compatibility

A file with **no `manifest`/`data` envelope** is accepted as a single
character — i.e. a bare `{ name, data }` object imports as one new character.
This keeps older single-character exports importable.

---

## Security / hardening

`parseImportJson()` in `importSanitizer.ts` runs before any data is applied:

| Guard               | Limit / behavior                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| File size           | **5 MB** max (`MAX_BYTES`).                                                                                         |
| Nesting depth       | **12** levels max (`MAX_DEPTH`).                                                                                    |
| Array length        | **1000** items max per array (`MAX_ARRAY_ITEMS`).                                                                   |
| String length       | **200,000** chars max per string field (`MAX_STR_LEN`).                                                             |
| Prototype pollution | Keys `__proto__`, `constructor`, `prototype` are stripped.                                                          |
| Log HTML            | `sanitizeLogHtml()` strips `<script>` blocks, `on*=` handlers, and `javascript:` URLs before any entry is rendered. |

Exceeding a limit throws an `ImportError`, which surfaces a user-facing
message and aborts the import without mutating any state.

The end-to-end behavior here is covered by
[`apps/web/tests/e2e/import-export.spec.ts`](../apps/web/tests/e2e/import-export.spec.ts)
and [`apps/web/tests/e2e/import-collision.spec.ts`](../apps/web/tests/e2e/import-collision.spec.ts).
