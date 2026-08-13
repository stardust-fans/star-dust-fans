// db/sqliteAdapter.js
const Database = require('better-sqlite3');
const path = require('path');

class SQLiteAdapter {
    constructor(dbPath) {
        this.db = new Database(path.join(__dirname, '..', dbPath));
        // 初始化表结构（如果不存在）
        this.initTables();
    }

    initTables() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS songs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title VARCHAR(100) NOT NULL,
                singer_id INTEGER DEFAULT 1,
                bilibili_url TEXT,
                type VARCHAR(20),
                release_date DATE,
                cover_url TEXT,
                is_masterpiece BOOLEAN DEFAULT 0,
                is_national_team BOOLEAN DEFAULT 0,
                is_gods_descend BOOLEAN DEFAULT 0,
                special_tags TEXT,
                collaboration_details TEXT,
                status VARCHAR(20) DEFAULT 'published',
                flag_reason TEXT,
                flag_details TEXT,
                flag_link TEXT,
                flagged_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_songs_status ON songs(status);
            CREATE INDEX IF NOT EXISTS idx_songs_singer ON songs(singer_id);
        `);
        console.log('✅ SQLite 表初始化完成');
    }

    // 查询多条
    query(sql, params = []) {
        const stmt = this.db.prepare(sql);
        return stmt.all(...params);
    }

    // 查询单条
    queryOne(sql, params = []) {
        const stmt = this.db.prepare(sql);
        return stmt.get(...params);
    }

    // 执行插入/更新/删除
    execute(sql, params = []) {
        const stmt = this.db.prepare(sql);
        const result = stmt.run(...params);
        return { lastId: result.lastInsertRowid, changes: result.changes };
    }

    // 关闭连接
    close() {
        this.db.close();
    }
}

module.exports = SQLiteAdapter;