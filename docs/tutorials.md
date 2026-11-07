# Tutorials

Point-and-click walkthroughs that guide a player through a task on the real
UI. They dim the page, highlight one control at a time and explain it in a
popover beside it. Players start them from **☰ → Tutorials**. They work on
desktop, tablet and phone, with mouse or touch.

They're built on [Driver.js](https://driverjs.com) (MIT), which loads the
first time a tutorial starts, so it adds nothing to the main bundle.

| Tutorial              | What it covers                                                                                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a character    | The switcher's "+ New character…", rolling a name, stats and (YRT) a region, randomizing the rest, Create; a bio and a portrait on the Background tab; initiative; swearing a first vow; taking a first starting asset and spending its experience from the log; debilities and bonds on the Status tab |
| Create your first foe | The switcher's "+ New foe…", searching and filtering the foe picker, choosing a foe, solo / pack / horde, its features, drives and tactics, Add to Foes, then its pills, marking progress and vanquishing it                                                                                            |

## Where things live

| File                                            | What it holds                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/web/src/lib/tutorials/tour.ts`            | The runner: `TourStep`, `Tutorial`, `runTour()` on top of Driver.js    |
| `apps/web/src/lib/tutorials/tour.css`           | The popover in the house style; bits-ui menus above the tour's overlay |
| `apps/web/src/lib/tutorials/index.ts`           | `TUTORIALS` (the menu's list) and `startTutorial(id)`                  |
| `apps/web/src/lib/tutorials/createCharacter.ts` | The Create a character tutorial                                        |
| `apps/web/src/lib/tutorials/createFoe.ts`       | The Create your first foe tutorial                                     |
| `apps/web/tests/e2e/tutorials.spec.ts`          | E2E tests that follow each tutorial as a player would                  |

## Writing a tutorial

A tutorial is a `Tutorial`: an `id`, a menu `title`, the `route` it runs on
(the runner navigates there first), a `ready` target that's on the page once
that route has rendered, and its `steps()`.

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
  list" and "choose + New character…".
- **Click along** (`clickToContinue`): no Next button. The tour moves on
  when the player clicks the highlighted control. Use it when the click's
  result is already on screen (Create, then the character it made).
- **Explain** (the default): Next moves on. `beforeNext` runs first and
  can do the step for the player if they skipped it (roll a name), so
  the tour never strands them at a disabled button further on.

Other step options:

| Option                | Meaning                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `selector`            | A CSS selector in place of `target`, for what the app writes as HTML and can't tag (a log entry's link); the first match is used  |
| `when: () => boolean` | Leave the step out unless true, asked when the tour starts (YRT on, a tab hidden)                                                 |
| `wait: ms`            | Wait for the target to appear (a dialog opening)                                                                                  |
| `backIfGone`          | If the target leaves the screen (a list row filtered out, its dialog closed), go back to the nearest earlier step still on screen |
| `optional`            | Skip the step when its target isn't there (a section only some foes have)                                                         |
| `back`                | Show Back. Only where the step before is still on screen                                                                          |
| `side`, `align`       | Where the popover sits                                                                                                            |

On a phone a dialog can fill the screen, leaving the popover nowhere to go
but over the dialog itself. When a step's player must use a button there
(Add on an asset card), give the button a step of its own with
`side: 'top'`, so the popover sits above it, not over it.

Then add it to `TUTORIALS` in `index.ts`, and add a test to
`tutorials.spec.ts` that follows it through using the real controls.

## Things the runner handles

- **The highlight follows its target** as it grows or shrinks, for example a
  notes field switching to its editor.
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
- **A tap on the dimmed page doesn't end the tour.** It ends with ✕, Escape
  or Done.
- **The tour's own buttons don't take focus.** Driver swallows their
  mouse-down, so Next doesn't blur a field the player is typing in. A step
  that needs the field closed first (the bio editor) blurs it in its
  `beforeNext`.
