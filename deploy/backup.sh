#!/bin/sh
# ─────────────────────────────────────────────────────────────
# JewelERP Database Backup Script
# ─────────────────────────────────────────────────────────────
# Run by cron inside the backup sidecar container.
# Produces compressed daily backups and prunes old ones.
#
# Usage (manual):
#   docker compose exec backup sh /backup.sh
#
# Restore:
#   gunzip < /backups/jewelerp_2026-03-11_020000.sql.gz | psql -U jewelerp jewelerp
# ─────────────────────────────────────────────────────────────

set -e

TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
BACKUP_FILE="/backups/jewelerp_${TIMESTAMP}.sql.gz"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

echo "[backup] Starting backup at $(date -Iseconds)"

# Dump database with compression
pg_dump -Fp --no-owner --no-privileges | gzip > "${BACKUP_FILE}"

SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[backup] Created ${BACKUP_FILE} (${SIZE})"

# Prune backups older than retention period
DELETED=$(find /backups -name "jewelerp_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[backup] Pruned ${DELETED} backup(s) older than ${RETENTION_DAYS} days"
fi

echo "[backup] Done at $(date -Iseconds)"
