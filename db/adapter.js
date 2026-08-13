// db/adapter.js
const SQLiteAdapter = require('./sqliteAdapter');
const D1Adapter = require('./d1Adapter');

// 根据环境变量决定使用哪个适配器
// 在本地开发时设置 NODE_ENV=development，部署到 Worker 时自动识别
function getAdapter(env = {}) {
    // 如果存在 env.DB（Cloudflare Worker 环境），使用 D1
    if (env.DB) {
        console.log('🔌 使用 D1 适配器 (Cloudflare Worker)');
        return new D1Adapter(env.DB);
    }

    // 否则使用 SQLite（本地开发）
    console.log('🔌 使用 SQLite 适配器 (本地开发)');
    return new SQLiteAdapter('./data/star_dust.db');
}

module.exports = { getAdapter };