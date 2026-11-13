# Character fields from extensions

An extension, the core rules included, can add fields to a character: values
the character has, shown on the sheet, rolled at creation, and checked by
preconditions. The core rules add a region of origin; YRT adds a religion, a
touched level and a touched animal.

## Why

Before this, YRT gave every character a region of origin, a religion, a
touched level (Pure, Prime, Second, Third or Feral) and, unless they're Pure,
an animal (Bear, Wolf, Cat (domestic), …), and none of them was stored as a
value:

- New Character wrote them into the background as prose
  (`**Region of origin:** Piscis`, `**Religion:** **Puritan**: Holds that…`,
  "Fanir is a **Second with 2** features of a wolf.") and the log.
- Each Touched asset kept its own copies of the level and animal: a Level
  dropdown (`touchedLevel`), which started at Prime and had no Pure, and an
  Animal text box (`animalName`).
- The `touched` precondition key was written into `preconditions.ts` and
  read the asset's dropdown. No asset used it.

The Character: Touched oracle (`yrtTouched`) says of Pure: "Cannot use
Touched Assets." The app couldn't check that: a character who rolled Pure
could add any Touched asset, and the asset made them Prime.

## The fields today

Region of origin belongs to the core rules, so every game has it:

```jsonc
// extensions/base/extension.json
"characterFieldsHeading": false,
"characterFields": [
  {
    "id": "origin",
    "label": "Region of origin",
    "type": "dropdown",
    "optionsFrom": { "oracle": "region" },
    "default": "",
    "roll": { "oracle": "region" },
    "tooltip": "Where your character was born, from the Location: Region oracle."
  }
]
```

Without YRT its options and its d6 are the Ironlands, from the core Region
oracle: Barrier Islands, Ragged Coast, The Hinterlands and so on. YRT already
supersedes that oracle (`"supersedesOracles": { "region": "yrtRegion" }`),
and a field's options and rolls both go through supersession, so with YRT on
the same field lists and rolls YRT's 25 regions. Turning YRT on or off
changes the list; a character whose stored region isn't in it shows the
stored id until a region is picked again.

YRT adds three more:

```jsonc
// extensions/yrt/extension.json
"characterFields": [
  {
    "id": "religion",
    "label": "Religion",
    "type": "dropdown",
    "optionsFrom": { "oracle": "yrtReligion", "label": "name" },
    "default": "",
    "roll": {
      "oracle": "yrtReligion",
      "from": "name",
      "column": { "field": "origin", "from": "country" }
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
    "if": [{ "key": "touched", "min": 1 }],
    "roll": { "oracle": "yrtAnimal" },
    "tooltip": "From the Character: Touched Aspect oracle."
  }
]
```

On the sheet, at the bottom of the Core tab, that's Region of origin with no
heading, then a YRT heading over:

- **Religion:** a dropdown of Puritan, Optime, Wildens and None, or their
  own. Hovering it shows the chosen religion's text from the oracle.
- **Touched:** a dropdown of the five levels.
- **Animal:** one line of text, hidden while Touched is Pure.

New Character shows the same fields, each with a d6. Religion is rolled on
the column for the origin's country (a property of YRT's region rows), so
its d6 waits for an origin. Religion depends on a core field, which is
allowed: the core rules can't be turned off.

The religion rows on `yrtReligion` gain a `name` (`"Puritan"`, `"Optime"`,
`"Wildens"`, `"None, or their own"`), since their `value` is the whole
description. The region rows already have the name as their `value`, and the
Touched rows as their `className`.

## Declaring a field

