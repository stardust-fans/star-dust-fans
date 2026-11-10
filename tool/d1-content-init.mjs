#!/usr/bin/env node
/**
 * 把 tool/content-schema.sql 灌到每个子站的内容库里。
 *
 * 库列表从 wrangler.jsonc 的 d1_databases 读，跳过身份库（binding 为 DB 的那个）。
 *
 * 用法：
 *   node tool/d1-content-init.mjs             # 打到远端（生产）
 *   node tool/d1-content-init.mjs --local     # 打到本地 dev 数据库
 *   node tool/d1-content-init.mjs shian-db    # 只处理指定的库
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NPM = process.platform === 'win32' ? 'npx.cmd' : 'npx';

// wrangler.jsonc 是 JSONC：去掉块注释、行注释和尾逗号后再解析
function readWranglerConfig() {
  const raw = readFileSync(resolve(ROOT, 'wrangler.jsonc'), 'utf8');
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(stripped);
}

const args = process.argv.slice(2);
const local = args.includes('--local');
const explicit = args.filter((a) => !a.startsWith('--'));

const config = readWranglerConfig();
const all = config.d1_databases || [];
const contentDbs = all.filter((db) => db.binding !== 'DB' && db.database_name);

if (contentDbs.length === 0) {
  console.error('❌ wrangler.jsonc 里没有找到子站内容库（binding 不是 DB 的 d1_databases）');
  process.exit(1);
}

const targets = explicit.length
  ? contentDbs.filter((db) => explicit.includes(db.database_name))
  : contentDbs;

if (explicit.length && targets.length === 0) {
  console.error(`❌ 没有匹配的库：${explicit.join(', ')}`);
  process.exit(1);
}

const schemaPath = resolve(ROOT, 'tool/content-schema.sql');
// 传给 wrangler 用相对路径：绝对路径里有中文目录，走 cmd.exe 时容易被代码页搞坏
const schemaRel = 'tool/content-schema.sql';
const isWin = process.platform === 'win32';
console.log(`📦 内容库 schema：${schemaPath}`);
console.log(`🎯 目标库：${targets.map((db) => db.database_name).join(', ')}${local ? '（本地）' : ''}\n`);

let failed = 0;
for (const db of targets) {
  console.log(`=== ${db.database_name} (${db.binding}) ===`);
  const cmdArgs = ['wrangler', 'd1', 'execute', db.database_name, '--file', schemaRel];
  cmdArgs.push(local ? '--local' : '--remote');
  cmdArgs.push('--yes');
  try {
    // Windows 上 Node 不能直接 spawn .cmd（EINVAL），要走 cmd.exe
    if (isWin) {
      execFileSync('cmd.exe', ['/c', 'npx.cmd', ...cmdArgs], { cwd: ROOT, stdio: 'inherit' });
    } else {
      execFileSync('npx', cmdArgs, { cwd: ROOT, stdio: 'inherit' });
    }
  } catch (error) {
    failed += 1;
    console.error(`❌ ${db.database_name} 失败：${error.message}`);
  }
}

console.log('');
if (failed) {
  console.error(`❌ 完成，但有 ${failed} 个库失败`);
  process.exit(1);
}
console.log(`✅ 全部完成：${targets.length} 个库`);
