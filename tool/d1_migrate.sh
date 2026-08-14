#!/usr/bin/env bash
set -euo pipefail

DB=stardust-db
RESTORE="/tmp/d1-restore-$(date +%Y%m%d%H%M%S).sql"

npx wrangler d1 export "$DB" --remote --output="$RESTORE" -y
echo "restore: $RESTORE ($(wc -c < "$RESTORE") bytes)"
