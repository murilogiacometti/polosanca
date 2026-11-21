#!/usr/bin/env bash
set -euo pipefail

# Automated PostgreSQL/TimescaleDB backup script for Docker Compose VPS deployments.
# Add to crontab (e.g. daily at 03:00 UTC):
#   0 3 * * * /opt/polosanca/deploy/backup-db.sh >> /var/log/polosanca-backup.log 2>&1

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/polosanca}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

# shellcheck disable=SC1091
source "${REPO_DIR}/deploy/.env.prod"

mkdir -p "${BACKUP_DIR}"
OUT_FILE="${BACKUP_DIR}/polosanca-${TIMESTAMP}.sql.gz"

docker compose -f "${REPO_DIR}/docker-compose.prod.yml" --env-file "${REPO_DIR}/deploy/.env.prod" \
  exec -T db pg_dump -U "${POSTGRES_USER:-polosanca}" -d "${POSTGRES_DB:-polosanca}" \
  | gzip -9 > "${OUT_FILE}"

echo "[$(date -u +%FT%TZ)] Created backup ${OUT_FILE} ($(du -h "${OUT_FILE}" | cut -f1))"

if [[ -n "${BACKUP_S3_URI:-}" ]] && command -v aws >/dev/null 2>&1; then
  aws s3 cp "${OUT_FILE}" "${BACKUP_S3_URI%/}/$(basename "${OUT_FILE}")" --only-show-errors
  echo "[$(date -u +%FT%TZ)] Uploaded backup to ${BACKUP_S3_URI}"
fi

find "${BACKUP_DIR}" -name "polosanca-*.sql.gz" -type f -mtime +"${RETENTION_DAYS}" -delete
