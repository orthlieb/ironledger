# Iron Ledger — Deployment Guide

Step-by-step instructions for deploying Iron Ledger to an IONOS VPS with pushbutton CI/CD.

## Architecture Overview

```
Internet
   │
   ▼
┌──────────┐
│  Nginx   │  HTTPS termination, static caching, rate limiting
│ :80/:443 │
└──┬───┬───┘
   │   │
   │   ├──▶ localhost:3000  →  Fastify API (PM2 cluster, 2 workers)
   │   └──▶ localhost:3001  →  SvelteKit Web (PM2 fork, 1 worker)
   │
   ├──▶ PostgreSQL 16 (localhost:5432) — RLS-secured, two roles
   └──▶ Redis/Valkey (localhost:6379) — rate limiting, maintenance mode
```

**Key properties:**
- Both Node processes are stateless (JWT + Redis) — horizontally scalable
- Zero-downtime deploys via PM2 cluster reload
- Automatic rollback on failed health check
- Daily encrypted backups to IONOS Object Storage

---

## Prerequisites

| Item | Details |
|------|---------|
| IONOS VPS | Ubuntu 24.04, 2+ vCPU, 4+ GB RAM |
| Domain | DNS A record pointing to VPS IP |
| GitHub repo | Push access to `main` branch |
| SSH key pair | Ed25519 recommended |
| IONOS Object Storage | For database backups (optional) |

---

## Phase 1: VPS Provisioning (One-Time)

### 1.1 Order the VPS

IONOS VPS Linux M or higher (2 vCPU, 4 GB RAM, 80 GB NVMe). Ubuntu 24.04.

IONOS provides DDoS protection on all VPS plans at no extra cost.

### 1.2 Run the Server Setup Script

SSH in as root and run the provisioning script:

```bash
# Upload the script (or clone the repo first)
scp infra/scripts/server-setup.sh root@YOUR_VPS_IP:/tmp/

# SSH in and run it
ssh root@YOUR_VPS_IP
bash /tmp/server-setup.sh
```

**Before running**, edit the script header to paste your SSH public key:
```bash
YOUR_SSH_PUBLIC_KEY="ssh-ed25519 AAAAC3... your-key-here"
```

The script installs (11 steps):
1. System packages (curl, git, build-essential, fail2ban, etc.)
2. UFW firewall (SSH + HTTP + HTTPS only)
3. SSH hardening (no password auth, key-only)
4. `ironledger` app user
5. Node.js 22 via nvm
6. PostgreSQL 16 with `app_admin` and `app_user` roles
7. Redis (Valkey) bound to localhost
8. Nginx with Iron Ledger site config
9. Certbot for Let's Encrypt SSL
10. PM2 with systemd startup
11. App directory structure

### 1.3 Post-Provisioning Checklist

After the script completes:

```bash
# 1. Change database passwords
sudo -u postgres psql -c "ALTER ROLE app_admin PASSWORD 'your_strong_password';"
sudo -u postgres psql -c "ALTER ROLE app_user  PASSWORD 'your_strong_password';"

# 2. Edit the Nginx config — replace YOURDOMAIN.COM
sudo nano /etc/nginx/sites-available/ironledger
sudo nginx -t && sudo systemctl reload nginx

# 3. Get SSL certificate
sudo certbot --nginx -d yourdomain.com

# 4. Clone the repo
sudo -u ironledger bash
cd /home/ironledger/app
git clone https://github.com/YOUR_ORG/ironledger.git .

# 5. Generate JWT keys
openssl genrsa -out /tmp/private.pem 2048
openssl rsa -in /tmp/private.pem -pubout -out /tmp/public.pem
# Copy the key contents into .env (see below)

# 6. Create production .env
cp .env.example /home/ironledger/.env
nano /home/ironledger/.env   # fill in all values
```

### 1.4 Create the Production .env

Copy `.env.example` and fill in production values:

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
APP_URL=https://yourdomain.com

DATABASE_URL=postgres://app_user:REAL_PASSWORD@localhost:5432/ironledger
DATABASE_ADMIN_URL=postgres://app_admin:REAL_PASSWORD@localhost:5432/ironledger

REDIS_URL=redis://localhost:6379

JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
JWT_EXPIRES_IN=900
REFRESH_TOKEN_TTL_DAYS=30

EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.ionos.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your_smtp_password
EMAIL_FROM=noreply@yourdomain.com

HCAPTCHA_SECRET=your_hcaptcha_secret

INTERNAL_API_URL=http://localhost:3000
WEB_URL=https://yourdomain.com
```

### 1.5 Update Nginx for SSR

The default `nginx.conf` in the repo is configured for SPA mode. For the SSR architecture (SvelteKit adapter-node), update the Nginx config:

Replace the static frontend block:
```nginx
# Replace this SPA block:
root /home/ironledger/app/apps/web/dist;
location / {
    try_files $uri /ironledger.html;
    expires 1h;
    add_header Cache-Control "public, must-revalidate";
}

# With this SSR proxy:
location / {
    proxy_pass http://127.0.0.1:3001;
    include /etc/nginx/proxy_params;
}
```

Keep the `/api/` and `/health` location blocks unchanged (they proxy to `:3000`).

### 1.6 First Deploy

```bash
# On the server as ironledger user:
cd ~/app
npm ci
npm run build
npm run migrate

# Start PM2
pm2 start ecosystem.config.js
pm2 save
```

---

## Phase 2: Pushbutton Deploys

Two deployment methods are provided — choose one or use both.

### Option A: GitHub Actions (Recommended)

Pushes to `main` trigger an automatic deploy.

**Setup GitHub Secrets** (Settings > Secrets and variables > Actions):

| Secret | Value |
|--------|-------|
| `IONOS_HOST` | Your VPS IP address |
| `IONOS_DEPLOY_KEY` | SSH private key for `ironledger` user |
| `IONOS_DOMAIN` | Your domain (e.g. `yourdomain.com`) |

**Optional: Production Environment Approval**

In GitHub Settings > Environments, create a `production` environment with required reviewers. This adds a manual approval gate before deploys.

**What the workflow does** (`.github/workflows/deploy.yml`):
1. Type-checks TypeScript
2. SSHs to VPS
3. `git fetch origin main && git reset --hard origin/main`
4. `npm ci`
5. `npm run build --workspace=apps/api` + `npm run build --workspace=apps/web`
6. `npm run migrate --workspace=apps/api` (schema-first, before restart)
7. `pm2 reload ironledger-api --update-env && pm2 reload ironledger-web --update-env`
8. Health check on `/login` (12 retries, 5s intervals)

### Option B: Manual Deploy Script

Run from your local machine:

```bash
./infra/scripts/deploy.sh              # full deploy with tests
./infra/scripts/deploy.sh --skip-tests # skip local test suite
```

**What the script does:**
1. Verifies clean working directory and `main` branch
2. Runs the full test suite locally
3. SSHs to the VPS
4. Pulls code, installs deps, builds, migrates
5. PM2 zero-downtime reload
6. Health checks the live URL
7. **Automatic rollback** if health check fails (resets to previous commit)

**Before first use**, edit the script header:
```bash
SERVER="ironledger@YOUR_VPS_IP"
APP_URL="https://yourdomain.com"
```

---

## Phase 3: Database Backups

### 3.1 IONOS Object Storage Setup

1. Create an Object Storage bucket in IONOS Cloud Panel
2. Create S3 credentials (access key + secret key)
3. Configure s3cmd on the VPS:

```bash
ssh ironledger@YOUR_VPS_IP
s3cmd --configure
# Endpoint: s3.ionos.com
# Enter your access key and secret key
```

### 3.2 Enable Daily Backups

```bash
# Edit the backup script config
nano ~/app/infra/scripts/backup.sh
# Set: S3_BUCKET="s3://your-bucket-name"

