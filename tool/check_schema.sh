#!/usr/bin/env bash
# Validates that remote D1 songs table has all columns worker.js expects.
# Run before deploying worker changes that add new columns.
# Usage: ./tool/check_schema.sh [--local]

set -euo pipefail

FLAG="--remote"
[[ "${1:-}" == "--local" ]] && FLAG="--local"

EXPECTED=(
  id bvid title cover_base64 description duration pubdate
  owner_name owner_mid owner_face
  stat_view stat_danmaku stat_reply stat_favorite stat_coin stat_share stat_like
  is_masterpiece is_national_team is_gods_descend is_legend
  special_tags collaboration_details status created_at updated_at
)

ACTUAL=$(npx wrangler d1 execute stardust-db \
  --command="SELECT name FROM pragma_table_info('songs')" \
  $FLAG 2>/dev/null | grep '"name"' | sed 's/.*"name": "\(.*\)".*/\1/')

MISSING=()
for col in "${EXPECTED[@]}"; do
  if ! echo "$ACTUAL" | grep -qx "$col"; then
    MISSING+=("$col")
  fi
done

if [[ ${#MISSING[@]} -eq 0 ]]; then
  echo "✓ D1 schema OK — all expected columns present"
  exit 0
else
  echo "✗ Missing columns in D1 songs table:"
  for col in "${MISSING[@]}"; do
    echo "  - $col"
  done
  echo ""
  echo "Apply pending migrations with:"
  echo "  npx wrangler d1 migrations apply stardust-db --remote"
  exit 1
fi
