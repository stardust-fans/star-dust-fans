import { ADMIN_PERMISSION_KEYS } from './adminPermissions.js';

export const ADMIN_GROUP_PRESETS = [
  { id: 'ordinary', name: '普通用户', description: '不授予后台权限', permissions: [] },
  { id: 'observers', name: '只读观察员', description: '只读查看内容管理模块', permissions: ['songs:read', 'daily:read', 'fanart:read', 'shop:read', 'tags:read', 'thanks:read'] },
  { id: 'songs-admins', name: '歌曲区管理员', description: '管理歌曲数据', permissions: ['songs:write'] },
  { id: 'daily-admins', name: '日报区管理员', description: '管理吸尘器日报', permissions: ['daily:write'] },
  { id: 'fanart-admins', name: '同人区管理员', description: '管理同人作品', permissions: ['fanart:write'] },
  { id: 'shop-admins', name: '量贩区管理员', description: '管理量贩作品', permissions: ['shop:write'] },
  { id: 'reviewers', name: '投稿审核员', description: '审核投稿', permissions: ['review:write'] },
  { id: 'tags-admins', name: '标签管理员', description: '管理标签', permissions: ['tags:write'] },
  { id: 'thanks-admins', name: '致谢维护员', description: '维护特别感谢', permissions: ['thanks:write'] },
  { id: 'comment-moderators', name: '评论管理员', description: '管理评论', permissions: ['comments:write'] },
  { id: 'auditors', name: '安全审计员', description: '查看安全记录', permissions: ['audit:read'] },
  { id: 'account-managers', name: '账号与权限管理员', description: '管理后台账号和权限组', permissions: ['manage:write'] },
  { id: 'owners', name: '站点管理员', description: '管理全部后台模块', permissions: [...ADMIN_PERMISSION_KEYS] },
];
