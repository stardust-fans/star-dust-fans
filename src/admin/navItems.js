// 后台侧边栏导航项（键名同时是路由名，scope 是所需权限）
export const NAV_ITEMS = [
  { key: 'songs', label: '歌曲管理', icon: 'fa-music', scope: 'songs:read' },
  { key: 'daily', label: '吸尘器日报', icon: 'fa-newspaper', scope: 'daily:read' },
  { key: 'fanart', label: '同人作品', icon: 'fa-palette', scope: 'fanart:read' },
  { key: 'shop', label: '量贩管理', icon: 'fa-store', scope: 'shop:read' },
  { key: 'tags', label: '标签管理', icon: 'fa-tags', scope: 'tags:read' },
  { key: 'pending', label: '投稿审核', icon: 'fa-clock', scope: 'review:read' },
  { key: 'thanks', label: '特别感谢', icon: 'fa-heart', scope: 'thanks:read' },
  { key: 'audit-log', label: '安全记录', icon: 'fa-shield-halved', scope: 'audit:read' },
  { key: 'admins', label: '管理员账户', icon: 'fa-user-gear', scope: 'manage:read' },
];

export function scopeOfRoute(name) {
  return NAV_ITEMS.find((item) => item.key === name)?.scope || null;
}
