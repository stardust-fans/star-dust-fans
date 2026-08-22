<template>
  <div>
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <span class="eyebrow page-eyebrow">02 · Archive</span>
        <h1 class="page-title">同人</h1>
        <p class="page-subtitle">来自吸尘器的爱<template v-if="items.length"> · 共 {{ items.length }} 件作品</template></p>
        <p class="guide-entry">
        <RouterLink to="/guide" class="guide-link">投稿指南</RouterLink>
        </p>
      </div>
      <button class="btn-hero-primary" @click="showModal = true">发布同人</button>
    </div>
    <div v-if="items.length > 0" class="card-grid">
      <FanartCard v-for="item in items" :key="item.id" :item="item" />
    </div>
    <EmptyState v-else message="暂无同人作品，欢迎投稿~" />

    <FanartContribute
      v-if="showModal"
      @close="showModal = false"
      @success="refresh"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { fetchAPI } from '../../shared/api.js';
import FanartCard from '../components/FanartCard.vue';
import EmptyState from '../components/EmptyState.vue';
import FanartContribute from '../components/FanartContribute.vue';

const items = ref([]);
const showModal = ref(false);

async function loadItems() {
  items.value = await fetchAPI('/fanart');
}

function refresh() {
  loadItems();
}

onMounted(loadItems);
</script>