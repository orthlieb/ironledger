# Character fields from extensions

**Status: proposed.** Nothing here is built yet. This is the spec the work
will follow; when it lands, this page becomes the feature's documentation.

An extension can add fields to a character: a value the character has, shown
on the sheet, set at creation, and checked by preconditions. YRT's touched
level is the first one.

## The problem

YRT gives every character a touched level: Pure, Prime, Second, Third or
Feral. The Character: Touched oracle (`yrtTouched`) says of Pure: "Cannot use
Touched Assets." Today the app can't check that:

- New Character rolls the level, then writes it into the background text and
  the log. Nothing on the character stores it.
- Each Touched asset keeps its own copy in a Level dropdown (`touchedLevel`),
  which starts at Prime and has no Pure.
- The `touched` precondition key is written into `preconditions.ts`, reads
  that dropdown, and treats a character without a Touched asset as Pure. No
  asset uses it.

So a character who rolled Pure can add any Touched asset, and the asset
makes them Prime.

## Declaring a field

A field is declared in `extension.json`:

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
  }
]
```

| Field     | Type   | Required | Description                                                                                                                          |
| --------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `id`      | string | yes      | camelCase key, unique across all extensions. Stores the value, and a precondition names the field by it.                             |
| `label`   | string | yes      | Shown on the sheet, in New Character, and in log lines.                                                                              |
| `type`    | string | yes      | `"dropdown"` or `"text"`.                                                                                                            |
| `options` | array  | dropdown | `{ id, label }` in order. A precondition compares positions, so order them from lowest to highest.                                   |
| `default` | string | yes      | The value a character has until one is set: an option `id`, or text (may be `""`).                                                   |
| `roll`    | object | no       | Rolls the field in New Character: `oracle` is an oracle key; `from` names the property to read when the oracle's value is an object. |
| `tooltip` | string | no       | Hover hint on the sheet's control.                                                                                                   |

`npm run gen:manifest` checks each field and fails the build when:

- the `id` isn't camelCase, is declared by two extensions, or matches a
  built-in precondition key (`momentum`, `edge`, `hasFoe`, `vowCount`,
  `wounded`, … all of them, listed in `preconditions.ts`). Asset names, which
  preconditions also accept, can't clash: they're display names and start with
  a capital.
- a dropdown has fewer than two options, repeats an option id, or its
  `default` isn't one of them.
- `roll.oracle` isn't an oracle the extension, or `base`, provides.

The manifest copies `characterFields` into the extension's registry entry, so
`/catalogue/extensions` serves it with the rest of the metadata and the web
reads it through `expansionStore`, as it reads `supersedesOracles`.

## Storage

Values live in a new map on the character, `fields`, keyed by field id:

```jsonc
"fields": { "touched": "second" }
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
or a text input for text. Each row carries `data-tour="char-field-<id>"`.

Changing a field writes a log entry titled `<character> — Touched`, reading
`Touched: Prime → Second`, as editing a stat does.

## At creation

A field with `roll` gets a checkbox in New Character's "Randomize the rest",
labelled with the field's `label` and ticked by default. On Create, a ticked
field rolls its oracle, takes the value (or its `from` property), matches it
to an option by id or label ignoring case, and stores the match. With the
box unticked, or no match, the field keeps its default and the player sets
it on the sheet.

Touched already has that checkbox, and it rolls more than the level: the
animal aspect and the features follow, into the background and the log
(`rollYrtTouchedStructured` in `characterRollups.ts`). That stays. The class
it rolls is stored in `fields.touched`, so the oracle is rolled once. A field
rolled by a plain oracle needs no code at all.

## Preconditions

A precondition key that names a declared field reads the character's value.
For a dropdown it's the option's position, counting from 0; for YRT's
touched level that's Pure 0, Prime 1, Second 2, Third 3, Feral 4. The
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

## The Touched card's Level dropdown

With the level on the character, the Touched assets stop keeping a copy:

- The `touchedLevel` custom field comes off all ten.
- `abilityMaxByField` may name a character field. The ten assets switch to
  `{ "touched": { "pure": 0, "prime": 1, "second": 2, "third": 3, "feral": 3 } }`,
  and `AssetCard` looks the key up in the asset's custom fields first, then
  in the character's fields.
- Where the dropdown was, the card shows the level as text ("Level: Second"),
  so the limit on marked abilities still explains itself.

Lowering the level on the sheet below what the character's Touched asset has
marked unmarks the extra abilities, keeping the first ones, as lowering the
card's dropdown does now. The log line says so: `Touched: Second → Prime;
unmarked 1 ability on Touched, Feline`. No XP comes back, as when an ability
is unmarked by hand.

## Existing characters

When a character loads (next to `hydrateCharacterInPlace` in `character.ts`)
and has no `fields.touched`, it's filled once from:

1. the `customValues.touchedLevel` of its Touched asset, if it owns one;
2. otherwise the old `data.touched` field, from saves older than the Touched
   assets;
3. otherwise nothing, which reads as Pure.

The old copies are then deleted (`customValues.touchedLevel`,
`data.touched`), and `touched` comes off the `CharacterData` type.

## Not covered

- NPCs. Their Touched roll still goes into their notes; NPCs have no fields.
- Region of origin and religion. YRT-specific code rolls both at creation
  into the background. Either could become a text field later.
- The animal aspect. The roll picks an animal and the player picks the
  matching Touched asset by hand; a field could later let the picker point to
  it.
- Number fields. Mana stays a global counter.

## The work

- **Manifest:** `scripts/gen-extensions-manifest.mjs` validates and passes
  `characterFields` through; `ExtensionInfo` gains it in
  `packages/shared`, `apps/api/src/routes/catalogue.ts` and the web types.
- **Web:**
  - `expansionStore`: the fields of the enabled extensions.
  - `preconditions.ts`: the field branch, and the `touched` branch removed.
  - `CharactersArea.svelte`: the Core tab rows, their log entry, the level
    change unmarking abilities, and the creation roll.
  - `RandomizeBlock.svelte`: a checkbox per rolled field (Touched's becomes
    the field's).
  - `AssetCard.svelte`: `abilityMaxByField` against character fields, and the
    level as text.
  - `character.ts`: the load-time move into `fields`.
- **YRT data:** the field in `extension.json`; the ten Touched assets lose
  `touchedLevel` and gain the precondition and the new `abilityMaxByField`.
  Assets change, so `npm run gen:yrt-ref` regenerates the reference pages.
- **Tests:**
  - Unit: the precondition branch, the manifest's validation, the move into
    `fields`.
  - E2E: a Pure character sees the Touched assets faded; setting Prime lets
    them add one; lowering the level unmarks an ability; New Character stores
    the rolled level.
  - `tutorials.spec.ts`, since the Create a character tutorial walks through
    "Randomize the rest".
- **Docs:** `extensions.md` (the new `extension.json` key), `data-schema.md`
  (character fields as precondition keys; the Touched row),
  the YRT README (Touched assets), `character-sheet.md` (the Core tab rows).
