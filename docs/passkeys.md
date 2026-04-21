# Passkeys

WebAuthn-based second sign-in method alongside email + password. Users enrol one or more passkeys (phone biometric, laptop fingerprint, hardware key, browser-synced cloud passkey) and can then sign in with a single tap — no password, phishing-resistant.

Passkey sign-in authenticates an **existing** account; it does not create one. Registration lock and the daily signup quota therefore don't apply to passkey logins, only to the initial password-based registration (or to social sign-in when that ships).

---

## Storage

`webauthn_credentials` (migration `0012_webauthn_credentials.sql`):

| column | type | notes |
|---|---|---|
| `id` | uuid pk | row id |
| `user_id` | uuid fk users | `ON DELETE CASCADE` |
| `credential_id` | bytea unique | the public id the authenticator sends on sign-in |
| `public_key` | bytea | CBOR-encoded |
| `counter` | bigint | clone-detection counter |
| `transports` | text[] | hint array: `internal`, `usb`, `ble`, `nfc`, `hybrid` |
| `label` | text | user-supplied — "MacBook fingerprint" |
| `created_at` / `last_used_at` | timestamptz | |

Admin-only table (`GRANT ALL ON webauthn_credentials TO app_admin`). Pre-auth lookups (during sign-in) go through `adminDb`, mirroring the refresh-token pattern.

---

## Flows

Redis challenges carry a 5-minute TTL:
- `webauthn:challenge:reg:{userId}` — enrol challenge
- `webauthn:challenge:auth:{sessionId}` — sign-in challenge

### Enrol (authenticated user, in Settings)

1. `POST /api/v1/auth/passkey/register/challenge` — server issues options via `@simplewebauthn/server`; challenge cached in Redis keyed by user id.
2. Browser calls `navigator.credentials.create()` via `@simplewebauthn/browser`'s `startRegistration`.
3. `POST /api/v1/auth/passkey/register/verify` with the attestation — server verifies against cached challenge, stores credential + optional label.

### Sign in (public, from `/login`)

1. `POST /api/v1/auth/passkey/login/challenge` — server issues options with empty `allowCredentials` (discoverable-credential flow). Returns `{ session, options }`.
2. Browser calls `navigator.credentials.get()` — the user picks which passkey to present.
3. `POST /api/v1/auth/passkey/login/verify` with `{ session, response }` — server looks up credential by its id, verifies the signature, bumps counter + last-used, issues JWT + refresh-token family identical to password login.

Same rate-limit bucket as password login (`RATE_LIMIT_LOGIN`).

### Manage

- `GET    /api/v1/auth/passkey/credentials` — list current user's passkeys
- `DELETE /api/v1/auth/passkey/credentials/:id` — revoke (ownership enforced in service, not just by auth)

---

## RP config

Relying-party identifier is derived from `APP_URL` at module load:

```ts
const appUrl = new URL(config.APP_URL);
const RP_ID  = appUrl.hostname;    // 'iron-ledger.org'
const ORIGIN = appUrl.origin;      // 'https://iron-ledger.org'
```

If the site ever moves to a subdomain strategy, set `RP_ID` to the parent domain explicitly so passkeys enrolled on `www.iron-ledger.org` also work on `app.iron-ledger.org`.

---

## Client integration

`apps/web/src/lib/passkey.ts` wraps `@simplewebauthn/browser`:

```ts
await enrolPasskey(label?)        // Settings "Add a passkey" button
await signInWithPasskey()         // login page button
await listPasskeys()              // Settings section
await removePasskey(id)           // Settings revoke button
isPasskeySupported()              // detects navigator.credentials availability
```

The login page shows a "Sign in with a passkey" button below the password form when the browser advertises WebAuthn support. Silently hidden otherwise.

---

## Audit events

- `passkey_registered` — enrolment
- `passkey_revoked` — deletion
- `passkey_login` — successful sign-in

Written via `logSecurityEvent`, visible in Admin → Audit.

---

## Testing

Playwright can't drive the native passkey prompt without Chromium's virtual authenticator, which requires extra setup. The service layer is tested via unit tests (mock the `@simplewebauthn/server` return values) rather than end-to-end.
