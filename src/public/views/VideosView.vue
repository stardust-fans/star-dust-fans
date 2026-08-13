<template>
  <div class="page-header">
    <span class="eyebrow page-eyebrow">01 · Archive</span>
    <h1 class="page-title">视频</h1>
    <p class="page-subtitle">星尘的歌声与影像<template v-if="songs.length"> · 共 {{ songs.length }} 首</template></p>
  </div>
  <div v-if="songs.length > 0" class="card-grid">
    <SongCard v-for="song in songs" :key="song.id" :song="song" />
  </div>
  <EmptyState v-else message="暂无歌曲数据" />
</template>

<script setup>
import { useSongs } from '../composables/useSongs.js';
import SongCard from '../components/SongCard.vue';
import EmptyState from '../components/EmptyState.vue';

const { songs } = useSongs();
</script>