# Add to crontab (runs at 3 AM daily)
crontab -e
0 3 * * * /home/ironledger/app/infra/scripts/backup.sh >> /home/ironledger/backups/backup.log 2>&1
```

**Backup strategy:**
- Daily: `pg_dump | gzip` uploaded to S3 (`daily/` prefix)
- Monthly: snapshot on the 1st of each month (`monthly/` prefix)
- Retention: 30 days of daily backups auto-pruned

---

## Horizontal Scaling

The architecture supports horizontal scaling when you outgrow a single VPS:

### API (Fastify)
- **Already stateless**: JWT auth, Redis for sessions/rate-limiting
- Scale by adding more VPS instances behind a load balancer (IONOS Cloud Load Balancer)
- Each instance points to the same PostgreSQL and Redis
- PM2 cluster mode already uses all available vCPUs

### Web (SvelteKit)
- **Already stateless**: SSR with no server-side session state
- The BFF proxy pattern means each web instance talks to any API instance
- Scale identically to the API

### Database
- **Vertical scaling** (bigger VPS) handles most workloads
- **Read replicas** via PostgreSQL streaming replication for read-heavy loads
- IONOS Managed Database for PostgreSQL is an alternative (managed backups, failover)

### Redis
- Single instance handles thousands of concurrent users
- For HA: Redis Sentinel or IONOS Managed Redis

---

## Maintenance Mode

Before deployments that require downtime:

1. Go to Admin Dashboard > Maintenance tab
2. Set message (e.g. "Upgrading to v2.0") and countdown (e.g. 5 minutes)
3. Click "Enable Maintenance Mode"
4. All users see a countdown banner; non-admin logins are blocked
5. All refresh tokens are revoked (users logged out when access tokens expire)
6. Admins can still log in
7. After deploy, click "Disable Maintenance" to restore normal operation

---

## Monitoring & Logs

### PM2
```bash
pm2 status             # process status
pm2 logs ironledger    # combined logs (API + Web)
pm2 monit              # real-time CPU/memory dashboard
```

### Nginx
```bash
tail -f /var/log/nginx/ironledger.access.log
tail -f /var/log/nginx/ironledger.error.log
```

### Application Logs
```bash
tail -f /home/ironledger/logs/api-out.log
tail -f /home/ironledger/logs/api-error.log
```

### Health Check
```bash
curl https://yourdomain.com/health
```

---

## Security Checklist

- [x] SSH key-only auth (no passwords)
- [x] UFW firewall (22, 80, 443 only)
- [x] fail2ban for SSH brute-force protection
- [x] HTTPS everywhere (Let's Encrypt auto-renewal)
- [x] HSTS, X-Frame-Options, CSP headers (Helmet + Nginx)
- [x] Rate limiting at Nginx AND API layers
- [x] 64KB request body limit (Nginx + Fastify)
- [x] PostgreSQL RLS (row-level security)
- [x] Argon2id password hashing (OWASP 2024 params)
- [x] HaveIBeenPwned password checking
- [x] hCaptcha on registration
- [x] JWT RS256 with short-lived access tokens (15 min)
- [x] Refresh token rotation with theft detection
- [x] DDoS protection (IONOS built-in)
- [x] Block `.env`, `.git`, `.sql` via Nginx
- [x] Redis bound to localhost only

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| 502 Bad Gateway | `pm2 status` — check if Node processes are running |
| Deploy health check fails | `pm2 logs ironledger --lines 50` — check for startup errors |
| Database connection refused | `systemctl status postgresql` — ensure PG is running |
| Redis connection error | `systemctl status valkey` — ensure Redis is running |
| SSL certificate expired | `sudo certbot renew` — Certbot auto-renews via cron |
| Rate limited during deploy | Health check endpoint (`/health`) has no rate limit |
| Migration fails | Check `DATABASE_ADMIN_URL` in `.env` has superuser credentials |
| `pm2` not found when running as root | PM2 is installed under the `ironledger` user's nvm — use `su - ironledger` (interactive) first |
| `[PM2][ERROR] File ecosystem.config.cjs not found` | Must run PM2 from `~/app` directory: `cd ~/app && pm2 reload ecosystem.config.cjs --update-env` |
| Cross-site POST form submissions forbidden | CSRF: SvelteKit compares `Origin` header to `ORIGIN` env var — update `ORIGIN` in `ecosystem.config.cjs` and reload after switching to HTTPS |
| Sign-out not working | `cookies.delete()` must pass the same options (`httpOnly`, `sameSite`, `secure`) as `cookies.set()` or the browser ignores the deletion |

---

## Lessons Learned from the First Deploy

Real-world notes captured during the initial deployment to production.

### PostgreSQL: BYPASSRLS requires superuser

`ALTER ROLE app_admin BYPASSRLS` needs a superuser (`postgres`) to execute. If this runs inside a migration file (which runs as `app_admin`), you get:
```
ERROR: permission denied to alter role
```

**Fix**: Apply it once manually as `postgres` and remove it from migrations:
```bash
sudo -u postgres psql -c "ALTER ROLE app_admin BYPASSRLS;"
```

For CI, add it to the "Setup test database roles" step *before* migrations run, using the `postgres` superuser.

Without `BYPASSRLS`, `FORCE ROW LEVEL SECURITY` on a table means even the table owner (`app_admin`) sees zero rows — silent data loss with no errors.

### PostgreSQL: custom GUC resets to `''` after LOCAL transaction

`set_config('app.user_id', userId, true)` (LOCAL) creates the GUC entry at the session level with default value `''`. When the LOCAL transaction ends, it reverts to `''`. Any subsequent query on that pooled connection runs `''::uuid` in RLS policies, throwing:

```
invalid input syntax for type uuid: ""
```

**Fix**: Wrap all `current_setting()` calls in RLS policies with `NULLIF`:
```sql
USING (id = NULLIF(current_setting('app.user_id', true), '')::uuid)
```

`NULLIF('', '')` → `NULL` → `NULL::uuid` → `NULL` → no rows matched, no error.

In integration tests, always use `adminDb` (BYPASSRLS) for cleanup and verification queries rather than the app_user pool.

### SvelteKit: cookie delete options must match cookie set options

`cookies.delete('access_token', { path: '/' })` will not clear a cookie that was set with `httpOnly: true`, `sameSite: 'strict'`, etc. The browser silently ignores the deletion.

**Fix**: Pass identical options to both `set` and `delete`:
```typescript
cookies.delete('access_token', {
  path: '/',
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
});
```

### SvelteKit: CSRF — update ORIGIN when switching to HTTPS

SvelteKit compares the `Origin` request header against the `ORIGIN` environment variable for POST form submissions. After enabling Let's Encrypt, if `ORIGIN` still has the `http://` address, every login attempt fails with:

