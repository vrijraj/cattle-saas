#!/usr/bin/env bash
set -euo pipefail

# Automated PostgreSQL backup with gzip compression and retention pruning.
# Usage: DATABASE_URL=postgres://... BACKUP_DIR=/var/backups/dairy RETENTION_DAYS=14 ./scripts/backup-db.sh

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL must be set (postgres://...)" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/cattle-saas-${STAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"
echo "Starting pg_dump to ${OUT}..."
pg_dump --no-owner --no-privileges --format=plain "${DATABASE_URL}" | gzip -9 > "${OUT}"
chmod 600 "${OUT}"

echo "Pruning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -type f -name "cattle-saas-*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete

echo "Backup complete: ${OUT} ($(du -h "${OUT}" | cut -f1))"
