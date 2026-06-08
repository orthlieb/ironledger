# Log Entry Title Templates

This file defines the title string displayed in the Session Log for each move and oracle roll.
Edit the **Proposed** column, then feed it back to Claude to implement the templates.

## Template Variable Syntax

Use `{variable}` placeholders:

| Variable      | Description                             | Example           |
| ------------- | --------------------------------------- | ----------------- |
| `{character}` | Active character's name                 | Hellion Skyfather |
| `{stat}`      | Stat used in the roll (capitalised)     | Edge              |
| `{site}`      | Active site/expedition name             | The Crevasse      |
| `{journey}`   | Active journey name                     | Road to Highwatch |
| `{foe}`       | Active foe name                         | Blood Thorn       |
| `{move}`      | Move name (literal, from the data file) | Face Danger       |

> **Note:** The log renders titles in `text-transform: uppercase`, so capitalisation in the
> template only matters for readability here.

---

## Move Titles

### Adventure

| Move                   | Current Pattern                              | Proposed                                     |
| ---------------------- | -------------------------------------------- | -------------------------------------------- |
| Face Danger            | `{character} — Face Danger ({stat})`         | `{character} — Face Danger ({stat})`         |
| Secure an Advantage    | `{character} — Secure an Advantage ({stat})` | `{character} — Secure an Advantage ({stat})` |
| Gather Information     | `{character} — Gather Information ({stat})`  | `{character} — Gather Information ({stat})`  |
| Heal                   | `{character} — Heal ({stat})`                | `{character} — Heal ({stat})`                |
| Resupply               | `{character} — Resupply ({stat})`            | `{character} — Resupply ({stat})`            |
| Make Camp              | `{character} — Make Camp ({stat})`           | `{character} — Make Camp ({stat})`           |
| Undertake a Journey    | `{character} — Undertake a Journey ({stat})` | `{character} — Undertake a Journey ({stat})` |
| Reach Your Destination | `{character} — Reach Your Destination`       | `{character} — Reach Your Destination`       |

### Combat

| Move           | Current Pattern                         | Proposed                                |
| -------------- | --------------------------------------- | --------------------------------------- |
| Enter the Fray | `{character} — Enter the Fray ({stat})` | `{character} — Enter the Fray ({stat})` |
| Strike         | `{character} — Strike ({stat})`         | `{character} — Strike ({stat})`         |
| Clash          | `{character} — Clash ({stat})`          | `{character} — Clash ({stat})`          |
| Turn the Tide  | `{character} — Turn the Tide`           | `{character} — Turn the Tide`           |
| Battle         | `{character} — Battle ({stat})`         | `{character} — Battle ({stat})`         |
| End the Fight  | `{character} — End the Fight`           | `{character} — End the Fight`           |

### Quest

| Move              | Current Pattern                            | Proposed                                   |
| ----------------- | ------------------------------------------ | ------------------------------------------ |
| Swear an Iron Vow | `{character} — Swear an Iron Vow ({stat})` | `{character} — Swear an Iron Vow ({stat})` |
| Reach a Milestone | `{character} — Reach a Milestone`          | `{character} — Reach a Milestone`          |
| Fulfill Your Vow  | `{character} — Fulfill Your Vow`           | `{character} — Fulfill Your Vow`           |
| Forsake Your Vow  | `{character} — Forsake Your Vow`           | `{character} — Forsake Your Vow`           |
| Advance           | `{character} — Advance`                    | `{character} — Advance`                    |

### Relationship

| Move                | Current Pattern                              | Proposed                                     |
| ------------------- | -------------------------------------------- | -------------------------------------------- |
| Compel              | `{character} — Compel ({stat})`              | `{character} — Compel ({stat})`              |
| Sojourn             | `{character} — Sojourn ({stat})`             | `{character} — Sojourn ({stat})`             |
| Draw the Circle     | `{character} — Draw the Circle ({stat})`     | `{character} — Draw the Circle ({stat})`     |
| Forge a Bond        | `{character} — Forge a Bond ({stat})`        | `{character} — Forge a Bond ({stat})`        |
| Test Your Bond      | `{character} — Test Your Bond ({stat})`      | `{character} — Test Your Bond ({stat})`      |
| Aid Your Ally       | `{character} — Aid Your Ally`                | `{character} — Aid Your Ally`                |
| Write Your Epilogue | `{character} — Write Your Epilogue ({stat})` | `{character} — Write Your Epilogue ({stat})` |

### Suffer

| Move                  | Current Pattern                                | Proposed                                       |
| --------------------- | ---------------------------------------------- | ---------------------------------------------- |
| Endure Harm           | `{character} — Endure Harm ({stat})`           | `{character} — Endure Harm ({stat})`           |
| Companion Endure Harm | `{character} — Companion Endure Harm ({stat})` | `{character} — Companion Endure Harm ({stat})` |
| Face Death            | `{character} — Face Death ({stat})`            | `{character} — Face Death ({stat})`            |
| Face a Setback        | `{character} — Face a Setback`                 | `{character} — Face a Setback`                 |
| Endure Stress         | `{character} — Endure Stress ({stat})`         | `{character} — Endure Stress ({stat})`         |
| Face Desolation       | `{character} — Face Desolation ({stat})`       | `{character} — Face Desolation ({stat})`       |
| Out of Supply         | `{character} — Out of Supply`                  | `{character} — Out of Supply`                  |

### Fate

