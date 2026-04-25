# Yrt Homebrew Data Extensions

This document describes data format extensions specific to the **Yrt** homebrew setting. These extend the base formats documented in [DATA_FORMAT.md](DATA_FORMAT.md).

---

## Mana Resource

Yrt adds a **mana** resource to characters, representing Conclave spellcraft fuel (mana seeds).

| Resource | Range | Color |
|----------|-------|-------|
| `mana` | 0–10 | amber (`#f59e0b`) |

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

| Field | Type | Description |
|-------|------|-------------|
| `touchedFeatures` | boolean | When `true`, the UI shows the character's Touched feature list alongside this asset |
| `exclusiveGroup` | string | Limits the character to owning one asset of this group at a time. All Touched assets set this to `"touched"`. Attempting to add a second Touched asset shows a user-facing error. |
| `abilityMaxByField` | object | Maps a `customField.id` → option value → maximum enabled abilities. For Touched assets this enforces the level-gated ability rules: Pure = 0, Prime = 1, Second = 2, Third/Feral = 3. When the player lowers their level, excess checked abilities are automatically cleared. |

**Preamble / postamble placement for Touched assets:**
- `preamble` — shown **before** the ability checkboxes (prerequisite or flavour note)
- `postamble` — shown **after** the ability checkboxes (used for the "how many abilities you may use" note, since it belongs logically after the list)

**Level-gated abilities:** The `abilityMaxByField` field enforces the rule that a Pure character may use no abilities, Prime one, Second two, Third or Feral all three. The UI disables unchecked boxes when the character is at their level cap and shows a tooltip explaining why. Lowering the level automatically clears any abilities beyond the new cap.

**Exclusive group:** Only one Touched asset may be active at a time. Adding a second Touched asset while one is already owned shows an error message directing the player to remove the existing one first.

