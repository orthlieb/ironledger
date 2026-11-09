# Tutorials

Point-and-click walkthroughs that guide a player through a task on the real
UI. They dim the page, highlight one control at a time and explain it in a
popover beside it. Players start them from **☰ → Tutorials**. They work on
desktop, tablet and phone, with mouse or touch.

They're built on [Driver.js](https://driverjs.com) (MIT). Only the menu's
list of ids and titles ships with the page (under half a kilobyte
gzipped): a tutorial's steps, the runner and Driver.js load when it's
picked, each tutorial in a chunk of its own.

| Tutorial                       | What it covers                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a character             | The switcher's "+ New character…", rolling a name, stats and (YRT) a region, randomizing the rest, Create; a bio and a portrait on the Background tab; initiative; debilities and bonds on the Status tab; then on to the next two                                                                                                                             |
| Add your first vow             | The + ⛓ button, naming the vow and choosing its rank, and the vow on the Vows tab                                                                                                                                                                                                                                                                              |
| Add your assets                | The + ◆ button, finding and picking an asset, its first ability, Add, and spending its 3 experience from the log; a new character takes three, with the 9 experience it starts with                                                                                                                                                                            |
| Start a journey                | The Expeditions switcher's "+ New Journey…", its name and difficulty, its progress track; saying how you set out, as a note in the log; Undertake a Journey and marking its progress from the log's links; what comes next (Make Camp on the road, Reach Your Destination)                                                                                     |
| Add a settlement and an NPC    | The Connections switcher's "+ New Settlement…" and "+ New NPC…" (a name typed or rolled, what else to roll), their cards, setting the NPC's Within to the settlement, and Forge a Bond                                                                                                                                                                         |
| Put your settlement on the map | The header's Map; a picture for a new map; + marker and a click where the settlement lies; linking the marker to it; the Choose Icon dialog's Icons, Buildings and Settlement builder tabs, drawing the settlement; OK; the marker's card and its Go To; the map listed on the settlement's card                                                               |
| Create your first foe          | The switcher's "+ New foe…", searching and filtering the foe picker, choosing a foe, solo / pack / horde, its features, drives and tactics, Add to Foes, then its pills, marking progress and vanquishing it                                                                                                                                                   |
| Fight your foe                 | With the active character and foe: vitals and initiative; Move → searching for Enter the Fray → a stat → Roll Move, then applying the outcome from the log's links; saying what you do, as a note in the log; Strike or Clash as initiative allows, and the harm marked on the foe's progress track; Endure Harm, applying it, rolling, and the health it cost |
| Make camp and heal             | After a fight, with the active character: their vitals; Heal (a stat, the roll, its health and wounded links in the log); saying where you camp, as a note in the log; Make Camp (what it lets you choose, the roll, choosing from its links); the vitals again                                                                                                |

## Where things live

