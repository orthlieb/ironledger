#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Iron Ledger — One-time server provisioning script
#
# Run as root on a fresh Ubuntu 24.04 IONOS VPS:
#   curl -fsSL https://raw.githubusercontent.com/YOU/ironledger/main/infra/scripts/server-setup.sh | bash
#   (or upload and run manually)
#
# What this does:
#   1. System updates and essential packages
#   2. Firewall (UFW)
#   3. SSH hardening
#   4. Create the ironledger app user
#   5. Node.js 22 via nvm
#   6. PostgreSQL 16
#   7. Redis (Valkey)
#   8. Nginx
#   9. Certbot (Let's Encrypt)
#   10. PM2
#   11. Initial directory structure
#
# After this script completes:
#   - Deploy your app with ./infra/scripts/deploy.sh
#   - Run certbot --nginx -d YOURDOMAIN.COM
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Config — edit before running ─────────────────────────────────────────────
APP_USER="ironledger"
APP_DIR="/home/$APP_USER/app"
YOUR_SSH_PUBLIC_KEY="ssh-ed25519 AAAAC3... your-key-here"   # paste your public key
# ─────────────────────────────────────────────────────────────────────────────

if [[ $EUID -ne 0 ]]; then
  echo "❌ This script must be run as root." >&2
  exit 1
fi

echo "▶ [1/11] System update..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git build-essential ufw fail2ban \
  gnupg2 ca-certificates lsb-release software-properties-common \
  htop ncdu logrotate cron s3cmd

# ── Firewall ──────────────────────────────────────────────────────────────────
echo "▶ [2/11] Configuring UFW firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # HTTP  (→ redirects to HTTPS)
ufw allow 443/tcp     # HTTPS
ufw --force enable
echo "  UFW enabled."

# ── SSH hardening ─────────────────────────────────────────────────────────────
echo "▶ [3/11] Hardening SSH..."
cat > /etc/ssh/sshd_config.d/ironledger.conf <<EOF
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
systemctl reload sshd
echo "  SSH hardened. Password auth disabled."

# ── App user ──────────────────────────────────────────────────────────────────
echo "▶ [4/11] Creating app user '$APP_USER'..."
if ! id "$APP_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$APP_USER"
fi

# Install your SSH public key for the app user (used by the deploy script)
sudo -u "$APP_USER" mkdir -p "/home/$APP_USER/.ssh"
echo "$YOUR_SSH_PUBLIC_KEY" >> "/home/$APP_USER/.ssh/authorized_keys"
chmod 700 "/home/$APP_USER/.ssh"
chmod 600 "/home/$APP_USER/.ssh/authorized_keys"
chown -R "$APP_USER:$APP_USER" "/home/$APP_USER/.ssh"
echo "  User '$APP_USER' created."

# ── Node.js via nvm ───────────────────────────────────────────────────────────
echo "▶ [5/11] Installing Node.js 22 via nvm..."
sudo -u "$APP_USER" bash -c '
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  source "$NVM_DIR/nvm.sh"
  nvm install 22
  nvm use 22
  nvm alias default 22
  echo "  Node $(node --version) installed."
'
# Make node/npm available system-wide for PM2
NVM_BIN="/home/$APP_USER/.nvm/versions/node/$(sudo -u "$APP_USER" bash -c 'source ~/.nvm/nvm.sh && nvm current')/bin"
ln -sf "$NVM_BIN/node" /usr/local/bin/node
ln -sf "$NVM_BIN/npm"  /usr/local/bin/npm

# ── PostgreSQL 16 ─────────────────────────────────────────────────────────────
echo "▶ [6/11] Installing PostgreSQL 16..."
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
echo "deb [signed-by=/etc/apt/trusted.gpg.d/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list
apt-get update -qq
apt-get install -y -qq postgresql-16 postgresql-client-16

systemctl enable postgresql
systemctl start postgresql