| Field         | Type   | Required        | Description                                                                                                                                                                        |
| ------------- | ------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | string | yes             | camelCase key, unique across all extensions. Stores the value, and a precondition names the field by it.                                                                           |
| `label`       | string | yes             | Shown on the sheet, in New Character, and in log lines.                                                                                                                            |
| `type`        | string | yes             | `"dropdown"`, `"radio"` (the same kind of choice, shown as a row of buttons), or `"text"` for one line of free text.                                                               |
| `options`     | array  | dropdown, radio | `{ id, label }` in order. A precondition compares positions, so order them from lowest to highest.                                                                                 |
| `optionsFrom` | object | dropdown, radio | Instead of `options`: one option per row of an oracle. `oracle`: its key. `label`: the row property to show (default `value`).                                                     |
| `default`     | string | yes             | The value of a character made before the field existed, or with the extension off: an option `id`, `""` for no choice, or text. New Character starts every field empty.            |
| `placeholder` | string | no              | Hint shown in an empty text box.                                                                                                                                                   |
| `if`          | array  | no              | Preconditions on fields declared above it in the same extension, or in the core rules. While they fail, the field is hidden, in New Character and on the sheet; its value is kept. |
| `roll`        | object | no              | The oracle New Character rolls for the field; see below.                                                                                                                           |
| `tooltip`     | string | no              | Hover hint on the sheet's control.                                                                                                                                                 |

`roll` holds:

