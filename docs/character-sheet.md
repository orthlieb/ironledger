# Character Sheet

Reference for the character sheet's fields and behaviour.

---

## Purpose

Full character editor: the Characters area of the home page (`/home`). All edits are auto-saved to the API 1.5 s after the last change (debounced). The sheet edits the character's `data` object in the character store directly (a deep-reactive `$state` proxy mirroring the `data` JSONB column).

The area is **`apps/web/src/lib/components/v2/CharactersArea.svelte`**. Three of its tabs have their own components under `components/v2/sheet/`: **`SheetCore`** (initiative, stats with their double-click edit and its dialogs, vitals, debilities, the tracks and their notes dialogs), **`SheetVows`** (a `VowCard` per vow) and **`SheetAssets`** (the asset chits, their counters and requirement fading). Each takes the live character data and edits it in place, so CharactersArea's autosave sees the change; what touches the rest of the area (the asset dialog, vow deletion and forsaking, momentum's reset) goes back through a callback. Details is `CharacterFields`; Background stays inline in CharactersArea. Clicking an asset chit opens `AssetCard` in a dialog; + Asset opens `AssetPicker`.

---

## Sections

The sheet's tabs: **Core** (initiative, stats, vitals, debilities, and the
Bonds and Failures tracks), **Details** (the character fields below),
**Background** (bio and portrait), **Vows** and **Assets**.

### Identity

