# Character fields from extensions

**Status: proposed.** Nothing here is built yet. This is the spec the work
will follow; when it lands, this page becomes the feature's documentation.

An extension can add fields to a character: values the character has, shown
on the sheet, rolled at creation, and checked by preconditions. YRT's region
of origin, religion, touched level and touched animal are the first four.

## The problem

YRT gives every character a region of origin, a religion, a touched level
(Pure, Prime, Second, Third or Feral) and, unless they're Pure, an animal
(Bear, Wolf, Cat (domestic), …). None of them is stored as a value:

- New Character writes them into the background as prose
  (`**Region of origin:** Piscis`, `**Religion:** **Puritan**: Holds that…`,
  "Fanir is a **Second with 2** features of a wolf.") and the log.
- Each Touched asset keeps its own copies of the level and animal: a Level
  dropdown (`touchedLevel`), which starts at Prime and has no Pure, and an
  Animal text box (`animalName`).
- The `touched` precondition key is written into `preconditions.ts`, reads
  the asset's dropdown, and treats a character without a Touched asset as
  Pure. No asset uses it.

The Character: Touched oracle (`yrtTouched`) says of Pure: "Cannot use
Touched Assets." The app can't check that: a character who rolled Pure can
add any Touched asset, and the asset makes them Prime.

## YRT's four fields

```jsonc
// extensions/yrt/extension.json
"characterFields": [
  {
    "id": "origin",
    "label": "Region of origin",
    "type": "dropdown",
    "optionsFrom": { "oracle": "yrtRegion" },
    "default": "",
    "creation": "pick",
    "roll": { "oracle": "yrtRegion" }
  },
  {
    "id": "religion",
    "label": "Religion",
    "type": "dropdown",
    "optionsFrom": { "oracle": "yrtReligion", "label": "name" },
    "default": "",
    "roll": {
      "oracle": "yrtReligion",
      "from": "name",
      "column": { "field": "origin", "from": "country" },
      "if": [{ "key": "origin", "min": 0 }]
    }
  },
  {
    "id": "touched",
    "label": "Touched",
    "type": "dropdown",
    "options": [
      { "id": "pure", "label": "Pure" },
      { "id": "prime", "label": "Prime" },
      { "id": "second", "label": "Second" },
      { "id": "third", "label": "Third" },
      { "id": "feral", "label": "Feral" }
    ],
    "default": "pure",
    "roll": { "oracle": "yrtTouched", "from": "className" },
    "tooltip": "From the Character: Touched oracle. A Pure character cannot use a Touched asset."
  },
  {
    "id": "touchedAnimal",
    "label": "Animal",
    "type": "text",
    "default": "",
    "placeholder": "Animal…",
    "roll": { "oracle": "yrtAnimal", "if": [{ "key": "touched", "min": 1 }] },
    "tooltip": "From the Character: Touched Aspect oracle."
  }
]
```

On the sheet that's four rows:

- **Region of origin:** a dropdown of the 25 regions on the Region oracle.
- **Religion:** a dropdown of Puritan, Optime, Wildens and None, or their
  own. Hovering it shows the chosen religion's text from the oracle.
- **Touched:** a dropdown of the five levels.
- **Animal:** one line of text.

Religion is rolled on the column for the origin's country, as now, and only
once an origin is set. The animal is rolled only for Prime or higher.

The religion rows on `yrtReligion` gain a `name` (`"Puritan"`, `"Optime"`,
`"Wildens"`, `"None, or their own"`), since their `value` is the whole
description. The Region rows already have the name as their `value`, and the
Touched rows as their `className`.

## Declaring a field

