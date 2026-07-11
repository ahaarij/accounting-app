#!/usr/bin/env bash
# Restore a backup produced by scripts/backup.sh.
#
# Usage: ./scripts/restore.sh backups/recon-db-YYYYMMDD-HHMMSS.dump
#
# This DROPS and recreates the current database contents. It will ask for
# confirmation first. Test this at least once before you need it for real.
set -euo pipefail

DUMP="${1:?Usage: ./scripts/restore.sh <path-to-.dump>}"

if [ ! -f "$DUMP" ]; then
  echo "No such file: $DUMP" >&2
  exit 1
fi

echo "This will REPLACE the current 'reconciliation' database with $DUMP"
read -r -p "Type 'restore' to continue: " CONFIRM
if [ "$CONFIRM" != "restore" ]; then
  echo "Aborted."
  exit 1
fi

docker exec -i reconciliation-db pg_restore \
  -U reconciliation -d reconciliation --clean --if-exists < "$DUMP"

echo "Restore complete. Restart the backend so TypeORM reconnects cleanly."