| Move           | Current Pattern                | Proposed                       |
| -------------- | ------------------------------ | ------------------------------ |
| Ask the Oracle | `{character} — Ask the Oracle` | `{character} — Ask the Oracle` |
| Pay the Price  | `{character} — Pay the Price`  | `{character} — Pay the Price`  |

### Delve

| Move                  | Current Pattern                            | Proposed                                             |
| --------------------- | ------------------------------------------ | ---------------------------------------------------- |
| Discover a Site       | `{character} — Discover a Site`            | `{character} — Discover a Site`                      |
| Delve the Depths      | `{character} — Delve the Depths ({stat})`  | `{character} Delved the Depths ({stat}) at {site}`   |
| Find an Opportunity   | `{character} — Find an Opportunity`        | `{character} — Find an Opportunity`                  |
| Reveal a Danger       | `{character} — Reveal a Danger`            | `{character} — Reveal a Danger`                      |
| Check Your Gear       | `{character} — Check Your Gear ({stat})`   | `{character} — Check Your Gear ({stat})`             |
| Locate Your Objective | `{character} — Locate Your Objective`      | `{character} — Locate Your Objective`                |
| Advance a Threat      | `{character} — Advance a Threat`           | `{character} — Advance a Threat`                     |
| Take a Hiatus         | `{character} — Take a Hiatus`              | `{character} — Take a Hiatus`                        |
| Escape the Depths     | `{character} — Escape the Depths ({stat})` | `{character} — Escape the Depths ({stat}) at {site}` |

### Rarity / Failure

| Move                     | Current Pattern                                   | Proposed                                          |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------- |
| Wield a Rarity           | `{character} — Wield a Rarity`                    | `{character} — Wield a Rarity`                    |
| Mark Your Failure        | `{character} — Mark Your Failure`                 | `{character} — Mark Your Failure`                 |
| Learn From Your Failures | `{character} — Learn From Your Failures ({stat})` | `{character} — Learn From Your Failures ({stat})` |

---

## Oracle Titles

Oracle log entries are always prefixed `Oracle:` in the current code (e.g. `Oracle: Ask the Oracle`).

| Oracle                           | Current Pattern                            | Proposed                                                   |
| -------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| Action                           | `Oracle: Action`                           | `Oracle: Action`                                           |
| Theme                            | `Oracle: Theme`                            | `Oracle: Theme`                                            |
| Region                           | `Oracle: Region`                           | `Oracle: Region`                                           |
| Location                         | `Oracle: Location`                         | `Oracle: Location`                                         |
| Location Descriptor              | `Oracle: Location Descriptor`              | `Oracle: Location Descriptor`                              |
| Settlement Name                  | `Oracle: Settlement Name`                  | `Oracle: Settlement Name`                                  |
| Settlement Name (Quick)          | `Oracle: Settlement Name (Quick)`          | `Oracle: Settlement Name (Quick)`                          |
| Quick Settlement Name            | `Oracle: Quick Settlement Name`            | `Oracle: Quick Settlement Name`                            |
| Character Role                   | `Oracle: Character Role`                   | `Oracle: Character Role`                                   |
| Character Goal                   | `Oracle: Character Goal`                   | `Oracle: Character Goal`                                   |
| Character Descriptor             | `Oracle: Character Descriptor`             | `Oracle: Character Descriptor`                             |
| Ironlander Name (Female)         | `Oracle: Ironlander Name (Female)`         | `Oracle: Ironlander Name (Female)`                         |
| Ironlander Name (Male)           | `Oracle: Ironlander Name (Male)`           | `Oracle: Ironlander Name (Male)`                           |
| Elf Name                         | `Oracle: Elf Name`                         | `Oracle: Elf Name`                                         |
| Giant/Varou/Troll Name           | `Oracle: Giant/Varou/Troll Name`           | `Oracle: Giant/Varou/Troll Name`                           |
| Combat Action                    | `Oracle: Combat Action`                    | `Oracle: Combat Action`                                    |
| Pay the Price                    | `Oracle: Pay the Price`                    | `Oracle: Pay the Price`                                    |
| Magic                            | `Oracle: Magic`                            | `Oracle: Magic`                                            |
| Trap Type                        | `Oracle: Trap Type`                        | `Oracle: Trap Type`                                        |
| Trap Complexity                  | `Oracle: Trap Complexity`                  | `Oracle: Trap Complexity`                                  |
| Delve the Depths Weak Hit Oracle | `Oracle: Delve the Depths Weak Hit Oracle` | `Oracle: Delve the Depths Weak Hit Oracle ({stat} column)` |
| Feature (Site Themes/Domains)    | `Oracle: Feature`                          | `Oracle: {site} — Feature`                                 |
| Danger (Site Themes/Domains)     | `Oracle: Danger`                           | `Oracle: {site} — Danger`                                  |
| Denizen (Site)                   | `Oracle: Denizen`                          | `Oracle: {site} — Denizen`                                 |
| _(YRT oracles)_                  | `Oracle: {oracle name}`                    | `Oracle: {oracle name}`                                    |

---

## Notes

- The `—` separator between `{character}` and the move label is the current convention. Consider whether to keep it for all titles or switch fully to natural-language sentences (e.g. "Hellion Skyfather delved the depths…").
- Variables that are unavailable at roll time (e.g. `{site}` when no expedition is active) should fall back gracefully — either omitting the segment or substituting a default like "unknown site".
- This file is a planning document only. No code reads it directly.
