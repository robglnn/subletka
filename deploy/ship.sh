#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
TARGET="${DEPLOY_URL:-$(cat ~/.subletka/deploy-url 2>/dev/null || true)}"
[ -n "$TARGET" ] || { echo "set DEPLOY_URL or write the target URL to ~/.subletka/deploy-url" >&2; exit 1; }
TOKEN="${DEPLOY_TOKEN:-$(cat ~/.subletka/deploy-token)}"

npm run build
rm -rf .ship && mkdir .ship
cp -r .next/standalone/. .ship/
cp -r .next/static .ship/.next/static
cp -r public .ship/public
[ -d drizzle ] && cp -r drizzle .ship/drizzle
[ -d .next/ship-scripts ] && cp -r .next/ship-scripts .ship/scripts
tar czf .ship.tgz -C .ship .
ls -lh .ship.tgz
curl -fsS --max-time 900 -X PUT -H "Authorization: Bearer $TOKEN" --data-binary @.ship.tgz "$TARGET/__deploy"
echo "live: $TARGET serves $(curl -fsS "$TARGET/__boot")"
