<template>
  <div class="page-header">
    <span class="eyebrow page-eyebrow">03 · Archive</span>
    <h1 class="page-title">量贩</h1>
    <p class="page-subtitle">星尘周边 · <template v-if="items.length">共 {{ items.length }} 件</template><template v-else>专辑</template></p>
  </div>
  <div v-if="items.length > 0" class="card-grid">
    <ShopCard v-for="item in items" :key="item.id" :item="item" />
  </div>
  <EmptyState v-else message="暂无商品，敬请期待~" />
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { fetchAPI } from '../../shared/api.js';
import ShopCard from '../components/ShopCard.vue';
import EmptyState from '../components/EmptyState.vue';

const items = ref([]);

onMounted(async () => {
  items.value = await fetchAPI('/shop');
});
</script>
