-- Migration number: 0005 	 2026-09-10T00:00:00.000Z

-- ============================================================
-- 1. 评论表（通用，支持量贩、同人、日报、歌曲等）
-- ============================================================
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
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (parent_id) REFERENCES comments(id)
);

CREATE INDEX IF NOT EXISTS idx_comments_target ON comments (target_type, target_id, status);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments (user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments (created_at DESC);


-- ============================================================
-- 2. 点赞表（通用，支持多种内容类型）
-- ============================================================
CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    target_type VARCHAR(20) NOT NULL,
    target_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_target ON likes (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_likes_user ON likes (user_id);


-- ============================================================
-- 3. 论坛版块表
-- ============================================================
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

CREATE INDEX IF NOT EXISTS idx_forum_boards_status ON forum_boards (status, sort_order);


-- ============================================================
-- 4. 论坛主题帖表
-- ============================================================
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
    FOREIGN KEY (board_id) REFERENCES forum_boards(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_forum_threads_board ON forum_threads (board_id, status, is_pinned DESC, last_reply_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_threads_user ON forum_threads (user_id);
CREATE INDEX IF NOT EXISTS idx_forum_threads_last_reply ON forum_threads (last_reply_at DESC);


-- ============================================================
-- 5. 论坛回复表
-- ============================================================
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
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (parent_id) REFERENCES forum_posts(id)
);

CREATE INDEX IF NOT EXISTS idx_forum_posts_thread ON forum_posts (thread_id, status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_user ON forum_posts (user_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_parent ON forum_posts (parent_id);


-- ============================================================
-- 6. 初始化论坛版块
-- ============================================================
INSERT OR IGNORE INTO forum_boards (name, slug, description, icon, sort_order) VALUES
('综合讨论', 'general', '星尘相关的一切话题', 'fa-comments', 1),
('二创分享', 'creation', '同人作品、翻唱、绘画分享', 'fa-palette', 2),
('站务', 'meta', '站点运营、反馈、建议', 'fa-bullhorn', 3);