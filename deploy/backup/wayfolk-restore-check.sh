#!/usr/bin/env bash
# Tries a backup (README.md, Running it live, Backups: "a restore tried once"): loads a dump
# into a scratch database, and shows what's in it and how long it took.
# Then point a local server's .env at that database and sign in to a real
# account to see their heroes, gold and things. Drops it again with --drop.
#
#   wayfolk-restore-check.sh [dump.sql.gz]     (default: the newest in BACKUP_DIR)
#   wayfolk-restore-check.sh --drop

set -euo pipefail

source /etc/wayfolk/backup.env
: "${MYSQL_CNF:?}" "${BACKUP_DIR:?}"
TARGET=game_wayfolk_restore
mysql_() { mysql --defaults-extra-file="$MYSQL_CNF" "$@"; }

if [ "${1:-}" = "--drop" ]; then
    mysql_ -e "DROP DATABASE IF EXISTS $TARGET"
    echo "restore check: $TARGET dropped"
    exit 0
fi

dump="${1:-}"
if [ -z "$dump" ]; then
    dumps=($(ls -1t "$BACKUP_DIR"/wayfolk-*.sql.gz))
    dump="${dumps[0]}"
fi
echo "restore check: loading $dump into $TARGET..."
started=$(date +%s)
mysql_ -e "DROP DATABASE IF EXISTS $TARGET; CREATE DATABASE $TARGET CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
gunzip -c "$dump" | mysql_ "$TARGET"
echo "restore check: loaded in $(( $(date +%s) - started ))s"

mysql_ "$TARGET" -t -e "
    SELECT (SELECT COUNT(*) FROM player) players, (SELECT COUNT(*) FROM hero) heroes,
           (SELECT SUM(gold) FROM inventory) gold, (SELECT COUNT(*) FROM market_listing WHERE state = 0) listings_on,
           (SELECT COUNT(*) FROM player_subscription WHERE until > NOW()) supporters,
           (SELECT MAX(active_at) FROM player) last_seen"
echo "restore check: now sign in against it (DB_DATABASE=$TARGET in a local server's .env), then: $0 --drop"
