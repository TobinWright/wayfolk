#!/usr/bin/env bash
# A deploy, on the live box (README.md, Running it live, Every deploy): the code pulled, the
# server built and its tests run (nothing restarts if they fail), the client
# built for the live address, both shipped together, the server restarted
# (saving everyone first) and waited for till /health says it's up.
#
#   /srv/wayfolk/deploy/deploy.sh
#
# Settings in /etc/wayfolk/deploy.env:
#   APP_DIR=/srv/wayfolk
#   SERVER_IP=example.com
#   SERVER_PORT=443
#   SERVER_PATH=/ws
#   CLIENT_SENTRY_DSN=https://...        (the client's Sentry project; empty: off)
#
# Before running it: npm run test:integration passed on your own machine (it
# needs a database it can make and drop, so it isn't run here), and
# PROTOCOL_BUMP raised in shared/Protocol.ts if a message's fields changed.

set -euo pipefail

source /etc/wayfolk/deploy.env
: "${APP_DIR:?}" "${SERVER_IP:?}" "${SERVER_PORT:=443}" "${SERVER_PATH:=/ws}" "${CLIENT_SENTRY_DSN:=}"

cd "$APP_DIR"
git pull --ff-only
commit=$(git rev-parse --short HEAD)
echo "deploy: $commit"

cd "$APP_DIR/server"
npm ci
npx tsc -p .
npm test
npm prune --omit=dev
# (Sentry's release: which build an error came from)
if grep -q '^SENTRY_RELEASE=' .env; then sed -i "s/^SENTRY_RELEASE=.*/SENTRY_RELEASE=$commit/" .env; else echo "SENTRY_RELEASE=$commit" >> .env; fi

cd "$APP_DIR/client"
npm ci
npm run build -- --env SERVER_IP="$SERVER_IP" --env SERVER_PORT="$SERVER_PORT" --env SERVER_PATH="$SERVER_PATH" \
    --env SENTRY_DSN="$CLIENT_SENTRY_DSN" --env RELEASE="$commit"

sudo systemctl restart wayfolk
for i in $(seq 1 60); do
    if curl -fsS -m 2 "http://127.0.0.1:5301/health" > /dev/null 2>&1; then
        echo "deploy: $commit is up"
        exit 0
    fi
    sleep 1
done
echo "deploy: the server didn't come up in 60s - journalctl -u wayfolk -n 100" >&2
exit 1
