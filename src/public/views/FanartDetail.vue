<template>
  <div class="detail-page">
    <div class="detail-back">
      <RouterLink to="/fanart">← 返回同人列表</RouterLink>
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
        <h1>{{ item.title || '无题' }}</h1>
        <div class="detail-meta">
          <span>作者：{{ item.author || '匿名' }}</span>
          <span>类型：{{ typeLabel }}</span>
          <span>发布时间：{{ formatDate(item.created_at) }}</span>
        </div>
        <p v-if="item.description" class="detail-desc">{{ item.description }}</p>
        <div v-if="item.bilibili_url" class="detail-links">
          <a :href="item.bilibili_url" target="_blank" rel="noopener">▶ B站链接</a>
        </div>
        <div v-if="item.source_url" class="detail-links">
          <a :href="item.source_url" target="_blank" rel="noopener">🔗 来源链接</a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { fetchAPI } from '../../shared/api.js';
import { FANART_TYPE_LABELS } from '../../shared/constants.js';

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

const typeLabel = computed(() => {
  if (!item.value) return '';
  return FANART_TYPE_LABELS[item.value.type] || item.value.type || '插画';
});

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('zh-CN', { hour12: false });
}

onMounted(async () => {
  loading.value = true;
  try {
    const data = await fetchAPI(`/fanart/${route.params.id}`);
    if (data && data.id) {
      item.value = data;
    } else {
      error.value = '作品不存在';
    }
  } catch (err) {
    error.value = '加载失败';
  } finally {
    loading.value = false;
  }
});
</script>