| Field    | Description                                                                                                                                                                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oracle` | The oracle's key (`yrtAnimal`), not its title, which can change. Rolls go through `resolveOracleKey`, so an extension that supersedes the oracle supplies the roll, as it does everywhere else.                                                                             |
| `from`   | The property to read when the rolled row is an object (default: the row's `value`).                                                                                                                                                                                         |
| `column` | For an oracle rolled on a column (`tableType: "columnSelect"`): `field` names a dropdown or radio field declared above it in the same extension or in the core rules, `from` a property of its chosen option's row. The column is the one whose label equals that property. |

Fields are rolled in the order they're declared, so a field's `if` or
`roll.column` can only use a field declared above it in the same extension,
or a core field: another extension may be turned off, the core rules can't.

A radio is a dropdown drawn as a row of buttons (`SegmentedRadio`, as
Initiative uses), which suits a few short options; a long list suits a
dropdown. Everything below said of dropdowns holds for radios: they store an
option id, a precondition reads the option's position, and a rolled value
matches an option the same way.

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
- a dropdown or radio has both `options` and `optionsFrom`, or neither; has fewer than
  two options; repeats an option id; or has a `default` that's neither one of
  them nor `""`.
- an oracle it names (`optionsFrom.oracle`, `roll.oracle`) isn't one the
  extension, or `base`, provides, or an `if` or `roll.column` names a field
  that isn't declared above it in the same extension or in the core rules.

The manifest copies `characterFields` into the extension's registry entry, so
`/catalogue/extensions` serves it with the rest of the metadata and the web
reads it through `expansionStore`, as it reads `supersedesOracles`.

## Order

Fields are sorted by their extension's `order` in `extension.json`
(Ironsworn 0, Delve 10, Lodestar 20, YRT 30), then in the order that
extension declares them. The sheet shows them in that order, and New
Character offers and rolls them in it. There's no per-field order number:
extensions don't know about each other, and a shared number would let one
extension's field land between two of another's.

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

A dropdown or radio stores the option id; a text field stores the text. A missing key
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

The fields of the enabled extensions close the Core tab, below Vitals, so
the stats and vitals stay at the top however many there are. Each field is a
label and its control: a `<Select>` for a dropdown, a `SegmentedRadio` for a
radio, a one-line text input for text. They sit two to a row on a wide
screen and one to a row on a phone. An unset dropdown shows "—"; an unset
radio has no button pressed. A field whose `if` fails is hidden, and keeps
its value: Animal disappears for a Pure character and comes back, with the
animal it had, if they're raised to Prime. Each field carries
`data-tour="char-field-<id>"`.

An extension's fields sit under a small heading, set by
`characterFieldsHeading` in its `extension.json`:

- left out: the extension's `name`, the label on its Settings toggle
  ("YRT");
- text: that text instead, for a name that reads well on a toggle but not as
  a heading;
- `false`: no heading. Delve and Lodestar set it, so when they add fields
  (Delve's Failures track, in the catalogue below, would be one), those
  fields carry no heading.

`npm run gen:manifest` fails on any other value, such as an empty string.

A field's hover hint is its `tooltip`. An `optionsFrom` dropdown or radio
adds the chosen row's `description`, or its `value` when that differs from the label,
as plain text: for Religion, the religion's description.

Changing a field writes a log entry titled `<character> — Touched`, reading
`Touched: Prime → Second`, as editing a stat does. A text field logs when the
box loses focus, not on every keystroke.

## At creation

New Character shows every field of the enabled extensions, in the same order
and under the same headings as the sheet, below the stats. Each shows its
control, with a d6 beside it when it has a `roll`; the die rolls the oracle
(on the column `roll.column` names, if any) and fills the control, and the
player can roll again or pick by hand. The die's hover hint names the
oracle by its title ("Roll on Character: Touched Aspect"). A field's controls carry
`data-tour="randomize-<id>"` and its die `data-tour="roll-<id>"`, so Region
of origin keeps the `randomize-origin` and `roll-origin` the Create a
character tutorial already uses.

Every field starts empty, so the die is the obvious thing to press, and
Touched doesn't show a preselected "Pure" for the player to skip past. A
field hides while its `if` fails: Animal appears once Touched is Prime or
higher, and hides again if it goes back to Pure. A die whose `roll.column`
field is still empty waits, with a hover hint naming it ("Pick a Region of
origin first").

On Create, each visible field still empty is rolled, in order, so a player in
a hurry can press Create at once, as with the name. Origin is rolled before
Religion needs its column, and Touched before Animal's `if` is checked. A
rolled value is stored as it comes for a text field; a dropdown or radio
matches it to an option by id or label, ignoring case. A field with no
`roll` left empty keeps its default, as does a dropdown value that matches
no option, and the player sets it on the sheet.

The fields join the "New Character — <name>" log entry as lines like the
randomized details (`Region of origin: Piscis`, `Religion: Puritan`,
`Touched: Second`, `Animal: Wolf`), and they don't go into the background.
The background no longer gets the origin and religion lines or the touched
sentence.

The features are still rolled by YRT's code, because how many depends on the
level: one at Prime, one to three at Second, four to six at Third, and
narrative at Feral. `rollYrtTouchedStructured` in `characterRollups.ts` stops
rolling the level and the animal; it reads `fields.touched`, rolls the
features, and writes them into the background as a list under **Touched
features**, with its own log entry as now. That stays a checkbox in
"Randomize the rest", which keeps the prose details (First Look, Activity,
and so on) and loses its Touched and Religion boxes.

NPCs keep today's behaviour: their Touched and religion rolls go into their
notes as prose, since NPCs have no fields.

## Preconditions

A precondition key that names a declared dropdown or radio field reads the
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
- The asset lists the fields it shows in `characterFields`
  (`["touched", "touchedAnimal"]`), and its chit on the sheet is named for
  the animal, as it was for `animalName`.

Lowering the level on the sheet below what the character's Touched asset has
marked unmarks the extra abilities, keeping the first ones, as lowering the
card's dropdown used to. The log line says so: `Touched: Second → Prime;
unmarked 1 ability on Touched, Feline`. No XP comes back, as when an ability
is unmarked by hand.

Setting the level to Pure keeps the Touched asset, with every ability
unmarked (its limit at Pure is 0). The asset's requirement no longer holds,
so the sheet shows it faded with the reason on hover, and its card says it
can't be used; Delete still works. That's general: any owned asset whose
`preconditions` fail is shown the same way.

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
become. "This work" marks what moved with character fields; the rest is listed so later
work can pick it up.

### Character fields (`characterFields`)

| Code                                                                                                                                                                                     | Does                                                   | Becomes                                                                                        | When      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | --------- |
| `characterRollups.ts` `rollYrtTouchedStructured`, `RandomizeBlock.svelte` Touched checkbox, `CharactersArea.svelte` `_commitNewCharacter`, `characterRollupsFormat.ts` `formatTouchedMd` | Rolls the touched level and animal into the background | The `touched` and `touchedAnimal` fields and their `roll`                                      | This work |
| `RandomizeBlock.svelte` region picker (`regionOriginOptions`), `characterRollups.ts` `religionColumnForOrigin`, `randomizationsAsMarkdown`                                               | Region of origin and religion, into the background     | The `origin` and `religion` fields; `roll.column`                                              | This work |
| `preconditions.ts` `touched` branch, `TOUCHED_LEVEL`, `TOUCHED_LABEL`                                                                                                                    | The `touched` precondition key                         | The generic field branch                                                                       | This work |
| The ten Touched assets' `touchedLevel` / `animalName` custom fields; `types.ts` `touched` / `touchedAnimal`                                                                              | Per-asset and legacy copies of the level and animal    | Read from `fields`; removed                                                                    | This work |
| `tutorials/createCharacter.ts` region step (`isSourceEnabled('yrt')`)                                                                                                                    | Shows the Region of origin step only with YRT on       | A "Roll their details" step, shown when an enabled extension declares fields                   | This work |
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

## Where it lives

- **Manifest:** `scripts/gen-extensions-manifest.mjs` validates and passes
  `characterFields` and `characterFieldsHeading` through; `ExtensionInfo`
  gains both in `packages/shared`, `apps/api/src/routes/catalogue.ts` and the
  web types. Delve's and Lodestar's `extension.json` set
  `"characterFieldsHeading": false`.
- **Web:**
  - `expansionStore`: the fields of the enabled extensions, sorted by
    extension `order` then declaration, with their headings and with
    `optionsFrom` options built from the loaded oracles.
  - `preconditions.ts`: the field branch, and the `touched` branch removed.
  - `CharactersArea.svelte`: the fields below Vitals (Animal hidden for
    Pure), their log entries, and the level change unmarking abilities.
  - New Character (`CharactersArea.svelte`, `RandomizeBlock.svelte`): each
    field's control and d6 below the stats, hidden by its `if`, replacing the
    region picker and the Touched and Religion checkboxes; Create rolling the
    fields left empty.
  - `characterRollups.ts` / `characterRollupsFormat.ts`: the generic field
    roll; YRT's features roll reading `fields.touched` and writing a list;
    the origin, religion and touched prose dropped from the background.
  - `AssetCard.svelte`: `abilityMaxByField` against character fields, the
    level and animal as text; the chit named for the animal.
  - `character.ts`: the load-time move into `fields`.
  - `tutorials/createCharacter.ts`: the "Roll a region of origin" step
    becomes one step over the YRT fields, shown when they're there.
- **YRT data:** the four fields in `extension.json`; a `name` on each
  `yrtReligion` row; the ten Touched assets lose `touchedLevel` and
  `animalName` and gain the precondition and the new `abilityMaxByField`.
  Assets and oracles change, so `npm run gen:yrt-ref` regenerates the
  reference pages.
- **Tests:**
  - `apps/web/tests/unit/characterFields.test.ts`: YRT's declarations
    against its real oracles, `optionsFrom` ids, visibility (no Animal for
    Pure), rolls (religion on the origin's column, none without an origin;
    supersession), precondition messages, and the move into `fields`.
  - `apps/api/tests/unit/publicExtension.test.ts`: the fields reach the
    client.
  - `apps/web/tests/e2e/character-fields.spec.ts`: New Character's dice and
    Create's rolls (kept out of the background); Animal hiding for Pure; a
    change logged; the Touched assets faded for Pure and open at Prime;
    lowering the level unmarking abilities; an older character's values
    moved in.
  - `apps/web/tests/e2e/tutorials.spec.ts`: the Create a character
    tutorial's "Roll their details" step.
- **Docs:** `extensions.md` (the new `extension.json` key, and its stale
  table of current extensions), `data-schema.md` (character fields as
  precondition keys; the Touched row), the YRT README (Touched assets,
  religion), `character-sheet.md` (the Core tab rows).
