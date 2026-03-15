# Foes — Design & Implementation Reference

Compiled from the old YRT app (`/yrt/src/modules/09-sites.js`, `09b-foes.js`) and the current Iron Ledger structure.

---

## 1. Data Files

**Location in API:** `apps/api/data/foes/`

| File | Contents |
|---|---|
| `foes_ironsworn.json` | ~30 Ironsworn core foes |
| `foes_delve.json` | ~30 Ironsworn Delve foes |
| `foes_yrt.json` | 4 homebrew YRT foes |

Each file has the shape `{ "foes": [ ...FoeDef[] ] }`.

---

## 2. Foe Definition Object (`FoeDef`)

```typescript
interface FoeDef {
  id:          string;     // "ironsworn/basilisk", "delve/blight-hound"
  name:        string;     // "Basilisk" — also used as image filename
  rank:        1 | 2 | 3 | 4 | 5;  // Base difficulty rank
  nature:      FoeNature;
  features:    string[];   // Descriptive bullet points (3–5 items)
  drives:      string[];   // What motivates this foe
  tactics:     string[];   // How it fights
  description: string;     // Multi-paragraph lore (may contain markdown links)
}

type FoeNature = 'Ironlander' | 'Firstborn' | 'Animal' | 'Beast' | 'Horror' | 'Anomaly';
```

---

## 3. Rank System

```typescript
const FOE_RANKS: Record<number, { label: string; progressPerHit: number; harm: number }> = {
  1: { label: 'Troublesome', progressPerHit: 12, harm: 1 },
  2: { label: 'Dangerous',   progressPerHit: 8,  harm: 2 },
  3: { label: 'Formidable',  progressPerHit: 4,  harm: 3 },
  4: { label: 'Extreme',     progressPerHit: 2,  harm: 4 },
  5: { label: 'Epic',        progressPerHit: 1,  harm: 5 },
};
```

- **`progressPerHit`** — ticks added to the 40-tick progress track each time "Mark Progress" is used.
- **`harm`** — how much harm the foe inflicts on the character per hit (reduces Health).

---

## 4. Quantity System

When adding a foe the player specifies quantity, which adjusts the effective rank:

```typescript
const FOE_QUANTITIES = [
  { value: 'solo',  label: 'Solo',       rankAdj: 0, desc: 'One foe'   },
  { value: 'pack',  label: 'Pack (2–4)', rankAdj: 1, desc: '+1 rank'   },
  { value: 'horde', label: 'Horde (5+)', rankAdj: 2, desc: '+2 ranks'  },
] as const;

type FoeQuantity = 'solo' | 'pack' | 'horde';
```

`effectiveRank = Math.min(5, foeDef.rank + rankAdj)`

---

## 5. Encounter Object (what gets stored)

This is what lives in `character.data.encounters[]` (or the global foes list):

```typescript
interface FoeEncounter {
  id:            string;        // crypto.randomUUID()
  foeId:         string;        // references FoeDef.id
  quantity:      FoeQuantity;   // 'solo' | 'pack' | 'horde'
  effectiveRank: 1|2|3|4|5;    // base rank + quantity adjustment, clamped to 5
  ticks:         number;        // 0–40 (10 boxes × 4 ticks per box)
  notes:         string;        // free-text player notes
  customName:    string;        // optional override; display foeDef.name if ''
  vanquished:    boolean;       // true after the encounter is won
}
```

> **Old app key:** `localStorage['oracle-combats']`
> **New app key:** `character.data.encounters` (JSONB column, array of `FoeEncounter`)

---

## 6. Foe Images

Images are PNGs named exactly after `FoeDef.name` (including spaces):

```
Basilisk.png
Bear.png
Blood Thorn.png      ← spaces preserved
Iron-Wracked Beast.png
```

**Static path in Iron Ledger:**

```
apps/web/static/foes/<FoeDef.name>.png
```

Served at runtime as `/foes/<FoeDef.name>.png`.

The directory `apps/web/static/foes/` already exists with some images. Copy the full set from `/yrt/data/assets/images/*.png` (they are the same set). When an image fails to load (`onerror`), hide the `<img>` or show a nature-coloured placeholder square.

---

## 7. API Endpoint (New)

