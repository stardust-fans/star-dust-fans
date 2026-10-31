<template>
  <div class="page-header lyrics-header">
    <div>
      <span class="eyebrow page-eyebrow">02 · Archive</span>
      <h1 class="page-title">歌词</h1>
      <p class="page-subtitle">
        把每一句，都收藏 · LRC × 尘站<template v-if="catalog"> · 共 {{ catalog.count }} 张专辑 · {{ catalog.song_count }} 首歌词</template>
      </p>
    </div>
    <div class="lyrics-header-actions">
      <a v-if="catalog" class="btn-hero-primary" :href="catalog.download_url" download="lrc-lyrics.zip">下载全部歌词 · {{ formatBytes(catalog.download_bytes) }}</a>
      <a class="btn-hero-secondary" :href="LRC_URL" target="_blank" rel="noopener">V宇宙词站 ↗</a>
    </div>
  </div>

  <div v-if="loading" class="loading-state" role="status">正在加载歌词目录…</div>
  <div v-else-if="error" class="empty-state" role="alert">
    <p>{{ error }}</p>
    <button class="btn-hero-secondary" type="button" @click="loadCatalog">重试</button>
  </div>
  <template v-else-if="catalog">
    <div class="lyrics-toolbar">
      <label class="lyrics-search">
        <span class="sr-only">搜索专辑</span>
        <input v-model="query" type="search" maxlength="200" placeholder="搜索专辑、歌姬、出品或曲目" />
      </label>
      <label class="lyrics-sort">
        排序
        <select v-model="sort">
          <option value="latest">最新</option>
          <option value="oldest">最早</option>
          <option value="name">名称</option>
        </select>
      </label>
    </div>
    <div class="vocal-tabs" role="group" aria-label="按歌姬筛选">
      <button type="button" class="vocal-tab" :aria-pressed="vocal === ''" @click="vocal = ''">
        全部 <span>{{ catalog.count }}</span>
      </button>
      <button v-for="option in vocalOptions" :key="option.name" type="button" class="vocal-tab"
        :aria-pressed="vocal === option.name" @click="vocal = option.name">
        {{ option.name }} <span>{{ option.count }}</span>
      </button>
    </div>

    <div v-if="visibleAlbums.length" class="card-grid">
      <article v-for="album in visibleAlbums" :key="album.slug" class="album-card">
        <div class="album-cover">
          <img v-if="album.cover" :src="album.cover" :alt="`《${album.name}》封面`" loading="lazy" decoding="async" />
          <span v-else class="album-cover-fallback" aria-hidden="true">{{ album.name }}</span>
        </div>
        <div class="album-info">
          <p class="album-meta">{{ releaseDate(album) || '发行日期不适用' }} · {{ album.song_count }} 首</p>
          <h2><a :href="album.source_url" target="_blank" rel="noopener">{{ album.name }}</a></h2>
          <p v-if="album.produce.length" class="album-credit">出品 · {{ album.produce.join('、') }}</p>
          <p v-if="album.lyric_maker.length" class="album-credit">歌词制作 · {{ album.lyric_maker.join('、') }}</p>
          <div v-if="album.vocal.length" class="tags">
            <span v-for="(name, index) in album.vocal" :key="index" class="tag" :class="{ stardust: STARDUST.test(name) }">{{ name }}</span>
          </div>
          <details class="album-tracks">
            <summary>曲目与单曲下载（{{ album.song_count }}）</summary>
            <ul>
              <li v-for="song in album.songs" :key="song.title">
                <span>{{ song.title }}</span>
                <a :href="song.download_url" :download="`${song.title}.lrc`" :aria-label="`下载《${song.title}》LRC 歌词`">LRC ↓</a>
              </li>
            </ul>
          </details>
          <div class="album-actions">
            <a class="album-download" :href="album.download_url" :download="`${album.folder}.zip`" :aria-label="`下载《${album.name}》专辑歌词包`">专辑 ZIP ↓ · {{ formatBytes(album.download_bytes) }}</a>
            <a class="link" :href="album.source_url" target="_blank" rel="noopener">专辑资料 ↗</a>
          </div>
        </div>
      </article>
    </div>
    <EmptyState v-else message="没有找到匹配的专辑，换个关键词或歌姬试试" />
    <SongPagination v-model:page="page" :page-count="pageCount" :total="filteredAlbums.length" unit="张专辑" label="歌词专辑分页" />

    <aside class="lyrics-license" aria-label="数据来源与许可">
      <p>歌词数据来自 <a :href="catalog.source.repository" target="_blank" rel="noopener">{{ catalog.source.name }}</a>，
        遵循 <a :href="catalog.source.license_url" target="_blank" rel="noopener">{{ catalog.source.license }}</a> 许可。请保留署名，以非商业方式使用，并以相同方式共享。</p>
      <p>{{ catalog.source.changes }}</p>
      <p>数据版本 <a :href="`${catalog.source.repository}/tree/${catalog.source.revision}`" target="_blank" rel="noopener">{{ catalog.source.revision.slice(0, 7) }}</a> ·
        <a href="/data/lrc/catalog.json" download="lrc-catalog.json">数据目录 JSON</a> ·
        <a href="/data/lrc/LICENSE.txt" download="LRC-LICENSE.txt">许可文件</a> ·
        <a href="/data/lrc/ATTRIBUTION.txt" download="LRC-ATTRIBUTION.txt">来源说明</a></p>
    </aside>
  </template>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { LRC_URL } from '../../shared/constants.js';
