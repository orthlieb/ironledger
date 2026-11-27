# Admin Panel

The Admin tab is visible only to users whose `role` is `admin`. It surfaces user management, system stats, log viewing, maintenance mode, and registration lock — all of which are also enforced server-side regardless of UI state.

There is no self-registration path to admin. The seed script (`npm run seed --workspace=apps/api`) creates the initial admin account; further admins must be promoted by an existing admin.

---

## Access Control

- **Route:** `apps/web/src/routes/admin/+page.svelte` — a dedicated `/admin` page. Non-admins and unauthenticated users are redirected out by `+page.server.ts`.
- **API prefix:** `/api/v1/admin/...`
- **Middleware:** every endpoint chains `authenticate` → `requireAdmin`. The latter rejects with 403 for non-admin tokens; absent or expired tokens return 401.
- **Reachability:** admins navigate directly via the **Admin** link in the top nav (shown only when `data.user.role === 'admin'`). There is no Admin tab inside `/home` — it was removed to eliminate a duplicate-UI drift bug.

---

## API Endpoints

`apps/api/src/routes/admin.ts`. Every route is `authenticate` + `requireAdmin`.

| Method | Path                                     | Purpose                                                                         |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------------- |
| GET    | `/api/v1/admin/`                         | List all users (paginated)                                                      |
| GET    | `/api/v1/admin/stats`                    | System stats (user counts, session counts, audit count)                         |
| GET    | `/api/v1/admin/stats/timeseries`         | Time-series data; `?timeframe=1hr\|1day\|7day\|30day`                           |
| DELETE | `/api/v1/admin/users/:id`                | Delete user + all associated data                                               |
| PATCH  | `/api/v1/admin/users/:id/role`           | Change role (`{ "role": "user" \| "admin" }`)                                   |
| PATCH  | `/api/v1/admin/users/:id/suspend`        | Suspend / unsuspend (`{ "suspended": boolean }`)                                |
| GET    | `/api/v1/admin/audit`                    | Recent audit log entries; `?search=...`                                         |
| DELETE | `/api/v1/admin/audit`                    | Clear the audit log                                                             |
| GET    | `/api/v1/admin/logs`                     | Tail PM2 log file; `?file=api-out\|api-error\|web-out\|web-error&lines=1..2000` |
| DELETE | `/api/v1/admin/logs`                     | Truncate one PM2 log file to zero bytes; `?file=…` (whitelisted, `fs.truncate`) |
| POST   | `/api/v1/admin/maintenance`              | Enable maintenance (`{ "message", "minutesUntilShutdown": 0..1440 }`)           |
| DELETE | `/api/v1/admin/maintenance`              | Disable maintenance                                                             |
| GET    | `/api/v1/admin/maintenance/status`       | Current status (used by the global banner poller too)                           |
| POST   | `/api/v1/admin/registration-lock`        | Lock registration (`{ "message" }`)                                             |
| DELETE | `/api/v1/admin/registration-lock`        | Unlock registration                                                             |
| GET    | `/api/v1/admin/registration-lock/status` | Current lock status                                                             |

---

## Tabs

The admin panel has four tabs — **Users**, **Invites**, **Logs**, and **Tools**. (The Maintenance, Registration-lock, and Broadcast controls described below are tiles inside the **Tools** tab, not separate tabs.)

### Users

A sortable, paginated list of every user, 25 to a page.

- **Wide screens (1100px and up):** a table with email, display name, role, an active dot, last login, created, and counts of characters, encounters and expeditions. Click a column heading to sort by it; click again to reverse.
- **Narrower screens (tablets and phones):** a grid of cards, one per user, with the same facts and buttons. A sort picker and an ▲ / ▼ button above them stand in for the headings.
- **Actions** (per user): promote to admin / demote to user, suspend / unsuspend, clear game data, delete. Every one but demote asks first in a confirmation (`ConfirmDialog`); you can't demote the last admin or suspend yourself. While a user's data is being cleared, their **Clear data** button reads _Clearing…_.
- **Clear data** wipes the user's game data (characters, connections, expeditions, foes, maps and markers, the log, portraits) and keeps the account.
- **Delete** removes the user and all their `user_data` rows (characters, expeditions, communities, NPCs, refresh tokens, security events). It is not reversible.

### Logs

Live PM2 log viewer.

- **Files:** `api-out`, `api-error`, `web-out`, `web-error` (read from `${config.LOG_DIR}/{file}.log`)
- **Tail size:** 1–2000 lines, default 200
- **Implementation:** `readFile()` + split-on-newline + slice. There is no streaming / WebSocket; the panel polls.
- **Filter:** client-side substring filter; expandable JSON rows when the line parses as JSON.
- **Clear:** the toolbar's **Clear** button (disabled while the file is empty or unavailable) opens a confirm dialog naming the file; a failure shows in the page's error bar. Then `DELETE /api/v1/admin/logs?file=` truncates it to zero bytes via `fs.truncate` — keeps PM2's open file handle valid so the next write appends to the empty file. Logged as an `admin_clear_log` security event.

