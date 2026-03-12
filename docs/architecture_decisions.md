# Architecture Decisions — Iron Ledger Online

This document records every significant design decision made during the
architecture and implementation of the Iron Ledger online platform.
Each entry explains **what** was chosen, **why** it was chosen, and
**what was rejected** and why.

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Runtime and Framework](#2-runtime-and-framework)
3. [Frontend Strategy](#3-frontend-strategy)
4. [Database](#4-database)
5. [Multi-Tenancy](#5-multi-tenancy)
6. [Authentication](#6-authentication)
7. [Session Management](#7-session-management)
8. [Password Security](#8-password-security)
9. [CAPTCHA](#9-captcha)
10. [Email](#10-email)
11. [Password Breach Detection](#11-password-breach-detection)
12. [Input Validation](#12-input-validation)
13. [Rate Limiting](#13-rate-limiting)
14. [Security Headers](#14-security-headers)
15. [Logging](#15-logging)
16. [ORM and Migrations](#16-orm-and-migrations)
17. [Configuration Management](#17-configuration-management)
18. [Testing Strategy](#18-testing-strategy)
19. [Deployment](#19-deployment)
20. [Secrets Management](#20-secrets-management)
21. [Backups](#21-backups)
22. [Error Handling](#22-error-handling)
23. [Audit Trail](#23-audit-trail)

---

## 1. Project Structure

**Decision:** npm workspaces monorepo with `apps/api`, `apps/web`, and `packages/shared`.

**Why:** The API and web frontend are separate deployable units but share TypeScript
types (e.g. `CharacterData`, API response shapes). A monorepo lets both apps import
from `@ironledger/shared` without publishing to npm or copy-pasting types.
npm workspaces is built into npm — no third-party tool (Turborepo, Nx, Lerna) required.

**Rejected:**
- **Separate repositories** — types would drift out of sync between API and frontend.
- **Turborepo/Nx** — adds complexity and build caching that isn't needed at this scale.

---

## 2. Runtime and Framework

**Decision:** Node.js 22 (LTS) + TypeScript 5 + Fastify 5.

**Why:**
- Node.js 22 is the current LTS with full ES2022+ support and native ESM.
- Fastify is faster than Express (~3× throughput in benchmarks), has native
  TypeScript support, schema-based validation built in, and a mature plugin ecosystem.
- TypeScript catches entire classes of bugs at compile time — null checks, type
  mismatches, missing properties — that would only surface at runtime in plain JS.

**Rejected:**
- **Express** — slower, no built-in validation, TypeScript support is bolted on.
- **Hono / Elysia** — newer, less proven in production, smaller ecosystems.
- **Next.js API routes** — overengineered for a dedicated API server; mixes
  frontend and backend concerns.
- **Bun** — immature for production use at this scale; Node 22 is faster than
  Bun on I/O-bound workloads anyway.

---

## 3. Frontend Strategy

**Decision:** Keep the existing vanilla JS single-file app. Replace localStorage
persistence with API calls. No framework rewrite.

**Why:** The existing Iron Ledger app is already a clean, well-structured vanilla JS
SPA. Rewriting it in React or Vue would provide no user-visible benefit while adding
weeks of work and a significant bundle size increase. The existing build pipeline
(`build.js`) continues to assemble and minify the frontend.

**Rejected:**
- **React** — no benefit for this app's interaction model; adds ~150KB to the bundle.
- **Vue / Svelte** — same reasoning.
- **HTMX** — interesting but would require restructuring the existing UI significantly.

---

## 4. Database

**Decision:** PostgreSQL 16, installed natively on the production server.

**Why:** PostgreSQL is the most capable open-source relational database.
Specifically chosen features:
- **JSONB** — stores semi-structured character data without requiring a migration
  every time the game rules change.
- **Row-Level Security (RLS)** — enforces tenant isolation at the database layer.
- **`pgcrypto`** — `gen_random_uuid()` for UUID primary keys.
- **TIMESTAMPTZ** — all timestamps stored in UTC, eliminating timezone bugs.

Installed natively (not in Docker) on the production VPS for simpler operation,
better performance, and easier `pg_dump` backup integration.

**Rejected:**
- **MySQL / MariaDB** — no RLS, weaker JSONB support.
- **MongoDB** — JSONB in PostgreSQL provides the same flexibility with the
  integrity guarantees of a relational database.
- **SQLite** — not suitable for multi-user concurrent writes.
- **PlanetScale / Neon / Supabase** — managed services add cost and a third-party
  dependency; a €12/month VPS covers the whole stack.

---

## 5. Multi-Tenancy

**Decision:** Row-Level Security (RLS) with a single shared schema.

**Why:** Each user is effectively their own tenant. RLS enforces isolation at the
PostgreSQL layer — even a SQL injection attack that bypasses the ORM cannot read
another user's data because the database policy rejects it. Every query that touches
user data goes through `withUserContext(userId)`, which sets `app.user_id` as a
transaction-local PostgreSQL setting checked by all RLS policies.

Two database roles:
- `app_user` — subject to RLS, used by the API server.
- `app_admin` — bypasses RLS, used only by migration scripts.

**Rejected:**
- **Schema-per-tenant** — overkill for personal game data; complicates migrations
  and connection pooling significantly.
- **Database-per-tenant** — extreme isolation with extreme operational cost.
- **Application-level filtering only** — a single bug in a WHERE clause could
  expose cross-tenant data. RLS provides a second enforcement layer.

---

## 6. Authentication

**Decision:** Email + password, with email verification required before first login.

**Why:** The most universally accessible authentication method. No phone required
(SMS 2FA has SIM-swap risks and excludes users without phones). Email verification
prevents throwaway registrations and ensures a working contact address.

**Future:** TOTP (time-based one-time passwords via an authenticator app) can be
added as an optional second factor without changing the core auth flow.

**Rejected:**
- **Magic link (passwordless)** — every login requires email access; impractical
  for frequent use.
- **OAuth only (Sign in with Google)** — excludes users without Google/GitHub
  accounts; adds a third-party dependency.
- **SMS 2FA** — SIM-swap vulnerability; requires a phone number.

---

## 7. Session Management

**Decision:** Short-lived JWT access tokens (RS256, 15 min) + long-lived opaque
refresh tokens (30 days, stored hashed in DB, rotated on every use).

**Why:**
- **RS256 (asymmetric)** over HS256 (symmetric): the private key signs tokens,
  the public key verifies them. A second service can verify tokens without the
  ability to create them.
- **15-minute access token TTL**: limits the window a stolen token is usable.
- **HttpOnly cookie for refresh token**: JavaScript cannot read it, eliminating
  XSS token theft.
- **`SameSite=Strict`**: cookie not sent on cross-site requests, preventing CSRF
  without an explicit CSRF token.
- **`path=/api/v1/auth`**: refresh cookie only sent to auth routes — not to
  character or catalogue endpoints.
- **Stateful refresh tokens**: unlike JWTs, refresh tokens can be revoked. A
  compromised refresh token can be invalidated immediately.
- **Token family theft detection**: all rotated tokens from a login share a
  `familyId`. Presenting a revoked token revokes the entire family, detecting
  and containing refresh token theft.

**Rejected:**
- **JWT in localStorage** — readable by JavaScript; stolen by any XSS.
- **Session cookies only** — requires server-side session store for every
  request; harder to scale.
- **HS256** — shared secret can create tokens; RS256 separates signing from
  verification.
- **Non-rotating refresh tokens** — a stolen token is usable indefinitely.

---

## 8. Password Security

**Decision:** Argon2id with OWASP 2024 parameters (memoryCost: 19456, timeCost: 2).

**Why:** Argon2id is the winner of the Password Hashing Competition and the
current OWASP recommendation. It is memory-hard, making GPU-based cracking
expensive. The parameters produce ~50ms per hash on modest hardware — acceptable
latency for login, brutal for offline attacks.

Passwords are additionally checked against HaveIBeenPwned's breach database
at registration and reset time (see §11).

**Rejected:**
- **bcrypt** — CPU-hard but not memory-hard; GPUs can crack bcrypt much faster
  than Argon2id.
- **scrypt** — also acceptable, but Argon2id is the current recommendation.
- **PBKDF2** — weakest of the acceptable options; OWASP requires very high
  iteration counts to compensate.
- **MD5 / SHA-256 directly** — never acceptable for passwords.

---

## 9. CAPTCHA

**Decision:** hCaptcha.

**Why:** Drop-in replacement for reCAPTCHA. Privacy-respecting (GDPR-friendly,
no Google dependency). Accessible challenge fallbacks. Free tier covers
reasonable traffic. The server-side secret key is used for verification —
the client token is always verified server-side (never trusted client-side).

Local development uses hCaptcha's published test secret
(`0x0000000000000000000000000000000000000000`) which always passes.

**Failed-closed:** if the hCaptcha verification API is unreachable, the request
is rejected. A CAPTCHA that degrades open is no CAPTCHA.

**Rejected:**
- **reCAPTCHA v3** — privacy concerns, Google dependency, scoring is opaque.
- **No CAPTCHA** — registration and login endpoints are primary targets for
  credential stuffing and spam registration bots.

---

## 10. Email

**Decision:** Resend (primary) with IONOS SMTP as fallback, configurable via
`EMAIL_PROVIDER` environment variable.

**Why:** Resend has excellent deliverability, a simple API, and a generous free tier.
IONOS SMTP is available as a fallback since we're already hosting on IONOS —
no additional account needed. The mailer abstraction in `lib/mailer.ts` routes
to whichever provider is configured, with no changes required in the rest of the code.

All emails include both HTML and plain-text versions. Plain-text fallbacks improve
deliverability (spam filters trust emails with both) and support accessibility tools.

**Rejected:**
- **SendGrid** — more expensive, more complex.
- **AWS SES** — adds AWS dependency; IONOS SMTP is simpler at this scale.
- **Nodemailer direct to recipient** — poor deliverability; IP reputation issues.

---

## 11. Password Breach Detection

**Decision:** HaveIBeenPwned Pwned Passwords API with k-anonymity model.

**Why:** The HIBP k-anonymity model sends only the first 5 characters of the
SHA-1 hash to HIBP's servers. HIBP returns all hashes with that prefix; we
check locally whether the full hash appears. The actual password — or its full
hash — never leaves the server. HIBP cannot determine which password was checked.

**Failed-open:** if HIBP is unreachable, registration proceeds. Unlike CAPTCHA,
HIBP is a quality check, not a security gate. A strong unique password that
happens not to be reachable from HIBP is still acceptable.

The `Add-Padding: true` header is sent to prevent traffic analysis via
response size (different prefixes return different numbers of hashes; padding
normalises the response size).

**Rejected:**
- **Client-side checking** — the password would have to leave the client in cleartext.
- **Maintaining a local breach list** — the HIBP dataset is hundreds of GB;
  impractical to self-host and keep current.

---

## 12. Input Validation

**Decision:** Zod for all request bodies, parameters, and environment variables.

**Why:** Zod provides TypeScript-native runtime validation with excellent error
messages. The same schema that validates input also produces the TypeScript type
— no duplication between runtime checks and type annotations. Fastify's AJV is
used for schema-level stripping (`removeAdditional: 'all'`) to prevent
mass-assignment attacks.

**Rejected:**
- **Joi** — not TypeScript-native; verbose.
- **Yup** — slower than Zod; less ergonomic TypeScript integration.
- **Manual validation** — error-prone, inconsistent.

---

## 13. Rate Limiting

**Decision:** `@fastify/rate-limit` backed by Redis, with per-route overrides
for sensitive endpoints.

**Why:** Redis-backed rate limiting survives process restarts and works correctly
with multiple PM2 workers. In-memory rate limiting would be per-process — a
client could bypass it by hitting different workers in round-robin.

Limits:
- Login: 5 requests per 15 minutes per IP
- Register: 3 requests per hour per IP
- Global: 120 requests per minute per user (or IP if unauthenticated)

The key generator prefers authenticated user ID over IP — shared IPs (office
NAT, mobile carrier NAT) don't cause legitimate users to be blocked by others
on the same network.

---

## 14. Security Headers

**Decision:** `@fastify/helmet` with a strict Content-Security-Policy.

**Why:** Helmet sets all recommended security headers in one registration call.
The CSP is tuned for this application: `'self'` for all resources, with
explicit allowances for hCaptcha's CDN domains (scripts, frames, and connections).

Key headers:
- `Content-Security-Policy` — prevents XSS by whitelisting script sources.
- `Strict-Transport-Security` — forces HTTPS for 2 years, including subdomains.
- `X-Frame-Options: DENY` — prevents clickjacking.
- `X-Content-Type-Options: nosniff` — prevents MIME sniffing.
- `Referrer-Policy: strict-origin-when-cross-origin` — limits referrer leakage.

---

## 15. Logging

**Decision:** Pino (structured JSON in production, pretty-printed in development).

**Why:** Fastify uses Pino internally. Pino is the fastest Node.js logger —
it serializes to JSON asynchronously to avoid blocking the event loop. In
production, raw JSON is output to stdout for ingestion by log aggregators
(Grafana Loki, Datadog, etc.). In development, `pino-pretty` formats logs
for human readability.

Sensitive data (passwords, tokens) is never logged. The error handler logs
the full error server-side but returns a generic message to clients in
production.

---

## 16. ORM and Migrations

**Decision:** Drizzle ORM + plain SQL migration files.

**Why:** Drizzle is SQL-first — queries look like SQL, not magic. This makes
it easy to reason about what queries are actually executed, optimise them,
and apply RLS correctly. Migration files are plain SQL, checked into git,
run in order by the migration runner. Drizzle-kit generates the SQL from
schema changes; the files are reviewed before committing.

Migrations are always **additive** — no destructive changes in a single deploy.
A column to be dropped is first made nullable (deploy 1), then removed after
the code no longer references it (deploy 2). This allows zero-downtime deploys.

**Rejected:**
- **Prisma** — heavy generated client, difficult to use RLS correctly, slower
  query performance in benchmarks.
- **TypeORM** — decorator-based, complex, poor ESM support.
- **Raw SQL throughout** — no type safety at the query level.

---

## 17. Configuration Management

**Decision:** All environment variables declared, typed, and validated in
`config.ts` using Zod. The app crashes at startup with a clear error message
if any required variable is missing or malformed.

**Why:** Fail-fast at startup is vastly preferable to mysterious runtime errors
hours later when a specific code path is first hit. A single `config` object
is the only place `process.env` is read — everywhere else imports from
`config.ts`. This makes the full configuration surface visible in one file
and ensures TypeScript types flow through the application correctly.

Cross-field validation (e.g. "if EMAIL_PROVIDER=smtp then SMTP_HOST is required")
is handled by Zod refinements on the full config object.

---

## 18. Testing Strategy

**Decision:** Three-tier testing with Vitest: unit → integration → e2e.

**Tiers:**
- **Unit** — pure logic, no I/O. Test token generation, hashing, validation
  schemas, utility functions. Run in milliseconds. External dependencies mocked.
- **Integration** — real PostgreSQL database, external services mocked.
  Tests the auth and character service business logic against actual SQL and RLS.
  Runs sequentially to avoid DB conflicts.
- **E2E** — full HTTP pipeline via Fastify `inject()`. Tests routes, middleware,
  cookie handling, status codes, and error responses. No real TCP socket needed.

**Why Vitest over Jest:** Vitest is configuration-compatible with Vite, has native
ESM support (no transform needed), and is significantly faster than Jest for
TypeScript projects. The `vi.mock()` API is identical to `jest.mock()`.

**Why `inject()` over supertest:** Fastify's built-in injection is faster, requires
no open port, has no socket lifecycle to manage, and handles cookies and headers
identically to real HTTP.

Coverage thresholds enforced in CI: 80% lines, 80% functions, 75% branches.

---

## 19. Deployment

**Decision:** Single IONOS VPS, Node.js installed natively, PM2 for process
management, Nginx as reverse proxy, Certbot for TLS.

**Why:** Simple, auditable, low cost (~€12/month). No container registry, no
orchestration platform, no managed Kubernetes. The full stack runs on one machine
which is more than adequate for a hobbyist RPG tracker. PM2 provides zero-downtime
restarts, automatic crash recovery, and log rotation.

Deploy process:
1. GitHub Actions runs tests on every PR.
2. Merge to `main` triggers the deploy workflow.
3. The workflow SSHs to the server, runs `git pull`, `npm ci`, `npm run build`,
   `npm run migrate`, then `pm2 reload` (zero-downtime rolling restart).
4. A health check (`/health`) is polled after deploy; the workflow fails and
   alerts if it doesn't return 200 within 30 seconds.

**Rejected:**
- **Docker in production** — adds overhead and complexity on a single VPS.
- **Serverless / Lambda** — cold start latency is unacceptable for an interactive app.
- **Managed database (Supabase, Neon)** — adds cost and a third-party dependency.

---

## 20. Secrets Management

**Decision:** Environment variables in a `chmod 600 .env` file on the server,
loaded by PM2's `ecosystem.config.js`. Never committed to git.

**Why:** At this scale, a properly locked `.env` file on the server is appropriate.
The file is owned by the app user (`ironledger:ironledger`), readable only by
that user, and not accessible to other OS users or web processes.

`.env.example` (with placeholder values) is committed to git so developers
know which variables to populate.

**Future:** If the project grows or multiple team members need access, migrate
to HashiCorp Vault or AWS Secrets Manager.

**Rejected:**
- **Hardcoded values** — never acceptable.
- **Committed `.env`** — the most common cause of credential leaks.
- **AWS Secrets Manager now** — adds AWS dependency and cost for a single-server setup.

---

## 21. Backups

**Decision:** Daily `pg_dump` piped to gzip, uploaded to IONOS Object Storage
(S3-compatible), with 30-day retention.

**Why:** IONOS Object Storage is S3-compatible and cheap. `pg_dump` produces a
consistent snapshot without locking the database. The backup script runs via
cron at 3am daily. Backups older than 30 days are pruned automatically.

The backup script uses `s3cmd` with IONOS-specific endpoints. The S3 credentials
are stored in the app user's environment — separate from the database credentials.

---

## 22. Error Handling

**Decision:** Domain errors in the service layer (typed `AuthError`, `CharacterError`
with `statusCode` and `code` properties); HTTP mapping in the route layer;
global catch-all in the Fastify error handler.

**Why:** Services must be independently testable without an HTTP server. By throwing
typed domain errors, services express failure clearly without coupling to HTTP.
The route layer maps domain errors to status codes; the global error handler catches
anything unexpected.

In production, 500 errors return `"An unexpected error occurred"` — stack traces
and internal details are logged server-side only. This prevents information leakage
to attackers.

---

## 23. Audit Trail

**Decision:** `security_events` table — append-only, `app_user` can INSERT but
not SELECT, UPDATE, or DELETE.

**Why:** Security events (login attempts, password resets, token theft detection)
must be tamper-proof. Even if the API is fully compromised, an attacker cannot
erase their tracks because `app_user` has no DELETE permission on the table.
The table intentionally has no foreign key on `user_id` so events are preserved
even if the user account is deleted.

Events are read and archived by `app_admin` scripts only, not via the API.

---

*Document last updated during initial project scaffolding (Layer 8).*
*Update this document whenever a significant decision is made or revisited.*
