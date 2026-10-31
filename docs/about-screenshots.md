# About-page screenshots

The About page's feature carousel and its "Saga at a Glance" hero (also the
README's hero) are real screenshots of the app. One script regenerates all of
them from a demo campaign, so they can be refreshed whenever the UI changes:

```bash
npm run screenshots:about -w apps/web
```

It is a local script, not a build step: it needs a running stack and writes
the images into the tree for you to review and commit.

## What it writes

| Image                                    | Size     | Shows                                                      |
| ---------------------------------------- | -------- | ---------------------------------------------------------- |
| `apps/web/static/ironledger-home.webp`   | 1600×919 | The whole home screen (also copied to `docs/images/`)      |
| `apps/web/static/about/characters.webp`  | 1200×800 | Characters panel, Core tab                                 |
| `apps/web/static/about/foes.webp`        | 1200×800 | Choose a Foe dialog                                        |
| `apps/web/static/about/maps.webp`        | 1200×800 | The starter's Regional Map, fullscreen, with the demo pins |
| `apps/web/static/about/moves.webp`       | 1200×800 | The Face Danger move, ready to roll                        |
| `apps/web/static/about/oracles.webp`     | 1200×800 | Oracles dialog                                             |
| `apps/web/static/about/log.webp`         | 1200×800 | The session log after the demo turns                       |
| `apps/web/static/about/connections.webp` | 1200×800 | Connections panel on a settlement                          |

The other carousel images (`expeditions.webp`, `ai-storyteller.webp`,
`mobile.webp`) and the login hero (`ironledger-login.webp`) are hand-made
artwork. The script leaves them alone.

## Before you run it

- **The stack is up.** API on `:3000`, web on `:5173`. Use the dev servers
  or a production build (see the README's Development Setup).
- **The account can be wiped.** By default the script signs in as the seeded
  Playwright user, `test@ironledger.local`. ⚠ It deletes everything on that
  account (characters, foes, expeditions, connections, maps, log) before it
  loads the demo campaign. Never point it at an account you care about.
- **The browser can reach Google Fonts.** The app loads its fonts from there.
  Without them, headings and body text fall back to system fonts.

## How it works

`apps/web/scripts/about-screenshots.mjs` uses Playwright's Chromium and runs
these steps:

1. **Sign in and wipe** the account through the API.
2. **Import the Starter Ironlands** the way a new sign-up does: it sets the
   `il_seed_starter` cookie and loads `/home`, which imports
   `/about/ironlands-starter.zip`. This gives the Ironlands regions and the
   Regional Map.
3. **Seed the demo campaign** from `about-screenshots/demo-campaign.mjs`
   through the API:
   - Bryn Halvard, with her vows and assets
   - the Broken Tooth Raiders and three other foes
   - a journey, a delve site and a scene challenge
   - two settlements and four NPCs, placed inside the starter's regions
   - map pins for the settlements and the barrow
4. **Play a few turns** (`PLAY`) through the log's command bar. These are
   notes, real move rolls and an oracle roll, so the log holds genuine
   entries. 3D dice are off, so each roll lands at once.
5. **Capture each shot.** The page runs at 1600×919 CSS px at 3× scale. Each
   shot is cropped to 3:2 from its panel or dialog, then scaled to its final
   size. The browser encodes the WebP itself (canvas → `toDataURL`), so the
   script needs nothing outside Playwright.

The theme is light, with the default livery.

Dice and oracle results are random, so every run gives a slightly different
log. Re-run until you like it.

## Options

All options are environment variables:

| Variable                                   | Default                     |
| ------------------------------------------ | --------------------------- |
| `SCREENSHOT_WEB_URL`                       | `http://localhost:5173`     |
| `SCREENSHOT_API_URL`                       | `http://localhost:3000`     |
| `SCREENSHOT_EMAIL` / `SCREENSHOT_PASSWORD` | the seeded Playwright user  |
| `SCREENSHOT_ONLY`                          | all shots, e.g. `log,moves` |

`SCREENSHOT_ONLY` still wipes the account and re-seeds it. It only skips the
captures you didn't name.

## Changing a shot

- **Content** (names, vows, foes, notes, the turns played) lives in
  `about-screenshots/demo-campaign.mjs`. It is all original text written for
  these screenshots.
- **Framing** lives in the `SHOTS` table in `about-screenshots.mjs`. Each
  entry opens what it shows, then calls `saveWebp` with a crop:
  - `crop(box)` takes the top 3:2 of a panel.
  - `crop(box, { fit: 'cover' })` widens a dialog's box to 3:2 around its
    centre.
- **A new carousel image:** add a shot that writes `about/<key>.webp`, then
  set `image` and an accurate `alt` on the matching feature in
  `apps/web/src/routes/about/+page.svelte`.

Keep each `alt` describing what the screenshot actually shows, and update it
when a shot's content changes.
