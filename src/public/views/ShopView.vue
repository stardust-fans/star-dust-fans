<template>
  <div>
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <span class="eyebrow page-eyebrow">03 · Archive</span>
        <h1 class="page-title">量贩</h1>
        <p class="page-subtitle">星尘周边 · <template v-if="items.length">共 {{ items.length }} 件</template><template v-else>专辑</template></p>
      </div>
      <button class="btn-hero-primary" @click="showModal = true">发布量贩</button>
    </div>
    <div v-if="items.length > 0" class="card-grid">
      <ShopCard v-for="item in items" :key="item.id" :item="item" />
    </div>
    <EmptyState v-else message="暂时没有量贩，等通知吧~" />

    <ShopContribute
      v-if="showModal"
      @close="showModal = false"
      @success="refresh"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { fetchAPI } from '../../shared/api.js';
import ShopCard from '../components/ShopCard.vue';
import EmptyState from '../components/EmptyState.vue';
import ShopContribute from '../components/ShopContribute.vue';

const items = ref([]);
const showModal = ref(false);

async function loadItems() {
  items.value = await fetchAPI('/shop');
}

function refresh() {
  loadItems();
}

onMounted(loadItems);
</script>