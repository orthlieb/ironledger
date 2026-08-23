# Yrt Homebrew Data Extensions

This document describes data format extensions specific to the **Yrt** homebrew setting. These extend the base formats documented in [data-schema.md](../../docs/data-schema.md).

---

## Mana Resource

Yrt adds a **mana** resource to characters, representing Conclave spellcraft fuel (mana seeds).

| Resource | Range | Color             |
| -------- | ----- | ----------------- |
| `mana`   | 0–10  | amber (`#f59e0b`) |

Mana is a valid `data-resource` value in resource links:

```html
<a class="resource-link" data-resource="mana" data-value="-1">−1 mana</a>
```

It is defined alongside standard resources in `STAT_RANGES` and `STAT_LINK_COLORS` in `07-moves.js`.

---

## Touched Assets

The Touched are characters physically altered by manite exposure. Touched assets use the `"Touched"` category and include a boolean flag for UI grouping:

```json
{
  "id": "path/yrt-touched-feline",
  "name": "Touched, Feline",
  "category": "Touched",
  "summary": "One-line summary shown in the picker tile.",
  "postamble": "Your touched value determines how many abilities you may use: Pure — none; Prime — 1; ...",
  "touchedFeatures": true,
  "exclusiveGroup": "touched",
  "abilityMaxByField": { "touchedLevel": { "pure": 0, "prime": 1, "second": 2, "third": 3, "feral": 3 } },
  "abilities": [ ... ]
}
```

| Field               | Type    | Description                                                                                                                                                                                                                                                                   |
| ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `touchedFeatures`   | boolean | When `true`, the UI shows the character's Touched feature list alongside this asset                                                                                                                                                                                           |
| `exclusiveGroup`    | string  | Limits the character to owning one asset of this group at a time. All Touched assets set this to `"touched"`. Attempting to add a second Touched asset shows a user-facing error.                                                                                             |
| `abilityMaxByField` | object  | Maps a `customField.id` → option value → maximum enabled abilities. For Touched assets this enforces the level-gated ability rules: Pure = 0, Prime = 1, Second = 2, Third/Feral = 3. When the player lowers their level, excess checked abilities are automatically cleared. |

**Preamble / postamble placement for Touched assets:**

- `preamble` — shown **before** the ability checkboxes (prerequisite or flavour note)
- `postamble` — shown **after** the ability checkboxes (used for the "how many abilities you may use" note, since it belongs logically after the list)

**Level-gated abilities:** The `abilityMaxByField` field enforces the rule that a Pure character may use no abilities, Prime one, Second two, Third or Feral all three. The UI disables unchecked boxes when the character is at their level cap and shows a tooltip explaining why. Lowering the level automatically clears any abilities beyond the new cap.

**Exclusive group:** Only one Touched asset may be active at a time. Adding a second Touched asset while one is already owned shows an error message directing the player to remove the existing one first.

