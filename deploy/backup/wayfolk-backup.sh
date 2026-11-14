#!/usr/bin/env bash
# Wayfolk's database backup (README.md, Running it live, Backups): a consistent dump taken
# without stopping the game, gzipped, copied off the box, old ones pruned.
# Exits non-zero on any failure (the timer's OnFailure, or the heartbeat not
# being pinged, tells you). Run daily by wayfolk-backup.timer.
#
# Settings in /etc/wayfolk/backup.env:
#   DB_NAME=game_wayfolk
#   MYSQL_CNF=/etc/wayfolk/backup.cnf     ([client] user= password=, chmod 600)
#   BACKUP_DIR=/var/backups/wayfolk
#   KEEP_DAYS=14                          (here on the box; the bucket keeps its own: object lock / lifecycle)
#   RCLONE_REMOTE=b2:wayfolk-backups      (an rclone remote whose key can write but not delete; empty: kept on the box only)
#   HEARTBEAT_URL=https://...             (optional: pinged after a good backup, alerting when it isn't)

set -euo pipefail

source /etc/wayfolk/backup.env
: "${DB_NAME:?}" "${MYSQL_CNF:?}" "${BACKUP_DIR:?}" "${KEEP_DAYS:=14}" "${RCLONE_REMOTE:=}"

mkdir -p "$BACKUP_DIR"
file="$BACKUP_DIR/wayfolk-$(date -u +%Y-%m-%dT%H%M%SZ).sql.gz"
partial="$file.partial"
trap 'rm -f "$partial"' EXIT

started=$(date +%s)
mysqldump --defaults-extra-file="$MYSQL_CNF" --single-transaction --no-tablespaces --triggers --hex-blob "$DB_NAME" | gzip -9 > "$partial"
# (a dump that stopped part way has no completion line)
last=$(gunzip -c "$partial" | tail -n 1)
[[ "$last" == *"Dump completed"* ]] || { echo "backup: the dump didn't finish" >&2; exit 1; }
mv "$partial" "$file"

# (no RCLONE_REMOTE yet: kept on the box only)
if [ -n "$RCLONE_REMOTE" ]; then rclone copy "$file" "$RCLONE_REMOTE/" --immutable; fi
find "$BACKUP_DIR" -name 'wayfolk-*.sql.gz' -mtime +"$KEEP_DAYS" -delete

echo "backup: $(basename "$file") ($(du -h "$file" | cut -f1)) in $(( $(date +%s) - started ))s, copied to ${RCLONE_REMOTE:-nowhere (on the box only)}"
if [ -n "${HEARTBEAT_URL:-}" ]; then curl -fsS -m 10 --retry 3 "$HEARTBEAT_URL" > /dev/null; fi