import SongPagination from '../../shared/SongPagination.vue';
import EmptyState from '../components/EmptyState.vue';

const STARDUST_LABEL = '星尘';
const STARDUST = /星尘|星塵|永夜|stardust|minus/i;
const MIN_VOCAL_ALBUMS = 5;
// LRC 目录用这个日期表示发行日期不适用
const NOT_APPLICABLE_DATE = '1970-01-01';
const pageSize = 12;

const catalog = ref(null);
const loading = ref(true);
const error = ref('');
const query = ref('');
const vocal = ref(STARDUST_LABEL);
const sort = ref('latest');
const page = ref(1);
let controller;

function matchesVocal(album, name) {
  return name === STARDUST_LABEL
    ? album.vocal.some(value => STARDUST.test(value))
    : album.vocal.some(value => value.includes(name));
}

function releaseDate(album) {
  return album.year === NOT_APPLICABLE_DATE ? '' : album.year;
}

// 没有发行日期的专辑在两种日期排序下都排在最后
function byDate(direction) {
  return (a, b) => (!releaseDate(a) - !releaseDate(b))
    || direction * releaseDate(a).localeCompare(releaseDate(b))
    || a.name.localeCompare(b.name, 'zh-CN');
}

const sorters = {
  latest: byDate(-1),
  oldest: byDate(1),
  name: (a, b) => a.name.localeCompare(b.name, 'zh-CN'),
};

