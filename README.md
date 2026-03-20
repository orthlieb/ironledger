# Iron Ledger

Ironsworn TTRPG character tracker. Manage characters, track progress, roll moves, consult oracles, and run expeditions — all in a web-based interface with real-time state persistence.

* This was a first foray into using Claude to do all the coding. It's an experiment not a social commentary.
* That being said, the AI generated images for foes are slop, I'd be open to working with a willing artist to make these much nicer.
* I am not a designer, suggestions for improving the UI are most welcome.
* I have probably misintrepreted or missed a rule here or there, bug reports are definitely welcome.
* **Ironsworn and the Delve Expansion** are incredible RPGs, I highly encourage you to support [Shawn Tomkin](https://tomkinpress.com/) and purchase his work.

A final note: The YRT expansion that is referred to is a side project I'm working on set in a post-apocalyptic world where technology is indistinguishable from magic. 
I'm not ready to release anything yet but you can see some of the the workings in the Conclave spells, the use of mana, and some Oracles.

## Screenshot

![Adventure Tab](<docs/images/Iron Ledger Adventure Tab.png>)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | SvelteKit 2 + Svelte 5 (runes), adapter-node SSR |
| **API** | Fastify 5, TypeScript, Zod validation |
| **Database** | PostgreSQL 16 with Row-Level Security (Drizzle ORM) |
| **Cache** | Redis (Valkey) — rate limiting, maintenance mode |
| **Auth** | JWT RS256 (15-min access + 30-day rotating refresh tokens) |
| **Process** | PM2 (cluster mode for API, fork for web) |
| **Proxy** | Nginx with TLS (Let's Encrypt), rate limiting |

## Monorepo Structure

```
ironledger/
  apps/
    api/          Fastify REST API (port 3000)
    web/          SvelteKit frontend (port 5173 dev / 3001 prod)
  packages/
    shared/       Shared TypeScript types and game data
  infra/
    nginx/        Production Nginx config
    scripts/      Server setup, deploy, backup scripts
    docker/       Dev database containers
  docs/           Feature documentation
```

## Quick Start

### Prerequisites

- Node.js 22+
- PostgreSQL 16+ (or Docker)
- Redis 7+ (or Docker)

### Development Setup

```bash
# 1. Clone and install
git clone <repo-url> && cd ironledger
npm install

# 2. Start database services (Docker)
docker compose up -d
# Or use: ./infra/scripts/dev-db.sh up

# 3. Create .env from template
cp .env.example .env
# Edit .env — generate JWT keys with:
#   openssl genrsa -out private.pem 2048
#   openssl rsa -in private.pem -pubout -out public.pem

# 4. Run database migrations
npm run migrate

# 5. Seed development data (optional)
npm run seed --workspace=apps/api

# 6. Start dev servers (two terminals)
npm run dev       # API on :3000
npm run dev:web   # Web on :5173
```

### Dev Credentials

| Account | Email | Password |
|---------|-------|----------|
| Admin | `admin@ironledger.local` | `adminpassword123!` |
| User | `dev@ironledger.local` | `devpassword123!` |

## Features

### Character Management
- Create and manage Ironsworn characters
- Full character sheet with stats, tracks, assets, and vows
- Auto-save with 1500ms debounce

### Moves & Dice
- Complete Ironsworn move reference with picker grid
- Action, progress, and spell rolls with 3D animated dice
- Live roll formula display (e.g., `d6 + iron[3] + adds[+1] vs d10 & d10`) between spinners and roll button
- Data-driven progress routing: each progress move reads from the correct track (foe, journey, site, bonds, failures) via `progressSource` field
- Move precondition checking (disables moves with unmet requirements)
- Burn momentum to upgrade roll outcomes
- Clickable move cross-references in outcome text
- Strong Hit / Weak Hit / Miss outcomes shown in move detail view

### Oracles
- Oracle table consultation with random rolls
- Linked oracle chains

### Foes & Encounters
- Full foe catalogue from Ironsworn data
- Per-character encounter tracking with progress tracks
- Ranks 1-5 with progress mechanics

### Expeditions
- Journey and Delve Site expedition types
- Progress tracks with waypoint/room mechanics
- Delve tables for site exploration

### Session Log
- Persistent session log with interactive links
- Resource changes, moves, oracles, progress, initiative, debilities, menace links
- State-modifying links with strikethrough after click
- Auto-appended "Momentum: Burn Available" log entry when burn is possible on action roll results
- Cascade rules auto-append log entries on resource floor events:
  - **Overflow**: health/spirit drops below 0 → excess converts to momentum loss
  - **Floor**: supply hits 0 → "Supply: Exhausted" with Unprepared debility link; momentum hits −6 → note appended
  - **Floor overflow**: resource already at minimum → "Face a Setback", "Face Death", "Face Desolation", or "Out of Supply" entries with per-point clickable exchange links
- Export includes timestamps for each entry

### Initiative Tracking
- Per-character initiative badges (sword/shield icons) on GCB and character sheet
- Automatically clears when foe is deselected

### Admin Dashboard
- **Users tab** — sortable user table with pagination, role management (promote/demote), delete
- **Audit Log tab** — searchable event log, admin email attribution, event type coloring, clear log
- **Maintenance tab** — enable/disable maintenance mode with countdown, message, session revocation

### Maintenance Mode
- Redis-backed system maintenance state shared across instances
- Global countdown banner for all users (polls every 10s)
- Blocks non-admin logins during maintenance
- Revokes all refresh tokens to force logoff
- Admin bypass for login during maintenance
- Full audit logging of maintenance events

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API dev server |
| `npm run dev:web` | Start web dev server |
| `npm run build` | Build both API and web |
| `npm run test` | Run API test suite (vitest) |
| `npm run migrate` | Run database migrations |
| `npm run check:web` | TypeScript check for web |

## Deployment

See [docs/deployment.md](docs/deployment.md) for complete IONOS VPS deployment instructions including:
- One-time server provisioning
- Pushbutton CI/CD via GitHub Actions
- Manual deploy script with rollback
- Database backup strategy
- Horizontal scaling guide
- Maintenance mode workflow

## Documentation

Feature docs are in the `docs/` directory:

| Doc | Description |
|-----|-------------|
| [deployment.md](docs/deployment.md) | IONOS VPS deployment guide |
| [architecture_decisions.md](docs/architecture_decisions.md) | Architecture and design decisions |
| [character-sheet.md](docs/character-sheet.md) | Character sheet component |
| [global-context-bar.md](docs/global-context-bar.md) | GlobalContextBar tile layout |
| [moves.md](docs/moves.md) | Moves system and dice rolling |
| [foes.md](docs/foes.md) | Foes and encounters |
| [expeditions.md](docs/expeditions.md) | Expeditions system |
| [log.md](docs/log.md) | Session log with interactive links |
| [notes.md](docs/notes.md) | Notes dialog |
| [oracles.md](docs/oracles.md) | Oracle tables |
| [data_format.md](docs/data_format.md) | Character data format spec |
| [dice_rolling.md](docs/dice_rolling.md) | Dice rolling implementation |

## Security

- SSH key-only auth, UFW firewall, fail2ban
- HTTPS with HSTS, CSP, X-Frame-Options (Helmet + Nginx)
- Rate limiting at Nginx and API layers (Redis-backed)
- PostgreSQL Row-Level Security
- Argon2id password hashing (OWASP 2024)
- HaveIBeenPwned password checking
- hCaptcha on registration
- JWT RS256 with refresh token rotation and theft detection
- 64KB request body limit
