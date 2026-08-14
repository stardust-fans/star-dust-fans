<template>
  <div class="song-card">
    <div class="cover-wrapper">
      <img
        v-if="coverSrc && !coverError"
        class="cover"
        :src="coverSrc"
        :alt="song.title"
        loading="lazy"
        referrerpolicy="no-referrer"
        @error="coverError = true"
      />
      <div v-else class="cover-placeholder">无封面</div>
    </div>
    <div class="info">
      <h3>
        <a :href="`https://www.bilibili.com/video/${song.bvid}`" target="_blank" rel="noopener">{{ song.title }}</a>
      </h3>
      <div class="meta">
        <span class="stat">{{ formatNumber(song.stats?.view) }} 播放</span>
        <span class="stat">{{ formatNumber(song.stats?.like) }} 赞</span>
        <span class="stat">{{ formatDuration(song.duration) }}</span>
        <span class="stat">{{ formatDate(song.pubdate) }}</span>
      </div>
      <div v-if="song.is_masterpiece || song.is_legend || song.is_national_team || song.is_gods_descend || (song.special_tags && song.special_tags.length)" class="tags">
        <span v-if="song.is_masterpiece" class="tag masterpiece">殿堂曲</span>
        <span v-if="song.is_legend" class="tag legend">传说曲</span>
        <span v-if="song.is_national_team" class="tag national">国家队</span>
        <span v-if="song.is_gods_descend" class="tag gods">众神下凡</span>
        <span
          v-for="(tag, idx) in song.special_tags"
          :key="idx"
          class="tag"
          :class="getTagClass(tag)"
        >{{ tag }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { formatNumber, formatDuration, formatDate, getTagClass } from '../../shared/format.js';
import { toImageSrc } from '../../shared/image.js';

const props = defineProps({
  song: { type: Object, required: true },
});

const coverError = ref(false);
const coverSrc = computed(() => toImageSrc(props.song.cover));
</script>