| Field         | Type   | Required | Description                                                                                                                     |
| ------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | string | yes      | camelCase key, unique across all extensions. Stores the value, and a precondition names the field by it.                        |
| `label`       | string | yes      | Shown on the sheet, in New Character, and in log lines.                                                                         |
| `type`        | string | yes      | `"dropdown"`, or `"text"` for one line of free text.                                                                            |
| `options`     | array  | dropdown | `{ id, label }` in order. A precondition compares positions, so order them from lowest to highest.                              |
| `optionsFrom` | object | dropdown | Instead of `options`: one option per row of an oracle. `oracle`: its key. `label`: the row property to show (default `value`).  |
| `default`     | string | yes      | The value a character has until one is set: an option `id`, `""` for an unset dropdown, or text.                                |
| `placeholder` | string | no       | Hint shown in an empty text box.                                                                                                |
| `creation`    | string | no       | How New Character offers the field: `"roll"` (default), a checkbox in "Randomize the rest"; or `"pick"`, a dropdown with a die. |
| `roll`        | object | no       | Rolls the field in New Character; see below.                                                                                    |
| `tooltip`     | string | no       | Hover hint on the sheet's control.                                                                                              |

`roll` holds:

| Field    | Description                                                                                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oracle` | The oracle to roll.                                                                                                                                                                                                  |
| `from`   | The property to read when the rolled row is an object (default: the row's `value`).                                                                                                                                  |
| `column` | For an oracle rolled on a column (`tableType: "columnSelect"`): `field` names a dropdown field declared above, `from` a property of its chosen option's row. The column is the one whose label equals that property. |
| `if`     | Preconditions, checked first. A field whose `if` fails isn't rolled and keeps its default.                                                                                                                           |

Fields roll in the order they're declared, so a `roll.if` or `roll.column`
can only use a field declared above it.

An `optionsFrom` dropdown takes its options from the oracle as it's served:
each option's id is its label in lower case with every run of other
characters turned into `-` (`Oray Hills` → `oray-hills`, `None, or their own`
→ `none-or-their-own`), in the oracle's row order. Each option keeps its row,
so the sheet can show the row's text and `roll.column` can read the row's
properties. Adding a row to the oracle adds an option.

`npm run gen:manifest` checks each field and fails the build when:

- the `id` isn't camelCase, is declared by two extensions, or matches a
  built-in precondition key (`momentum`, `edge`, `hasFoe`, `vowCount`,
  `wounded`, … all of them, listed in `preconditions.ts`). Asset names, which
  preconditions also accept, can't clash: they're display names and start
  with a capital.
- a dropdown has both `options` and `optionsFrom`, or neither; has fewer than
  two options; repeats an option id; or has a `default` that's neither one of
  them nor `""`.
- an oracle it names (`optionsFrom.oracle`, `roll.oracle`) isn't one the
  extension, or `base`, provides, or a `roll.if` or `roll.column` names a
  field that isn't declared above it.

The manifest copies `characterFields` into the extension's registry entry, so
`/catalogue/extensions` serves it with the rest of the metadata and the web
reads it through `expansionStore`, as it reads `supersedesOracles`.

## Storage

Values live in a new map on the character, `fields`, keyed by field id:

```jsonc
"fields": {
  "origin": "piscis",
  "religion": "puritan",
  "touched": "second",
  "touchedAnimal": "Wolf"
}
```

A dropdown stores the option id; a text field stores the text. A missing key
reads as the field's `default`. The server keeps character data as untyped
JSON, so it needs no change.

`fields` is separate from `globalValues` on purpose. That map holds numeric
counters, and importing a character runs it through `reconcileGlobalValues`,
which drops every id no asset declares and every value that isn't a number.
`"second"` would be dropped there.

Turning an extension off hides its fields and keeps their values; turning it
back on shows them again. Export and import carry `fields` with the rest of
the character. Import keeps values for field ids it doesn't know, since the
extension may be off or missing on that install; the importer's usual
stripping of `__proto__`-style keys still applies. A dropdown value that
matches no option (an oracle row since renamed) shows as its stored id until
the player picks again.

## On the sheet

The Core tab gets a row per field of each enabled extension, below
Initiative and laid out like it: the label, then a `<Select>` for a dropdown
or a one-line text input for text. An unset dropdown shows "—". Each row
carries `data-tour="char-field-<id>"`.

A field's hover hint is its `tooltip`. An `optionsFrom` dropdown adds the
chosen row's `description`, or its `value` when that differs from the label,
as plain text: for Religion, the religion's description.

Changing a field writes a log entry titled `<character> — Touched`, reading
`Touched: Prime → Second`, as editing a stat does. A text field logs when the
box loses focus, not on every keystroke.

## At creation

A `"roll"` field gets a checkbox in New Character's "Randomize the rest",
labelled with the field's `label` and ticked by default. A `"pick"` field
gets a dropdown with a die, as Region of origin has now, carrying
`data-tour="randomize-<id>"` and `data-tour="roll-<id>"` (for Region of
origin, the `randomize-origin` and `roll-origin` the Create a character
tutorial already uses). A checkbox whose `roll.if` depends on a `"pick"`
field is ticked when that field is set and unticked when it's cleared, as
Religion's is now.

On Create, each ticked field whose `roll.if` passes rolls its oracle (on the
column `roll.column` names, if any), takes the value (or its `from`
property), and stores it: a dropdown matches it to an option by id or label,
ignoring case; a text field stores it as it is. A `"pick"` field stores what
was picked. An unticked field, a failed `if`, or a dropdown value that
matches no option leaves the default, and the player can set the field on
the sheet.

The fields join the "New Character — <name>" log entry as lines like the
other randomized details (`Region of origin: Piscis`, `Religion: Puritan`,
`Touched: Second`, `Animal: Wolf`), and they don't go into the background.
The background no longer gets the origin and religion lines or the touched
sentence.

The features are still rolled by YRT's code, because how many depends on the
level: one at Prime, one to three at Second, four to six at Third, and
narrative at Feral. `rollYrtTouchedStructured` in `characterRollups.ts` stops
rolling the level and the animal; it reads `fields.touched`, rolls the
features, and writes them into the background as a list under **Touched
features**, with its own log entry as now.

NPCs keep today's behaviour: their Touched and religion rolls go into their
notes as prose, since NPCs have no fields.

## Preconditions

A precondition key that names a declared dropdown field reads the
character's value as the option's position, counting from 0, or −1 when it's
unset. For the touched level that's Pure 0, Prime 1, Second 2, Third 3,
Feral 4; `{ "key": "origin", "min": 0 }` means "an origin is set". The
failure message uses the option labels: "Requires Touched: Prime or higher",
"Requires Touched: Third or lower", "Requires Touched: Pure". Text fields
can't be used in preconditions, which compare numbers.

The check runs before the asset-name fallback, so a field is never mistaken
for an asset. The hard-coded `touched` branch in `preconditions.ts`, with its
`TOUCHED_LEVEL` and `TOUCHED_LABEL` tables, goes: `touched` becomes YRT's
field, on the same 0–4 scale.

YRT's ten Touched assets each get:

```json
"preconditions": [{ "key": "touched", "min": 1 }]
```

The asset picker then fades them for a Pure character, with the reason on
hover, as it does for any precondition that fails.

## The Touched cards

With the level and the animal on the character, the Touched assets stop
keeping copies:

- The `touchedLevel` and `animalName` custom fields come off all ten.
- `abilityMaxByField` may name a character field. The ten assets switch to
  `{ "touched": { "pure": 0, "prime": 1, "second": 2, "third": 3, "feral": 3 } }`,
  and `AssetCard` looks the key up in the asset's custom fields first, then
  in the character's fields.
- Where the two inputs were, the card shows the character's values as text
  ("Second · Wolf"), so the limit on marked abilities still explains itself.
- The asset chit and the card title use the animal where they used
  `animalName`.

Lowering the level on the sheet below what the character's Touched asset has
marked unmarks the extra abilities, keeping the first ones, as lowering the
card's dropdown does now. The log line says so: `Touched: Second → Prime;
unmarked 1 ability on Touched, Feline`. No XP comes back, as when an ability
is unmarked by hand.

## Existing characters

When a character loads (next to `hydrateCharacterInPlace` in `character.ts`),
each YRT field it doesn't have yet is filled once, from the first of these
it finds:

| Field           | Sources, in order                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `origin`        | The background's `**Region of origin:** <region>` line                                                                                                         |
| `religion`      | The background's `**Religion:** **<name>**` line                                                                                                               |
| `touched`       | The Touched asset's `customValues.touchedLevel`; the old `data.touched`; the background's touched sentence (`**Second with`, `**Pure with no`, `**Feral with`) |
| `touchedAnimal` | The Touched asset's `customValues.animalName`; the old `data.touchedAnimal`; the background's "features of a <animal>"                                         |

Only the wording New Character wrote is read; a background the player has
rewritten is left alone, and the field keeps its default. Nothing is removed
from the background. The asset copies and the old fields are deleted once
read, and `touched` / `touchedAnimal` come off the `CharacterData` type.

## Not covered here

- Number fields. Mana stays a global counter for now.
- Pointing the asset picker at the Touched asset that matches the animal.

## Extension logic still in code

Code that knows about one extension by name, and what each piece would
become. "This work" marks what this spec moves; the rest is listed so later
work can pick it up.

### Character fields (`characterFields`)

| Code                                                                                                                                                                                     | Does                                                   | Becomes                                                                                        | When      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | --------- |
| `characterRollups.ts` `rollYrtTouchedStructured`, `RandomizeBlock.svelte` Touched checkbox, `CharactersArea.svelte` `_commitNewCharacter`, `characterRollupsFormat.ts` `formatTouchedMd` | Rolls the touched level and animal into the background | The `touched` and `touchedAnimal` fields and their `roll`                                      | This work |
| `RandomizeBlock.svelte` region picker (`regionOriginOptions`), `characterRollups.ts` `religionColumnForOrigin`, `randomizationsAsMarkdown`                                               | Region of origin and religion, into the background     | The `origin` (`creation: "pick"`) and `religion` fields; `roll.column`                         | This work |
| `preconditions.ts` `touched` branch, `TOUCHED_LEVEL`, `TOUCHED_LABEL`                                                                                                                    | The `touched` precondition key                         | The generic field branch                                                                       | This work |
| The ten Touched assets' `touchedLevel` / `animalName` custom fields; `types.ts` `touched` / `touchedAnimal`                                                                              | Per-asset and legacy copies of the level and animal    | Read from `fields`; removed                                                                    | This work |
| `tutorials/createCharacter.ts` region step (`isSourceEnabled('yrt')`)                                                                                                                    | Shows the Region of origin step only with YRT on       | Shown when the `randomize-origin` control exists                                               | This work |
| `CharactersArea.svelte` Status tab `isSourceEnabled('delve')`: Failures track, Lessons Learned; `MovesDialog.svelte` `+1 failure` link on a miss                                         | Delve's failures track on the character                | A `track` field type, and a move-outcome hook for the `+1 failure` link                        | Later     |
| `CharactersArea.svelte` `applyResourceChange` `mana` branch; `preconditions.ts` `mana` in the stat map; `MovesDialog.svelte` mana commit                                                 | YRT's mana as a resource with a 0–10 range             | A `counter` field type with a range and colour, which `resource:` links and preconditions read | Later     |

### Other declarations

| Code                                                                                                                                      | Does                                                                       | Becomes                                                                                                                                                            | When  |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| `CommunitiesArea.svelte` `LODESTAR_SETTLEMENT_FIELDS`, `newCommunityRollLodestar`, `lodestarOn` (hides Location and Descriptor)           | Lodestar's six settlement fields, rolled at creation and shown on the card | `settlementFields`, the same shape as `characterFields`; a way to hide the two Core fields                                                                         | Later |
| `VowCard.svelte` `isSourceEnabled('delve')`: Threat and Menace                                                                            | Delve's vow fields                                                         | `vowFields` (Menace needs the `track` type and its log links)                                                                                                      | Later |
| `rules/statArrays.ts` `LODESTAR_ARRAYS`, `availableStatArrays(isSourceEnabled('lodestar'))` in `CharactersArea.svelte`                    | Lodestar's Challenging / Perilous / Grim starting stat arrays              | `statArrays: [{ label, hint, values }]`                                                                                                                            | Later |
| `ExpeditionsArea.svelte` `+ New Site…` (Delve), `+ New Scene…` (Lodestar)                                                                 | Which extension offers which kind of expedition                            | `expeditionKinds: ["site"]`; the site and scene screens stay code                                                                                                  | Later |
| `types.ts` `AssetCategory` (`'Touched'`), `iconRegistry.ts` `CAT_ICON`, `AssetPicker.svelte` and `CharactersArea.svelte` category colours | YRT's Touched asset category, its icon and colour                          | `assetCategories: [{ key, icon, color }]`, as `moveCategories`                                                                                                     | Later |
| `FoesArea.svelte` `foeExtraFlag(def, 'yrt', 'escalates' / 'escalatesDefense')`                                                            | YRT's escalating foes, read under the `yrt` name                           | Read the flags from any extension's foe data                                                                                                                       | Later |
| `characterConcept.ts` `CHARACTER_CONCEPT_KEYS.disposition`                                                                                | Prefers Lodestar's Character Disposition oracle over Delve's               | A Lodestar `supersedesOracles` entry (`charDisposition` → `lodestarCharacterDisposition`) in place of its `suppressesOracles` one, read through `resolveOracleKey` | Later |

### Fallbacks that can go

Every content file now carries `source` (the manifest stamps it), so these
no longer do anything:

- `oracleStore.svelte.ts` `ORACLE_KEY_SOURCE_FALLBACK`, an oracle-key →
  extension table for an API older than source tagging.
- `foeStore.svelte.ts` `foeSource`, which falls back to the id prefix
  (`delve/`, `yrt/`).

### Staying code

Screens built around one extension's rules: Delve's sites, themes, domains
and delve tables; Lodestar's scenes; YRT's Conclave ritual casting in the
Moves dialog (mana commit and inspection factors). Declarations can switch
them on, as `expeditionKinds` would, but the screens themselves stay code.

## The work

- **Manifest:** `scripts/gen-extensions-manifest.mjs` validates and passes
  `characterFields` through; `ExtensionInfo` gains it in `packages/shared`,
  `apps/api/src/routes/catalogue.ts` and the web types.
- **Web:**
  - `expansionStore`: the fields of the enabled extensions, in order, with
    `optionsFrom` options built from the loaded oracles.
  - `preconditions.ts`: the field branch, and the `touched` branch removed.
  - `CharactersArea.svelte`: the Core tab rows, their log entries, the level
    change unmarking abilities, and the creation rolls.
  - `RandomizeBlock.svelte`: a checkbox per `"roll"` field and a dropdown per
    `"pick"` field, replacing the Touched checkbox, the Religion checkbox and
    the region picker.
  - `characterRollups.ts` / `characterRollupsFormat.ts`: the generic field
    roll; YRT's features roll reading `fields.touched` and writing a list;
    the origin, religion and touched prose dropped from the background.
  - `AssetCard.svelte`: `abilityMaxByField` against character fields, the
    level and animal as text, the animal in the title.
  - `character.ts`: the load-time move into `fields`.
  - `tutorials/createCharacter.ts`: the region step keyed on its control.
- **YRT data:** the four fields in `extension.json`; a `name` on each
  `yrtReligion` row; the ten Touched assets lose `touchedLevel` and
  `animalName` and gain the precondition and the new `abilityMaxByField`.
  Assets and oracles change, so `npm run gen:yrt-ref` regenerates the
  reference pages.
- **Tests:**
  - Unit: the precondition branch, the manifest's validation, `optionsFrom`
    ids, the field rolls (Pure skips the animal; religion uses the origin's
    column, and isn't rolled without an origin), the move into `fields`.
  - E2E: a Pure character sees the Touched assets faded; setting Prime lets
    them add one; lowering the level unmarks an ability; New Character fills
    all four fields and leaves them out of the background.
  - `tutorials.spec.ts`, since the Create a character tutorial walks through
    Region of origin and "Randomize the rest".
- **Docs:** `extensions.md` (the new `extension.json` key, and its stale
  table of current extensions), `data-schema.md` (character fields as
  precondition keys; the Touched row), the YRT README (Touched assets,
  religion), `character-sheet.md` (the Core tab rows).
