# Expeditions

Tracks journeys, sites and scenes. Expeditions come in three types (`ExpeditionType` in `apps/web/src/lib/types.ts`):

- **Journey** — overland or sea travel toward a destination.
- **Site** — a dangerous place (dungeon, lair, ruin) being delved.
- **Scene** — see [Scene](#scene) below.

Journeys and sites use 10-box progress tracks with 4 ticks per box and a difficulty rank.

---

## Data Model

### Journey

```js
{
  id:         string,        // crypto.randomUUID()
  type:       'journey',     // discriminant
  name:       string,
  difficulty: VowDifficulty, // troublesome | dangerous | formidable | extreme | epic
  ticks:      number,        // 0–40
  complete:   boolean,
  notes:      string,
}
```

### Site

```js
{
  id:         string,
  type:       'site',
  name:       string,
  objective:  string,
  theme:      DelveTheme | '',  // 8 themes: Ancient, Corrupted, Fortified, Hallowed, Haunted, Infested, Ravaged, Wild
  domain:     DelveDomain | '', // 12 domains: Barrow, Cavern, Frozen Cavern, Icereach, Mine, Pass, Ruin, Sea Cave, Shadowfen, Stronghold, Tanglewood, Underkeep
  difficulty: VowDifficulty,
  ticks:      number,           // 0–40
  denizens:   string[12],       // per cell: a catalogue foe's id (picked) or the text typed
  complete:   boolean,
}
```

### Discriminated Union

Both types are stored in a single `expeditions` array using `type` as the discriminant: `Expedition = Journey | Site`.

---

## Storage

- **Database**: `user_data.expeditions` JSONB column
- **API**: `PATCH /api/v1/session/expeditions`
- **Client store**: `expeditionStore.svelte.ts` (module-level `$state`, same pattern as encounterStore)

---

## UI Structure

The Expeditions area (`apps/web/src/lib/components/v2/ExpeditionsArea.svelte`) shows one expedition at a time. Its tabs have their own components under `components/v2/expeditions/`: **`ExpeditionCore`** (with a site's **`SiteFields`**: Theme / Domain / Feature / Danger and their rolls), **`ExpeditionDescription`** and **`SiteDenizens`**. Each edits through a callback, so ExpeditionsArea keeps every write and the save; it also keeps the field-row styles they share, the New and Change Theme / Domain dialogs, and Roll Denizen's `DenizenDialog`.

- **Header** — the switcher (`Combobox`) lists every expedition A→Z with its type's glyph and colour, Journeys / Sites / Scenes filter pills, and the **+ New Journey…**, **+ New Site…** and **+ New Scene…** actions (each opens its New dialog). The gear opens `ExpeditionOptionsDialog` (rename, delete).
- **Tabs** for the open expedition, below. While it's marked complete, everything on Core but the Status toggle is disabled, and so are the tab buttons (the gear still works).

Notes fields are click-to-edit **markdown** (`MarkdownNotes`, rendered by `renderNote()` from `#lib/markdown.js`: `**bold**`, `*italic*`, `# heading`, `- list`); textarea on click, rendered HTML on blur.

### Journey

- **Core** — type and difficulty pills (difficulty is chosen in the New Journey dialog), the Active / Complete status toggle, the 10-box progress track with +/- buttons (`ProgressTrackPanel`), and the map chips (one per campaign-map marker linked to it)
- **Description** — Summary (`shortDescription`, shown on its map marker's card) and Detailed description (`notes`), with the portrait floated right

### Site

- **Core** — pills and status as for a journey, then:
  - **Theme** and **Domain** selects, each with a d6 (`.dice-btn`) for a random pick
  - **Feature** and **Danger** selects listing the combined theme + domain table (`buildCombinedTable`), each with a d6 that rolls d100 on that table, writes a session log entry and sets the field. A 99 or 100 adds a Change Theme / Change Domain link to the entry (`/site.theme`, `/site.domain`, which open the site's picker). Both wait for a theme and a domain.
  - Progress track and map chips
- **Description** — Objective, then Summary and Detailed description as for a journey
- **Denizens** — the 12-cell denizen grid:
  - d100 range labels and frequency indicators
  - Text input for each cell
  - A **+** button to pick a foe from the catalogue (opens FoePickerDialog in denizen mode);
    the cell stores the foe's id and shows its name, so a renamed or translated
    foe still finds the same one. Typed text is kept as typed, and matches a foe
    by name (`findDenizenFoe` / `denizenLabel` in `foeStore.svelte.ts`)
  - **Roll Denizen** opens `DenizenDialog` (a wrapper around `FoeRollDialog`), which rolls d100 on the site's denizens; when the result is a catalogue foe it offers **Add to Foes**

### Scene

- **Core** only — objective, consequences, status, progress track, the 4-segment countdown (`CountdownTrack`) and notes. Scenes aren't placed on maps.

---

## Expansion Toggle (Delve)

Sites are Delve content. When the **Delve** expansion toggle is off (per user, see [expansion-toggles.md](expansion-toggles.md)):

- **+ New Site…** is left out of the switcher's actions (Journey creation still works).
- Existing `Site` records are **never deleted** — they keep rendering, including theme/domain change, feature/danger rolls, denizen edits and Roll Denizen, and progress marks. Toggle gates new-site creation only.
- The `DELVE_THEMES` / `DELVE_DOMAINS` constants and the `/api/v1/catalogue/delve` endpoint stay loaded so existing sites resolve.

Journeys are part of the base game and are unaffected by either toggle.

---

## Delve Data

Theme and domain feature/danger tables are served via:

- **API**: `GET /api/v1/catalogue/delve` (public, cached with ETag)
- **BFF proxy**: `GET /api/catalogue/delve`
- **Client store**: `delveStore.svelte.ts`

The store provides:

- `buildCombinedTable(theme, domain, 'features' | 'dangers')` — merges theme + domain entries
- `rollCombinedTable(theme, domain, type)` — d100 roll on the combined table

---

## Active expedition selection

The expedition picked in the Expeditions area's switcher is the active one:
ExpeditionsArea publishes it with `setActiveExpeditionId()`
(`activeContext.svelte.ts`). The Moves dialog (wired in `+layout.svelte`)
reads it for journey / site / scene conditions and progress rolls, and the
command bar shows it as a chip in its type's colour and points commands such
as `/site.theme` at it.

---

## Components

| Component               | File                                                     | Purpose                                                                                                      |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| ExpeditionsArea         | `components/v2/ExpeditionsArea.svelte`                   | The Expeditions area: switcher, New dialogs, the tabs, every write and save, Change Theme / Domain           |
| ExpeditionCore          | `components/v2/expeditions/ExpeditionCore.svelte`        | The Core tab: pills, status, a scene's objective, consequences, countdown and notes, the progress track, Map |
| SiteFields              | `components/v2/expeditions/SiteFields.svelte`            | A site's Theme / Domain / Feature / Danger and their rolls                                                   |
| ExpeditionDescription   | `components/v2/expeditions/ExpeditionDescription.svelte` | The Description tab: a site's objective, summary, portrait, description                                      |
| SiteDenizens            | `components/v2/expeditions/SiteDenizens.svelte`          | A site's Denizens tab: Roll Denizen and the twelve cells                                                     |
| ExpeditionOptionsDialog | `components/ExpeditionOptionsDialog.svelte`              | Rename and delete an expedition                                                                              |
| DenizenDialog           | `components/DenizenDialog.svelte`                        | Roll Denizen (wraps `FoeRollDialog`)                                                                         |
| FoePickerDialog         | `components/FoePickerDialog.svelte`                      | Foe picker (encounter + denizen modes)                                                                       |

## Stores

| Store           | File                        | Purpose                       |
| --------------- | --------------------------- | ----------------------------- |
| expeditionStore | `expeditionStore.svelte.ts` | Expedition CRUD + persistence |
| delveStore      | `delveStore.svelte.ts`      | Delve oracle table data       |
