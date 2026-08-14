#!/usr/bin/env bash
set -euo pipefail

DB=stardust-db

BOOKMARK=$(npx wrangler d1 time-travel info "$DB" --json 2>/dev/null \
  | grep '"bookmark"' | sed 's/.*"bookmark": *"\([^"]*\)".*/\1/')
echo "restore point: $BOOKMARK"
echo "  wrangler d1 time-travel restore $DB --bookmark=$BOOKMARK"