Following the exact same pattern as assets/moves/oracles in `catalogue.ts`:

**Fastify route:** `GET /api/v1/catalogue/foes`
**SvelteKit BFF proxy:** `GET /api/catalogue/foes` → `apps/web/src/routes/api/catalogue/foes/+server.ts`

### `catalogue.ts` changes

Add foes to `loadCatalogue()`:

```typescript
// Load all foe files
const [foesIs, foesDelve, foesYrt] = await Promise.all([
  loadJson(path.join(DATA_ROOT, 'foes/foes_ironsworn.json')),
  loadJson(path.join(DATA_ROOT, 'foes/foes_delve.json')),
  loadJson(path.join(DATA_ROOT, 'foes/foes_yrt.json')),
]) as Array<{ foes: FoeDef[] }>;

const allFoes = {
  foes: [...foesIs.foes, ...foesDelve.foes, ...foesYrt.foes],
};
```

Add to return value:
```typescript
foes: { data: allFoes, etag: makeEtag(allFoes) },
```

Add route:
```typescript
server.get('/foes', (req, reply) => sendCatalogueItem(catalogue.foes, req, reply));
```

### `apps/web/src/routes/api/catalogue/foes/+server.ts` (new file)

Mirror of the oracles BFF proxy, forwarding to `/api/v1/catalogue/foes`.

---

## 8. Foe Store (`foeStore.svelte.ts`)

Module-level reactive store, same pattern as `oracleStore.svelte.ts` and `assetStore.svelte.ts`:

```typescript
let _foes:    FoeDef[] = $state([]);
let _loading  = $state(false);
let _loaded   = false;

export async function loadFoes(): Promise<void>         // idempotent fetch
export function getFoes(): FoeDef[]                     // all foes
export function getFoeNatures(): FoeNature[]            // distinct natures in order
export function getFoeSources(): string[]               // 'Ironsworn' | 'Delve' | 'Yrt'
export function findFoe(id: string): FoeDef | undefined
```

Source is derived from `id` prefix: `"ironsworn/*"` → `"Ironsworn"`, `"delve/*"` → `"Delve"`, `"yrt/*"` → `"Yrt"`.

---

## 9. Foe Picker Dialog (`FoePickerDialog.svelte`)

Two-step native `<dialog>`, same open()/close() interface as `OraclesDialog`.

### Step 1 — Picker view
- Search `<input>` — matches on `name` and `features[]`
- Nature filter tag buttons (Ironlander / Firstborn / Animal / Beast / Horror / Anomaly)
- Source filter buttons (Ironsworn / Delve / Yrt)
- Tile grid: `display:grid; grid-template-columns: repeat(auto-fill, minmax(140px,1fr))`
  - Each tile:
    - Foe portrait `<img src="/foes/{foeDef.name}.png">` — hide on `onerror`
    - Nature-coloured left border (4 px)
    - Name
    - Nature badge + Rank badge
    - First 3 features (2-line clamp)
- Clicking a tile → Step 2

### Step 2 — Confirm view (quantity/rank)
- Foe portrait + name + nature/rank badges
- Quantity radio group: Solo / Pack (2–4) / Horde (5+)
- Live "Effective rank: Formidable (3)" display
- **Add to Foes** button → callback
- **← Back** button → return to picker

### Callback signature
```typescript
onSelect(foeDef: FoeDef, quantity: FoeQuantity, effectiveRank: number): void
```

---

## 10. Nature Colour Mapping

| Nature | CSS variable | Approximate colour |
|---|---|---|
| Ironlander | `--color-iron` | `#9ca3af` (grey) |
| Firstborn | `--color-wits` | `#f59e0b` (amber) |
| Animal | `--color-supply` | `#34d399` (green) |
| Beast | `--color-heart` | `#ef4444` (red) |
| Horror | `--color-shadow` | `#a855f7` (purple) |
| Anomaly | `--color-mana` | `#f59e0b` (orange) |

---

## 11. Foe Card Component (`FoeCard.svelte`)

Collapsible card shown in the Foes tab list.

