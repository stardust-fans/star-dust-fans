#!/usr/bin/env bash
set -uo pipefail

DB=stardust-db

INFO=$(npx wrangler d1 time-travel info "$DB" --json)
STATUS=$?
if [ "$STATUS" -ne 0 ]; then
  echo "wrangler d1 time-travel info failed (exit $STATUS):"
  echo "$INFO"
  exit "$STATUS"
fi

BOOKMARK=$(echo "$INFO" | grep '"bookmark"' | sed 's/.*"bookmark": *"\([^"]*\)".*/\1/')
echo "restore point: $BOOKMARK"
echo "  wrangler d1 time-travel restore $DB --bookmark=$BOOKMARK"
