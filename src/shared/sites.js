// ===== 多站点配置：全站唯一真源 =====
//
// 一个仓库、一套代码服务多个角色站点，靠这个文件描述：
//   - 站点标题 / 副标题 / 应援色（选择面板的渐变）
//   - 该站绑定的内容库（wrangler.jsonc 里的 D1 绑定名）
//   - 该站对应的域名
//   - 是否开放（status）
//
// 身份数据（users / admins / audit_logs / oidc_* / saml_* / scim_*）永远只放在
// IDENTITY_DB 这一个库里，不进各站的内容库 —— 否则账户就不互通了。

export const DEFAULT_SITE = 'stardust';

// 身份库绑定名（wrangler.jsonc 里的 binding）
export const IDENTITY_DB = 'DB';

// colors：应援色。单色写 ['#RRGGBB']（渐变自动补 #FFFFFF），双色写 ['#A', '#B']
// theme：站点主题色（覆盖 CSS 变量）。不写就用现在这套默认配色
// contentDb：该站内容表所在的 D1 绑定；暂时都指向 DB（尘站的库），后续再切
export const SITES = {
  stardust: {
    key: 'stardust',
    name: '星尘',
    en: 'Stardust',
    tagline: '吸尘器聚集地',
    colors: ['#9999FF', '#FFFF00'],
    origins: ['stardustinfinity.top', 'www.stardustinfinity.top'],
    contentDb: 'DB',
    status: 'live',
    features: { live2d: true, forum: true, shop: true },
  },
  shian: {
    key: 'shian',
    name: '诗岸',
    en: 'Shian',
    colors: ['#F6BE71', '#FFFFFF'],
    origins: ['shian.stardustinfinity.top'],
    contentDb: 'DB_SHIAN',
    status: 'soon',
  },
  chiyu: {
    key: 'chiyu',
    name: '赤羽',
    en: 'Chiyu',
    colors: ['#FF4004'],
    origins: ['chiyu.stardustinfinity.top'],
    contentDb: 'DB_CHIYU',
    status: 'soon',
  },
  haiyi: {
    key: 'haiyi',
    name: '海伊',
    en: 'Haiyi',
    colors: ['#A4D4FF'],
    origins: ['haiyi.stardustinfinity.top'],
    contentDb: 'DB_HAIYI',
    status: 'soon',
  },
  yongye: {
    key: 'yongye',
    name: '永夜',
    en: 'Yongye',
    colors: ['#A36AF5'],
    origins: ['yongye.stardustinfinity.top'],
    contentDb: 'DB_YONGYE',
    status: 'soon',
  },
  cangqiong: {
    key: 'cangqiong',
    name: '苍穹',
    en: 'Cangqiong',
    colors: ['#7FB2A1'],
    origins: ['cangqiong.stardustinfinity.top'],
    contentDb: 'DB_CANGQIONG',
    status: 'soon',
  },
  muxin: {
    key: 'muxin',
    name: '牧心',
    en: 'Muxin',
    colors: ['#2A2859'],
    origins: ['muxin.stardustinfinity.top'],
    contentDb: 'DB_MUXIN',
    status: 'soon',
  },
};

// 展示顺序（选择面板 / 站点列表）
export const SITE_ORDER = ['stardust', 'shian', 'chiyu', 'haiyi', 'yongye', 'cangqiong', 'muxin'];

// 所有站点域名（校验"这个附件 URL 是否属于本站体系"时用）
export const SITE_HOSTS = new Set(
  Object.values(SITES).flatMap((site) => site.origins || [])
);

// 站点对外主域名（含协议）
export function siteOrigin(site) {
  const host = site?.origins?.[0];
  return host ? `https://${host}` : '';
}

export function siteList() {
  return SITE_ORDER.map((key) => SITES[key]).filter(Boolean);
}

// 按域名找站点：认不出来就回默认站（localhost、预览域名等都落到默认站）
export function resolveSiteByHost(host) {
  const name = String(host || '').toLowerCase().split(':')[0];
  for (const key of SITE_ORDER) {
    const site = SITES[key];
    if (site?.origins?.includes(name)) return site;
  }
  return SITES[DEFAULT_SITE];
}

const FALLBACK_FROM = '#9999FF';
const FALLBACK_TO = '#FFFFFF';

// 渐变两端：单应援色 → 应援色到白；双应援色 → 首色到次色
export function stationColors(site) {
  const list = Array.isArray(site?.colors) ? site.colors.filter(Boolean) : [];
  const from = list[0] || FALLBACK_FROM;
  const to = list[1] || FALLBACK_TO;
  return [from, to];
}

export function stationGradient(site, deg = 135) {
  const [from, to] = stationColors(site);
  return `linear-gradient(${deg}deg, ${from}, ${to})`;
}

// 发给浏览器的公开配置：不含 contentDb / 内部字段
export function publicSiteConfig(site) {
  return {
    key: site.key,
    name: site.name,
    en: site.en,
    tagline: site.tagline || '',
    colors: site.colors || [],
    status: site.status,
    theme: site.theme || null,
    features: site.features || null,
  };
}

export function publicSiteList() {
  return siteList().map(publicSiteConfig);
}
