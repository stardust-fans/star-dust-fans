<template>
  <div class="page-header">
    <span class="eyebrow page-eyebrow">02 · Archive</span>
    <h1 class="page-title">同人</h1>
    <p class="page-subtitle">来自吸尘器的爱<template v-if="items.length"> · 共 {{ items.length }} 件作品</template></p>
  </div>
  <div v-if="items.length > 0" class="card-grid">
    <FanartCard v-for="item in items" :key="item.id" :item="item" />
  </div>
  <EmptyState v-else message="暂无同人作品，欢迎投稿~" />
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { fetchAPI } from '../../shared/api.js';
import FanartCard from '../components/FanartCard.vue';
import EmptyState from '../components/EmptyState.vue';

const items = ref([]);

onMounted(async () => {
  items.value = await fetchAPI('/fanart');
});
</script>
