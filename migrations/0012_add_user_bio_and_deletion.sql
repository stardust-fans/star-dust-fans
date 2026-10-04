-- Migration number: 0012 	 2026-09-27T00:00:00.000Z

-- ============================================================
-- 用户设置页：个人简介 + 注销标记
--   bio        用户可自行编辑的一句话简介
--   deleted_at 非空表示账号已注销（匿名化，保留投稿/评论的归属占位）
-- ============================================================
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;