Touched assets follow the same auto-enable convention as Paths (see [DATA_FORMAT.md — Auto-Enabled Abilities](DATA_FORMAT.md#auto-enabled-abilities)): the first ability starts checked on acquisition; others start unchecked.

Touched assets are defined in `data/assets/assets_yrt.json`.

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

| Field | Type | Description |
|-------|------|-------------|
| `description` | string (HTML) | Extended narrative text displayed on the card between `preamble` and the ability checkboxes. Used for Conclave Ritual lore and usage guidance. Supports `<strong>`, `<br>`, and other inline HTML. |
| `cantrips` | array | Pool of available cantrip definitions |
| `cantrips[].key` | string | Unique cantrip identifier (kebab-case) |
| `cantrips[].name` | string | Display name |
| `cantrips[].desc` | string | Short description of the effect |
| `cantripSlots` | array of numbers | Number of cantrip slots unlocked per ability tier (e.g., `[2, 2, 2]` = 2 slots per ability, 6 total when all marked) |

The character selects cantrips from the pool to fill their available slots. Unlocking more abilities opens more slots.

**Preamble / postamble / description placement for Ritual assets:**

The card renders content in this order:
1. `preamble` — prerequisite or flavour text (e.g., "If you are a Conclave ritualist.")
2. `description` — extended narrative / usage guidance (Yrt-specific, HTML supported)
3. Ability checkboxes (3 rows)
4. Cantrip / selectable-list section (if `cantrips` / `cantripSlots` are present)
5. Difficulty Factors collapsible (if `inspectionFactors` is present — Conclave Rituals only)
6. `postamble` — explanatory note that belongs logically after the ability list

Ritual assets follow the same auto-enable convention as Paths: the first ability starts checked on acquisition (see [DATA_FORMAT.md — Auto-Enabled Abilities](DATA_FORMAT.md#auto-enabled-abilities)).

---

## Yrt Oracles

Yrt adds several oracle tables in `data/oracles/`, identified by `"group": "Yrt"`:

| File | Key | Description |
|------|-----|-------------|
| `yrt-touched.json` | `yrtTouched` | Touched class, social rank, and description |
| `touched-count.json` | `touchedCount` | Number of Touched features |
| `touched-features.json` | `touchedFeatures` | Specific Touched feature types |
| `mana-backlash.json` | `manaBacklash` | Consequences of mana overuse or failure |
| `yrt-animal.json` | `yrtAnimal` | Animals native to the Yrt setting |
| `freeport-denizen.json` | `freeportDenizen` | NPCs for Freeport settlements |

### Freeport Denizen (structured values)

The freeport denizen oracle uses structured `value` objects instead of plain strings:

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

| Value Field | Type | Description |
|-------------|------|-------------|
| `type` | string | Denizen occupation or role |
| `notes` | string | Additional details |
| `salary` | string | Cost to hire |
| `count` | string | Dice expression for number present |

---

## Yrt Foes

Yrt-specific foes are defined in `data/foes/foes_yrt.json`, using the same format as base Ironsworn and Delve foes (see [DATA_FORMAT.md — Foes](DATA_FORMAT.md#foes)). Their IDs use the `yrt/` prefix:

```json
{
  "id": "yrt/mana-wraith",
  "name": "Mana Wraith",
  "rank": 3,
  "nature": "Horror",
  ...
}
```

### Escalating Harm (YRT Extension)

Some Yrt foes inflict harm that starts low and worsens the longer the character fails to deal with them, rather than having a fixed harm value determined by rank. This is declared with the `escalates` flag on the foe definition, and tracked per-encounter with `currentHarm`.

#### Foe definition fields

| Field | Type | Description |
|-------|------|-------------|
| `escalates` | boolean | When `true`, the foe's harm is variable. The FoeCard renders a +/− counter instead of a static Harm badge. |
| `escalatingHarm` | object | *(Optional)* Metadata documenting escalation rules for reference. Not read by the app at runtime — the UI derives caps from `effectiveRank`. |
| `escalatingHarm.startHarm` | number | Starting harm value (always `1`). |
| `escalatingHarm.trigger` | string | Narrative trigger key (e.g., `"miss-endure-harm"`). |
| `escalatingHarm.rankCaps` | object | Maps rank number → maximum harm (e.g., `{ "1": 1, "2": 2, "3": 3, "4": 4, "5": 5 }`). |
| `escalatingHarm.removal` | string | Prose description of how to remove the foe and reset escalation. |

```json
{
  "id": "yrt/necrotic-sea-hare",
  "name": "Necrotic Sea Hare",
  "escalates": true,
  "rank": 1,
  "escalatingHarm": {
    "startHarm": 1,
    "trigger": "miss-endure-harm",
    "rankCaps": { "1": 1, "2": 2, "3": 3, "4": 4, "5": 5 },
    "removal": "Sustained heat, concentrated Luminous mana, or saturated salt solution."
  }
}
```

#### Encounter runtime state

| Field | Type | Description |
|-------|------|-------------|
| `currentHarm` | number | Current harm level in ticks. Stored on `FoeEncounter`. Absent = `1`. Persisted with the character via auto-save. |

#### Harm cap by effective rank

The GCB derives the escalation ceiling from the encounter's `effectiveRank` (after quantity adjustment):

| Effective Rank | Cap |
|---|---|
| 1 – Troublesome | 1 |
| 2 – Dangerous | 2 |
| 3 – Formidable | 3 |
| 4 – Extreme | 4 |
| 5 – Epic | 5 |

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

| Field | Type | Description |
|-------|------|-------------|
| `escalatesDefense` | boolean | When `true`, the foe has an escalating defense. The FoeCard renders a +/− counter and shows a `Progress: N ↓` badge when defense > 0. |
| `escalatingDefense` | object | *(Optional)* Metadata documenting defense rules for reference. Not read by the app at runtime — the UI derives caps from `effectiveRank`. |
| `escalatingDefense.startDefense` | number | Starting defense value (always `0`). |
| `escalatingDefense.trigger` | string | Narrative trigger key (e.g., `"miss"`). |
| `escalatingDefense.rankCaps` | object | Maps rank → max defense value (= `progressPerHit − 1`): `{ "1": 11, "2": 7, "3": 3, "4": 1, "5": 0 }`. |
| `escalatingDefense.minimum` | number | Minimum defense value (always `0`). |
| `escalatingDefense.removal` | string | Prose description of what happens when the encounter ends. |

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

| Field | Type | Description |
|-------|------|-------------|
| `currentDefense` | number | Current defense level. Stored on `FoeEncounter`. **Absent = 0** (starts at zero, increases on each miss). Max = `progressPerHit − 1`. Persisted with the character via auto-save. |

#### Defense max by effective rank

Max defense = `progressPerHit − 1`, ensuring ticks per mark never drop below 1.

| Effective Rank | progressPerHit | Max defense |
|---|---|---|
| 1 – Troublesome | 12 | 11 |
| 2 – Dangerous | 8 | 7 |
| 3 – Formidable | 4 | 3 |
| 4 – Extreme | 2 | 1 |
| 5 – Epic | 1 | 0 |

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

Yrt-specific assets are defined in `data/assets/assets_yrt.json`, using the same base format as Ironsworn and Delve assets (see [DATA_FORMAT.md — Assets](DATA_FORMAT.md#assets)). Their IDs typically include a `yrt-` prefix in the name portion:

```json
{
  "id": "combat/yrt-iron-sworn-blade",
  "id": "companion/yrt-crow",
  "id": "path/yrt-oathkeeper"
}
```

The Yrt asset file also includes Touched assets and ritual assets with cantrips (documented above).

---

## Yrt Source Files Summary

| Data Type | File | Contents |
|-----------|------|----------|
| Assets | `data/assets/assets_yrt.json` | Yrt combat talents, companions, paths, rituals, Touched assets, and rarities |
| Foes | `data/foes/foes_yrt.json` | Yrt-specific creatures, horrors, and NPCs |
| Oracles | `data/oracles/yrt-*.json`, `touched-*.json`, `mana-backlash.json`, `freeport-denizen.json` | Setting-specific oracle tables |