```
Cross-site POST form submissions are forbidden
```

**Fix**: Update `ORIGIN` in `ecosystem.config.cjs` and reload with env:
```bash
cd ~/app
# The config uses JS object syntax, not env var syntax
sed -i "s|ORIGIN: 'http://OLD_VALUE'|ORIGIN: 'https://yourdomain.com'|" ecosystem.config.cjs
pm2 reload ecosystem.config.cjs --update-env
```

Note: `pm2 reload ironledger-api --update-env` alone won't pick up ecosystem config changes — you must use the `.cjs` file form.

### PM2: must run as ironledger user (nvm dependency)

PM2 and Node.js are installed via nvm under the `ironledger` user. Running `su - ironledger -c "pm2 ..."` fails because nvm is not initialized in a non-interactive shell.

**Fix**: Use an interactive shell login:
```bash
su - ironledger         # interactive (-) loads .bashrc / nvm
cd ~/app
pm2 reload ecosystem.config.cjs --update-env
```

### PM2: reload must be run from the app directory

`pm2 reload ecosystem.config.cjs` fails with "file not found" unless the working directory is `~/app`. Always `cd ~/app` first.

### JWT: add jti for guaranteed uniqueness

`iat` (issued-at) is second-precision. Two tokens issued in the same second are byte-for-byte identical, which breaks tests asserting uniqueness and blocks future token revocation.

**Fix**: Add a `jti` (JWT ID) claim with a random value:
```typescript
new SignJWT({ email, role })
  .setJti(randomBytes(16).toString('hex'))
  // ...
```

### Resend: onboarding@resend.dev only delivers to account owner

During development, `onboarding@resend.dev` only sends to the Resend account owner's address. Any other recipient silently receives nothing.

**Fix**: Verify your own domain in Resend (DNS TXT + CNAME records), then use `noreply@yourdomain.com` as the sender.

### CI: vitest needs working-directory for monorepo

`npx vitest run --project unit` must be run from the directory containing `vitest.config.ts`. In a monorepo, all test steps need:
```yaml
working-directory: apps/api
```

Without it, vitest can't find the project configuration and fails with "No projects matched the filter."

### CI: schema ownership after DROP/CREATE in integration tests

`setup.ts` runs `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` before migrations. The new schema is owned by the connecting user (`app_admin`). You must explicitly grant ownership back:

```sql
ALTER SCHEMA public OWNER TO app_admin;
GRANT ALL   ON SCHEMA public TO app_admin;
GRANT USAGE ON SCHEMA public TO app_user;
```

This must happen *before* migrations run (which create the tables).
