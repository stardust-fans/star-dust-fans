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
    flag_reason TEXT,
    images TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
    ship_time TIMESTAMP,
    images TEXT,
    flag_reason TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_fanart_user_id ON fanart (user_id);
CREATE INDEX IF NOT EXISTS idx_fanart_status ON fanart (status);
CREATE INDEX IF NOT EXISTS idx_shop_user_id ON shop (user_id);
CREATE INDEX IF NOT EXISTS idx_shop_status ON shop (status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS oidc_authorization_codes (
    code_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    nonce TEXT NOT NULL,
    scope TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    response_mode TEXT NOT NULL DEFAULT 'query',
    dpop_jkt TEXT,
    request_uri_hash TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oidc_authorization_codes_expiry
ON oidc_authorization_codes (expires_at);

CREATE TABLE IF NOT EXISTS oidc_access_tokens (
    token_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    scope TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    token_type TEXT NOT NULL DEFAULT 'Bearer',
    dpop_jkt TEXT,
    issued_at INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oidc_access_tokens_expiry
ON oidc_access_tokens (expires_at);

CREATE INDEX IF NOT EXISTS idx_oidc_access_tokens_client
ON oidc_access_tokens (client_id, expires_at);

CREATE TABLE IF NOT EXISTS oidc_refresh_tokens (
    token_hash TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    scope TEXT NOT NULL,
    token_type TEXT NOT NULL DEFAULT 'Bearer',
    dpop_jkt TEXT,
    expires_at INTEGER NOT NULL,
    issued_at INTEGER NOT NULL,
    used_at INTEGER,
    revoked_at INTEGER,
    replaced_by_hash TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oidc_refresh_tokens_family
ON oidc_refresh_tokens (family_id, expires_at);

CREATE TABLE IF NOT EXISTS oidc_par_requests (
    request_uri_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    parameters TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_oidc_par_requests_expiry
ON oidc_par_requests (expires_at);

CREATE TABLE IF NOT EXISTS oidc_device_authorizations (
    device_code_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    user_code TEXT NOT NULL UNIQUE,
    scope TEXT NOT NULL,
    nonce TEXT,
    code_challenge TEXT,
    code_challenge_method TEXT,
    user_id INTEGER,
    approval_nonce_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at INTEGER NOT NULL,
    interval_seconds INTEGER NOT NULL DEFAULT 5,
    last_polled_at INTEGER,
    approved_at INTEGER,
    consumed_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oidc_device_authorizations_expiry
ON oidc_device_authorizations (expires_at);

CREATE TABLE IF NOT EXISTS oidc_ciba_requests (
    auth_req_id_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    nonce TEXT,
    user_id INTEGER,
    binding_message TEXT,
    approval_nonce_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at INTEGER NOT NULL,
    interval_seconds INTEGER NOT NULL DEFAULT 5,
    last_polled_at INTEGER,
    approved_at INTEGER,
    consumed_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oidc_ciba_requests_expiry
ON oidc_ciba_requests (expires_at);

CREATE TABLE IF NOT EXISTS oidc_dynamic_clients (
    client_id TEXT PRIMARY KEY,
    client_secret_hash TEXT,
    client_name TEXT NOT NULL,
    redirect_uris TEXT NOT NULL,
    post_logout_redirect_uris TEXT NOT NULL,
    token_endpoint_auth_method TEXT NOT NULL,
    jwks TEXT,
    grant_types TEXT NOT NULL,
    response_types TEXT NOT NULL,
    scope TEXT NOT NULL,
    require_signed_request_object INTEGER NOT NULL DEFAULT 0,
    registration_access_token_hash TEXT NOT NULL,
    registration_access_token_expires_at INTEGER NOT NULL,
    client_secret_expires_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oidc_dynamic_clients_registration_token
ON oidc_dynamic_clients (registration_access_token_hash);

CREATE TABLE IF NOT EXISTS oidc_dpop_proofs (
    jti_hash TEXT PRIMARY KEY,
    jkt TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oidc_client_assertions (
    jti_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scim_user_state (
    user_id INTEGER PRIMARY KEY,
    external_id TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scim_user_state_external_id
ON scim_user_state (external_id);

CREATE TABLE IF NOT EXISTS scim_groups (
    id TEXT PRIMARY KEY,
    external_id TEXT,
    display_name TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scim_group_members (
    group_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES scim_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scim_groups_external_id
ON scim_groups (external_id);

CREATE TABLE IF NOT EXISTS saml_pending_requests (
    request_hash TEXT PRIMARY KEY,
    request_xml TEXT NOT NULL,
    relay_state TEXT,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_saml_pending_requests_expiry
ON saml_pending_requests (expires_at);
