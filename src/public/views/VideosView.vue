<template>
  <div class="page-header">
    <span class="eyebrow page-eyebrow">01 · Archive</span>
    <h1 class="page-title">视频</h1>
    <p class="page-subtitle">
      她唱过的每一首<template v-if="songs.length"> · 共 {{ songs.length }} 首</template>
    </p>
  </div>

  <!-- 排序栏 -->
  <div class="sort-bar" v-if="songs.length > 0">
    <span class="sort-label">排序：</span>
    <div class="sort-options">
      <button
        v-for="option in sortOptions"
        :key="option.value"
        class="sort-btn"
        :class="{ active: currentSort === option.value }"
        @click="setSort(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>

  <div v-if="sortedSongs.length > 0" class="card-grid">
    <SongCard v-for="song in sortedSongs" :key="song.id" :song="song" />
  </div>
  <EmptyState v-else message="这里还是空的" />
</template>

<script setup>
import { ref, computed } from 'vue';
import { useSongs } from '../composables/useSongs.js';
import SongCard from '../components/SongCard.vue';
import EmptyState from '../components/EmptyState.vue';

const { songs } = useSongs();

const sortOptions = [
  { value: 'latest', label: '最新' },
  { value: 'oldest', label: '最早' },
  { value: 'view', label: '播放量' },
  { value: 'like', label: '点赞数' },
  { value: 'coin', label: '投币数' },
  { value: 'favorite', label: '收藏数' },
];

const currentSort = ref('latest');

function setSort(value) {
  currentSort.value = value;
}

const sortedSongs = computed(() => {
  const list = [...songs];
  if (list.length === 0) return list;

  switch (currentSort.value) {
    case 'latest':
      return list.sort((a, b) => (b.pubdate || 0) - (a.pubdate || 0));
    case 'oldest':
      return list.sort((a, b) => (a.pubdate || 0) - (b.pubdate || 0));
    case 'view':
      return list.sort((a, b) => (b.stats?.view || 0) - (a.stats?.view || 0));
    case 'like':
      return list.sort((a, b) => (b.stats?.like || 0) - (a.stats?.like || 0));
    case 'coin':
      return list.sort((a, b) => (b.stats?.coin || 0) - (a.stats?.coin || 0));
    case 'favorite':
      return list.sort((a, b) => (b.stats?.favorite || 0) - (a.stats?.favorite || 0));
    default:
      return list;
  }
});
</script>