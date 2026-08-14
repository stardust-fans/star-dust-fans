#!/usr/bin/env bash
# Creates a D1 restore point (full export), displays schema summary,
# then applies any pending migrations.
set -euo pipefail

DB=stardust-db
RESTORE="/tmp/d1-restore-$(date +%Y%m%d%H%M%S).sql"

echo "=== 创建 D1 还原点 ==="
npx wrangler d1 export "$DB" --remote --output="$RESTORE" -y
SIZE=$(wc -c < "$RESTORE")
echo "还原点: $RESTORE (${SIZE} bytes)"

echo ""
echo "=== 数据库 schema 汇总 ==="
grep "^CREATE TABLE" "$RESTORE" | while IFS= read -r line; do
  TABLE=$(echo "$line" \
    | sed 's/CREATE TABLE IF NOT EXISTS //;s/CREATE TABLE //' \
    | grep -oE '^[A-Za-z_]+' || true)
  [ -n "$TABLE" ] && echo "  $TABLE"
done

echo ""
echo "=== songs 表字段 ==="
grep "^CREATE TABLE songs" "$RESTORE" \
  | sed 's/^[^(]*(//' | sed 's/);$//' \
  | tr ',' '\n' | sed 's/^ *//' | awk '{print "  " $1}'

echo ""
echo "=== 应用迁移 ==="
npx wrangler d1 migrations apply "$DB" --remote