- **Name** — given in the New Character dialog; changed in Character options (the gear in the area header). Stored in `data.name`, which the switcher reads (falling back to the top-level `character.name` column).
- **Background** — click-to-edit markdown (`MarkdownNotes`) on the Background tab.
- **Portrait** — click to upload a JPEG; uploaded to the content-addressed blob store via `PUT /api/characters/:id/portrait`. `data.portraitEtag` holds the content hash and the bytes are no longer inlined. See [Portraits in import-schema.md](import-schema.md#portraits).

### Core Stats (0–4)

Five `StatControl` components, one per stat. They're set in the New
Character dialog (a starting array: 0 under Lodestar's Grim, up to 4 under
its Challenging) and read out on the Core tab. A few path assets change a
stat by an ability (Battle-Scarred, Shadow-Kin, Lorekeeper, Oathbreaker):
marking the ability writes its stat links to the log (see
[data-schema.md → Ability log links](data-schema.md#ability-log-links-log)),
where a click makes the change. For anything else, a double-click on a stat (a double-tap on a phone, timed by hand since iOS
doesn't report one), after a warning that editing stats after creation is
unusual (Yes / No), makes that stat a 0–4 field (`STAT_MIN` / `STAT_MAX` in
`rules/statArrays.ts`). Leaving it (Enter, or focus moving on) lists the
change and asks to Apply it (one log entry), Discard it, or Cancel back to
the field; with nothing changed it just reads out again, as Escape or
switching character does. An action roll's score (action die + stat + adds)
is capped at 10 (`rules/actionScore.ts`).

| Stat   | Color            | Key      |
| ------ | ---------------- | -------- |
| Edge   | `#3b82f6` blue   | `edge`   |
| Heart  | `#ef4444` red    | `heart`  |
| Iron   | `#9ca3af` gray   | `iron`   |
| Shadow | `#a855f7` purple | `shadow` |
| Wits   | `#f59e0b` amber  | `wits`   |

The core rules and extensions can add fields to a character, shown on the
Details tab: Region of origin (core, no heading), and with YRT, under a YRT
heading, Religion, Touched and Animal (Animal hidden while Touched is Pure).
Changing one is logged (`Touched: Prime → Second`), and lowering Touched
unmarks a Touched asset's abilities above the new limit. They're stored in
`data.fields`; see [character-fields.md](character-fields.md).

### Vitals (`MomentumTile`, `ResourceTile`)

On the Core tab, below Stats. Each tile carries its own +/− buttons.

| Resource   | Range            | Notes                                                                                        |
| ---------- | ---------------- | -------------------------------------------------------------------------------------------- |
| Momentum   | –6 → maxMomentum | Max reduced by 1 per debility (min 0). Reset button burns momentum to `momentumReset` value. |
| Health     | 0–5              |                                                                                              |
| Spirit     | 0–5              |                                                                                              |
| Supply     | 0–5              | Party-wide: a change is written to every character (`setPartySupply`).                       |
| Experience | 0–30             | `data.xp`.                                                                                   |

Mana (0–10, YRT) isn't a vitals tile: it's YRT's global counter, kept in
`data.globalValues.mana` and shown, with its ± buttons, on the chit of each
asset that refers to it (Assets tab).

### Progress Tracks (`ProgressTrackPanel`)

- **Bonds** — 0–40 ticks across 10 boxes.
- **Failures** — 0–40 ticks across 10 boxes (with Delve on).

Both sit on the Core tab. The note button at the end of each track (lit when
there are notes) opens its notes in a dialog (`TrackNotesDialog`): Bonds
Formed (`data.bondsFormed`) and Lessons Learned (`data.lessonsLearned`).
Notes already written open rendered (click to edit); empty notes open in the
textarea. Markdown works; Save (or Ctrl/Cmd+Enter) keeps the edit, Cancel
drops it.

### Debilities (`DebilitiesSection`)

On the Core tab, below Vitals. Groups of boolean toggles:

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

### Assets (`SheetAssets`)

Each asset references an `assetId` from the asset catalogue, with per-ability `enabled` booleans, an optional `rarityId`, and companion fields (`companionName`, `companionHealth`).

### Initiative

At the top of the Core tab: a None / Foe (shield) / Character (sword)
toggle (`SegmentedRadio`), stored in `data.initiative` (0 / 2 / 1). Move
outcomes set it through their initiative links (`/initiative=me`,
`/initiative=foe`; see [command-language.md](command-language.md)), and the
Moves dialog reads it for moves that require initiative (Strike's
`initiative == me`).

---

## Header Controls

| Control                  | Description                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Switcher (`Combobox`)    | Lists the characters; its **+ New character…** action opens the New Character dialog |
| + Vow (link icon)        | Opens the New Vow dialog (name, difficulty)                                          |
| + Asset (gem icon)       | Opens the Assets tab and the asset picker                                            |
| Character options (gear) | `CharacterOptionsDialog`: rename, and delete (behind a confirmation)                 |

The portrait is on the Background tab (`PortraitUploader`: click to upload,
or drop an image). Export is ☰ → Export, with the rest of the campaign.

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
  /** Extension fields (core: origin; YRT: religion, touched, touchedAnimal),
   *  keyed by field id: an option id or text. */
  fields?: Record<string, string>;
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

A `$effect` in CharactersArea snapshots the active character's `data` deeply, so any change to it starts/resets a 1500 ms debounce (`createDebouncedSave()`, `debouncedSave.ts`). On expiry it calls `flushCharacterToApi(id)` (`characterStore.svelte.ts`), which sends `characters.update(id, { name, data })`. Switching character or leaving the page flushes the pending save at once. There is no save-status readout; a failed save is logged to the console.

**Reloading or closing the tab inside the debounce doesn't lose the edit.** `src/lib/pageExit.ts` runs every pending save on `pagehide`, and when the page is hidden (on mobile a hidden page can be discarded without `pagehide`). The requests those saves start are sent `keepalive`, so the browser finishes them after the page is gone. This covers the shared debounce (`debouncedSave.ts`) behind all four home areas. For the session-collection stores it also covers `entitySync.ts`: on exit it sends every unsynced row at once instead of one request at a time.

**A reload re-opens the entry you had open.** Each home area (Characters, Foes, Expeditions, Connections) remembers its open entry per device in localStorage (`src/lib/rememberedSelection.ts`). It falls back to the first entry when that one is gone. Without this, a reload landed on whatever sorted first. For characters that's rarely the one you were editing, because the list sorts by `updatedAt` and every save bumps it.

---

## Action Bus Integration

CharactersArea consumes the action bus from `log.svelte.ts`. The Moves dialog (Endure Harm's Apply), LogPanel (a burn's momentum reset) and the tutorials queue actions with `triggerAction()`; log links don't use it any more — they are commands (`#lib/commands/`), which write values themselves (an asset purchase's XP cost is a `/xp-=n` link).

A `$effect` reads `getActionNonce()` and drains queued actions via `drainActions(charId)`. Handles:

- **Resource changes** (`type: 'resource'`): Applies delta to momentum, health, spirit, supply, mana, xp, bonds, or failures with proper clamping (e.g., momentum -6 to maxMomentum, health/spirit/supply 0-5, xp 0-30; `resourceRange()` in `character.ts`).
- **Debility toggles** (`type: 'debility'`): Sets debility flags (wounded, shaken, etc.) to the specified value.
- **Track resets** (`type: 'reset-track'`), **absolute sets** (`type: 'set'`) and **initiative** (`type: 'initiative'`, 0 / 1 / 2).

Actions for the active character apply through the live data (with the floor and debility cascades); actions queued for another character are applied to a snapshot of its data and saved at once.

The bus uses the nonce-queue-drain pattern to ensure mutations happen inside Svelte's reactive context (`$effect`), not from external callbacks.

---

## Icon Imports

The Core tab's tiles (`SheetCore`, and `MomentumTile` for momentum):

| Variable                 | File                                                                | Used for                       |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------ |
| `momentumSvg`            | `#icons/icon-momentum.svg?raw`                                      | Momentum tile (`MomentumTile`) |
| `iconHealth`             | `#icons/icon-health.svg?raw`                                        | Health tile                    |
| `iconSpirit`             | `#icons/icon-spirit.svg?raw`                                        | Spirit tile                    |
| `iconSupply`             | `#icons/icon-supply.svg?raw`                                        | Supply tile                    |
| `iconStar`               | `#icons/star-solid.svg?raw`                                         | Experience tile                |
| `swordSvg` / `shieldSvg` | `#icons/sword-solid.svg?raw` / `#icons/shield-halved-solid.svg?raw` | Initiative toggle              |
| `iconNote`               | `#icons/note-sticky-solid.svg?raw`                                  | Bonds / Failures note buttons  |