const vocalOptions = computed(() => {
  const albums = catalog.value?.albums || [];
  const counts = new Map();
  for (const album of albums) {
    for (const name of new Set(album.vocal)) {
      if (!STARDUST.test(name)) counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  const names = [STARDUST_LABEL, ...[...counts].filter(([, count]) => count >= MIN_VOCAL_ALBUMS).sort((a, b) => b[1] - a[1]).map(([name]) => name)];
  return names.map(name => ({ name, count: albums.filter(album => matchesVocal(album, name)).length }));
});

const filteredAlbums = computed(() => {
  const term = query.value.trim().toLocaleLowerCase();
  return (catalog.value?.albums || [])
    .filter(album => (!vocal.value || matchesVocal(album, vocal.value))
      && (!term || [album.name, ...album.vocal, ...album.produce, ...album.songs.map(song => song.title)]
        .some(value => value.toLocaleLowerCase().includes(term))))
    .sort(sorters[sort.value]);
});
const pageCount = computed(() => Math.max(1, Math.ceil(filteredAlbums.value.length / pageSize)));
const visibleAlbums = computed(() => filteredAlbums.value.slice((page.value - 1) * pageSize, page.value * pageSize));
watch([query, vocal, sort], () => { page.value = 1; });

function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function loadCatalog() {
  controller?.abort();
  controller = new AbortController();
  loading.value = true;
  error.value = '';
  try {
    const response = await fetch('/data/lrc/catalog.json', { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.albums) || !data.source?.revision) throw new Error('歌词目录格式异常');
    catalog.value = data;
  } catch (cause) {
    if (cause.name !== 'AbortError') error.value = '歌词目录暂时无法加载，请重试或前往 V宇宙词站下载。';
  } finally {
    loading.value = false;
  }
}

onMounted(loadCatalog);
onUnmounted(() => controller?.abort());
</script>

<style scoped>
.lyrics-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; }
.lyrics-header-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; }
.lyrics-toolbar { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
.lyrics-search { flex: 1; min-width: 0; }
.lyrics-search input,
.lyrics-sort select {
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--paper-raised);
  color: var(--ink);
  font: inherit;
  font-size: 0.9rem;
}
.lyrics-search input { width: 100%; }
.lyrics-search input::placeholder { color: var(--ink-muted); }
.lyrics-sort { display: flex; align-items: center; gap: 8px; color: var(--ink-soft); }
.lyrics-search input:focus,
.lyrics-sort select:focus { outline: 2px solid var(--cobalt); outline-offset: 2px; }
.vocal-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 24px; }
.vocal-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 14px;
  border: 1px solid var(--line);
  border-radius: 100px;
  background: transparent;
  color: var(--ink-muted);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  cursor: pointer;
  transition: border-color 0.2s var(--ease), color 0.2s var(--ease), background 0.2s var(--ease);
}
.vocal-tab span { color: var(--ink-faint); font-size: 0.7rem; }
.vocal-tab:hover { border-color: var(--cobalt-soft); color: var(--ink); }
.vocal-tab[aria-pressed="true"] { border-color: var(--cobalt); color: var(--cobalt); background: var(--cobalt-wash); }
.vocal-tab[aria-pressed="true"] span { color: var(--cobalt-soft); }
.vocal-tab:focus-visible { outline: 2px solid var(--cobalt); outline-offset: 2px; }
.album-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--paper-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  overflow-wrap: anywhere;
  transition: border-color 0.25s var(--ease);
}
.album-card:hover { border-color: var(--cobalt-soft); }
.album-cover {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1 / 1;
  background: #0a0a14;
  border-bottom: 1px solid var(--line);
}
.album-cover img { display: block; width: 100%; height: 100%; object-fit: contain; }
.album-cover-fallback {
  padding: 24px;
  color: var(--ink-faint);
  font-family: var(--font-display);
  font-size: 1.4rem;
  line-height: 1.4;
  text-align: center;
}
.album-info { display: flex; flex: 1; flex-direction: column; padding: 16px 18px 18px; }
.album-meta { color: var(--ink-muted); font-family: var(--font-mono); font-size: 0.74rem; margin-bottom: 6px; }
.album-info h2 { font-family: var(--font-display); font-size: 1.1rem; font-weight: 500; line-height: 1.45; margin-bottom: 8px; }
.album-info h2 a { color: var(--ink); text-decoration: none; }
.album-info h2 a:hover { color: var(--cobalt); }
.album-credit { color: var(--ink-soft); font-size: 0.8rem; margin-bottom: 4px; }
.album-info .tags { margin: 10px 0 0; }
.album-info .tag.stardust { color: var(--gold); }
.album-tracks { margin: 14px 0; border-top: 1px solid var(--line); }
.album-tracks summary { padding: 12px 0; color: var(--ink-soft); font-size: 0.82rem; cursor: pointer; }
.album-tracks summary:hover { color: var(--ink); }
.album-tracks ul { list-style: none; }
.album-tracks li { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-top: 1px solid var(--line); font-size: 0.82rem; }
.album-tracks li a { flex-shrink: 0; display: inline-flex; align-items: center; min-height: 40px; color: var(--cobalt); font-family: var(--font-mono); font-size: 0.74rem; text-decoration: none; }
.album-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-top: auto; padding-top: 14px; border-top: 1px solid var(--line); }
.album-download {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 8px 14px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  text-decoration: none;
  transition: border-color 0.2s var(--ease), background 0.2s var(--ease);
}
.album-download:hover { border-color: var(--cobalt); background: var(--cobalt-wash); }
.lyrics-license { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--line); color: var(--ink-muted); font-size: 0.8rem; }
.lyrics-license a { color: var(--cobalt); text-underline-offset: 4px; }
.lyrics-license p + p { margin-top: 8px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@media (max-width: 768px) {
  .lyrics-header { flex-direction: column; align-items: flex-start; }
  .lyrics-header-actions { justify-content: flex-start; }
}
@media (max-width: 480px) {
  .lyrics-toolbar { flex-wrap: wrap; }
  .lyrics-search { flex-basis: 100%; }
  .lyrics-sort { margin-left: auto; }
}
</style>
