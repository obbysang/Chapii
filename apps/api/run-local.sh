#!/bin/sh
# Local API launcher (dev): builds if needed, starts the NestJS API on the local Postgres.
cd "$(dirname "$0")"
export DATABASE_URL="${DATABASE_URL:-postgresql://agentvault:agentvault@localhost:5434/agentvault}"
export PORT="${PORT:-3100}"
export NEAR_RPC_URL="${NEAR_RPC_URL:-https://rpc.testnet.fastnear.com}"
if [ "$1" != "--no-build" ]; then
  pnpm build
fi
setsid nohup node dist/main.js > /tmp/agentvault-api.log 2>&1 < /dev/null &
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  if curl -s -m 3 "http://localhost:${PORT}/health" | grep -q '"ok":true'; then
    echo "API up on :${PORT}"
    exit 0
  fi
done
echo "API failed to start; see /tmp/agentvault-api.log"
exit 1
