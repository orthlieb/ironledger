# Expeditions System Design

Ported from the old app (`yrt/ironledger.html`). Expeditions are global (non-character) state covering two types: **Journeys** (overland travel) and **Delve Sites** (location exploration).

## Data Model

### Journey
| Field | Type | Description |
|-------|------|-------------|
| id | string | crypto.randomUUID() |
| type | 'journey' | Discriminant |
| name | string | Journey name |
| difficulty | VowDifficulty | troublesome / dangerous / formidable / extreme / epic |
| ticks | number | 0-40 (10 boxes x 4 ticks) |
| notes | string | Waypoints, landmarks, perils encountered |
| complete | boolean | Completion flag |

### Delve Site
| Field | Type | Description |
|-------|------|-------------|
| id | string | crypto.randomUUID() |
| type | 'site' | Discriminant |
| name | string | Site name |
| objective | string | Goal for this site |
| theme | DelveTheme \| '' | One of 8 themes |
| domain | DelveDomain \| '' | One of 12 domains |
| difficulty | VowDifficulty | Same scale as journeys |
| ticks | number | 0-40 (10 boxes x 4 ticks) |
| denizens | string[12] | One entry per denizen cell |
| complete | boolean | Completion flag |

### Discriminated Union
Both types are stored in a single `expeditions` array using `type` as the discriminant: `Expedition = Journey | Site`.

## Progress Tracking

Same system as vows and foe encounters:
- 10 boxes, 4 ticks each, 40 total
- Mark Progress ticks per difficulty: Troublesome=12, Dangerous=8, Formidable=4, Extreme=2, Epic=1

## Themes (8)
Ancient, Corrupted, Fortified, Hallowed, Haunted, Infested, Ravaged, Wild

Each theme has Features (d100 table) and Dangers (d100 table).

## Domains (12)
Barrow, Cavern, Frozen Cavern, Icereach, Mine, Pass, Ruin, Sea Cave, Shadowfen, Stronghold, Tanglewood, Underkeep

Each domain has Features (d100 table) and Dangers (d100 table).

## Denizen Cells (12 rows)
| # | Label | d100 Range |
|---|-------|-----------|
| 1 | Very Common | 01-27 |
| 2 | Common | 28-41 |
| 3 | Common | 42-55 |
| 4 | Common | 56-69 |
| 5 | Uncommon | 70-75 |
| 6 | Uncommon | 76-81 |
| 7 | Uncommon | 82-87 |
| 8 | Uncommon | 88-93 |
| 9 | Rare | 94-95 |
| 10 | Rare | 96-97 |
| 11 | Rare | 98-99 |
| 12 | Unforeseen | 00 |

Rolling a d100 maps to the matching cell's denizen entry.

## Storage
- Database: `user_data.expeditions` JSONB column (already exists)
- API: `PATCH /api/v1/session/expeditions` (already exists)
- Client store: `expeditionStore.svelte.ts` (module-level $state, same pattern as encounterStore)

## UI
- Single "Expeditions" tab with "+ New Journey" and "+ New Site" buttons
- Items displayed in chronological insertion order, intermixed
- Collapsible cards (JourneyCard, SiteCard) following FoeCard/VowCard patterns
- GlobalContextBar: expedition selector dropdown + summary row

## Delve Integration (Phase 2)

### Features & Dangers
- Theme/Domain row includes inline **Features** and **Dangers** buttons (disabled until both are set)
- Opens DelveTableDialog showing combined theme+domain oracle table
- Roll button performs d100 with dice animation and session log entry
- Data served via `GET /api/v1/catalogue/delve` → `delveStore.svelte.ts`

### Denizen ↔ Foe Flow
- Each denizen cell has a ⊕ button to pick a foe from the catalogue (FoePickerDialog in denizen mode)
- **Roll Denizen** d100 highlights the matching cell
- If the rolled denizen name matches a foe in the catalogue, an **Add to Foes?** button appears
- Clicking adds the foe as a new encounter via the existing encounter system
