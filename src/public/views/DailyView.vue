<template>
  <div class="page-header">
    <span class="eyebrow page-eyebrow">04 · Archive</span>
    <h1 class="page-title">吸尘器日报</h1>
    <p class="page-subtitle"><template v-if="items.length">星尘的最新动态 · 共 {{ items.length }} 条</template><template v-else>有消息会在这里更新</template></p>
  </div>
  <div v-if="items.length > 0" class="daily-list">
    <DailyCard v-for="item in items" :key="item.id" :item="item" />
  </div>
  <EmptyState v-else message="还没有更新，等等看~" />
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { fetchAPI } from '../../shared/api.js';
import DailyCard from '../components/DailyCard.vue';
import EmptyState from '../components/EmptyState.vue';

const items = ref([]);

onMounted(async () => {
  items.value = await fetchAPI('/daily');
});
</script>