| File                                            | What it holds                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/lib/tutorials/tour.ts`            | The runner: `TourStep`, `Tutorial`, `runTour()` on top of Driver.js                                                                              |
| `apps/web/src/lib/tutorials/tour.css`           | The popover in the house style; bits-ui menus above the tour's overlay                                                                           |
| `apps/web/src/lib/tutorials/index.ts`           | `TUTORIALS` (the menu's list) and `startTutorial(id)`                                                                                            |
| `apps/web/src/lib/tutorials/createCharacter.ts` | The Create a character tutorial                                                                                                                  |
| `apps/web/src/lib/tutorials/addVow.ts`          | The Add your first vow tutorial                                                                                                                  |
| `apps/web/src/lib/tutorials/addAssets.ts`       | The Add your assets tutorial                                                                                                                     |
| `apps/web/src/lib/tutorials/startJourney.ts`    | The Start a journey tutorial                                                                                                                     |
| `apps/web/src/lib/tutorials/addConnections.ts`  | The Add a settlement and an NPC tutorial                                                                                                         |
| `apps/web/src/lib/tutorials/mapSettlement.ts`   | The Put your settlement on the map tutorial                                                                                                      |
| `apps/web/src/lib/tutorials/createFoe.ts`       | The Create your first foe tutorial                                                                                                               |
| `apps/web/src/lib/tutorials/fightFoe.ts`        | The Fight your foe tutorial                                                                                                                      |
| `apps/web/src/lib/tutorials/makeCamp.ts`        | The Make camp and heal tutorial                                                                                                                  |
| `apps/web/src/lib/tutorials/moves.ts`           | What the tutorials that make moves share: the rolls and notes made since the tour began, closing the Moves dialog, searching it, choosing a stat |
| `apps/web/src/lib/tutorials/keys.ts`            | Controls drawn into a step's text as they look (`MOVE`, `MAP`, `ADD_VOW`, `ADD_ASSET`, `ADD_MARKER`), for buttons that show an icon, not a word  |
| `apps/web/tests/e2e/tutorials.spec.ts`          | E2E tests that follow each tutorial as a player would                                                                                            |

## Writing a tutorial

A tutorial is a `Tutorial`, in a module of its own: the `route` it runs on
(the runner navigates there first), a `ready` target that's on the page once
that route has rendered, and its `steps()`. The page draws before its
stores arrive, so a tutorial whose `steps()` reads one (whether there's a
settlement yet, the entries there already) also gives `loaded`, and the
runner waits for it to return true first.

Each step points at an element by a **`data-tour` id**. Put the attribute on
the element in its component. The shared components take a `tour` prop for
this: `Combobox` (its trigger, and a `tour` on each action row),
`ConfirmDialog` (the dialog, and `<tour>-confirm` on its confirm button),
`MarkdownNotes` and `PortraitUploader`. Point at stable elements: a wrapper
that stays put while its content changes beats the content itself.

While a tour runs, only the highlighted control takes clicks (and a menu
opened from it). So a step must highlight whatever the player has to use:
point at a block holding the controls, not at an explanation beside them.

A step is one of three kinds:

- **Do this** (`continueWhen: '<id>'`): no Next button. The tour moves on
  once the `<id>` target is on screen, meaning what the player's action
  opened. It's keyed to the result, not the click, so a menu closed and
  reopened, or already open, still lands right. Use it for "open the
  list" and "choose + New character…". For a result with no target of its
  own, give it a function instead, and the tour moves on once it returns
  true (a note the player wrote to the log).
- **Click along** (`clickToContinue`): no Next button. The tour moves on
  when the player clicks the highlighted control. Use it when the click's
  result is already on screen (Create, then the character it made). Given
  a selector, only a click on what matches it inside the target counts
  (Endure Harm's Apply, not the steppers beside it).
- **Explain** (the default): Next moves on. `beforeNext` runs first and
  can do the step for the player if they skipped it (roll a name), so
  the tour never strands them at a disabled button further on.

Other step options:

| Option                | Meaning                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `selector`            | A CSS selector in place of `target`, for what the app writes as HTML and can't tag (a log entry's link); the first match is used  |
| `find: () => Element` | Or a function that finds it as the step is reached, for what's known only then: the roll just made, the move initiative allows    |
| `pageClass`           | A class on `<body>` while the step shows, for `tour.css` to make room: `il-tour-log` grows a phone's log to show a whole roll     |
| `when: () => boolean` | Leave the step out unless true, asked when the tour starts (YRT on, a tab hidden)                                                 |
| `wait: ms`            | Wait for the target to appear (a dialog opening)                                                                                  |
| `backIfGone`          | If the target leaves the screen (a list row filtered out, its dialog closed), go back to the nearest earlier step still on screen |
| `optional`            | Skip the step when its target isn't there (a section only some foes have)                                                         |
| `back`                | Show Back. Only where the step before is still on screen                                                                          |
| `side`, `align`       | Where the popover sits                                                                                                            |

Name a control by what it shows. Where it's an icon with no word (the
header's Move on a phone, the character's + ⛓ and + ◆), draw it into the
text with `keys.ts`: "Click ${MOVE}" shows the button itself, its label
hidden on narrow screens as the header hides it.

On a phone a dialog can fill the screen, leaving the popover nowhere to go
but over the dialog itself. When a step's player must use a button there
(Add on an asset card), give the button a step of its own with
`side: 'top'`, so the popover sits above it, not over it. The same goes for
a block of controls that fills the dialog: the settlement builder's knobs
and its preview (the die and Use this) are two steps, so neither popover
covers the other's controls.

A step that waits on a dialog's result should wait for what changes, not
for something that may be on screen already: an open journey's track, or
the vow list, sits behind the New Journey and New Vow dialogs. Start a
journey, Add your first vow and Add a settlement and an NPC move on once
the store holds a journey, vow, settlement or NPC that wasn't there when
the tour began, and the dialog has closed. Put your settlement on the map
notes the markers on the map as it opens (the map loads then), and its
link step waits for a new one linked to a settlement.

Where dice decide what happens, read the page as it is rather than assume
an outcome. A roll's step finds its roll as the newest one the tour hasn't
seen (`logWatch()` in `moves.ts`). Fight your foe also picks the move to
make by who holds initiative, and its `beforeNext` applies what the fight
needs (initiative, harm) if the player left the link. Their E2E tests load
the dice, so each roll comes out as the test says.

Then add it to `TUTORIALS` in `index.ts` — its `id`, its menu `title`, and
a `load` that imports its module — and add a test to `tutorials.spec.ts`
that follows it through using the real controls. Don't import a tutorial or
`tour.ts` anywhere else up front: that would put them back in every page.

## Things the runner handles

- **The highlight follows its target** as it moves or changes size: a notes
  field switching to its editor, a move's tile scrolled into view in its
  list, a roll pushed down the log by the entry its link wrote. Driver
  re-measures only when the window scrolls or resizes; the runner checks
  every frame.
- **Menus opened from a highlighted control** (a Select's list, a
  DropdownMenu) open above both the overlay and the tour's popover, and
  take clicks. Driver otherwise disables pointer events everywhere except
  the highlighted element.
- **Clicks during the move to a step count.** Driver's own click-to-advance
  ignores clicks while it animates; the runner listens itself.
- **Taps the page acts on itself count as clicks.** The log handles a tap
  on a link at touchend and cancels the click that would follow; a
  click-along step counts such a cancelled tap as its click.
- **A target that changes size on the way is measured again.** Driver takes
  a step's measure only as its move ends (a refresh before then places the
  popover by the step before), so the runner holds resizes until then and
  measures once more: a foe list still loading as the picker's grid comes up.
- **The 3D dice roll above the tour's overlay**, not dimmed under it.
- **A tap on the dimmed page doesn't end the tour.** It ends with ✕, Escape
  or Done.
- **A phone's keyboard doesn't throw the highlight off.** A text field
  left focused outside the new step's target (a stat typed in on the step
  before) is blurred as the step starts, so its keyboard closes; the
  overlay is drawn one unit to the CSS pixel (Driver scaled it to cover
  the screen, and with a keyboard up the cut-out landed off its target);
  and it's measured again whenever the visual viewport changes size.
- **The tour's own buttons don't take focus.** Driver swallows their
  mouse-down, so Next doesn't blur a field the player is typing in. A step
  that needs the field closed first (the bio editor) blurs it in its
  `beforeNext`.