Touched assets follow the same auto-enable convention as Paths (see [data-schema.md — Auto-Enabled Abilities](../../docs/data-schema.md#auto-enabled-abilities)): the first ability starts checked on acquisition; others start unchecked.

Touched assets are defined in `assets/assets.json`.

---

## Ritual Assets with Cantrips

Some Yrt ritual assets include a cantrip system — minor magical effects that don't require a move roll. Cantrips are unlocked as abilities are marked.

```json
{
  "id": "ritual/yrt-hedge-magic",
  "name": "Hedge Magic",
  "category": "Ritual",
  "description": "Optional narrative text shown on the asset card between preamble and the ability list.",
  "cantrips": [
    { "key": "tidy-clean",    "name": "Tidy/Clean",    "desc": "clean or create a minor mess on a surface" },
    { "key": "mark-unmark",   "name": "Mark/Unmark",   "desc": "place or remove a small symbol or mark" },
    { "key": "mute-amplify",  "name": "Mute/Amplify",  "desc": "mute or amplify a small sound" },
    { "key": "freshen-spoil", "name": "Freshen/Spoil", "desc": "freshen or spoil a small quantity of food/drink" },
    { "key": "warm-chill",    "name": "Warm/Chill",    "desc": "warm or cool a small object or liquid" }
  ],
  "cantripSlots": [2, 2, 2],
  "abilities": [ ... ]
}
```

| Field             | Type             | Description                                                                                                                                                                                        |
| ----------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `description`     | string (HTML)    | Extended narrative text displayed on the card between `preamble` and the ability checkboxes. Used for Conclave Ritual lore and usage guidance. Supports `<strong>`, `<br>`, and other inline HTML. |
| `cantrips`        | array            | Pool of available cantrip definitions                                                                                                                                                              |
| `cantrips[].key`  | string           | Unique cantrip identifier (kebab-case)                                                                                                                                                             |
| `cantrips[].name` | string           | Display name                                                                                                                                                                                       |
| `cantrips[].desc` | string           | Short description of the effect                                                                                                                                                                    |
| `cantripSlots`    | array of numbers | Number of cantrip slots unlocked per ability tier (e.g., `[2, 2, 2]` = 2 slots per ability, 6 total when all marked)                                                                               |

The character selects cantrips from the pool to fill their available slots. Unlocking more abilities opens more slots.

**Preamble / postamble / description placement for Ritual assets:**

The card renders content in this order:

1. `preamble` — prerequisite or flavour text (e.g., "If you are a Conclave ritualist.")
2. `description` — extended narrative / usage guidance (Yrt-specific, HTML supported)
3. Ability checkboxes (3 rows)
4. Cantrip / selectable-list section (if `cantrips` / `cantripSlots` are present)
5. Difficulty Factors collapsible (if `inspectionFactors` is present — Conclave Rituals only)
6. `postamble` — explanatory note that belongs logically after the ability list

Ritual assets follow the same auto-enable convention as Paths: the first ability starts checked on acquisition (see [data-schema.md — Auto-Enabled Abilities](../../docs/data-schema.md#auto-enabled-abilities)).

---

## Yrt Oracles

Yrt adds twelve oracle tables in `oracles/`, each tagged `"source": "yrt"` and
grouped in the Ask dialog by `category`. Rows are `topRange` + `value` unless
noted.

### Settlement & location

| Oracle                           | Key                        | Category   | Description                                                                                                                                                                                                                                |
| -------------------------------- | -------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Location: Region                 | `yrtRegion`                | Location   | The 22 Yrt-world regions, ordered by land type and frequency-weighted (settled lands roll most often, remote least). Each row carries a `type` (Settled / Boundary / Remote) shown as its own column. **Replaces the base Region oracle.** |
| Settlement: Type                 | `yrtSettlementType`        | Settlement | Scale and purpose (Stead → Hold), rolled against the settlement's land tier (a `columnSelect` table). The preamble maps Yrt regions to Settled / Boundary / Remote lands. **Replaces the Lodestar Settlement: Type oracle.**               |
| Location: Settlement Landmark    | `yrtCityTownLocation`      | Location   | A point-of-interest inside a settlement, town, or city (75 entries).                                                                                                                                                                       |
| Location: Settlement Waypoint    | `yrtSettlementWaypoint`    | Location   | A location, discovery, or event when you _Undertake a Journey_ through a settlement.                                                                                                                                                       |
| Location: Settlement Peril       | `yrtSettlementPeril`       | Location   | A perilous event or complication on a settlement journey (a miss).                                                                                                                                                                         |
| Location: Settlement Opportunity | `yrtSettlementOpportunity` | Location   | An unexpected, beneficial event on a settlement journey (a strong hit with a match).                                                                                                                                                       |

### Character & setting

| Oracle                         | Key               | Category  | Description                                                                                           |
| ------------------------------ | ----------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| Character: Touched             | `yrtTouched`      | Character | A Touched character — social class, animal aspect, and features.                                      |
| Character: Touched Features    | `touchedFeatures` | Character | A specific supernatural feature for a Touched character.                                              |
| Character: Freeport Occupation | `freeportDenizen` | Character | A random occupation for an NPC in Freeport or another large town/city (structured value — see below). |
| Character: Touched Aspect      | `yrtAnimal`       | Character | The Touched animal-type aspect of a character.                                                        |
| Magic: Mana Backlash           | `manaBacklash`    | Move      | A mana-specific backlash cost when magic goes wrong.                                                  |

> **Supersession.** When YRT is enabled it hides the base `region` and the
> Lodestar `storyRegion` / `settlementType` / `settlementCondition` oracles and
> stands in with the YRT versions (including `yrtStoryRegion`), via
> `suppressesOracles` in `extension.json` (see
> [docs/extensions.md — Oracle supersession](../../docs/extensions.md)).

### Freeport Occupation (structured values)

The Freeport Occupation oracle uses structured `value` objects instead of plain strings:

```json
{
  "key": "freeportDenizen",
  "data": [
    {
      "topRange": 5,
      "value": {
        "type": "Merchant",
        "notes": "Sells common goods and supplies",
        "salary": "2 supply/season",
        "count": "1d6"
      }
    }
  ]
}
```

| Value Field | Type   | Description                        |
| ----------- | ------ | ---------------------------------- |
| `type`      | string | Denizen occupation or role         |
| `notes`     | string | Additional details                 |
| `salary`    | string | Cost to hire                       |
| `count`     | string | Dice expression for number present |

---

## Yrt Moves

Yrt adds two moves in `moves/`, tagged `"category": "Yrt"`:

| Move                 | Trigger                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Cast Conclave Ritual | When you attempt to cast a Conclave ritual — examine it to sum its difficulty factors, then roll. |
| Craft an Item        | When you use your skill to craft an item, drawing on your training.                               |

_Cast Conclave Ritual_ pairs with the Conclave-ritual assets' Difficulty Factors
(`inspectionFactors`) and the **Mana Backlash** oracle on a miss.

---

## Yrt Foes

> **`foes/foes.json` is GENERATED — do not hand-edit it.** The canonical source
> for the bestiary is the private **yrt-vault** (`yrt-vault/Game/foes/*.md`), one
> Markdown file per foe. Edit foes there in Obsidian, then run `npm run gen:yrt-json`
> to regenerate `foes.json` (sorted by id), and commit the result. The mapping is
> defined in `scripts/yrt-md.mjs` and proven lossless by
> `apps/api/tests/unit/yrtMdRoundTrip.test.ts`. `npm run gen:yrt-json:check` fails
> if `foes.json` has drifted from the vault. This generation is a **local** step
> (CI has no access to the private vault); `foes.json` is validated in CI by the
> app schema and tests as usual. To bootstrap the vault from scratch:
> `node scripts/migrate-yrt-to-md.mjs`. Moves, assets, and oracles remain
> hand-authored JSON in this repo — only foes are vault-canonical.

Yrt-specific foes are defined in `foes/foes.json`, using the same format as base Ironsworn and Delve foes (see [data-schema.md — Foes](../../docs/data-schema.md#foes)). Their IDs use the `yrt/` prefix:

```json
{
  "id": "yrt/mana-wraith",
  "name": "Mana Wraith",
  "rank": 3,
  "nature": "Horror",
  ...
}
```

### Foe overrides

`foes/overrides.json` re-contextualizes base and Delve foes for the Yrt setting without duplicating them. Each entry keys a base foe id and either adds an `addendum` (a Yrt-specific lore note shown on the foe card) or sets `present: false` to hide the foe. 58 base and Delve foes carry Yrt overrides. Mirrors the foe-override format in [data-schema.md](../../docs/data-schema.md#foe-overrides).

### Escalating Harm (YRT Extension)

Some Yrt foes inflict harm that starts low and worsens the longer the character fails to deal with them, rather than having a fixed harm value determined by rank. This is declared with the `escalates` flag on the foe definition, and tracked per-encounter with `currentHarm`.

#### Foe definition fields

| Field                      | Type    | Description                                                                                                                                  |
| -------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `escalates`                | boolean | When `true`, the foe's harm is variable. The FoeCard renders a +/− counter instead of a static Harm badge.                                   |
| `escalatingHarm`           | object  | _(Optional)_ Metadata documenting escalation rules for reference. Not read by the app at runtime — the UI derives caps from `effectiveRank`. |
| `escalatingHarm.startHarm` | number  | Starting harm value (always `1`).                                                                                                            |
| `escalatingHarm.trigger`   | string  | Narrative trigger key (e.g., `"miss-endure-harm"`).                                                                                          |
| `escalatingHarm.rankCaps`  | object  | Maps rank number → maximum harm (e.g., `{ "1": 2, "2": 3, "3": 4, "4": 5, "5": 5 }`).                                                        |
| `escalatingHarm.removal`   | string  | Prose description of how to remove the foe and reset escalation.                                                                             |

```json
{
  "id": "yrt/necrotic-sea-hare",
  "name": "Necrotic Sea Hare",
  "escalates": true,
  "rank": 1,
  "escalatingHarm": {
    "startHarm": 1,
    "trigger": "miss-endure-harm",
    "rankCaps": { "1": 2, "2": 3, "3": 4, "4": 5, "5": 5 },
    "removal": "Sustained heat, concentrated Luminous mana, or saturated salt solution."
  }
}
```

#### Encounter runtime state

| Field         | Type   | Description                                                                                                      |
| ------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `currentHarm` | number | Current harm level in ticks. Stored on `FoeEncounter`. Absent = `1`. Persisted with the character via auto-save. |

#### Harm cap by effective rank

The GCB derives the escalation ceiling from the encounter's `effectiveRank` (after quantity adjustment):

| Effective Rank  | Cap |
| --------------- | --- |
| 1 – Troublesome | 2   |
| 2 – Dangerous   | 3   |
| 3 – Formidable  | 4   |
| 4 – Extreme     | 5   |
| 5 – Epic        | 5   |

#### Game mechanic

- Harm starts at **1** regardless of rank.
- On a **Miss** where the fiction calls for **Endure Harm**, the GM increases `currentHarm` by 1 using the + button (up to the rank cap).
- On a **Strong Hit when Enduring Harm**, the player may narrate shaking the foe loose — the GM decreases `currentHarm` by 1 using the − button.
- The counter resets to 1 only when the foe is fully removed **and** the contact site treated. Killing the creature while attached does not reset — use the − button to reflect partial treatment.
- The Harm badge in the pills row shows the current value (`Harm: N ↑`) in italic red while escalation is active, distinguishing it from the static harm badge on non-escalating foes.

---

### Escalating Defense (YRT Extension)

Some Yrt foes carry a Gray-mana defense that builds up on each miss, making progress progressively harder to mark. The defense starts at 0 and increases by 1 on each Miss. This is declared with `escalatesDefense` on the foe definition and tracked per-encounter with `currentDefense`.

#### Foe definition fields

| Field                            | Type    | Description                                                                                                                               |
| -------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `escalatesDefense`               | boolean | When `true`, the foe has an escalating defense. The FoeCard renders a +/− counter and shows a `Progress: N ↓` badge when defense > 0.     |
| `escalatingDefense`              | object  | _(Optional)_ Metadata documenting defense rules for reference. Not read by the app at runtime — the UI derives caps from `effectiveRank`. |
| `escalatingDefense.startDefense` | number  | Starting defense value (always `0`).                                                                                                      |
| `escalatingDefense.trigger`      | string  | Narrative trigger key (e.g., `"miss"`).                                                                                                   |
| `escalatingDefense.rankCaps`     | object  | Maps rank → max defense value (= `progressPerHit − 1`): `{ "1": 11, "2": 7, "3": 3, "4": 1, "5": 0 }`.                                    |
| `escalatingDefense.minimum`      | number  | Minimum defense value (always `0`).                                                                                                       |
| `escalatingDefense.removal`      | string  | Prose description of what happens when the encounter ends.                                                                                |

```json
{
  "id": "yrt/blighted-guilder",
  "name": "Blighted Guilder",
  "escalatesDefense": true,
  "escalatingDefense": {
    "startDefense": 0,
    "trigger": "miss",
    "rankCaps": { "1": 11, "2": 7, "3": 3, "4": 1, "5": 0 },
    "minimum": 0,
    "removal": "When the encounter ends or the foe is defeated, the tracery disperses and defense resets to 0."
  }
}
```

#### Encounter runtime state

| Field            | Type   | Description                                                                                                                                                                       |
| ---------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `currentDefense` | number | Current defense level. Stored on `FoeEncounter`. **Absent = 0** (starts at zero, increases on each miss). Max = `progressPerHit − 1`. Persisted with the character via auto-save. |

#### Defense max by effective rank

Max defense = `progressPerHit − 1`, ensuring ticks per mark never drop below 1.

| Effective Rank  | progressPerHit | Max defense |
| --------------- | -------------- | ----------- |
| 1 – Troublesome | 12             | 11          |
| 2 – Dangerous   | 8              | 7           |
| 3 – Formidable  | 4              | 3           |
| 4 – Extreme     | 2              | 1           |
| 5 – Epic        | 1              | 0           |

#### Game mechanic

- Defense starts at **0** (no armor).
- On a **Miss**, press **+** to increase `currentDefense` by 1 (armor consolidates).
- To recover, press **−** to decrease `currentDefense` by 1 (minimum 0).
- Ticks per **Mark Progress** = `progressPerHit − currentDefense` (minimum 1). As defense grows, each progress mark puts in fewer ticks.
- The pill row shows `Progress: N ↓` in italic blue when `currentDefense > 0`, where N is the current ticks-per-mark value.
- Defense resets to 0 when the foe is defeated or the encounter ends.

---

## Rarity Display Convention

All rarity names are displayed with the `RARITY:` prefix in the Iron Ledger UI — both on the asset card's rarity checkbox label and in session log entries. This applies to Ironsworn, Delve, and Yrt rarities alike.

Examples in the log:

- `Rarity acquired: **RARITY: Hawk's Eye Bow** for **Archer** −3 experience`
- `Rarity removed: **RARITY: Hawk's Eye Bow** from **Archer**`

This prefix is added by the UI (`AssetCard.svelte`) and does **not** appear in the source JSON `name` field.

---

## Yrt Assets

Yrt-specific assets live in `assets/assets.json`, using the same base format as Ironsworn and Delve assets (see [data-schema.md — Assets](../../docs/data-schema.md#assets)). The current set (12 assets + 1 rarity):

| Asset                 | Category | Summary                                                                    |
| --------------------- | -------- | -------------------------------------------------------------------------- |
| Touched, Salamandrine | Touched  | Wounds that knit closed, skin that breathes underwater, a slow metabolism. |
| Touched, Feline       | Touched  | Night-hunter senses, impossible leaps, predator stealth.                   |
| Touched, Porcine      | Touched  | An unerring nose for hidden threats, iron constitution, danger instinct.   |
| Touched, Bovine       | Touched  | An unstoppable charge, an unbreakable will, a voice that bends a room.     |
| Touched, Ursine       | Touched  | A looming presence, crushing strength, a body that shrugs off blows.       |
| Touched, Hircine      | Touched  | Surefooted on lethal heights; a gut that shrugs off poison and rot.        |
| Cantrip               | Ritual   | Minor magical tricks — clean, light, warm, lock, and more.                 |
| Arcane Inspection     | Ritual   | Sense and interpret mana in a person, object, or area.                     |
| Illusion              | Ritual   | Visual, auditory, and physical illusions to deceive.                       |
| Compulsion            | Ritual   | Influence thoughts, emotions, and perceptions in a target's mind.          |
| Bittercraft           | Path     | Detect poisons; brew contact/ingestion toxins from plant extracts.         |
| Quillwise             | Path     | Forge documents — mimic handwriting, replicate seals, detect fakes.        |

The **Touched** assets (level-gated abilities, exclusive group) and the ritual assets with **cantrips** are documented above. Rarity: **Nemezo** (for the Ironsworn `combat/cutthroat` asset).

---

## Yrt Source Files Summary

| Data Type     | File                  | Contents                                                                 |
| ------------- | --------------------- | ------------------------------------------------------------------------ |
| Assets        | `assets/assets.json`  | 6 Touched assets, 4 ritual assets (with cantrips), 2 paths, 1 rarity     |
| Moves         | `moves/*.json`        | Cast Conclave Ritual, Craft an Item                                      |
| Oracles       | `oracles/*.json`      | 12 setting-specific oracle tables (settlement, region, Touched, mana, …) |
| Foes          | `foes/foes.json`      | 24 Yrt-specific creatures, horrors, constructs, and NPCs                 |
| Foe overrides | `foes/overrides.json` | Yrt addenda / hidden flags for 58 base & Delve foes                      |

## Generated reference

`extensions/yrt/reference/` holds a human-readable Markdown view of the YRT
content — **bestiary.md, moves.md, assets.md, oracles.md** — generated from the
JSON in this folder by `scripts/gen-yrt-reference.mjs`. It's the always-in-sync
source for the worldbuilding wiki/garden; do **not** hand-edit it.

```bash
npm run gen:yrt-ref         # regenerate after changing any YRT JSON
npm run gen:yrt-ref:check    # CI drift gate (fails if stale)
```

Foe editorial extras (`extras.yrt.natureNote` / `rework` / `caption`) live in
`foes.json` and flow into the bestiary. App-internal DSL links (`move:` /
`oracle:` / …) are rendered as plain labels in the reference.
