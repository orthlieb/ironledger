# Admin Panel

The Admin tab is visible only to users whose `role` is `admin`. It surfaces user management, system stats, log viewing, maintenance mode, and registration lock — all of which are also enforced server-side regardless of UI state.

There is no self-registration path to admin. The seed script (`npm run seed --workspace=apps/api`) creates the initial admin account; further admins must be promoted by an existing admin.

---

## Access Control

- **Route:** `apps/web/src/routes/admin/+page.svelte` (also reachable via the Admin tab on `/home`)
- **API prefix:** `/api/v1/admin/...`
- **Middleware:** every endpoint chains `authenticate` → `requireAdmin`. The latter rejects with 403 for non-admin tokens; absent or expired tokens return 401.
- **Tab visibility:** the Admin tab in `routes/home/+page.svelte` is conditionally rendered on `data.user.role === 'admin'`. Hiding the tab is cosmetic — direct API calls without admin role are still rejected.

---

## API Endpoints

`apps/api/src/routes/admin.ts`. Every route is `authenticate` + `requireAdmin`.

| Method | Path | Purpose |
|---|---|---|
| GET    | `/api/v1/admin/`                          | List all users (paginated) |
| GET    | `/api/v1/admin/stats`                     | System stats (user counts, session counts, audit count) |
| GET    | `/api/v1/admin/stats/timeseries`          | Time-series data; `?timeframe=1hr\|1day\|7day\|30day` |
| DELETE | `/api/v1/admin/users/:id`                 | Delete user + all associated data |
| PATCH  | `/api/v1/admin/users/:id/role`            | Change role (`{ "role": "user" \| "admin" }`) |
| PATCH  | `/api/v1/admin/users/:id/suspend`         | Suspend / unsuspend (`{ "suspended": boolean }`) |
| GET    | `/api/v1/admin/audit`                     | Recent audit log entries; `?search=...` |
| DELETE | `/api/v1/admin/audit`                     | Clear the audit log |
| GET    | `/api/v1/admin/logs`                      | Tail PM2 log file; `?file=api-out\|api-error\|web-out\|web-error&lines=1..2000` |
| POST   | `/api/v1/admin/maintenance`               | Enable maintenance (`{ "message", "minutesUntilShutdown": 0..1440 }`) |
| DELETE | `/api/v1/admin/maintenance`               | Disable maintenance |
| GET    | `/api/v1/admin/maintenance/status`        | Current status (used by the global banner poller too) |
| POST   | `/api/v1/admin/registration-lock`         | Lock registration (`{ "message" }`) |
| DELETE | `/api/v1/admin/registration-lock`         | Unlock registration |
| GET    | `/api/v1/admin/registration-lock/status`  | Current lock status |

---

## Tabs

The admin panel has four sub-tabs.

### Users

A sortable, paginated table of every user.

- **Columns:** email, name, role, suspended flag, created-at, last-login-at, action menu
- **Actions** (per user): promote to admin / demote to user, suspend / unsuspend, delete
- **Delete** removes the user and all their `user_data` rows (characters, expeditions, communities, NPCs, refresh tokens, security events). It is not reversible.

### Logs

Live PM2 log viewer.

- **Files:** `api-out`, `api-error`, `web-out`, `web-error` (read from `${config.LOG_DIR}/{file}.log`)
- **Tail size:** 1–2000 lines, default 200
- **Implementation:** `readFile()` + split-on-newline + slice. There is no streaming / WebSocket; the panel polls.
- **Filter:** client-side substring filter; expandable JSON rows when the line parses as JSON.

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
- A global countdown banner polls `/api/v1/admin/maintenance/status` every 10s and renders for all users.
- Login is blocked for non-admin users.
- Admins can still log in (admin bypass) so they can disable maintenance.

When **disabled**, the keys are deleted and the banner clears on next poll.

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

The Audit tab in the panel is a paginated, searchable view of the last 100 events. Clearing the audit log is itself an audit-log entry (recorded after the truncate).

---

## Operational Notes

- **Initial admin:** created by `npm run seed --workspace=apps/api`. Default credentials are listed in the README's *Dev Credentials* table — change them on any deployed environment.
- **Promoting yourself:** there is no self-promote endpoint. If you lose all admin accounts, the recovery path is direct DB access: `UPDATE users SET role = 'admin' WHERE email = '...'`.
- **PM2 log rotation:** if `LOG_DIR` files are rotated out, the Logs tab will show "file not found"; `existsSync()` is checked before read. PM2's logrotate module is the recommended companion.
- **Redis dependency:** maintenance + registration-lock state both live in Redis. If Redis is down, the API treats both as "disabled" (fail-open), and the corresponding admin actions error out until Redis returns.

---

## Components

| Component | File | Purpose |
|---|---|---|
| Admin route | `apps/web/src/routes/admin/+page.svelte` | Top-level admin tab UI |
| Admin API | `apps/api/src/routes/admin.ts` | Endpoint definitions |
| Admin service | `apps/api/src/services/adminService.ts` | User CRUD + stats queries |
| Maintenance service | `apps/api/src/services/maintenanceService.ts` | Redis-backed maintenance state + token revocation |
| Registration lock service | `apps/api/src/services/registrationLockService.ts` | Redis-backed registration lock state |
| `requireAdmin` middleware | `apps/api/src/middleware/requireAdmin.js` | 403 guard chained after `authenticate` |
