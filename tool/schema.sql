CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bvid VARCHAR(20) NOT NULL UNIQUE,
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);