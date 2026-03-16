# Foes

Tracks active combat encounters (foes). Each encounter record links to a foe definition from the foe catalogue and stores combat-specific state (progress track, custom name, vanquished flag).

---

## Data Model

### Encounter (stored per-character)
```js
{
  id:         string,   // crypto.randomUUID()
  foeId:      string,   // references foe catalogue entry
  customName: string,   // optional display name override
  rank:       number,   // effective rank (1-5, after quantity adjustment)
  quantity:   'solo' | 'pack' | 'horde',
  ticks:      number,   // 0-40 progress track
  vanquished: boolean,
}
```

### Foe Catalogue Entry (FoeDef)
```js
{
  id:          string,       // e.g. "ironsworn/bear", "delve/troll"
  name:        string,
  nature:      FoeNature,    // Ironlander | Firstborn | Animal | Beast | Horror | Anomaly
  rank:        number,       // base rank 1-5
  description: string,
  features:    string[],
  drives:      string[],
  tactics:     string[],
}
```

---

## Foe Catalogue

Static JSON data served via:
- **API**: `GET /api/v1/catalogue/foes` (public, cached with ETag)
- **BFF proxy**: `GET /api/catalogue/foes`
- **Client store**: `foeStore.svelte.ts`

Sources: Ironsworn core, Delve supplement, Yrt homebrew.

### Ranks & Mechanics
| Rank | Progress/Hit | Harm/Strike |
|------|-------------|-------------|
| Troublesome | 12 | 1 |
| Dangerous | 8 | 2 |
| Formidable | 4 | 3 |
| Extreme | 2 | 4 |
| Epic | 1 | 5 |

### Quantities
- **Solo** — base rank, one foe
- **Pack (2-4)** — +1 rank adjustment
- **Horde (5+)** — +2 rank adjustment

---

## UI Structure

The Foes tab contains:
- **+ New Foe** button — opens FoePickerDialog
- Encounter cards (FoeCard) displayed in order, each showing:
  - Foe portrait, name (custom or catalogue), nature badge, rank badge
  - Name override input + harm-per-strike tag
  - Description, features, drives, tactics from catalogue
  - 10-box progress track with +/- mark buttons
  - **Mark Vanquished** / **Return to Active** toggle

### FoePickerDialog
- Searchable grid of foe tiles filtered by name and nature
- Two modes:
  - **Encounter mode** — pick foe → confirm with quantity selector → adds encounter
  - **Denizen mode** — pick foe → immediately returns foe name (used by SiteCard)

---

## Global Context Integration

The **Foe selector** in GlobalContextBar is populated with active (non-vanquished) encounters. Selecting a foe shows a summary row with rank and progress information.

---

## Components

| Component | File | Purpose |
|-----------|------|---------|
| FoeCard | `components/FoeCard.svelte` | Individual encounter card |
| FoePickerDialog | `components/FoePickerDialog.svelte` | Foe selection dialog |

## Stores

| Store | File | Purpose |
|-------|------|---------|
| encounterStore | `encounterStore.svelte.ts` | Encounter CRUD + persistence |
| foeStore | `foeStore.svelte.ts` | Foe catalogue data + lookups |
