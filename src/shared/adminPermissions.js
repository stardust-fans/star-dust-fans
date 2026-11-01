// 后台管理员的角色与权限范围定义（worker 与后台前端共用）
//
// 权限粒度 = 后台侧边栏的一个模块。超级管理员（role='super'）拥有全部权限，
// 并能管理其他管理员账号；普通管理员（role='admin'）只能操作 permissions 里列出的模块。
// 兼容旧数据：permissions 为 NULL 的账号视为"全部权限"（升级前的管理员都是全权的）。

export const ADMIN_PERMISSIONS = [
  { key: 'review', label: '投稿审核', desc: '审核通过 / 驳回同人与量贩投稿' },
  { key: 'songs', label: '歌曲数据', desc: '新增、修改、删除歌曲（视频）数据' },
  { key: 'daily', label: '吸尘器日报', desc: '新增、修改、删除日报' },
  { key: 'fanart', label: '同人作品', desc: '新增、修改、删除同人作品' },
  { key: 'shop', label: '量贩作品', desc: '新增、修改、删除量贩商品' },
  { key: 'tags', label: '标签管理', desc: '新增、删除分类标签' },
  { key: 'thanks', label: '特别感谢', desc: '维护特别感谢名单' },
  { key: 'audit', label: '安全记录', desc: '查看后台审计日志' },
];

export const ADMIN_PERMISSION_KEYS = ADMIN_PERMISSIONS.map((item) => item.key);

export const ADMIN_ROLES = [
  { key: 'super', label: '超级管理员', desc: '全部权限，并可管理其他管理员账号' },
  { key: 'admin', label: '普通管理员', desc: '只能操作下方勾选的模块' },
];

// 仅超级管理员可用的权限（不出现在普通管理员的勾选列表里）
export const SUPER_ONLY_PERMISSIONS = ['admins'];

// 后台侧边栏路由 ↔ 权限范围
export const ADMIN_ROUTE_PERMISSIONS = {
  songs: 'songs',
  daily: 'daily',
  fanart: 'fanart',
  shop: 'shop',
  tags: 'tags',
  pending: 'review',
  'audit-log': 'audit',
  thanks: 'thanks',
  admins: 'admins',
};

export function normalizeAdminRole(role) {
  return role === 'super' ? 'super' : 'admin';
}

// 解析数据库里的 permissions 字段：NULL 表示"全部权限"（旧账号）
export function parseAdminPermissions(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    const valid = list.filter((key) => ADMIN_PERMISSION_KEYS.includes(key));
    return Array.from(new Set(valid));
  } catch {
    return [];
  }
}

export function serializeAdminPermissions(permissions) {
  if (permissions === null || permissions === undefined) return null;
  if (!Array.isArray(permissions)) return null;
  const valid = permissions.filter((key) => ADMIN_PERMISSION_KEYS.includes(key));
  return JSON.stringify(Array.from(new Set(valid)));
}

// 是否拥有某模块权限
export function adminHasPermission(admin, scope) {
  if (!admin) return false;
  if (SUPER_ONLY_PERMISSIONS.includes(scope)) {
    // 仅超级管理员（或旧的全权账号）可以管理管理员账号
    return admin.role === 'super' || admin.permissions === null;
  }
  if (admin.role === 'super') return true;
  if (admin.permissions === null) return true;
  return Array.isArray(admin.permissions) && admin.permissions.includes(scope);
}

export function adminIsSuper(admin) {
  return Boolean(admin) && (admin.role === 'super' || admin.permissions === null);
}
