# Security review — November 2026

An OWASP Top 10 pass before opening public sign-ups. Three read-only reviews
(injection and XSS; access control and the BFF proxies; authentication,
crypto, logging and supply chain) and checks by hand. Each fix below has a test
that fails on the code before it.

## Fixed

| Finding                                                                                                                                                                                                                                                                      | Severity | Fix                                                                                                                                                                                                                                               | Test                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| BFF proxies built API URLs from decoded route parameters: an entity id of `../log` (from a shared backup) wiped the log, and `../../admin/users/<id>/role` carried an admin's token to the role endpoint.                                                                    | Critical | Every parameter encoded as one path segment (`pathSegment`); `apiFetch` refuses paths the URL parser would rewrite; the AI catch-all reaches only the AI routes; the importer replaces unsafe ids and the API refuses them on create.             | `proxy-paths.spec.ts`, `apiFetch.test.ts`, `security.test.ts` (entity ids)      |
| The web server didn't forward visitors' addresses, so every per-IP limit was one shared limit (after 10 sign-ups a day, the rest silently dropped); and `trustProxy: true` let a client choose its own address.                                                              | High     | `apiFetch` sends the visitor's address (from Nginx's `X-Real-IP`); Fastify trusts `X-Forwarded-For` only from loopback; the global limit counts per signed-in user. See [deployment.md → Client IP Addresses](deployment.md#client-ip-addresses). | `security.test.ts` (client address), `apiFetch.test.ts`, `rateLimitKey.test.ts` |
| Stored XSS: an imported character's stat could be markup, and the Moves dialog rendered it as HTML.                                                                                                                                                                          | High     | Import gives numbers and true/false values their types; the Moves dialog coerces too.                                                                                                                                                             | `import-xss.spec.ts`, `characterFields.test.ts`                                 |
| Pre-account takeover: verifying an email signed the clicker in, so someone who registered your address first, with their password, shared your account once you verified.                                                                                                    | High     | Verifying signs no one in, and is a button (not a GET); "Forgot password" works for unverified accounts and verifies them.                                                                                                                        | `auth.test.ts` (integration: pre-account takeover)                              |
| Five wrong passwords disabled any account, admins included, until an admin re-enabled it.                                                                                                                                                                                    | High     | A 15-minute lock per address _and_ IP, counted for unknown addresses too; the account itself is never touched.                                                                                                                                    | `auth.test.ts` (integration: failed sign-ins)                                   |
| Stored log HTML was parsed with `innerHTML` on page elements (Markdown export, Story dialog), which runs `<img onerror>`; spending a log link wrote its decoded text back unescaped; imported log HTML passed only a regex filter.                                           | Medium   | `inertBody` (DOMParser) for reading; the spent text is escaped; imports go through the DOMPurify allowlist the log is shown with.                                                                                                                 | `import-xss.spec.ts`                                                            |
| Several requests after the access token expired each refreshed with the same token; the API took the second as theft and revoked the session (random sign-outs).                                                                                                             | Medium   | One shared refresh per refresh token in `hooks.server.ts`.                                                                                                                                                                                        | `session-cookies.spec.ts`                                                       |
| Logging out never revoked the refresh token on the server; a session without "Remember me" became a 30-day cookie after its first refresh.                                                                                                                                   | Medium   | Logout passes the refresh token to the API; a `remember` cookie keeps the original lifetime on renewal.                                                                                                                                           | `session-cookies.spec.ts`                                                       |
| Smaller: raw error messages from the web server; the admin-typed name unescaped in the invite email; GCM tags shorter than 16 bytes accepted; invites skipped the password rule; Nginx locations dropped the security headers; spent tokens never pruned; `.gitignore` gaps. | Low      | Each fixed in place.                                                                                                                                                                                                                              | `auth.test.ts` (spent-token pruning)                                            |

Also new in this pass: a privacy notice, self-service account deletion, a
90-day security log, and replacement verification links (see
[architecture_decisions.md §6](architecture_decisions.md#6-authentication)).

## Still open

Recommended in this order. None blocks a limited launch on its own.

1. **Content-Security-Policy on the app pages** (medium). Only API responses
   have one. A nonce-mode `kit.csp` needs the two inline scripts in `app.html`,
   hCaptcha, Google Fonts and the 3D dice checked under it.
2. **Per-user storage quotas** (medium). `PATCH /session/:kind/:id` upserts
   past the per-kind count caps; portraits and map backgrounds can be stored
   for parents that don't exist; log HTML and character history have no size
   cap. A signed-in account can fill the disk.
3. **Deploy workflow** (medium). It deploys every push to `main` without
   waiting for CI, runs `git reset --hard origin/main` rather than the checked
   SHA, and uses `appleboy/ssh-action` by tag without a host-key fingerprint.
4. **`NODE_ENV` fails open** (low). Unset, it means development: no captcha,
   permissive CORS. PM2 sets `production`; failing closed would be safer.
5. **Access tokens outlive a suspension, deletion or demotion** by up to 15
   minutes (low). A per-user token version in Redis would end them at once.
6. **Admins** (low): no last-admin guard, and any admin can clear the audit log.
7. **Imported log links** (low) still act on the active character when
   clicked (spend XP, change resources). Marking imported links spent, or
   stripping their `data-*` attributes, would stop it.
8. **Zip limits** (low) are checked after decompressing; map zips have none.
   Only the importing tab suffers.
9. **Smaller**: hCaptcha's response isn't checked against the sitekey or
   hostname; the invite token sits in the URL path (request logs); register
   and forgot-password response times differ for existing addresses; the AI-key
   encryption key is a plain SHA-256 of the secret with no associated data;
   Google Fonts and `?debug=1`'s unpinned eruda load from third parties.
