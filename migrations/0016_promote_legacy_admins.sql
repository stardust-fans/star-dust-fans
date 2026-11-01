-- 0015 只把"最早的账号"提升成超级管理员，但升级前所有管理员实际上都是全权账号
-- （permissions = NULL）。这里把仍然是 NULL 的账号统一标记为 super，
-- 让界面上显示的角色和实际拥有的权限一致，避免"看起来被降权"的错觉。
-- 新建的受限账号都有明确的 permissions 数组，不会被这条语句影响。
UPDATE admins SET role = 'super' WHERE permissions IS NULL;
