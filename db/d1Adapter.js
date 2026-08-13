// db/d1Adapter.js
class D1Adapter {
    constructor(db) {
        this.db = db;
        console.log('✅ D1 适配器已初始化');
    }

    // 查询多条
    async query(sql, params = []) {
        const stmt = this.db.prepare(sql);
        const result = await stmt.bind(...params).all();
        return result.results || [];
    }

    // 查询单条
    async queryOne(sql, params = []) {
        const stmt = this.db.prepare(sql);
        const result = await stmt.bind(...params).first();
        return result || null;
    }

    // 执行插入/更新/删除
    async execute(sql, params = []) {
        const stmt = this.db.prepare(sql);
        const result = await stmt.bind(...params).run();
        return { lastId: result.meta?.last_row_id || null, changes: result.meta?.changes || 0 };
    }
}

module.exports = D1Adapter;