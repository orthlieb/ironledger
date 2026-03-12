#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Iron Ledger — Database backup script
#
# Runs on the SERVER (not locally). Add to ironledger user's crontab:
#   crontab -e
#   0 3 * * * /home/ironledger/app/infra/scripts/backup.sh >> /home/ironledger/backups/backup.log 2>&1
#
# What this does:
#   1. pg_dump → gzip to a local temp file
#   2. Upload to IONOS Object Storage (S3-compatible)
#   3. Prune backups older than RETAIN_DAYS
#   4. Verify today's backup can be listed (basic sanity check)
#
# Prerequisites on the server:
#   apt install s3cmd
#   s3cmd --configure   (run once, saves to ~/.s3cfg)
#   Use IONOS Object Storage endpoint: s3.ionos.com
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
DB_NAME="ironledger"
DB_USER="app_admin"
S3_BUCKET="s3://ironledger-backups"
S3_ENDPOINT="https://s3.ionos.com"
RETAIN_DAYS=30
LOCAL_BACKUP_DIR="/home/ironledger/backups"
# ─────────────────────────────────────────────────────────────────────────────

DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y-%m-%dT%H:%M:%S)
FILENAME="${DB_NAME}-${DATE}.sql.gz"
LOCAL_PATH="${LOCAL_BACKUP_DIR}/${FILENAME}"

echo "[$TIMESTAMP] ▶ Starting backup of '$DB_NAME'..."

# ── Dump and compress ─────────────────────────────────────────────────────────
pg_dump \
  --username="$DB_USER" \
  --no-password \
  --format=plain \
  --no-owner \
  --no-acl \
  "$DB_NAME" \
  | gzip -9 > "$LOCAL_PATH"

FILESIZE=$(du -sh "$LOCAL_PATH" | cut -f1)
echo "[$TIMESTAMP]   Dump complete: $FILENAME ($FILESIZE)"

# ── Upload to IONOS Object Storage ────────────────────────────────────────────
s3cmd put "$LOCAL_PATH" \
  "${S3_BUCKET}/daily/${FILENAME}" \
  --host="$S3_ENDPOINT" \
  --host-bucket="%(bucket)s.${S3_ENDPOINT#https://}" \
  --quiet

echo "[$TIMESTAMP]   Uploaded to ${S3_BUCKET}/daily/${FILENAME}"

# Keep a monthly snapshot (1st of each month)
DAY_OF_MONTH=$(date +%d)
if [[ "$DAY_OF_MONTH" == "01" ]]; then
  MONTH=$(date +%Y-%m)
  s3cmd cp \
    "${S3_BUCKET}/daily/${FILENAME}" \
    "${S3_BUCKET}/monthly/${DB_NAME}-${MONTH}.sql.gz" \
    --host="$S3_ENDPOINT" \
    --host-bucket="%(bucket)s.${S3_ENDPOINT#https://}" \
    --quiet
  echo "[$TIMESTAMP]   Monthly snapshot saved."
fi

# ── Remove local temp file ────────────────────────────────────────────────────
rm "$LOCAL_PATH"

# ── Prune old daily backups from S3 ──────────────────────────────────────────
CUTOFF=$(date -d "$RETAIN_DAYS days ago" +%Y-%m-%d)
echo "[$TIMESTAMP]   Pruning daily backups older than $CUTOFF..."

s3cmd ls "${S3_BUCKET}/daily/" \
  --host="$S3_ENDPOINT" \
  --host-bucket="%(bucket)s.${S3_ENDPOINT#https://}" \
  | awk '{print $4}' \
  | while read -r file; do
    # Extract date from filename: ironledger-YYYY-MM-DD.sql.gz
    FILEDATE=$(basename "$file" | grep -oP '\d{4}-\d{2}-\d{2}' || true)
    if [[ -n "$FILEDATE" && "$FILEDATE" < "$CUTOFF" ]]; then
      s3cmd del "$file" \
        --host="$S3_ENDPOINT" \
        --host-bucket="%(bucket)s.${S3_ENDPOINT#https://}" \
        --quiet
      echo "[$TIMESTAMP]   Deleted old backup: $(basename "$file")"
    fi
  done

# ── Verify the backup exists in S3 ───────────────────────────────────────────
if s3cmd ls "${S3_BUCKET}/daily/${FILENAME}" \
    --host="$S3_ENDPOINT" \
    --host-bucket="%(bucket)s.${S3_ENDPOINT#https://}" \
    --quiet 2>/dev/null; then
  echo "[$TIMESTAMP] ✅ Backup verified in S3: $FILENAME"
else
  echo "[$TIMESTAMP] ❌ Backup verification FAILED — file not found in S3!"
  exit 1
fi
