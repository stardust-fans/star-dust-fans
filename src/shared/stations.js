// 站点清单：以后加子站只改这里
//
// colors：应援色。单色写成 ['#RRGGBB']，渐变会自动补 #FFFFFF；
//         双色写成 ['起始色', '结束色']，直接两色渐变。
// status：'live' 可进入（当前站点）/ 'soon' 敬请期待（暂不开放预览）。

export const STATIONS = [
  {
    key: 'stardust',
    name: '星尘',
    en: 'Stardust',
    tagline: '吸尘器聚集地',
    colors: ['#9999FF', '#FFFF00'],
    status: 'live',
  },
  {
    key: 'shian',
    name: '诗岸',
    en: 'Shian',
    colors: ['#F6BE71', '#FFFFFF'],
    status: 'soon',
  },
  {
    key: 'chiyu',
    name: '赤羽',
    en: 'Chiyu',
    colors: ['#FF4004'],
    status: 'soon',
  },
  {
    key: 'haiyi',
    name: '海伊',
    en: 'Haiyi',
    colors: ['#A4D4FF'],
    status: 'soon',
  },
  {
    key: 'yongye',
    name: '永夜',
    en: 'Yongye',
    colors: ['#A36AF5'],
    status: 'soon',
  },
  {
    key: 'cangqiong',
    name: '苍穹',
    en: 'Cangqiong',
    colors: ['#7FB2A1'],
    status: 'soon',
  },
  {
    key: 'muxin',
    name: '牧心',
    en: 'Muxin',
    colors: ['#2A2859'],
    status: 'soon',
  },
];

const FALLBACK_FROM = '#9999FF';
const FALLBACK_TO = '#FFFFFF';

// 取出渐变的两端颜色：单应援色 → 应援色到白；双应援色 → 原样
export function stationColors(station) {
  const list = Array.isArray(station?.colors) ? station.colors.filter(Boolean) : [];
  const from = list[0] || FALLBACK_FROM;
  const to = list[1] || FALLBACK_TO;
  return [from, to];
}

export function stationGradient(station, deg = 135) {
  const [from, to] = stationColors(station);
  return `linear-gradient(${deg}deg, ${from}, ${to})`;
}
