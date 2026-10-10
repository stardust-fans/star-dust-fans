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
            class="zoomable"
            role="button"
            tabindex="0"
            :aria-label="`放大查看第 ${idx + 1} 张图片`"
            @click="openLightbox(idx)"
            @keydown.enter.prevent="openLightbox(idx)"
            @keydown.space.prevent="openLightbox(idx)"
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

        <!-- 附件 -->
        <div v-if="attachmentList.length > 0" class="detail-attachments">
          <h3>附件</h3>
          <ul>
            <li v-for="(a, i) in attachmentList" :key="i">
              <a :href="a.url" :download="a.name">{{ a.name }}</a>
              <span class="attachment-size">({{ formatSize(a.size) }})</span>
            </li>
          </ul>
        </div>

        <div v-if="item.bilibili_url" class="detail-links">
          <a :href="item.bilibili_url" target="_blank" rel="noopener">▶ B站链接</a>
        </div>
        <div v-if="item.source_url" class="detail-links">
          <a :href="item.source_url" target="_blank" rel="noopener">🔗 来源链接</a>
        </div>
      </div>
    </div>

    <CommentSection v-if="item" target-type="fanart" :target-id="item.id" />

    <ImageLightbox
      v-if="lightboxOpen"
      :images="images"
      :start-index="lightboxIndex"
      :alt="item?.title || ''"
      @close="lightboxOpen = false"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { fetchAPI } from '../../shared/api.js';
import { FANART_TYPE_LABELS } from '../../shared/constants.js';
import CommentSection from '../components/CommentSection.vue';
import ImageLightbox from '../components/ImageLightbox.vue';

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

// 附件
const attachmentList = computed(() => {
  if (!item.value?.attachments) return [];
  try {
    const arr = JSON.parse(item.value.attachments);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
});

function formatSize(bytes) {
  if (typeof bytes !== 'number') return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// 图片放大预览
const lightboxOpen = ref(false);
const lightboxIndex = ref(0);

function openLightbox(idx) {
  lightboxIndex.value = idx;
  lightboxOpen.value = true;
}

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

<style scoped>
.detail-attachments {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.detail-attachments h3 {
  font-family: var(--font-display);
  font-size: 1.05rem;
  margin-bottom: 10px;
  color: var(--ink);
}

.detail-attachments ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-attachments li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-attachments a {
  color: var(--cobalt);
  text-decoration: none;
  word-break: break-all;
  transition: color 0.2s var(--ease);
}

.detail-attachments a:hover {
  text-decoration: underline;
}

.attachment-size {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--ink-muted);
}
</style>