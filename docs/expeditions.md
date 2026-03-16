# Expeditions

Tracks journey and site expeditions. Expeditions represent the two types of progress-track-based travel/exploration in Ironsworn:

- **Journey** — overland or sea travel toward a destination.
- **Site** — a dangerous place (dungeon, lair, ruin) being delved.

Both use 10-box progress tracks with 4 ticks per box and a difficulty rank.

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
  denizens:   string[12],       // one text entry per denizen cell
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

The Expeditions tab contains:
- **+ New Journey** / **+ New Site** buttons
- Cards displayed in insertion order, intermixed
- Collapsible cards (JourneyCard, SiteCard) following FoeCard/VowCard patterns

### JourneyCard
- Name, difficulty selector, notes textarea
- 10-box progress track with +/- buttons
- Mark Complete toggle

### SiteCard
- Name, difficulty, objective fields
- Theme + Domain selectors with **Features** and **Dangers** buttons inline
  - Buttons open a DelveTableDialog showing the combined theme+domain oracle table
  - Roll button performs a d100 roll with dice animation and session log entry
  - Dialog closes after rolling
- 12-cell denizen grid with:
  - d100 range labels and frequency indicators
  - Text input for each cell
  - ⊕ button to pick a foe from the catalogue (opens FoePickerDialog in denizen mode)
  - **Roll Denizen** button for d100 denizen roll with cell highlighting
  - When a rolled denizen matches a foe in the catalogue, an **Add to Foes?** button appears
- 10-box progress track with +/- buttons
- Mark Complete toggle

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

## Global Context Integration

The **Expedition selector** in GlobalContextBar is populated with active (non-complete) journeys and sites in separate `<optgroup>` elements. Selecting an expedition shows a summary row with progress information.

---

## Components

| Component | File | Purpose |
|-----------|------|---------|
| JourneyCard | `components/JourneyCard.svelte` | Journey expedition card |
| SiteCard | `components/SiteCard.svelte` | Delve site card with denizen grid |
| DelveTableDialog | `components/DelveTableDialog.svelte` | Combined feature/danger table with roll |
| FoePickerDialog | `components/FoePickerDialog.svelte` | Foe picker (encounter + denizen modes) |

## Stores

| Store | File | Purpose |
|-------|------|---------|
| expeditionStore | `expeditionStore.svelte.ts` | Expedition CRUD + persistence |
| delveStore | `delveStore.svelte.ts` | Delve oracle table data |
