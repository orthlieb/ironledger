# Character Sheet

Reference for the character sheet's fields and behaviour.

> **⚠️ v2 note.** The v2 UI rewrite dissolved the standalone card components
> into a single area component: the sheet is now implemented in
> **`apps/web/src/lib/components/v2/CharactersArea.svelte`** (with
> `ResourceTile` / `MomentumTile` / `ProgressTrackPanel` / `AssetCard` /
> `AssetPicker`). Component names referenced below — `CharacterSheet`,
> `MeterControl`, `XpTrack`, `AssetsSection` — are the retired v1 names; the
> field semantics still apply. The action buses (below) drain in
> `CharactersArea`, not `CharacterSheet`.

---

## Purpose

Full character editor rendered in the "Characters" tab of the character detail page. All edits are auto-saved to the API 1.5 s after the last change (debounced). State is a deep-reactive `$state` object mirroring the `data` JSONB column.

---

## Sections

### Identity

- **Name** — text input, synced to `character.name` (top-level DB column) as well as `data.name`.
- **Background** — textarea for backstory/notes.
- **Portrait** — click to upload a JPEG; uploaded to the content-addressed blob store via `PUT /api/characters/:id/portrait`. `data.portraitEtag` holds the content hash and the bytes are no longer inlined. See [Portraits in import-schema.md](import-schema.md#portraits).

### Core Stats (1–4, rarely 5)

Five `StatControl` components, one per stat:

| Stat   | Color            | Key      |
| ------ | ---------------- | -------- |
| Edge   | `#3b82f6` blue   | `edge`   |
| Heart  | `#ef4444` red    | `heart`  |
| Iron   | `#9ca3af` gray   | `iron`   |
| Shadow | `#a855f7` purple | `shadow` |
| Wits   | `#f59e0b` amber  | `wits`   |

Also shows **Touched** level (`pure / prime / second / third / feral`) and **Touched Animal** name (YRT homebrew).

### Resources (`MeterControl` components)

| Resource | Range            | Notes                                                                                        |
| -------- | ---------------- | -------------------------------------------------------------------------------------------- |
| Momentum | –6 → maxMomentum | Max reduced by 1 per debility (min 0). Reset button burns momentum to `momentumReset` value. |
| Health   | 0–5              | Blocked (locked at 0) when Wounded.                                                          |
| Spirit   | 0–5              | Blocked when Shaken.                                                                         |
| Supply   | 0–5              | Party-wide in the full app.                                                                  |
| Mana     | 0–10             | YRT Conclave homebrew.                                                                       |

### Progress Tracks (`XpTrack` / `ProgressTrack`)

- **XP** — 0–30, `XpTrack` component.
- **Bonds** — 0–40 ticks across 10 boxes.
- **Failures** — 0–40 ticks across 10 boxes.

### Debilities (`DebilitiesSection`)

Four groups of boolean toggles:

| Group      | Flags                                   |
| ---------- | --------------------------------------- |
| Conditions | Wounded, Unprepared, Shaken, Encumbered |
| Banes      | Maimed, Corrupted                       |
| Burdens    | Cursed, Tormented                       |

Each active debility reduces `maxMomentum` by 1.

### Vows (`VowCard`)

Each vow has: name, difficulty (`troublesome / dangerous / formidable / extreme / epic`), a 10-box progress track (0–40 ticks), threat text, and a 10-pip menace track (0–10).

Mark-progress ticks per difficulty:

```
troublesome → 12 ticks  dangerous → 8  formidable → 4  extreme → 2  epic → 1
```

### Assets (`AssetsSection`)

Each asset references an `assetId` from the asset catalogue, with per-ability `enabled` booleans, an optional `rarityId`, and companion fields (`companionName`, `companionHealth`).

---

## Header Controls

| Control                   | Description                                                                   |
| ------------------------- | ----------------------------------------------------------------------------- |
| Collapse ▼/▶              | Hides/shows the full sheet body                                               |
| Portrait                  | Click to upload; eye-slash button to remove                                   |
| Export (file-export icon) | Downloads `{name}.zip` — the character's full data + portrait bytes           |
| Delete (trash icon)       | Triggers delete confirmation; calls `onDelete` prop to submit the hidden form |

---

## Key Types

```ts
// apps/web/src/lib/types.ts

interface CharacterData {
  name: string;
  background: string;
  portraitEtag?: string; // content hash; bytes live in the portrait blob store
  portrait?: string; // @deprecated legacy inline base64 — import transport only
  edge: number;
  heart: number;
  iron: number;
  shadow: number;
  wits: number;
  /** @deprecated migrated to Touched asset's customValues.touchedLevel */
  touched?: TouchedLevel;
  /** @deprecated migrated to Touched asset's customValues.animalName */
  touchedAnimal?: string;
  momentum: number;
  health: number;
  spirit: number;
  supply: number;
  /** Shared counter values for asset CustomFieldDefs with global:true (e.g. mana). Keyed by field.id. */
  globalValues?: Record<string, string>;
  xp: number;
  bonds: number;
  failures: number;
  /** Markdown notes shown beneath the Bonds track — significant bonds formed. */
  bondsFormed?: string;
  /** Markdown notes shown beneath the Failures track (delve mode only). */
  lessonsLearned?: string;
  wounded: boolean;
  unprepared: boolean;
  shaken: boolean;
  encumbered: boolean;
  maimed: boolean;
  corrupted: boolean;
  cursed: boolean;
  tormented: boolean;
  vows: Vow[];
  assets: CharacterAsset[];
  /** 0 = no initiative, 1 = character has it, 2 = foe has it. */
  initiative?: number;
}

type TouchedLevel = 'pure' | 'prime' | 'second' | 'third' | 'feral';
type VowDifficulty = 'troublesome' | 'dangerous' | 'formidable' | 'extreme' | 'epic';
```

```ts
// apps/web/src/lib/api.ts

interface CharacterFull {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  data: Record<string, unknown>; // JSONB — use hydrateCharacter() to get typed CharacterData
}
```

---

## Key Helper Functions

```ts
// apps/web/src/lib/character.ts

hydrateCharacter(raw); // merges raw JSONB onto DEFAULT_CHARACTER; fills missing keys
countDebilities(d); // count of all true debility flags
maxMomentum(d); // 10 − countDebilities (min 0)
momentumReset(d); // 2 / 1 / 0 depending on debility count
```

---

## Auto-save Behaviour

Changes to any field in `$state data` trigger a `$effect` watcher that starts/resets a 1500 ms debounce timer. On expiry the component calls `characters.update(id, { name, data })` via the API client. Save status is shown in the header: **Saving…** → **Saved** → **Save failed!**.

---

## Action Bus Integration

CharacterSheet consumes two reactive buses from `log.svelte.ts`:

### XP Spend Bus

A `$effect` reads `getXpSpendNonce()` and drains queued XP spend amounts via `drainXpSpend(charId)`. Triggered when the user clicks XP cost links in the session log.

### Generalized Action Bus

A `$effect` reads `getActionNonce()` and drains queued actions via `drainActions(charId)`. Handles:

- **Resource changes** (`type: 'resource'`): Applies delta to momentum, health, spirit, supply, mana, xp, bonds, or failures with proper clamping (e.g., momentum -6 to maxMomentum, health/spirit/supply 0-5).
- **Debility toggles** (`type: 'debility'`): Sets debility flags (wounded, shaken, etc.) to the specified value.

Both buses use the nonce-queue-drain pattern to ensure mutations happen inside Svelte's reactive context (`$effect`), not from external callbacks.

---

## Icon Imports

| Variable        | File                                    | Used for       |
| --------------- | --------------------------------------- | -------------- |
| `trashSvg`      | `$icons/trash-solid-full.svg?raw`       | Delete button  |
| `fileExportSvg` | `$icons/file-export-solid-full.svg?raw` | Export button  |
| `iconHeart`     | `$lib/images/icon-heart.svg?raw`        | Health meter   |
| `iconMomentum`  | `$lib/images/icon-momentum.svg?raw`     | Momentum meter |
| `iconSpirit`    | `$lib/images/icon-spirit.svg?raw`       | Spirit meter   |
| `iconSupply`    | `$lib/images/icon-supply.svg?raw`       | Supply meter   |
| `iconMana`      | `$lib/images/icon-mana.svg?raw`         | Mana meter     |
