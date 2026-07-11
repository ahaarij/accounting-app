#!/usr/bin/env bash
# Nightly backup: PostgreSQL dump + uploaded logos, with 30-day rotation.
#
# Usage:   ./scripts/backup.sh [target-dir]      (default: ./backups)
# Restore: see scripts/restore.sh
#
# Schedule it (crontab -e):
#   30 2 * * * /path/to/Reconcillation\ app/scripts/backup.sh /Volumes/BackupDisk/recon-backups >> /tmp/recon-backup.log 2>&1
#
# IMPORTANT: point the target at a SECOND disk (external drive, NAS, or a
# cloud-synced folder). A backup on the same disk as the database does not
# protect against disk failure.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${1:-$REPO_DIR/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
KEEP_DAYS=30

mkdir -p "$BACKUP_DIR"

# 1. Database — custom format (-Fc) supports selective/parallel restore
docker exec reconciliation-db pg_dump -U reconciliation -Fc reconciliation \
  > "$BACKUP_DIR/recon-db-$STAMP.dump"

# 2. Uploaded files (company logos)
if [ -d "$REPO_DIR/backend/uploads" ]; then
  tar -czf "$BACKUP_DIR/recon-uploads-$STAMP.tar.gz" -C "$REPO_DIR/backend" uploads
fi

# 3. Rotate: delete backups older than KEEP_DAYS
find "$BACKUP_DIR" -name 'recon-*' -type f -mtime +"$KEEP_DAYS" -delete

# 4. Sanity check — a dump under 10KB almost certainly means something failed
SIZE=$(wc -c < "$BACKUP_DIR/recon-db-$STAMP.dump")
if [ "$SIZE" -lt 10240 ]; then
  echo "WARNING: dump is only ${SIZE} bytes — verify the database container is healthy" >&2
  exit 1
fi

echo "OK: $BACKUP_DIR/recon-db-$STAMP.dump ($SIZE bytes)"
