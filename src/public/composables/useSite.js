import { ref } from 'vue';

// 站点配置（由 Worker 按域名解析后返回），模块级单例，全站只请求一次
const site = ref(null);
const sites = ref([]);
const loaded = ref(false);
let pending = null;

function applyTheme(config) {
  const theme = config?.theme;
  if (!theme) return;
  const root = document.documentElement;
  if (theme.cobalt) root.style.setProperty('--cobalt', theme.cobalt);
  if (theme.gold) root.style.setProperty('--gold', theme.gold);
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
