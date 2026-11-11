import { ref } from 'vue';
import { themeVars } from '../../shared/sites.js';

// 站点配置（由 Worker 按域名解析后返回），模块级单例，全站只请求一次
const site = ref(null);
const sites = ref([]);
const loaded = ref(false);
let pending = null;

// 把站点 theme 里的字段写成 CSS 变量（字体 / 文字色 / 底色 / 强调色）
function applyTheme(config) {
  const vars = themeVars(config?.theme);
  const root = document.documentElement;
  for (const [cssVar, value] of Object.entries(vars)) {
    root.style.setProperty(cssVar, value);
  }
}

async function load() {
  if (loaded.value) return site.value;
  if (pending) return pending;

  pending = fetch('/api/site', { headers: { Accept: 'application/json' } })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data?.current) {
        site.value = data.current;
        sites.value = Array.isArray(data.sites) ? data.sites : [];
        applyTheme(data.current);
      }
      return site.value;
    })
    // 拿不到配置就当作当前站正常，不要把页面搞挂
    .catch(() => null)
    .finally(() => {
      loaded.value = true;
      pending = null;
    });

  return pending;
}

export function useSite() {
  return { site, sites, loaded, load };
}
