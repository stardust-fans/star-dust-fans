-- 作品标签（JSON 数组字符串），为空表示未分类
ALTER TABLE fanart ADD COLUMN tags TEXT DEFAULT NULL;

-- 标签库（管理员维护）
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(32) NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 预置默认标签
INSERT OR IGNORE INTO tags (name, sort_order) VALUES
    ('表情包', 1),
    ('同人', 2),
    ('原创曲', 3),
    ('翻唱曲', 4),
    ('教程', 5),
    ('MMD', 6);