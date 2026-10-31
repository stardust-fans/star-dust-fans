<template>
  <div class="page-header">
    <span class="eyebrow page-eyebrow">LRC × 尘站</span>
    <h1 class="page-title">把每一句，都收藏</h1>
    <p class="page-subtitle">与 LRC · V宇宙词站一起，分享虚拟歌姬的专辑歌词</p>
  </div>

  <section class="lyrics-intro" aria-label="LRC 合作">
    <div>
      <h2>歌词，让喜欢有迹可循</h2>
      <p>由 LRC 社群整理与制作，提供带时间轴的 LRC 歌词。选择一张专辑，或把所有歌词一起带走。</p>
      <a href="https://lrc.wuyilingwei.com" target="_blank" rel="noopener">前往 V宇宙词站 ↗</a>
    </div>
    <div v-if="catalog" class="lyrics-downloads">
      <span>{{ catalog.count }} 张专辑 · {{ catalog.song_count }} 首歌词</span>
      <a class="lyrics-button" :href="catalog.download_url" download="lrc-lyrics.zip">下载全部歌词 · {{ formatBytes(catalog.download_bytes) }}</a>
      <a href="/data/lrc/catalog.json" download="lrc-catalog.json">下载数据目录 JSON</a>
    </div>
  </section>

  <div v-if="loading" class="loading-state" role="status">正在加载歌词目录…</div>
  <div v-else-if="error" class="empty-state" role="alert">
    <p>{{ error }}</p>
    <button class="lyrics-button" type="button" @click="loadCatalog">重试</button>
  </div>
  <template v-else-if="catalog">
    <div class="lyrics-toolbar">
      <label class="lyrics-search">
        <span>搜索专辑、歌姬或歌词曲目</span>
        <input v-model="query" type="search" maxlength="200" placeholder="搜索专辑、歌姬或歌词曲目" />
      </label>
      <label class="lyrics-filter"><input v-model="stardustOnly" type="checkbox" /> 星尘相关专辑</label>
    </div>
    <p class="lyrics-results" role="status">找到 {{ filteredAlbums.length }} 张专辑</p>
    <div v-if="visibleAlbums.length" class="lyrics-albums">
      <article v-for="album in visibleAlbums" :key="album.slug" class="lyrics-album">
        <div class="lyrics-album-heading">
          <div>
            <p class="lyrics-meta">{{ album.year || '发行日期未收录' }} · {{ album.song_count }} 首</p>
            <h2>{{ album.name }}</h2>
          </div>
          <a class="lyrics-button" :href="album.download_url" :download="`${album.folder}.zip`" :aria-label="`下载《${album.name}》专辑歌词包`">专辑 ZIP ↓</a>
        </div>
        <p v-if="album.vocal.length" class="lyrics-credits">演唱 · {{ album.vocal.join('、') }}</p>
        <p v-if="album.produce.length" class="lyrics-credits">出品 · {{ album.produce.join('、') }}</p>
        <p v-if="album.lyric_maker.length" class="lyrics-credits">歌词制作 · {{ album.lyric_maker.join('、') }}</p>
        <details>
          <summary>曲目与单曲下载（{{ album.song_count }}）</summary>
          <ul class="lyrics-tracks">
            <li v-for="song in album.songs" :key="song.title">
              <span>{{ song.title }}</span>
              <a :href="song.download_url" :download="`${song.title}.lrc`" :aria-label="`下载《${song.title}》LRC 歌词`">LRC ↓</a>
            </li>
          </ul>
        </details>
        <a class="lyrics-source-link" :href="album.source_url" target="_blank" rel="noopener">专辑资料与原始来源 ↗</a>
      </article>
    </div>
    <p v-else class="empty-state">没有找到匹配的专辑，换个关键词试试。</p>
    <nav v-if="pageCount > 1" class="lyrics-pagination" aria-label="歌词专辑分页">
      <button class="lyrics-button" type="button" :disabled="page === 1" @click="page--">上一页</button>
      <span aria-live="polite">{{ page }} / {{ pageCount }}</span>
      <button class="lyrics-button" type="button" :disabled="page === pageCount" @click="page++">下一页</button>
    </nav>

    <aside class="lyrics-license" aria-label="数据来源与许可">
      <p>歌词数据来自 <a :href="catalog.source.repository" target="_blank" rel="noopener">{{ catalog.source.name }}</a>，
        遵循 <a :href="catalog.source.license_url" target="_blank" rel="noopener">{{ catalog.source.license }}</a> 许可。请保留署名，以非商业方式使用，并以相同方式共享。</p>
      <p>{{ catalog.source.changes }}</p>
      <p>数据版本 <a :href="`${catalog.source.repository}/tree/${catalog.source.revision}`" target="_blank" rel="noopener">{{ catalog.source.revision.slice(0, 7) }}</a> ·
        <a href="/data/lrc/LICENSE.txt" download="LRC-LICENSE.txt">许可文件</a> ·
        <a href="/data/lrc/ATTRIBUTION.txt" download="LRC-ATTRIBUTION.txt">来源说明</a></p>
    </aside>
  </template>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