### Maintenance

Enable / disable maintenance mode. State lives in **Redis** (shared across horizontally scaled API instances):

```
maintenance:enabled     "1" when active
maintenance:message     admin-provided message string
maintenance:shutdownAt  ISO timestamp when the system is expected to go down
```

When **enabled** (`maintenanceService.enableMaintenance`):

1. Sets all three keys via a Redis pipeline.
2. Revokes every active refresh token by setting `refresh_tokens.revoked_at = now()` for non-admin users — so they get logged out the moment their access token (15 min) expires.
3. Audit-logs the event.

When active:

- A global countdown banner renders for all users. Every open tab checks
  `/api/v1/system/status` (maintenance and broadcast together) once a
  minute while it's visible, at once when it's shown again, and not while
  it's hidden. So a warning can take up to a minute to appear: schedule a
  shutdown a few minutes ahead. Once a tab has the shutdown time it counts
  down and logs the user out on its own.
- Login is blocked for non-admin users.
- Admins can still log in (admin bypass) so they can disable maintenance.

When **disabled**, the keys are deleted and the banner clears on each tab's next check.

### Registration

Locks new account creation **without** triggering full maintenance mode. Two Redis keys:

```
registration:locked   "1" when locked
registration:message  admin-provided message string
```

When locked:

- `POST /api/v1/auth/register` returns the locked message instead of creating the account.
- The `/register` page detects the lock state on load and replaces the form with the message and a link to sign in.
- Existing users are unaffected — sign-in, refresh, and all session endpoints continue to work.

This is the right tool when you need to pause growth (e.g. data-import window, bot wave) without kicking everyone offline.

---

## Audit Log

Every admin action is recorded in `security_events` (Drizzle table in `apps/api/src/db/schema.ts`):

- Actor user ID + IP
- Event type (`role_change`, `user_delete`, `user_suspend`, `maintenance_enabled`, `maintenance_disabled`, `registration_locked`, `registration_unlocked`, etc.)
- Target (when applicable)
- Timestamp
- Free-form JSON details

The audit-log view is a paginated, searchable view of the last 100 events. Clearing the audit log is itself an audit-log entry (recorded after the truncate).

**Retention: 90 days.** The table holds IP addresses, user agents and (for sign-in and reset events) email addresses, so every API process prunes rows older than `SECURITY_LOG_RETENTION_DAYS` at start-up and then daily (`apps/api/src/services/retentionService.ts`). The privacy notice (`/privacy`) states the 90 days; change both together. Admin-action rows age out the same way.

---

## Players deleting their own accounts

☰ → Settings → Account → **Delete my account** asks for the password again, then `POST /api/v1/auth/delete-account` deletes the `users` row; every table of theirs cascades from it, and invitations sent to their address are deleted too. The browser is signed out and lands on `/login?deleted=1`. An `account_deleted` event is logged with the old user id only.

An **admin** account can't delete itself this way (`ADMIN_ACCOUNT`), so the site can't lose its last admin by accident: another admin removes the role first. Deleted data lingers in the nightly backups until they age out (`RETAIN_DAYS=30` in `infra/scripts/backup.sh`), which the privacy notice also states.

---

## Operational Notes

- **Initial admin:** created by `npm run seed --workspace=apps/api`. Default credentials are listed in the README's _Dev Credentials_ table — change them on any deployed environment.
- **Promoting yourself:** there is no self-promote endpoint. If you lose all admin accounts, the recovery path is direct DB access: `UPDATE users SET role = 'admin' WHERE email = '...'`.
- **PM2 log rotation:** if `LOG_DIR` files are rotated out, the Logs tab will show "file not found"; `existsSync()` is checked before read. PM2's logrotate module is the recommended companion.
- **Redis dependency:** maintenance + registration-lock state both live in Redis. If Redis is down, the API treats both as "disabled" (fail-open), and the corresponding admin actions error out until Redis returns.

---

## Components

| Component                 | File                                               | Purpose                                           |
| ------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| Admin route               | `apps/web/src/routes/admin/+page.svelte`           | Page shell: first load, ErrorBar, tab bar         |
| Admin tabs                | `apps/web/src/lib/components/admin/`               | Stats + graph, one component per tab              |
| Log-line parser           | `apps/web/src/lib/adminLogs.ts`                    | Parses PM2 / pino log lines for the Logs tab      |
| Admin API                 | `apps/api/src/routes/admin.ts`                     | Endpoint definitions                              |
| Admin service             | `apps/api/src/services/adminService.ts`            | User CRUD + stats queries                         |
| Maintenance service       | `apps/api/src/services/maintenanceService.ts`      | Redis-backed maintenance state + token revocation |
| Registration lock service | `apps/api/src/services/registrationLockService.ts` | Redis-backed registration lock state              |
| `requireAdmin` middleware | `apps/api/src/middleware/requireAdmin.ts`          | 403 guard chained after `authenticate`            |
