# Markdown + link-DSL migration plan

Move all authored game text — **moves, oracles, assets** (base + extensions) —
off hand-written HTML and onto one shared renderer (`renderRich`) plus a
`[label](scheme:path?query)` interactive-link DSL.

Proven end-to-end on the `feat/moves-oracles-dsl-poc` branch: one move
(`forge-a-bond`), one oracle (`monstrosity`), one asset (`path/herbalist`).

## Goals

- **One renderer, one DSL.** Collapse today's ~7 text renderers (moves:
  harm/enrich; oracles: fill/linkify; assets: `formatText`/`stripMdLinks`/
  `renderNote`/raw) toward a single `renderRich`.
- **Markdown for prose** (`**bold**`, `*italic*`, `-`/`1.` lists), **DSL for
  interactive links** (`[label](move:…)`, `[label](resource:…)`, …), **`roll:`
  for oracle substitution blanks** (`[label](roll:key?rollFrom=1&rollTo=3)`).
- **No HTML in authored content** when done.

## Principles (why this is low-risk)

1. **Opt-in per item** via a `markdown: true` flag. Un-flagged content still
   renders through the legacy path, so the two coexist for the whole migration.
2. **Byte-identical output.** The DSL emits the exact `<a class="…" data-…>`
   HTML the existing click handlers (`enrichOutcomeLinks`, `resolveHarmLinks`,
   asset link handlers) already consume — nothing downstream changes.
3. **Lint-gated.** A build-time validator checks every `(scheme:args)` so a
   scripted conversion can't silently produce a dead link.
4. **Incremental & reversible.** Each item is converted + verified on its own;
   a bad conversion fails the lint, and reverting one item is a one-file change.

---

## Phase 0 — Foundation (harden the POC)

Nothing else starts until this is solid; it de-risks every later phase.

- **`renderRich`** (`$lib/dsl.ts`): finalize; confirm the `renderNote` reuse
  covers all needed markdown (bold/italic/lists). **Decision:** keep the
  hand-rolled `renderNote` rather than pulling in `markdown-it` — the only
  syntax in use is bold/italic/lists, and staying dependency-free avoids the
  `+`/`&`/`html:true` normalization pitfalls. Revisit only if authors need
  tables/nested structure.
- **`<p>`-wrapper fix.** `renderNote` wraps lines in `<p>`; add
  `.md-outcome-text p, .md-notes-text p, .ability-text p { margin: 0 }` (and the
  oracle equivalents) so spacing matches the old inline output exactly. Verify a
  before/after screenshot on a converted item of each type.
- **Explicit `compound` style flag.** Replace the `/:\s/ || \]\(roll:/`
  heuristic in `rollOracle`'s compound branch with an authored
  `compound: "dossier" | "phrase"` field. (See `oracles.md` — dossier =
  per-field breakdown, phrase = composed name.)
- **Build-time lint** (`scripts/lint-dsl.mjs`, run on `predev`/`prebuild` + CI).
  See the spec below. This is the safety net that makes the scripted migrations
  trustworthy.
- **Unit tests** for `dsl.ts`: `parseDslHref` (lenient `+`, missing query),
  `dslActionLink` (every scheme → exact HTML, class-first), `renderRich`
  (protect/format/restore round-trip, list + link combos), and the oracle
  `parseRollSpec` (`times` vs `rollFrom`/`rollTo`).

**Exit criteria:** dsl tests green; lint runs clean against the 3 already-
converted POC items; the three `<p>` fixes verified.

---

## Phase 1 — Moves (52 moves, ~255 links, 13 files)

The richest link vocabulary (all 10 schemes) — do it first to exercise the DSL
fully.

- Script an **HTML → DSL conversion** (per-link-type regex; the mapping is 1:1
  and reversible): `<a class="move-link" data-id="move/x">L</a>` →
  `[L](move:x)`, `resource-link` → `[L](resource:name?value=±n)`, etc.;
  `<strong>` → `**`, `<b>` → `**`, `<i>`/`<em>` → `*`, `<ul><li>` → `-`,
  `<br>` → newline; `<span class="log-only">` → `[…]{.log-only}`.
- Set `markdown: true` on each converted move.
- **Embedded move tables** (`table` field on Pay the Price / Reveal a Danger):
  route `doTableRoll` + the table-row display through `renderRich`, and convert
  those rows — this merges with the tracked _"extend `[self]` to move tables"_
  task (their "Roll twice more…" rows become `[Roll Twice](roll:self?times=2)`).
- **Verify:** lint clean; every move renders (trigger/outcomes/notes) and rolls;
  spot-click each link type once.

**Exit criteria:** all 52 moves flagged + lint-clean; the harm-link and
table-roll moves manually click-tested.

---

