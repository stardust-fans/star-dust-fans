export const ADMIN_RESOURCES = [
  { key: 'songs', label: '歌曲数据' },
  { key: 'daily', label: '吸尘器日报' },
  { key: 'fanart', label: '同人作品' },
  { key: 'shop', label: '量贩作品' },
  { key: 'tags', label: '标签管理' },
  { key: 'review', label: '投稿审核' },
  { key: 'thanks', label: '特别感谢' },
  { key: 'audit', label: '安全记录', readOnly: true },
  { key: 'comments', label: '评论管理' },
  { key: 'manage', label: '账号与权限组' },
];

export const ADMIN_PERMISSIONS = ADMIN_RESOURCES.flatMap(resource =>
  (resource.readOnly ? ['read'] : ['read', 'write']).map(action => ({
    key: resource.key + ':' + action,
    label: resource.label + ' · ' + (action === 'read' ? '读取' : '修改'),
  }))
);
export const ADMIN_PERMISSION_KEYS = ADMIN_PERMISSIONS.map(item => item.key);

export function adminHasPermission(admin, permission) {
  if (!ADMIN_PERMISSION_KEYS.includes(permission) || !Array.isArray(admin?.permissions)) return false;
  if (admin.permissions.includes(permission)) return true;
  return permission.endsWith(':read') && admin.permissions.includes(permission.slice(0, -5) + ':write');
}

export function effectiveAdminPermissions(account, groups) {
  const memberIds = new Set(account.groupIds);
  const granted = new Set(groups.filter(group => memberIds.has(group.id)).flatMap(group => group.permissions));
  return ADMIN_PERMISSION_KEYS.filter(key => adminHasPermission({ permissions: [...granted] }, key));
}

export function adminGroups(account, groups) {
  return groups.filter(group => account.groupIds.includes(group.id)).map(group => ({ id: group.id, name: group.name }));
}
