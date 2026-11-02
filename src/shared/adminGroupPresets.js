import { ADMIN_PERMISSION_KEYS } from './adminPermissions.js';

export const ADMIN_GROUP_PRESETS = [
  { id: 'ordinary', name: '普通用户', description: '不授予后台权限', permissions: [] },
  { id: 'observers', name: '只读成员', description: '只读查看内容管理模块', permissions: ['songs:read', 'daily:read', 'fanart:read', 'shop:read', 'tags:read', 'thanks:read'] },
  { id: 'regional', name: '区域管理员', description: '请选择负责模块并授予相应权限', permissions: [] },
  { id: 'owners', name: '站点管理员', description: '管理全部后台模块', permissions: [...ADMIN_PERMISSION_KEYS] },
];