## Phase 2 — Assets (~90 assets, ~344 move-links + 6 oracle-links)

Highest link count but only two schemes (`move:`, `oracle:`), so mechanically
simpler than moves.

- Script the same HTML → DSL conversion over `ability.text`, `preamble`,
  `description`. `<b>`/`<i>` → `**`/`*`; the `  * item` lists → `- item`.
- Set `markdown: true` per asset.
- **Verify:** lint clean; render each converted asset's card (ability text,
  preamble, description); confirm move/oracle links still click.

**Exit criteria:** all assets flagged + lint-clean; a sampled render pass across
categories (combat/path/ritual/companion).

---

## Phase 3 — Oracles (finish + harmonize)

Partly done (roll-twice `[self]{2}` shipped; `monstrosity` on the POC branch).

- Convert remaining **compound** oracles (`siteName`, `sampleCompoundName`) to
  `[label](roll:key)` + set `compound: "phrase"|"dossier"`.
- **Harmonize the roll-twice oracles**: `[self]{2}` → `[Roll Twice](roll:self?times=2)`
  and `[key]{n,m}` → `[label](roll:key?rollFrom=n&rollTo=m)` across the migrated
  set, so oracles use the same `[label](scheme:args)` shape as moves/assets.
- **Retire the legacy token** (`TEMPLATE_TOKEN`, the bare `[key]`/`[self]`
  path in `fillTemplate`/`linkifyTemplate`) once nothing uses it.
- **Verify:** roll each converted oracle; confirm phrase vs dossier renders per
  the flag; confirm interop path is gone (no legacy tokens remain).

**Exit criteria:** no `[key]{n}`/`[self]` tokens in oracle data; every compound
carries an explicit `compound` style; lint clean.

---

## Phase 4 — Flip the default & retire legacy

Only once **all** content of a type is converted.

- **Drop the `markdown: true` flag** — make `renderRich` the default path for
  moves/assets (and remove the per-item flag from data), keeping raw HTML only
  as an explicit `html: true` escape hatch if ever needed.
- **Delete** the superseded renderers: asset `formatText` + `stripMdLinks`; any
  raw `{@html}` passthroughs; the oracle legacy-token code (from Phase 3).
- Keep `enrichOutcomeLinks` / `resolveHarmLinks` — they run _after_ `renderRich`
  and still wire up the emitted links.
- **Docs** (tracked task): `extensions.md` (authoring guide), `moves.md`,
  `data-schema.md` (moves + assets fields, the `markdown`/`compound` flags),
  `oracles.md` (the `roll:` DSL alongside the template section).

**Exit criteria:** one renderer (`renderRich`) for all authored text; no
`formatText`/`stripMdLinks`/legacy-token code; docs published.

---

## The lint (`scripts/lint-dsl.mjs`)

For every `[label](scheme:path?query)` and `[text]{.class}` in flagged content:

- **Scheme** is known (`move`/`resource`/`progress`/`debility`/`initiative`/
  `oracle`/`reset`/`harm`/`vanquish`/`roll`; class `log-only`).
- **Targets exist**: `move:` slug resolves to a real move id; `oracle:` /
  `roll:` key resolves to a real oracle key (`self` allowed for `roll:`);
  `resource`/`track`/`debility` names are in the known sets.
- **Args are well-formed**: `resource`/`progress`/`debility` require `value`;
  `roll:` accepts `times` OR `rollFrom`/`rollTo`; `move:` optional `harm`.
- **No stray HTML** left in a flagged item (catches half-finished conversions).

Runs in `predev`/`prebuild` and CI; a failure blocks the build with the exact
`file → item → bad token`.

---

## Risks & mitigations

| Risk                                        | Mitigation                                         |
| ------------------------------------------- | -------------------------------------------------- |
| Scripted conversion produces a dead link    | The lint (targets-exist) fails the build           |
| Spacing/visual drift from `<p>` wrapper     | Phase-0 CSS fix + per-type before/after screenshot |
| Phrase compound mis-rendered as dossier     | Explicit `compound` flag replaces the heuristic    |
| A rare HTML construct the DSL can't express | `html: true` escape hatch (kept in Phase 4)        |
| Big-bang breakage                           | Opt-in flag = migrate + verify one item at a time  |

## Rough effort

- **Phase 0** ≈ 1 day (renderer polish + lint + tests).
- **Phase 1 (moves)** ≈ 1–1.5 days (script + review + table-roll wiring).
- **Phase 2 (assets)** ≈ 1 day (script + sampled review; simplest variety).
- **Phase 3 (oracles)** ≈ 0.5 day (small remaining set + legacy retire).
- **Phase 4 (flip + docs)** ≈ 0.5–1 day.

Each phase ships on its own branch behind the lint; nothing lands until its
converted content is verified.
