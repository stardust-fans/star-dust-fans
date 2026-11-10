-- ============================================================================
-- 子站内容库 schema（每个角色站点一个 D1）
--
-- 只放"内容"表：songs / daily / fanart / shop / tags / comments / likes / forum_*
-- 身份表（users / admins / audit_logs / oidc_* / saml_* / scim_*）**不在这里**，
-- 它们永远只存在身份库（wrangler.jsonc 里的 DB 绑定），这样所有子站共用一套账号。
--
-- 注意：跨库外键在 D1 里不可用，所以 user_id 只保留列和索引、不写 REFERENCES users(id)。
-- 站内引用（comments.parent_id / forum_threads.board_id / forum_posts.thread_id）
-- 在同一库内，保留外键。
--
-- 用法：
--   node tool/d1-content-init.mjs            # 给 wrangler.jsonc 里所有子站内容库灌一份
--   npx wrangler d1 execute shian-db --remote --file tool/content-schema.sql   # 单库
-- ============================================================================

-- ===== 歌曲 =====
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

-- ===== 日报 =====
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

-- ===== 同人 =====
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
    flag_reason TEXT,
    images TEXT,
    tags TEXT DEFAULT NULL,
    attachments TEXT DEFAULT NULL,
    user_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== 量贩 =====
CREATE TABLE IF NOT EXISTS shop (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    price VARCHAR(50),
    image_url VARCHAR(500),
    bilibili_url VARCHAR(500),
    xianyu_url VARCHAR(500),
    other_url VARCHAR(500),
    ship_time TIMESTAMP,
    images TEXT,
    flag_reason TEXT,
    user_id INTEGER,
    status VARCHAR(20) DEFAULT 'waiting',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== 标签 =====
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(32) NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO tags (name, sort_order) VALUES
    ('表情包', 1),
    ('同人', 2),
    ('原创曲', 3),
    ('翻唱曲', 4),
    ('教程', 5),
    ('MMD', 6);

-- ===== 评论（通用）=====
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    target_type VARCHAR(20) NOT NULL,
    target_id INTEGER NOT NULL,
    parent_id INTEGER DEFAULT NULL,
    content TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'published',
    metadata TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES comments(id)
);

-- ===== 点赞（通用）=====
CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    target_type VARCHAR(20) NOT NULL,
    target_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, target_type, target_id)
);

-- ===== 论坛 =====
CREATE TABLE IF NOT EXISTS forum_boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(50) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    description TEXT DEFAULT NULL,
    icon VARCHAR(50) DEFAULT NULL,
    sort_order INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    metadata TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forum_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    is_pinned INTEGER DEFAULT 0,
    is_locked INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    last_reply_at TIMESTAMP DEFAULT NULL,
    last_reply_user_id INTEGER DEFAULT NULL,
    status VARCHAR(20) DEFAULT 'published',
    metadata TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (board_id) REFERENCES forum_boards(id)
);

CREATE TABLE IF NOT EXISTS forum_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    parent_id INTEGER DEFAULT NULL,
    content TEXT NOT NULL,
    floor_number INTEGER DEFAULT NULL,
    like_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'published',
    metadata TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thread_id) REFERENCES forum_threads(id),
    FOREIGN KEY (parent_id) REFERENCES forum_posts(id)
);

-- 默认版块（描述保持中性，不绑定具体角色）
INSERT OR IGNORE INTO forum_boards (name, slug, description, icon, sort_order) VALUES
    ('综合讨论', 'general', '相关的一切话题', 'fa-comments', 1),
    ('二创分享', 'creation', '同人作品、翻唱、绘画分享', 'fa-palette', 2),
    ('站务', 'meta', '站点运营、反馈、建议', 'fa-bullhorn', 3);

-- ===== 索引 =====
CREATE INDEX IF NOT EXISTS idx_fanart_user_id ON fanart (user_id);
CREATE INDEX IF NOT EXISTS idx_fanart_status ON fanart (status);
CREATE INDEX IF NOT EXISTS idx_shop_user_id ON shop (user_id);
CREATE INDEX IF NOT EXISTS idx_shop_status ON shop (status);
CREATE INDEX IF NOT EXISTS idx_songs_status ON songs (status);
CREATE INDEX IF NOT EXISTS idx_daily_status ON daily (status);

CREATE INDEX IF NOT EXISTS idx_comments_target ON comments (target_type, target_id, status);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments (user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_likes_target ON likes (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_likes_user ON likes (user_id);

CREATE INDEX IF NOT EXISTS idx_forum_boards_status ON forum_boards (status, sort_order);
CREATE INDEX IF NOT EXISTS idx_forum_threads_board ON forum_threads (board_id, status, is_pinned DESC, last_reply_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_threads_user ON forum_threads (user_id);
CREATE INDEX IF NOT EXISTS idx_forum_threads_last_reply ON forum_threads (last_reply_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_thread ON forum_posts (thread_id, status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_user ON forum_posts (user_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_parent ON forum_posts (parent_id);
