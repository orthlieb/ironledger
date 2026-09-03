# Iron Ledger Import / Export Schema

This document describes the **`.zip` archives** Iron Ledger produces
from the **Hamburger → Export…** dialog and accepts via
**Hamburger → Import…**. It covers the export of **characters**,
**expeditions**, **connections** (communities + NPCs + places), the
**session log**, and the combined **everything** bundle.

> This is the **user-data** format. For the read-only **catalogue/content**
> data (moves, assets, oracles, foes, delve tables) shipped under `data/`,
> see [data-schema.md](data-schema.md).

The export/import logic lives in
[`apps/web/src/routes/home/+page.svelte`](../apps/web/src/routes/home/+page.svelte);
the import hardening + zip decompression lives in
[`apps/web/src/lib/importSanitizer.ts`](../apps/web/src/lib/importSanitizer.ts).

---

## The bundle

Every export (except the **Session Log JSON** — no images, so it stays a
plain `.json` file — and the **Markdown** flavours) is a `.zip` with
three top-level entries:

```
<content>-<stamp>.zip
├── manifest.json      { app, version, exportedAt, type, count, body }
├── <type>.json        the payload — same JSON envelope this doc describes
└── images/            portraits pulled out as raw JPEG/PNG bytes
    ├── portrait-1.jpg
    └── portrait-2.png
```

Zip over inlined JSON because portraits (typically 200–500 kB per image)
would otherwise pay a ~33 % base64 tax if inlined into the JSON body.
Raw bytes packed alongside stay compact and match the "Everything"
Markdown export's layout.

**Inside the zip, `<type>.json` is a wrapper object with two top-level
keys** — same shape you'd expect if this were a single JSON file:

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

The manifest inside `<type>.json` mirrors the top-level `manifest.json`
file — they're kept identical so a tool that only reads the body still
sees the same envelope.

### Manifest fields

| Field        | Type   | Notes                                                                                                            |
| ------------ | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `app`        | string | Always `"Iron Ledger"`.                                                                                          |
| `version`    | string | Export-format version. Currently the literal `"1.0.0"` (not the app version).                                    |
| `exportedAt` | string | ISO-8601 timestamp (`new Date().toISOString()`).                                                                 |
| `type`       | string | Selects how `data` is shaped and routed on import (see table below).                                             |
| `count`      | number | Item count — informational only; import does not rely on it.                                                     |
| `body`       | string | Optional. Points at the body filename inside the zip when it's not one of the standard `<type>.json` candidates. |

Import dispatches **solely on `manifest.type`**.

### Export types

| `type`           | Export menu item  | `data` shape                                                                                    | Body filename           | Zip filename                    |
| ---------------- | ----------------- | ----------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------- |
| `character`      | Current Character | `{ name, data }`                                                                                | `character.json`        | `<slug-of-name>.zip`            |
| `all-characters` | All Characters    | `Array<{ name, data }>`                                                                         | `characters.json`       | `all-characters-<stamp>.zip`    |
| `communities`    | Connections       | `{ communities: Community[], npcs: Npc[], places: Place[] }`                                    | `communities.json`      | `communities-<stamp>.zip`       |
| `expeditions`    | Expeditions       | `Array<Expedition>` (Journey \| Site \| Scene)                                                  | `expeditions.json`      | `expeditions-<stamp>.zip`       |
| `everything`     | Everything        | `{ characters, log, communities, npcs, places, expeditions, session }` (foes are Markdown-only) | `everything.json`       | `ironledger-export-<stamp>.zip` |
| `log`            | Session Log       | `Array<LogEntry>` (oldest-first)                                                                | _(no zip — plain JSON)_ | `session-log-<stamp>.json`      |

`<stamp>` is local time formatted `YYYY-MM-DD_HHmm` (e.g. `2026-06-18_1504`).

This document covers the **zip / JSON body** format only — the zip
exports are the re-importable form and the contract this doc defines.
Separate human-readable **Markdown** exports exist in the UI (Session
Log, Everything-as-zip, and **Stories** — the AI-generated prose entries
only, `stories-<stamp>.md`); these are one-way (not re-importable) and
out of scope here.