const catalog = ref(null);
const loading = ref(true);
const error = ref('');
const query = ref('');
const stardustOnly = ref(false);
const page = ref(1);
const pageSize = 12;
let controller;

const filteredAlbums = computed(() => {
  const term = query.value.trim().toLocaleLowerCase();
  return (catalog.value?.albums || []).filter(album => {
    if (stardustOnly.value && !album.vocal.some(vocal => /星尘|星塵|永夜|stardust|minus/i.test(vocal))) return false;
    return !term || [album.name, ...album.vocal, ...album.produce, ...album.songs.map(song => song.title)]
      .some(value => value.toLocaleLowerCase().includes(term));
  });
});
const pageCount = computed(() => Math.ceil(filteredAlbums.value.length / pageSize));
const visibleAlbums = computed(() => filteredAlbums.value.slice((page.value - 1) * pageSize, page.value * pageSize));
watch([query, stardustOnly], () => { page.value = 1; });

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
.lyrics-intro { display: flex; justify-content: space-between; gap: 32px; padding: 32px; margin-bottom: 32px; border: 1px solid var(--line-strong); background: var(--cobalt-wash); }
.lyrics-intro h2 { font-family: var(--font-display); font-size: 1.4rem; margin-bottom: 12px; }
.lyrics-intro p { color: var(--ink-soft); max-width: 34em; margin-bottom: 16px; }
.lyrics-intro a, .lyrics-license a, .lyrics-tracks a, .lyrics-source-link { color: var(--cobalt); text-underline-offset: 4px; }
.lyrics-downloads { display: flex; flex-direction: column; justify-content: center; gap: 12px; flex-shrink: 0; font-size: 0.85rem; }
.lyrics-button { display: inline-flex; justify-content: center; align-items: center; min-height: 44px; padding: 10px 16px; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--paper-raised); color: var(--ink); font: inherit; text-decoration: none; cursor: pointer; }
.lyrics-intro .lyrics-button { color: var(--ink); }
.lyrics-button:hover:not(:disabled) { border-color: var(--cobalt); background: var(--cobalt-wash); }
.lyrics-button:disabled { opacity: 0.4; cursor: default; }
.lyrics-toolbar { display: flex; align-items: center; gap: 24px; }
.lyrics-search { flex: 1; }
.lyrics-search span { display: block; margin-bottom: 8px; color: var(--ink-soft); font-size: 0.8rem; }
.lyrics-search input { width: 100%; min-height: 48px; padding: 12px 16px; background: var(--paper-raised); color: var(--ink); border: 1px solid var(--line-strong); border-radius: var(--radius); font: inherit; }
.lyrics-filter { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer; }
.lyrics-filter input { accent-color: var(--cobalt); }
.lyrics-results { color: var(--ink-muted); font-size: 0.8rem; margin: 16px 0; }
.lyrics-albums { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; align-items: start; }
.lyrics-album { min-width: 0; padding: 24px; border: 1px solid var(--line); background: var(--paper-raised); overflow-wrap: anywhere; }
.lyrics-album-heading { display: flex; justify-content: space-between; align-items: start; gap: 16px; margin-bottom: 16px; }
.lyrics-album-heading h2 { font-family: var(--font-display); font-size: 1.25rem; line-height: 1.5; }
.lyrics-album-heading .lyrics-button { flex-shrink: 0; font-size: 0.8rem; }
.lyrics-meta { color: var(--ink-muted); font-family: var(--font-mono); font-size: 0.75rem; margin-bottom: 6px; }
.lyrics-credits { color: var(--ink-soft); font-size: 0.82rem; margin-bottom: 8px; }
.lyrics-album details { border-top: 1px solid var(--line); margin-top: 20px; }
.lyrics-album summary { padding: 14px 0; color: var(--ink); font-size: 0.85rem; cursor: pointer; }
.lyrics-tracks { list-style: none; margin-bottom: 16px; }
.lyrics-tracks li { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 8px 0; border-top: 1px solid var(--line); font-size: 0.85rem; }
.lyrics-tracks a { flex-shrink: 0; display: inline-flex; align-items: center; min-height: 44px; }
.lyrics-source-link { font-size: 0.75rem; }
.lyrics-pagination { display: flex; align-items: center; justify-content: center; gap: 24px; margin-top: 32px; }
.lyrics-license { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--line); color: var(--ink-muted); font-size: 0.8rem; }
.lyrics-license p + p { margin-top: 8px; }
@media (max-width: 900px) {
  .lyrics-intro { flex-direction: column; gap: 24px; }
  .lyrics-downloads { align-items: flex-start; }
  .lyrics-albums { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .lyrics-intro, .lyrics-album { padding: 20px; }
  .lyrics-toolbar { align-items: stretch; flex-direction: column; gap: 16px; }
  .lyrics-album-heading { flex-direction: column; }
}
</style>