### Card header (always visible)
- Collapse toggle `▶ / ▼`
- Thumbnail `<img>` (hover shows larger popover)
- Display name (`customName || foeDef.name`)
- Quantity badge (hidden when `solo`)
- Nature badge
- Rank badge showing `effectiveRank` label; tooltip notes quantity adjustment if pack/horde
- Status icon: sword SVG (active) or skull SVG (vanquished)
- Delete button

### Card body (collapsible)
- Custom name `<input>` — overrides foeDef.name in header
- `Inflicts {FOE_RANKS[effectiveRank].harm} harm` reminder
- Full description (markdown → HTML)
- **Features** bulleted list
- **Drives** bulleted list
- **Tactics** bulleted list
- Progress track: 10 boxes × 4 ticks = 40 ticks total
  - Mark Progress button — adds `progressPerHit` ticks for `effectiveRank`
  - Clear Progress button
- Notes `<textarea>`
- **Vanquished / Active** toggle button

### Log entries emitted
| Action | Log message |
|---|---|
| Foe added | `Foe added: <strong>Name</strong> (solo, Extreme rank)` |
| Progress marked | `Progress marked on <strong>Name</strong> (3/10 → 4/10)` |
| Vanquished | `<strong>Name</strong> marked as vanquished` |
| Foe removed | `Foe removed from encounter: <strong>Name</strong>` |

---

## 12. Foes Tab Layout (`+page.svelte` — Foes tab)

```svelte
{:else if activeTab === 'foes'}
  <div class="char-toolbar">
    {#if foeError}<span class="char-error">{foeError}</span>{/if}
    <div class="char-toolbar-actions">
      <button class="btn btn-primary" onclick={openFoePicker}>+ New Foe</button>
    </div>
  </div>

  {#if encounters.length === 0}
    <div class="empty-tab">
      <span class="empty-tab-icon">{@html skullSvg}</span>
      <span class="empty-tab-title">No Foes Tracked</span>
      <span class="empty-tab-sub">Use <strong>+ New Foe</strong> to start a fight.</span>
    </div>
  {:else}
    <div class="foe-list">
      {#each encounters as enc (enc.id)}
        <FoeCard {enc} onDelete={...} />
      {/each}
    </div>
  {/if}
```

Encounters are stored as `character.data.encounters[]` on the **active character** and auto-saved via the existing 1.5s debounce in `CharacterSheet`.

---

## 13. GlobalContextBar — Foe Dropdown

The foe selector stub in `GlobalContextBar.svelte` (line 94–100) is already wired and waiting. It needs:

**New props:**
```typescript
encounters:       FoeEncounter[];   // active foes for the current character
activeFoeId:      string;           // '' = none
onFoeSelect:      (id: string) => void;
```

**Behaviour:**
- Lists `(none)` + one `<option>` per encounter: `customName || foeDef.name` + rank badge
- Only shows non-vanquished encounters (vanquished foes stay listed but marked)
- `activeFoeId` feeds into `PreconditionContext.hasFoe` and `.initiative` checks

---

## 14. Precondition Context Integration

`apps/web/src/lib/preconditions.ts` already declares:
```typescript
interface PreconditionContext {
  hasFoe?:    boolean;  // true when activeFoeId !== ''
  initiative?: number; // 0=none, 1=character, 2=foe
}
```

The active foe selection drives `hasFoe`. Initiative tracking (who has it — character or foe) is a future per-encounter field.

---

## 15. Implementation Order

1. **API** — add `foes` to `catalogue.ts` `loadCatalogue()` + `/foes` route
2. **BFF proxy** — `apps/web/src/routes/api/catalogue/foes/+server.ts`
3. **Store** — `apps/web/src/lib/foeStore.svelte.ts`
4. **Images** — copy PNGs to `apps/web/static/foes/`
5. **Types** — add `FoeDef`, `FoeEncounter`, `FoeQuantity`, `FoeNature` to `types.ts`; add `encounters: FoeEncounter[]` to `CharacterData`
6. **FoePickerDialog** — two-step picker → confirm dialog
7. **FoeCard** — collapsible card component
8. **Foes tab** — toolbar + list in `+page.svelte`
9. **GlobalContextBar** — enable foe dropdown with real data + `onFoeSelect` prop
10. **Preconditions** — wire `hasFoe` context from `activeFoeId`
