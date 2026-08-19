CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bvid VARCHAR(20) NOT NULL UNIQUE,
    title TEXT,
    cover_base64 TEXT,
    cover_url TEXT,
    description TEXT,
    duration INTEGER DEFAULT 0,
    pubdate INTEGER DEFAULT 0,
    owner_name TEXT,
    owner_mid INTEGER,
    owner_face TEXT,
    stat_view INTEGER DEFAULT 0,
    stat_danmaku INTEGER DEFAULT 0,
    stat_reply INTEGER DEFAULT 0,
    stat_favorite INTEGER DEFAULT 0,
    stat_coin INTEGER DEFAULT 0,
    stat_share INTEGER DEFAULT 0,
    stat_like INTEGER DEFAULT 0,
    snapshot_synced_at TIMESTAMP,
    is_masterpiece BOOLEAN DEFAULT 0,
    is_national_team BOOLEAN DEFAULT 0,
    is_gods_descend BOOLEAN DEFAULT 0,
    is_legend BOOLEAN DEFAULT 0,
    special_tags TEXT,
    collaboration_details TEXT,
    status VARCHAR(20) DEFAULT 'published',
    flag_reason TEXT,
    flag_details TEXT,
    flag_link TEXT,
    flagged_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(200) NOT NULL,
    content TEXT,
    source_url VARCHAR(500),
    cover_url VARCHAR(500),
    publish_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'published',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fanart (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(200) NOT NULL,
    author VARCHAR(100),
    description TEXT,
    image_url VARCHAR(500),
    bilibili_url VARCHAR(500),
    source_url VARCHAR(500),
    type VARCHAR(20) DEFAULT 'illust',
    status VARCHAR(20) DEFAULT 'published',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shop (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    price VARCHAR(50),
    image_url VARCHAR(500),
    bilibili_url VARCHAR(500),
    xianyu_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'waiting',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type VARCHAR(20) NOT NULL,
    actor_admin_id INTEGER,
    actor_username TEXT,
    target_table VARCHAR(20),
    target_id INTEGER,
    summary TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 普通用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 投稿关联表（记录用户投稿的内容）
CREATE TABLE IF NOT EXISTS user_contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content_type VARCHAR(20) NOT NULL, -- 'fanart' 或 'shop'
    content_id INTEGER NOT NULL,       -- 对应 fanart.id 或 shop.id
    status VARCHAR(20) DEFAULT 'pending', -- 'pending' / 'approved' / 'rejected'
    reviewer_admin_id INTEGER,
    review_comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_admin_id) REFERENCES admins(id) ON DELETE SET NULL
);

-- 为 user_id 和 status 建索引，方便后台审核查询
CREATE INDEX IF NOT EXISTS idx_user_contributions_user_id ON user_contributions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_contributions_status ON user_contributions (status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);