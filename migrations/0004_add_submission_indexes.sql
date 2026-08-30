-- Migration number: 0004

CREATE INDEX IF NOT EXISTS idx_fanart_user_id ON fanart (user_id);
CREATE INDEX IF NOT EXISTS idx_fanart_status ON fanart (status);
CREATE INDEX IF NOT EXISTS idx_shop_user_id ON shop (user_id);
CREATE INDEX IF NOT EXISTS idx_shop_status ON shop (status);
