-- 管理员账号分组：角色 + 模块权限
-- role: 'super' 超级管理员 | 'admin' 普通管理员
-- permissions: JSON 数组（如 ["review","tags"]）；NULL = 全部权限（升级前的旧账号）

ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE admins ADD COLUMN permissions TEXT DEFAULT NULL;

-- 现有最早的账号提升为超级管理员；其余旧账号保留 NULL（= 全权），避免升级后突然失权
UPDATE admins SET role = 'super' WHERE id = (SELECT MIN(id) FROM admins);
