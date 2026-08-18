<template>
  <div class="page-header">
    <span class="eyebrow page-eyebrow">01 · Archive</span>
    <h1 class="page-title">视频</h1>
    <p class="page-subtitle">
      她唱过的每一首<template v-if="total"> · 共 {{ total }} 首</template>
    </p>
  </div>

  <!-- 排序按键 -->
  <div class="sort-bar">
    <button class="sort-btn" @click="cycleSort">
      <span class="sort-label">排序：</span>
      <span class="sort-current">{{ currentSortLabel }}</span>
      <span class="sort-arrow">↻</span>
    </button>
  </div>

  <div v-if="displaySongs.length > 0" class="card-grid">
    <SongCard v-for="song in displaySongs" :key="song.id" :song="song" />
  </div>
  <div v-else-if="loaded" class="empty-state">这里还是空的</div>
  <div v-else class="loading-state">加载中...</div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useSongs } from '../composables/useSongs.js';
import SongCard from '../components/SongCard.vue';
import EmptyState from '../components/EmptyState.vue';

const { songs, total, loaded, loadSongs } = useSongs();

const sortModes = [
  { value: 'latest', label: '最新' },
  { value: 'oldest', label: '最早' },
  { value: 'view-desc', label: '播放量 ↓' },
  { value: 'view-asc', label: '播放量 ↑' },
];

const currentSortIndex = ref(0);

function cycleSort() {
  currentSortIndex.value = (currentSortIndex.value + 1) % sortModes.length;
}

const currentSortLabel = computed(() => {
  return sortModes[currentSortIndex.value].label;
});

const displaySongs = computed(() => {
  const list = Array.isArray(songs.value) ? [...songs.value] : [];
  if (list.length === 0) return list;

  const mode = sortModes[currentSortIndex.value].value;

  switch (mode) {
    case 'latest':
      return list.sort((a, b) => (b.pubdate || 0) - (a.pubdate || 0));
    case 'oldest':
      return list.sort((a, b) => (a.pubdate || 0) - (b.pubdate || 0));
    case 'view-desc':
      return list.sort((a, b) => (b.stats?.view || 0) - (a.stats?.view || 0));
    case 'view-asc':
      return list.sort((a, b) => (a.stats?.view || 0) - (b.stats?.view || 0));
    default:
      return list;
  }
});

onMounted(() => {
  loadSongs();
});
</script>