> **Maps.** Campaign maps ride along inside `everything` as nested
> `maps/<mapId>/` dirs (`manifest.json` + `map.json` with the marker list +
> optional `background.jpg`), so a full backup captures them. `map.json` also
> records the map's owner **by name** (`ownerKind` + `ownerName`) so import can
> re-link it to the owning community / place / journey / site after entities
> land (ids regenerate, names don't). On a merge import where that owner
> already has a map, the user is prompted **Replace** (overwrite it) or
> **Skip** (import the incoming map standalone); an owner that can't be matched
> also imports standalone. The Export dialog also offers a standalone
> **All Maps** (`type: "map"`) bundle of the same `maps/<id>/` dirs, plus a
> one-way PNG snapshot. The single-map zip shape — shared by both paths — is
> documented in [campaign-map.md § Exports](campaign-map.md#exports).

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

`type: "expeditions"` — `data` is an array of `Expedition` objects,
discriminated by their own `type` field into three kinds:

- **Journey** — `name`, `difficulty`, `ticks` (progress track), and the usual
  notes/complete/portrait fields.
- **Site** (Delve) — a Journey plus `theme`, `domain`, a `denizens` array, and
  the rolled `currentFeature` / `currentDanger`.
- **Scene** (Lodestar Scene Challenge) — a Journey plus `objective`,
  `consequences`, and `countdownFilled` (0–4 filled countdown segments).

See the `Journey`, `Site`, and `Scene` interfaces in
`apps/web/src/lib/types.ts` for the full field list. As with connections, the
whole object round-trips — the `"…"` below is the rest of each kind's field
set, not dropped fields.

```json
{
  "manifest": { "…": "…", "type": "expeditions", "count": 3 },
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
    },
    {
      "id": "…",
      "type": "scene",
      "name": "Escape the Collapsing Vault",
      "difficulty": "dangerous",
      "ticks": 8,
      "objective": "…",
      "consequences": "…",
      "countdownFilled": 2,
      "...": "…"
    }
  ]
}
```

---

## Connections (communities + NPCs + places)

The **Connections** deck exports under `type: "communities"`. The payload
holds all three lists side by side. `places` is optional on import so
older exports (which pre-date the Place entity) still load — a missing
`places` field is treated as `[]`.

```json
{
  "manifest": { "…": "…", "type": "communities", "count": 4 },
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
    ],
    "places": [
      {
        "id": "…",
        "name": "The Silver Fish",
        "region": "Ragged Coast",
        "location": "Tavern",
        "locationDescription": "waterfront, second door on the left",
        "withinSettlementName": "Whitehaven",
        "notes": "",
        "...": "…"
      }
    ]
  }
}
```

Field lists for `Community`, `Npc`, and `Place` are in `apps/web/src/lib/types.ts`.
A **Community** captures a people bound to a settlement (Hobbiton — a
Community named for its Hobbits); a **Place** captures a fixed location worth
remembering, whether inside a community (a specific tavern) or out in the
world (Mt. Doom). See [communities.md](communities.md) for the full
distinction.

> **The whole entity round-trips — the JSON above is abridged, not a
> whitelist.** Export takes a full `$state.snapshot()` of each row and import
> stores the row as-is (minus the poison keys), so every field a live entity
> carries survives, including any this doc doesn't spell out. The `"…"` in the
> examples stands in for the rest of the field set, not for fields that get
> dropped.

The examples above show only the always-present core. The following
**extension fields are optional** — populated when the owning extension is
enabled, absent (or empty) otherwise — and, per the round-trip rule above,
they export and import exactly like any other field:

| Entity        | Extension        | Optional fields                                                                          |
| ------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| **Community** | Lodestar         | `type`, `condition`, `firstLook`, `disposition`, `projects`, `culturalTouchstones` (six) |
| **Community** | (always)         | `locationDescription`, `situationalNotes`                                                |
| **NPC**       | Lodestar / Delve | `firstLook`, `activity`, `disposition`, `situationalNotes`                               |
| **Place**     | (always)         | `locationDescription`, `situationalNotes`, `withinSettlementId` / `withinSettlementName` |

`Place` currently shares the `Community` field set (it renders in the same
card), but is stored as its own entity kind so future place-specific fields
don't need a schema shuffle. `Place.trouble` is deprecated (kept for
back-compat, shown only if populated).

> **A Place's parent settlement is carried by name.** A live `Place` links
> to its parent `Community` by `withinSettlementId`, but ids are minted
> per-user, so a raw id never re-links on another ledger. On export the id is
> dropped and the parent's current name is written as **`withinSettlementName`**;
> on import that name is resolved back to the local settlement's id (matched
> case/space-insensitively, after the communities land). Unresolved or
> standalone places import with no parent link. This mirrors how bundled maps
> re-link their owner entity by name.

