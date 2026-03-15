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
  "abilities": [ ... ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `touchedFeatures` | boolean | When `true`, the UI shows the character's Touched feature list alongside this asset |

**Preamble / postamble placement for Touched assets:**
- `preamble` — shown **before** the ability checkboxes (prerequisite or flavour note)
- `postamble` — shown **after** the ability checkboxes (used for the "how many abilities you may use" note, since it belongs logically after the list)

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
