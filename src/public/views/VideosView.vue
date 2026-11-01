<template>
  <div class="page-header">
    <span class="eyebrow page-eyebrow">01 · Archive</span>
    <h1 class="page-title">视频</h1>
    <p class="page-subtitle">她唱过的每一首</p>
  </div>

  <div class="song-toolbar">
    <label class="song-search">
      <span class="sr-only">搜索歌曲</span>
      <input v-model="query" type="search" maxlength="200" placeholder="搜索歌曲标题、BV 号或 UP 主" />
    </label>
    <label class="song-sort">
      排序
      <select v-model="sort">
        <option value="latest">最新</option>
        <option value="oldest">最早</option>
        <option value="view-desc">播放量 ↓</option>
        <option value="view-asc">播放量 ↑</option>
      </select>
    </label>
  </div>

  <div v-if="loading" class="loading-state" role="status">加载中...</div>
  <div v-else-if="error" class="empty-state" role="alert">
    {{ error }} <button type="button" class="sort-btn" @click="reload">重试</button>
  </div>
  <div v-else-if="songs.length > 0" class="card-grid">
    <SongCard v-for="song in songs" :key="song.id" :song="song" />
  </div>
  <EmptyState v-else :message="query.trim() ? '没有找到匹配的歌曲，换个关键词试试' : '这里还是空的'" />
  <SongPagination v-model:page="page" :page-count="pageCount" :total="total" :disabled="loading" />
</template>

<script setup>
import { useSongList } from '../../shared/useSongList.js';
import SongPagination from '../../shared/SongPagination.vue';
import SongCard from '../components/SongCard.vue';
import EmptyState from '../components/EmptyState.vue';

const { songs, total, page, pageCount, query, sort, loading, error, reload } = useSongList();
</script>

<style scoped>
.song-toolbar { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.song-search { flex: 1; min-width: 0; }
.song-search input,
.song-sort select {
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--paper-raised);
  color: var(--ink);
  font: inherit;
  font-size: 0.9rem;
}
.song-search input { width: 100%; }
.song-search input::placeholder { color: var(--ink-muted); }
.song-sort { display: flex; align-items: center; gap: 8px; color: var(--ink-soft); }
.song-search input:focus,
.song-sort select:focus { outline: 2px solid var(--cobalt); outline-offset: 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@media (max-width: 480px) {
  .song-toolbar { flex-wrap: wrap; }
  .song-search { flex-basis: 100%; }
  .song-sort { margin-left: auto; }
}
</style>