Two fields are worth calling out:

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
      "roll": {
        "moveId": "move/strike",
        "actionScore": 7,
        "c1": 3,
        "c2": 9,
        "charId": "…",
        "foeId": "…",
        "expeditionId": "…"
      }
    }
  ]
}
```

`LogEntry` fields: `id`, `title`, `html`, `ts` (required); `note`, `source`,
`roll` (optional). See `apps/web/src/lib/log.svelte.ts`. Each entry's `html` is
sanitized on import (see [Import sanitization](#import-sanitization)).

`roll` (present only on action-roll entries) carries `moveId`, `actionScore`,
the two challenge dice (`c1`/`c2`), and `charId`. It also carries `foeId` /
`expeditionId` when the move's title references `{foe}` / `{expedition}` (combat
and journey/delve rolls) — these let the AI-story preface scan match those
entities exactly instead of by name.

`source` has **two shapes** depending on the entry:

- **Note entries** (`title === "Note"`) — the raw Markdown the user typed; the
  rendered output is stored in `html`.
- **Story entries** (AI-generated prose) — a JSON string
  `{ "kind": "story", "user", "md" }` holding the exact user prompt (so the entry
  can be regenerated against the active companion) and the raw Markdown (so it can
  be exported). The system prompt and model are **not** stored — they come from
  the current server-side provider config at regeneration time. Story entries are
  identified by this payload, not by their title, so a user-chosen title still
  works.

> **Story section markers are not part of the export.** The ▲ / ▼ marker ids
> that define a live story-selection (see
> [log.md § Story sections](log.md#story-sections-----markers)) are UI state
> stored in `localStorage['ironledger:ai:section']`, not on the log entries. A
> selection pinned in one browser doesn't cross-import with the log — a
> re-imported log arrives with no markers set, ready for a fresh selection.

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
    "places": [{ "id": "…", "name": "…" }],
    "expeditions": [{ "id": "…", "type": "journey" }],
    "session": { "activeCharId": "…", "activeFoeId": "…", "activeExpeditionId": "…" }
  }
}
```

`count` is the sum of `characters + log + communities + npcs + places + expeditions`
lengths. `places` is optional on import — legacy exports without it load as `[]`. `session` records which entities were active at export time (not
re-applied on import).