# Create database roles and database
sudo -u postgres psql <<PSQL
  CREATE ROLE app_admin WITH LOGIN PASSWORD 'CHANGE_ME_ADMIN' CREATEDB;
  CREATE ROLE app_user  WITH LOGIN PASSWORD 'CHANGE_ME_USER';
  CREATE DATABASE ironledger OWNER app_admin;
  GRANT CONNECT ON DATABASE ironledger TO app_user;
PSQL
echo "  PostgreSQL 16 installed."
echo "  ⚠️  Change the database passwords in /etc/postgresql/16/main/pg_hba.conf"

# ── Redis (Valkey) ────────────────────────────────────────────────────────────
echo "▶ [7/11] Installing Redis (Valkey)..."
curl -fsSL https://packages.valkey.io/gpg | gpg --dearmor -o /etc/apt/trusted.gpg.d/valkey.gpg
echo "deb [signed-by=/etc/apt/trusted.gpg.d/valkey.gpg] https://packages.valkey.io/apt $(lsb_release -cs) main" \
  > /etc/apt/sources.list.d/valkey.list
apt-get update -qq
apt-get install -y -qq valkey

# Lock Redis to localhost only
sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/valkey/valkey.conf
systemctl enable valkey
systemctl start valkey
echo "  Valkey (Redis) installed and bound to localhost."

# ── Nginx ─────────────────────────────────────────────────────────────────────
echo "▶ [8/11] Installing Nginx..."
apt-get install -y -qq nginx
systemctl enable nginx
systemctl start nginx

# Copy proxy_params
cp "$(dirname "$0")/../nginx/proxy_params" /etc/nginx/proxy_params

# Disable the default site
rm -f /etc/nginx/sites-enabled/default

# Install the Iron Ledger site config
cp "$(dirname "$0")/../nginx/nginx.conf" /etc/nginx/sites-available/ironledger
ln -sf /etc/nginx/sites-available/ironledger /etc/nginx/sites-enabled/ironledger

nginx -t && systemctl reload nginx
echo "  Nginx installed."
echo "  ⚠️  Edit /etc/nginx/sites-available/ironledger and replace YOURDOMAIN.COM"

# ── Certbot ───────────────────────────────────────────────────────────────────
echo "▶ [9/11] Installing Certbot..."
apt-get install -y -qq certbot python3-certbot-nginx
echo "  Certbot installed."
echo "  ⚠️  Run: certbot --nginx -d YOURDOMAIN.COM"

# ── PM2 ───────────────────────────────────────────────────────────────────────
echo "▶ [10/11] Installing PM2..."
sudo -u "$APP_USER" bash -c '
  source ~/.nvm/nvm.sh
  npm install -g pm2
'
# Generate the systemd startup script so PM2 survives reboots
env PATH="$NVM_BIN:$PATH" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" | tail -1 | bash
echo "  PM2 installed with systemd startup."

# ── App directory ─────────────────────────────────────────────────────────────
echo "▶ [11/11] Creating app directory..."
sudo -u "$APP_USER" bash -c "
  mkdir -p '$APP_DIR'
  mkdir -p /home/$APP_USER/backups
"
echo "  App directory: $APP_DIR"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ Server provisioning complete!"
echo ""
echo "Next steps:"
echo "  1. Edit /etc/nginx/sites-available/ironledger — replace YOURDOMAIN.COM"
echo "  2. Point your domain's DNS A record to this server's IP"
echo "  3. Run: certbot --nginx -d YOURDOMAIN.COM"
echo "  4. Create /home/$APP_USER/.env (copy from .env.example)"
echo "  5. Run: ./infra/scripts/deploy.sh (from your local machine)"
echo ""
echo "  Database passwords to change:"
echo "    sudo -u postgres psql -c \"ALTER ROLE app_admin PASSWORD 'new_password';\""
echo "    sudo -u postgres psql -c \"ALTER ROLE app_user  PASSWORD 'new_password';\""
echo "════════════════════════════════════════════════════════════════"
