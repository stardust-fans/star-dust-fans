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
// theme：字体 / 文字色 / 底色 / 强调色，写哪个就覆盖哪个 CSS 变量：
//        fontDisplay fontMono fontBody
//        ink inkSoft inkMuted inkFaint
//        paper paperRaised line lineStrong
//        cobalt cobaltSoft cobaltWash gold goldSoft
// background：星空与粒子层。crystal = { color, halo, opacity: [min,max], motion }
//             particles = { colors: [...], density }
//             不写就用 DEFAULT_BACKGROUND
// contentDb：该站内容表所在的 D1 绑定
// copy：站点文案。只写要覆盖的字段，其余自动回落默认站（stardust）的写法
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
    // 默认站文案 = 全站兜底，改这里会同时影响所有没写自己 copy 的站
    copy: {
      nav: {
        home: '主页',
        videos: '视频',
        lyrics: '歌词',
        fanart: '同人',
        shop: '量贩',
        daily: '日报',
        starmap: '星图',
        forum: '论坛',
        about: '关于',
      },
      hero: {
        badge: 'STARDUST · 中文虚拟歌姬',
        title: '星尘',
        subtitle: '众星因你，皆降为尘',
        desc: [
          '诞生于宇宙高次位面「以太之海」，',
          '发丝蓄满以太的蓝，每首歌里都带着点来处的遥远。',
        ],
        info: [
          { label: '生日', value: '08.12 · 狮子座' },
          { label: '体型', value: '160cm · 16岁' },
          { label: '代表色', value: '钴蓝 / 金黄' },
        ],
        aboutTitle: '关于星尘',
        aboutSubtitle: '设定档案 · 声库资讯',
        aboutCards: [
          {
            index: '01 · 声库',
            title: '声源与发行',
            lines: ['北京福托科技 · 2016.02.20 发售', '声源：茶理理'],
          },
          {
            index: '02 · 生日',
            title: '生日与星座',
            lines: ['8月12日 · 狮子座', '16岁 · 身高 160cm'],
          },
          {
            index: '03 · 色彩',
            title: '代表色',
            lines: ['钴蓝 #9999FF · 黄 #FFFF00', '「众星因你，皆降为尘」'],
          },
          {
            index: '04 · 设定',
            title: '世界观',
            lines: ['诞生于宇宙高次位面「以太之海」', '头发由以太构成，能发出钴蓝色光晕'],
          },
        ],
      },
      about: {
        title: '关于星尘粉丝站',
        subtitle: '一个由星尘爱好者维护的非官方站点',
      },
      footer: '✦ 众星为你· 皆降为尘 ✦',
    },
  },
  shian: {
    key: 'shian',
    name: '诗岸',
    en: 'Shian',
    colors: ['#F6BE71', '#FFFFFF'],
    origins: ['shian.stardustinfinity.top'],
    contentDb: 'DB_SHIAN',
    status: 'live',
    // 桌宠模型是豆丁星尘，诗岸站先不显示
    features: { live2d: false, forum: true, shop: true },
    // TODO(主题)：想改诗岸的字体 / 配色 / 背景，取消注释后改值即可
    // theme: {
    //   cobalt: '#F6BE71',            // 强调色：按钮、链接、星空渐变
    //   gold: '#FFE0A8',
    //   paper: '#0a0906',             // 页面底色
    //   paperRaised: '#14110b',       // 卡片底色
    //   ink: '#f2e8d8',               // 正文
    //   inkSoft: '#cdbfa8',
    //   inkMuted: '#8f8471',
    //   inkFaint: '#5a5346',
    //   fontBody: "'Noto Serif SC', serif",
    // },
    // background: {
    //   crystal: { color: '#F6BE71', halo: '#4a7ad6' },
    //   particles: { colors: ['#F6BE71', '#ffffff', '#ffe6b8'], density: 60 },
    // },
    // TODO(文案)：以下占位待填，没写的字段会用尘站的
    copy: {
      hero: {
        badge: 'SHIAN · 中文虚拟歌姬',
        title: '诗岸',
        subtitle: '落笔成诗，传于彼岸',
        desc: ['从大地里传来的声音，是大地的孩子',
              '她的歌声如诗如画，传递着无尽的情感与故事。',
        ],
        info: [
          { label: '生日', value: '01·19' },
          { label: '体型', value: '140cm · 14岁' },
          { label: '代表色', value: '#F6BE71' },
        ],
        aboutTitle: '关于诗岸',
        aboutCards: [
          { index: '01 · 声库', title: '声源与发行', lines: ['Warma'] },
          { index: '02 · 生日', title: '生日与星座', lines: ['1月19日 · 摩羯座'] },
          { index: '03 · 色彩', title: '代表色', lines: ['#F6BE71', '「诗岸黄」'] },
          { index: '04 · 设定', title: '世界观', lines: ['大地的孩子，代表物是正六边形，这是土在几何中最简单的代表。'] },
        ],
      },
      about: {
        title: '关于诗岸粉丝站',
        subtitle: '一个由诗岸爱好者维护的非官方站点',
      },
      footer: '✦ 落笔成诗，传于彼岸 ✦',
    },
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
  // 本地预览子站：shian.localhost / chiyu.localhost → 对应站点
  // （浏览器会把 *.localhost 解析到 127.0.0.1，不用改 hosts）
  const localMatch = name.match(/^([a-z0-9-]+)\.localhost$/);
  if (localMatch && SITES[localMatch[1]]) return SITES[localMatch[1]];

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

// ===== 站点文案 =====
// 只覆盖写了的字段，其余回落默认站；nav / hero / about 三个嵌套对象单独合并，
// 所以子站只写 hero.subtitle 也不会把 hero 的其它字段冲掉。
export function siteCopy(keyOrSite) {
  const key = typeof keyOrSite === 'string' ? keyOrSite : keyOrSite?.key;
  const base = SITES[DEFAULT_SITE]?.copy || {};
  const own = (SITES[key] || SITES[DEFAULT_SITE])?.copy || {};
  return {
    ...base,
    ...own,
    nav: { ...(base.nav || {}), ...(own.nav || {}) },
    hero: { ...(base.hero || {}), ...(own.hero || {}) },
    about: { ...(base.about || {}), ...(own.about || {}) },
  };
}

// ===== 站点主题（字体 / 文字色 / 底色 / 强调色）=====
// site.theme 里写哪个键就覆盖哪个 CSS 变量，没写的一律沿用 style.css 的默认值。
export const THEME_CSS_VARS = {
  // 字体
  fontDisplay: '--font-display',
  fontMono: '--font-mono',
  fontBody: '--font-body',
  // 文字
  ink: '--ink',
  inkSoft: '--ink-soft',
  inkMuted: '--ink-muted',
  inkFaint: '--ink-faint',
  // 底色
  paper: '--paper',
  paperRaised: '--paper-raised',
  // 线条
  line: '--line',
  lineStrong: '--line-strong',
  // 强调色（也决定星空渐变、按钮、链接）
  cobalt: '--cobalt',
  cobaltSoft: '--cobalt-soft',
  cobaltWash: '--cobalt-wash',
  gold: '--gold',
  goldSoft: '--gold-soft',
};

export function themeVars(theme) {
  const vars = {};
  for (const [field, cssVar] of Object.entries(THEME_CSS_VARS)) {
    if (theme && theme[field]) vars[cssVar] = theme[field];
  }
  return vars;
}

// ===== 站点背景（星空 WebGL + 粒子层）=====
// color / halo 用 CSS 十六进制色，挂载时会转成 0~1 的 RGB。
export const DEFAULT_BACKGROUND = {
  crystal: {
    color: '#ffd64a',
    halo: '#1c7aff',
    opacity: [1, 1],
    motion: 'diagonal',
  },
  particles: {
    colors: ['#ffe9a8', '#bcd0ff', '#ffffff', '#c7a2ff'],
    density: 74,
  },
};

export function siteBackground(keyOrSite) {
  const key = typeof keyOrSite === 'string' ? keyOrSite : keyOrSite?.key;
  const own = (SITES[key] || SITES[DEFAULT_SITE])?.background || {};
  return {
    crystal: { ...DEFAULT_BACKGROUND.crystal, ...(own.crystal || {}) },
    particles: { ...DEFAULT_BACKGROUND.particles, ...(own.particles || {}) },
  };
}

// '#rrggbb' → [r, g, b]（0~1），WebGL 用
export function hexToRgb01(hex) {
  const value = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(value)) return [1, 1, 1];
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}
