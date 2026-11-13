# Character fields from extensions

**Status: proposed.** Nothing here is built yet. This is the spec the work
will follow; when it lands, this page becomes the feature's documentation.

An extension can add fields to a character: values the character has, shown
on the sheet, rolled at creation, and checked by preconditions. YRT's touched
level and touched animal are the first two.

## The problem

YRT gives every character a touched level (Pure, Prime, Second, Third or
Feral) and, unless they're Pure, an animal (Bear, Wolf, Cat (domestic), …).
The Character: Touched oracle (`yrtTouched`) says of Pure: "Cannot use
Touched Assets." Today the app can't check that:

- New Character rolls the level, the animal and the features, and writes
  them into the background as a sentence ("Fanir is a **Second with 2**
  features of a wolf.") plus the log. Nothing on the character stores them.
- Each Touched asset keeps its own copies: a Level dropdown (`touchedLevel`),
  which starts at Prime and has no Pure, and an Animal text box
  (`animalName`).
- The `touched` precondition key is written into `preconditions.ts`, reads
  the asset's dropdown, and treats a character without a Touched asset as
  Pure. No asset uses it.

So a character who rolled Pure can add any Touched asset, and the asset
makes them Prime.

## YRT's two fields

```jsonc
// extensions/yrt/extension.json
"characterFields": [
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

On the sheet that's a Touched dropdown with the five levels and a one-line
Animal text box. In New Character, a Pure roll leaves the animal empty: its
`roll.if` reads the level rolled just before it.

## Declaring a field

| Field         | Type   | Required | Description                                                                                                                                                          |
| ------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | string | yes      | camelCase key, unique across all extensions. Stores the value, and a precondition names the field by it.                                                             |
| `label`       | string | yes      | Shown on the sheet, in New Character, and in log lines.                                                                                                              |
| `type`        | string | yes      | `"dropdown"`, or `"text"` for one line of free text.                                                                                                                 |
| `options`     | array  | dropdown | `{ id, label }` in order. A precondition compares positions, so order them from lowest to highest.                                                                   |
| `default`     | string | yes      | The value a character has until one is set: an option `id`, or text (may be `""`).                                                                                   |
| `placeholder` | string | no       | Hint shown in an empty text box.                                                                                                                                     |
| `roll`        | object | no       | Rolls the field in New Character. `oracle`: the oracle's key. `from`: the property to read when the oracle's value is an object. `if`: preconditions, checked first. |
| `tooltip`     | string | no       | Hover hint on the sheet's control.                                                                                                                                   |

Fields roll in the order they're declared, so a `roll.if` can test a field
declared above it. A field whose `if` fails isn't rolled and keeps its
default.

`npm run gen:manifest` checks each field and fails the build when:

- the `id` isn't camelCase, is declared by two extensions, or matches a
  built-in precondition key (`momentum`, `edge`, `hasFoe`, `vowCount`,
  `wounded`, … all of them, listed in `preconditions.ts`). Asset names, which
  preconditions also accept, can't clash: they're display names and start
  with a capital.
- a dropdown has fewer than two options, repeats an option id, or its
  `default` isn't one of them.
- `roll.oracle` isn't an oracle the extension, or `base`, provides, or a
  `roll.if` names a field that isn't declared above it.

The manifest copies `characterFields` into the extension's registry entry, so
`/catalogue/extensions` serves it with the rest of the metadata and the web
reads it through `expansionStore`, as it reads `supersedesOracles`.

## Storage

Values live in a new map on the character, `fields`, keyed by field id:

```jsonc
"fields": { "touched": "second", "touchedAnimal": "Wolf" }
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
stripping of `__proto__`-style keys still applies.

## On the sheet

The Core tab gets a row per field of each enabled extension, below
Initiative and laid out like it: the label, then a `<Select>` for a dropdown
or a one-line text input for text. Each row carries
`data-tour="char-field-<id>"`.

Changing a field writes a log entry titled `<character> — Touched`, reading
`Touched: Prime → Second`, as editing a stat does. A text field logs when the
box loses focus, not on every keystroke.

## At creation

Each field with `roll` gets a checkbox in New Character's "Randomize the
rest", labelled with the field's `label` and ticked by default. On Create,
each ticked field whose `roll.if` passes rolls its oracle, takes the value
(or its `from` property), and stores it: a dropdown matches it to an option
by id or label, ignoring case; a text field stores it as it is. An unticked
field, a failed `if`, or a dropdown value that matches no option leaves the
default, and the player can set the field on the sheet.

The rolled fields join the "New Character — <name>" log entry as lines like
the other randomized details (`Touched: Second`, `Animal: Wolf`), and they
don't go into the background. The background no longer gets the touched
sentence.

The features are still rolled by YRT's code, because how many depends on the
level: one at Prime, one to three at Second, four to six at Third, and
narrative at Feral. `rollYrtTouchedStructured` in `characterRollups.ts` stops
rolling the level and the animal; it reads `fields.touched`, rolls the
features, and writes them into the background as a list under **Touched
features**, with its own log entry as now.

NPCs keep today's behaviour: their Touched roll goes into their notes as a
sentence, since NPCs have no fields.

## Preconditions

A precondition key that names a declared dropdown field reads the
character's value as the option's position, counting from 0. For the touched
level that's Pure 0, Prime 1, Second 2, Third 3, Feral 4. The failure message
uses the option labels: "Requires Touched: Prime or higher", "Requires
Touched: Third or lower", "Requires Touched: Pure". Text fields can't be used
in preconditions, which compare numbers.

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
each YRT field it doesn't have yet is filled once:

| Field           | Taken from, first found                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `touched`       | the Touched asset's `customValues.touchedLevel`; the old `data.touched`; otherwise nothing (Pure)     |
| `touchedAnimal` | the Touched asset's `customValues.animalName`; the old `data.touchedAnimal`; otherwise nothing (`""`) |

The old copies are then deleted, and `touched` / `touchedAnimal` come off the
`CharacterData` type. Backgrounds aren't touched: a character made before
this keeps the sentence it was given.

## Not covered here

- Region of origin and religion: YRT-specific code rolls both at creation and
  writes them into the background. Religion is rolled from the column for the
  origin's country, so it needs a way for a roll to read another field. See
  the catalogue below.
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
| `preconditions.ts` `touched` branch, `TOUCHED_LEVEL`, `TOUCHED_LABEL`                                                                                                                    | The `touched` precondition key                         | The generic field branch                                                                       | This work |
| The ten Touched assets' `touchedLevel` / `animalName` custom fields; `types.ts` `touched` / `touchedAnimal`                                                                              | Per-asset and legacy copies of the level and animal    | Read from `fields`; removed                                                                    | This work |
| `RandomizeBlock.svelte` region Select (`regionOriginOptions`), `characterRollups.ts` `religionColumnForOrigin`, `randomizationsAsMarkdown`; `tutorials/createCharacter.ts` region step   | Region of origin and religion, into the background     | A dropdown field and a text field; religion's roll picks its column from the origin field      | Later     |
| `CharactersArea.svelte` Status tab `isSourceEnabled('delve')`: Failures track, Lessons Learned; `MovesDialog.svelte` `+1 failure` link on a miss                                         | Delve's failures track on the character                | A `track` field type, and a move-outcome hook for the `+1 failure` link                        | Later     |
| `CharactersArea.svelte` `applyResourceChange` `mana` branch; `preconditions.ts` `mana` in the stat map; `MovesDialog.svelte` mana commit                                                 | YRT's mana as a resource with a 0–10 range             | A `counter` field type with a range and colour, which `resource:` links and preconditions read | Later     |

### Other declarations

| Code                                                                                                                                      | Does                                                                       | Becomes                                                                                                                                                            | When  |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| `CommunitiesArea.svelte` `LODESTAR_SETTLEMENT_FIELDS`, `newCommunityRollLodestar`, `lodestarOn` (hides Location and Descriptor)           | Lodestar's six settlement fields, rolled at creation and shown on the card | `settlementFields`, the same shape as `characterFields`; `suppresses` for the two Core fields                                                                      | Later |
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
  - `expansionStore`: the fields of the enabled extensions, in order.
  - `preconditions.ts`: the field branch, and the `touched` branch removed.
  - `CharactersArea.svelte`: the Core tab rows, their log entries, the level
    change unmarking abilities, and the creation rolls.
  - `RandomizeBlock.svelte`: a checkbox per rolled field (Touched's becomes
    the field's, and Animal gets one).
  - `characterRollups.ts` / `characterRollupsFormat.ts`: the generic field
    roll; YRT's features roll reading `fields.touched` and writing a list.
  - `AssetCard.svelte`: `abilityMaxByField` against character fields, the
    level and animal as text, the animal in the title.
  - `character.ts`: the load-time move into `fields`.
- **YRT data:** the two fields in `extension.json`; the ten Touched assets
  lose `touchedLevel` and `animalName` and gain the precondition and the new
  `abilityMaxByField`. Assets change, so `npm run gen:yrt-ref` regenerates the
  reference pages.
- **Tests:**
  - Unit: the precondition branch, the manifest's validation, the field
    rolls (Pure skips the animal), the move into `fields`.
  - E2E: a Pure character sees the Touched assets faded; setting Prime lets
    them add one; lowering the level unmarks an ability; New Character fills
    both fields and leaves them out of the background.
  - `tutorials.spec.ts`, since the Create a character tutorial walks through
    "Randomize the rest".
- **Docs:** `extensions.md` (the new `extension.json` key), `data-schema.md`
  (character fields as precondition keys; the Touched row), the YRT README
  (Touched assets), `character-sheet.md` (the Core tab rows).