> **Maps ride alongside the body.** Campaign maps are **not** in `data` — they
> sit beside `everything.json` in the same zip as nested `maps/<mapId>/` dirs
> (`manifest.json` + `map.json` with the marker list + optional
> `background.jpg`), exactly as in the standalone **All Maps** export. Import
> reassembles each and re-links it to its owner entity by name (Replace/Skip
> prompt when the owner already has a map; standalone when unmatched). They are
> omitted from `count`. See
> [campaign-map.md § Exports](campaign-map.md#exports).

> **Foes are Markdown-only.** Foe encounters are transient — they vary from
> campaign and session to session and are routinely deleted — so they are
> **excluded from the JSON export** entirely (and were never restored on
> import). They appear only in the **Markdown** export, as `foes.md` in the
> `everything` Markdown ZIP, as a human-readable record.

---

## Field reference & populating oracles

Every field below round-trips through export/import (a whole-object copy,
per the round-trip rule in [Connections](#connections-communities--npcs--places)).
The **Oracle** column names the catalogue oracle that fills a field when the
user rolls it during creation or on the card — by **Title** (`key`) — and its
**source**: **base** (Ironsworn classic, always on), **Delve**, **Lodestar**,
or **YRT**. Fields marked **—** are user-entered, mechanical, or generated
(uuids, timestamps), never oracle-rolled. `resolveOracleKey` means an enabled
expansion can supersede the base oracle; that's noted inline. The oracle
wiring lives in
[`CommunitiesArea.svelte`](../apps/web/src/lib/components/v2/CommunitiesArea.svelte)
and [`ExpeditionsArea.svelte`](../apps/web/src/lib/components/v2/ExpeditionsArea.svelte);
the concept→oracle resolution in
[`characterConcept.ts`](../apps/web/src/lib/characterConcept.ts).

### Community (`communities[]`)

| Key                   | Contains                                      | Oracle                                                                                                                                                            |
| --------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | uuid                                          | — (generated)                                                                                                                                                     |
| `name`                | Settlement name                               | **Settlement: Name** (`settlementName`) or **Settlement: Quick Name Generator** (`settlementNameQuick`), base                                                     |
| `region`              | Ironlands region (Flooded Lands, Havens…)     | **Location: Region** (`region`), base; YRT replaces with its own **Location: Region** (`yrtRegion`)                                                               |
| `location`            | The settlement's setting / landmark           | **Location** (`location`) or **Location: Coastal Waters** (`coastalWatersLocation`); Lodestar supersedes with **Overland Landmark** / **Coastal Waters Landmark** |
| `locationDescription` | Descriptive detail of the location            | **Location: Descriptor** (`locationDescriptor`), base                                                                                                             |
| `trouble`             | The settlement's current trouble              | **Settlement: Troubles** (`settlementTrouble`), base                                                                                                              |
| `type`                | Settlement size / kind                        | **Settlement: Type** (`settlementType`), **Lodestar** (YRT `yrtSettlementType`)                                                                                   |
| `condition`           | Current condition                             | **Settlement: Condition** (`settlementCondition`), **Lodestar**                                                                                                   |
| `firstLook`           | At-a-glance impression                        | **Settlement: First Look** (`settlementFirstLook`), **Lodestar**                                                                                                  |
| `disposition`         | Disposition toward the party                  | **Settlement: Disposition** (`settlementDisposition`), **Lodestar**                                                                                               |
| `projects`            | What the settlement is working on             | **Settlement: Projects** (`settlementProjects`), **Lodestar**                                                                                                     |
| `culturalTouchstones` | Cultural flavor                               | **Settlement: Cultural Touchstones** (`settlementCulturalTouchstones`), **Lodestar**                                                                              |
| `notes`               | Long-form description (Description tab)       | —                                                                                                                                                                 |
| `situationalNotes`    | Short situational notes (Core tab)            | —                                                                                                                                                                 |
| `portraitEtag`        | Portrait content-hash (blob store)            | —                                                                                                                                                                 |
| `imageUrl`            | _@deprecated_ inline base64 portrait (import) | —                                                                                                                                                                 |
| `createdAt`           | creation timestamp                            | —                                                                                                                                                                 |

The six Lodestar fields (`type` … `culturalTouchstones`) are the "Lodestar
settlement suite" — each backed by a `Settlement: …` Lodestar oracle.

### NPC (`npcs[]`)

| Key                         | Contains                                                                      | Oracle                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `id`                        | uuid                                                                          | —                                                                                                                       |
| `name`                      | Character name                                                                | **Character: Name** sets — Ironlander (`namesIronlander`, default) + Elf / Giant / Varou / Troll (`namesOther_*`), base |
| `role`                      | Community role / occupation                                                   | **Character: Role** (`characterRole`), base                                                                             |
| `goal`                      | Current goal                                                                  | **Character: Goal** (`characterGoal`), base                                                                             |
| `descriptor`                | Revealed details / trait                                                      | **Character: Revealed Details** (`characterDescriptor`), base                                                           |
| `firstLook`                 | At-a-glance impression                                                        | **Character: First Look** (`characterFirstLook`), **Lodestar**                                                          |
| `activity`                  | What they were doing when met                                                 | **Character: Activity** (`charActivity`), **Delve**                                                                     |
| `disposition`               | Disposition toward the party                                                  | **Character: Disposition** — `lodestarCharacterDisposition` (**Lodestar**) or `charDisposition` (**Delve**)             |
| `relationship`              | friendly / neutral / hostile (UI toggle)                                      | —                                                                                                                       |
| `location`                  | Where they're found                                                           | —                                                                                                                       |
| `notes`                     | Long-form description; YRT **Touched** (`yrtTouched`) writes a breakdown here | (YRT, when rolled)                                                                                                      |
| `situationalNotes`          | Short situational notes                                                       | —                                                                                                                       |
| `deceased`                  | alive (absent / false) vs deceased                                            | —                                                                                                                       |
| `portraitEtag` / `imageUrl` | portrait (blob / _@deprecated_ inline)                                        | —                                                                                                                       |
| `createdAt`                 | timestamp                                                                     | —                                                                                                                       |

### Place (`places[]`)

| Key                          | Contains                                                 | Oracle                                                                                                                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                         | uuid                                                     | —                                                                                                                                                                                                                                                               |
| `name`                       | Place name                                               | — (user-entered)                                                                                                                                                                                                                                                |
| `region`                     | Region                                                   | **Location: Region** (`region`); **inherited from parent settlement** when nested                                                                                                                                                                               |
| `location`                   | The landmark — _what it is_                              | Freestanding: **Location** (`location`) / **Location: Coastal Waters** (`coastalWatersLocation`), Lodestar → **Overland Landmark** / **Coastal Waters Landmark**. Nested: YRT **Location: Settlement Landmark** (`yrtCityTownLocation`), else base **Location** |
| `locationDescription`        | Landmark detail                                          | **Location: Descriptor** (`locationDescriptor`), base                                                                                                                                                                                                           |
| `withinSettlementId`         | Parent Community id (live only)                          | — (link)                                                                                                                                                                                                                                                        |
| `withinSettlementName`       | Parent name — export / import only                       | — (relink bridge)                                                                                                                                                                                                                                               |
| `trouble`                    | _@deprecated_ — Places no longer roll Settlement Trouble | —                                                                                                                                                                                                                                                               |
| `notes` / `situationalNotes` | descriptions                                             | —                                                                                                                                                                                                                                                               |
| `portraitEtag` / `imageUrl`  | portrait                                                 | —                                                                                                                                                                                                                                                               |
| `createdAt`                  | timestamp                                                | —                                                                                                                                                                                                                                                               |

### Expeditions (`expeditions[]`)

**Journey** (`type: "journey"`) — `id`, `name` (user-entered), `difficulty`,
`ticks`, `notes`, `complete`, `portraitEtag` / `imageUrl`, `createdAt`. No
oracle-driven fields.

**Site** (`type: "site"`, Delve):

| Key                                           | Contains              | Oracle                                                            |
| --------------------------------------------- | --------------------- | ----------------------------------------------------------------- |
| `name`                                        | Site name             | **Delve Site: Name (Template)** (`siteName`), base                |
| `theme`                                       | Delve theme           | **Delve Site: Theme** (`siteNatureTheme`), base                   |
| `domain`                                      | Delve domain          | **Delve Site: Domain** (`siteNatureDomain`), base                 |
| `currentFeature`                              | last-rolled feature   | Combined **Feature** table for the site's theme + domain (Delve)  |
| `currentDanger`                               | last-rolled danger    | Combined **Danger** table for theme + domain (Delve)              |
| `denizens[]`                                  | 12-row denizen matrix | Delve **denizen** tables (theme + domain), via the Denizen dialog |
| `objective`                                   | the site's objective  | —                                                                 |
| `difficulty` / `ticks` / `notes` / `complete` | mechanical            | —                                                                 |

**Scene** (`type: "scene"`, Lodestar Scene Challenge) — `name`, `objective`,
`consequences`, `countdownFilled` (0–4), `difficulty` (rank), `ticks`,
`notes`, `complete`. All user-entered or mechanical; no per-field oracle.

### Character (`{ name, data }`)

`name` comes from the **Character: Name** oracles; `data` is the full
persisted blob (stats — point-buy, not rolled; momentum / health / spirit /
supply; experience; initiative; vows; owned assets; debilities;
`globalValues`; portrait). Stats and tracks are mechanical, not
oracle-populated. Full field list mirrors `Character.data` in `types.ts`.

### Session-log entry (`log[]`)

`id`, `title`, `html`, `ts`, `note?`, `source?`, `roll?` — these are the
**recorded results** of oracle / move rolls, not fields an oracle fills. See
[Session log](#session-log) for the shape.

---

## Import behavior

Import dispatches by `manifest.type` (see the export-types table). Every
section that carries user-visible rows participates in collision detection
(see below); only the session log entries are always appended (deduplicated
internally by entry id).

### The import dialog

Import runs behind the **`ImportDialog`** (`$lib/components/ImportDialog.svelte`),
which the Hamburger → Import… action opens and the page's `runImport()` drives
through a small set of stages:

| Stage         | When                                                    | What the user sees                                           |
| ------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| **idle**      | Dialog just opened.                                     | Drop zone + "choose a file".                                 |
| **importing** | Reading + applying the archive.                         | Spinner.                                                     |
| **review**    | The validate pass dropped one or more rows (see below). | ⚠ list of unreadable rows + "Import the _N_ valid items?".   |
| **done**      | Finished (cleanly, or with skipped rows).               | ✓ summary; a warn badge + issue list when rows were skipped. |
| **error**     | A structural `ImportError` aborted the whole archive.   | ⚠ the readable error message; "Choose another file".         |

A drag-and-drop onto the page and the starter-seed both feed the same
`runImport()`; the seed path runs **silently** (no dialog), importing whatever
is valid and logging the rest.

### Validate, then confirm (partial import)

Before anything is applied, every incoming row is **shape-checked without
mutating state**: a row is valid when it is an object with a non-empty
`name` (expeditions also need a `type`). Invalid rows are collected with a
reason and dropped from the incoming arrays.

- If **no** rows were dropped, import proceeds straight to collision handling.
- If **some** rows were dropped, the dialog pauses on the **review** stage,
  lists what could not be read, and offers to import the remaining valid rows.
  Choosing **Cancel** applies nothing; choosing **Import _N_ valid items**
  continues with just the valid rows and reports them as skipped on the
  **done** stage.

This is distinct from a structural `ImportError` (see [Limits and
filters](#limits-and-filters)): a bad row is skippable and the rest can still
import, whereas a structural failure aborts the whole archive with no mutation.

Errors that occur **while applying** an individual row (a store call throwing)
are likewise caught per row, collected, and reported on the **done** stage —
one failed entity never aborts the others.

### Collision resolution

Imports are scanned up front against the current data, **matching by
lower-cased, trimmed `name`** (not by `id`). Matching by name lets a file
exported from one user be imported by another — IDs are minted independently
per user, so an `id`-based match would never fire on a cross-user transfer.

The collision dialog covers six categories:

| Category        | Detected against                                      |
| --------------- | ----------------------------------------------------- |
| **Characters**  | existing `Character.name`                             |
| **Communities** | existing `Community.name`                             |
| **NPCs**        | existing `Npc.name`                                   |
| **Places**      | existing `Place.name`                                 |
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

**No JSON-file import.** Only `.zip` archives are accepted. Older
plain-`.json` exports (from before the zip switchover) no longer
import; anyone with such a file can re-export from the previous
session or hand-wrap the JSON into a
`{ manifest.json + <type>.json + images/ }` zip.

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

| Entity                 | Field              | Notes                                                                                                                                                     |
| ---------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Character` (`data`)   | `background`       | Character sheet → Background tab — origin, upbringing, major traits                                                                                       |
| `Character` (`data`)   | `bondsFormed`      | Character sheet → Bonds → notes column                                                                                                                    |
| `Character` (`data`)   | `lessonsLearned`   | Character sheet → Failures → notes column                                                                                                                 |
| `Vow` (in `data.vows`) | `notes`            | Per-vow notes block                                                                                                                                       |
| `Community`            | `notes`            | Long-form description of the place (Description tab)                                                                                                      |
| `Community`            | `situationalNotes` | Conditions / aspects of the current trouble (Core tab)                                                                                                    |
| `Npc`                  | `notes`            | Background — origin, upbringing, major traits (Background tab)                                                                                            |
| `Npc`                  | `situationalNotes` | Actions taken by or things that have happened to this NPC in your story (Core tab)                                                                        |
| `Place`                | `notes`            | Physical features, atmosphere, notable details (Description tab)                                                                                          |
| `Place`                | `situationalNotes` | Events that have happened here, current state (Core tab)                                                                                                  |
| `Journey`              | `notes`            | Per-journey notes block                                                                                                                                   |
| `Site`                 | `notes`            | Per-site notes block                                                                                                                                      |
| `LogEntry`             | `note`             | Optional per-entry note appended below an entry                                                                                                           |
| `LogEntry`             | `source`           | Note entries: Markdown source (rendered output in `html`). Story entries: a JSON story payload (`{kind:"story", user, md}`) — see the Session Log section |

> **NPC `descriptor`** is _not_ mini-markdown — it's a one-line plain-text
> field for the NPC's short physical likeness (e.g. `tall, gaunt, scarred`)
> rendered on the Core tab.

In a character's `data.assets[].customValues`, any value keyed by a
`customField` whose `type` is `"markdown"` (see
[data-schema.md → CustomFieldDef](data-schema.md#customfielddef-schema))
is also rendered as Markdown. The catalogue defines the field type; the
import format just preserves the stored string.

---

## Portraits

Portraits (community / npc / expedition `imageUrl`, character `data.portrait`)
are **not** stored inline in the live data. The bytes live in a
content-addressed blob store on the server and the entity carries only a
lightweight reference:

- **`portraitEtag?: string`** on `Community`, `Npc`, `Journey`, `Site`, and in a
  character's `data` — the portrait's content hash (md5). The card renders
  `<img src="/api/.../portrait?v=<etag>">`; an absent/empty value means no
  portrait.

The zip export/import format is **self-contained and portable** by
extracting portraits as raw files inside the zip:

- **Export.** For each entity that has a portrait, `exportZip()` fetches
  the raw bytes from the blob endpoint and writes them to
  `images/portrait-N.<ext>` inside the zip (extension preserved via MIME
  sniff, so PNG stays PNG). The corresponding entity field in the
  `<type>.json` body carries a **file reference** — `imageUrlFile` for
  community / npc / place / expedition rows, `portraitFile` inside a
  character's `data` — instead of a base64 data URL. `portraitEtag` is
  dropped from the exported copy.

  ```json
  {
    "id": "abc123",
    "name": "Driftwood",
    "imageUrlFile": "images/portrait-1.jpg"
  }
  ```

- **Import.** `parseImportZip()` walks the reassembled body, resolves
  each `imageUrlFile` / `portraitFile` reference to its bytes in
  `images/`, encodes them as a `data:image/…;base64,…` URL, and writes
  them back onto the entity under the original field
  (`imageUrl` / `data.portrait`). The rest of the import flow then
  uploads that inline data URL to the blob store via
  `PUT /api/session/:kind/:id/portrait` (or `/api/characters/:id/portrait`),
  sets the entity's `portraitEtag` to the returned hash, and strips
  the inline field before the row is saved. A file reference that
  doesn't resolve is silently dropped — the entity just imports
  without a portrait, matching the pre-zip behaviour when a data-URL
  fetch returned empty.

Because the blob store is keyed by content hash, importing the same image
across several entities — or re-importing an export — **stores the bytes once**
and the duplicates collapse to references. The markdown (`.md` zip) export is
unaffected in shape: it also writes each portrait as a separate file under
`images/`, fetching the bytes from the blob endpoint.

---

## Import sanitization

Every imported file is run through `parseImportZip()` in
`importSanitizer.ts` **before any data is applied** — the raw file is
never trusted. An uploaded `.zip` (whatever its `manifest.type`) goes
through this pipeline:

1. **Outer size check** — reject the `.zip` up front if the raw byte
   payload exceeds the file-size limit.
2. **Decompress** — `fflate.unzipSync`. A malformed archive is reported
   as a friendly import error, not a crash. Total decompressed size is
   also capped (`MAX_BYTES × 4`) so a zip bomb — small compressed size,
   enormous unpacked payload — is rejected.
3. **Locate the body** — read `manifest.json` (must exist and be valid
   JSON), find the body file (`manifest.body` pointer or the first
   match in the standard candidate list), and enforce the same size
   cap on the body itself.
4. **Parse + reassemble portraits** — `JSON.parse` the body, then walk
   it swapping each `imageUrlFile` / `portraitFile` reference for the
   inline `imageUrl` / `portrait` data URL rebuilt from the zip's
   `images/*` entries.
5. **Recursive sanitize** — walk the reassembled structure, enforcing
   the depth / array-length / string-length limits and stripping
   prototype-pollution keys at every level. The result is the
   `{ manifest, data }` envelope the rest of the import flow consumes.
6. **Log-HTML scrub** — each log entry's `html` is passed through
   `sanitizeLogHtml()` (and added via `appendSafeLog()`) so no active
   content can reach the renderer.

### Limits and filters

| Guard                   | Limit / behavior                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Outer file size         | **5 MB** max (`MAX_BYTES`) on the raw `.zip` bytes.                                                                       |
| Total decompressed size | **20 MB** max (`MAX_BYTES × 4`) — zip-bomb guard.                                                                         |
| Body file size          | **5 MB** max (`MAX_BYTES`) on the unpacked `<type>.json`.                                                                 |
| Nesting depth           | **12** levels max (`MAX_DEPTH`).                                                                                          |
| Array length            | **1000** items max per array (`MAX_ARRAY_ITEMS`).                                                                         |
| String length           | Capped at the file-size limit (`MAX_STR_LEN = MAX_BYTES`, 5 MB) — large enough for a single re-embedded portrait.         |
| Prototype pollution     | Keys `__proto__`, `constructor`, `prototype` are stripped from every object (the `POISON_KEYS` set).                      |
| Missing portrait file   | Silently dropped — the entity imports without a portrait rather than aborting the whole zip.                              |
| Log HTML                | `sanitizeLogHtml()` strips `<script>` blocks, `on*=` event handlers, and `javascript:` URLs before any entry is rendered. |

Any violated limit throws an `ImportError`. That is caught at the import call
site, surfaced on the dialog's **error** stage as a readable message, and
**aborts the import with no mutation of existing state** — a malformed or
hostile file can never partially apply. (This is a whole-archive abort;
individual rows that merely fail the shape check are handled by the
[validate-then-confirm flow](#validate-then-confirm-partial-import), which can
import the rest.)

The end-to-end behavior here (happy-path round-trips, collision strategies,
and the security limits) is covered by
[`apps/web/tests/e2e/import-export.spec.ts`](../apps/web/tests/e2e/import-export.spec.ts)
and [`apps/web/tests/e2e/import-collision.spec.ts`](../apps/web/tests/e2e/import-collision.spec.ts).
