<template>
  <div class="detail-page">
    <div class="detail-back">
      <RouterLink to="/shop">← 返回量贩列表</RouterLink>
    </div>

    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-else-if="error" class="error-state">{{ error }}</div>
    <div v-else-if="item" class="detail-content">
      <div class="detail-gallery">
        <div class="detail-images">
          <img
            v-for="(img, idx) in images"
            :key="idx"
            :src="img"
            :alt="`${item.title} - ${idx + 1}`"
            loading="lazy"
          />
        </div>
      </div>

      <div class="detail-info">
        <h1>{{ item.title }}</h1>
        <div class="detail-meta">
          <span>价格：{{ item.price || '-' }}</span>
          <span>发车时间：{{ formatDate(item.ship_time) }}</span>
          <span>状态：{{ item.status === 'shipped' ? '已发车' : '等待发车' }}</span>
        </div>
        <p v-if="item.description" class="detail-desc">{{ item.description }}</p>
        <div class="detail-links">
          <a v-if="item.xianyu_url" :href="item.xianyu_url" target="_blank" rel="noopener" class="btn-link">
            🛒 闲鱼链接
          </a>
          <a v-if="item.bilibili_url" :href="item.bilibili_url" target="_blank" rel="noopener" class="btn-link">
            ▶ B站链接
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { fetchAPI } from '../../shared/api.js';

const route = useRoute();
const item = ref(null);
const loading = ref(true);
const error = ref('');

const images = computed(() => {
  if (!item.value) return [];
  try {
    return JSON.parse(item.value.images) || [item.value.image_url];
  } catch {
    return [item.value.image_url];
  }
});

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('zh-CN', { hour12: false });
}

onMounted(async () => {
  loading.value = true;
  try {
    const data = await fetchAPI(`/shop/${route.params.id}`);
    if (data && data.id) {
      item.value = data;
    } else {
      error.value = '商品不存在';
    }
  } catch (err) {
    error.value = '加载失败';
  } finally {
    loading.value = false;
  }
});
</script>