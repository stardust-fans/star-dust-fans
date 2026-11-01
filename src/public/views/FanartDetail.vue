<template>
  <div class="detail-page fanart-detail">
    <div class="detail-back">
      <RouterLink to="/fanart">← 返回同人列表</RouterLink>
    </div>

    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-else-if="error" class="error-state">{{ error }}</div>
    <div v-else-if="item" class="fa-layout">
      <!-- 左：图片舞台 -->
      <div class="fa-main">
        <div class="fa-stage">
          <button
            v-if="images.length > 1"
            type="button"
            class="fa-nav fa-nav-prev"
            aria-label="上一张"
            @click="step(-1)"
          >
            ‹
          </button>

          <img
            v-if="currentImage"
            :src="currentImage"
            :alt="`${item.title || '无题'} - ${activeIndex + 1}`"
            class="fa-image"
            role="button"
            tabindex="0"
            :aria-label="`放大查看第 ${activeIndex + 1} 张图片`"
            @click="openLightbox(activeIndex)"
            @keydown.enter.prevent="openLightbox(activeIndex)"
            @keydown.space.prevent="openLightbox(activeIndex)"
          />

          <button
            v-if="images.length > 1"
            type="button"
            class="fa-nav fa-nav-next"
            aria-label="下一张"
            @click="step(1)"
          >
            ›
          </button>
        </div>

        <div class="fa-stage-bar">
          <span class="fa-counter">{{ activeIndex + 1 }} / {{ images.length }}</span>
          <span class="fa-hint">
            点击图片看大图<template v-if="images.length > 1">，← → 翻页</template>
          </span>
        </div>

        <div v-if="images.length > 1" class="fa-thumbs">
          <button
            v-for="(img, i) in images"
            :key="img + '-' + i"
            type="button"
            class="fa-thumb"
            :class="{ active: i === activeIndex }"
            :aria-label="`切换到第 ${i + 1} 张`"
            @click="activeIndex = i"
          >
            <img :src="img" loading="lazy" :alt="`缩略图 ${i + 1}`" />
          </button>
        </div>
      </div>

      <!-- 右：信息栏 -->
      <aside class="fa-side">
        <h1 class="fa-title">{{ item.title || '无题' }}</h1>

        <div class="fa-author">
          <span class="fa-avatar" aria-hidden="true">{{ authorInitial }}</span>
          <span class="fa-author-text">
            <span class="fa-author-name">{{ item.author || '匿名' }}</span>
            <span class="fa-author-date">{{ formatDate(item.created_at) }}</span>
          </span>
        </div>

        <div v-if="tagList.length > 0" class="fa-tags">
          <RouterLink
            v-for="tag in tagList"
            :key="tag"
            class="fa-tag"
            :to="{ path: '/fanart', query: { tag } }"
          >
            #{{ tag }}
          </RouterLink>
        </div>

        <p v-if="item.description" class="fa-desc">{{ item.description }}</p>

        <section v-if="attachmentList.length > 0" class="fa-section">
          <h2 class="fa-section-title">附件 · {{ attachmentList.length }}</h2>
          <ul class="fa-attachments">
            <li v-for="(a, i) in attachmentList" :key="i">
              <a :href="a.url" :download="a.name" class="fa-attachment">
                <span class="fa-attachment-name">{{ a.name }}</span>
                <span class="fa-attachment-size">{{ formatSize(a.size) }}</span>
              </a>
            </li>
          </ul>
        </section>

        <div v-if="item.bilibili_url || item.source_url" class="fa-links">
          <a
            v-if="item.bilibili_url"
            :href="item.bilibili_url"
            target="_blank"
            rel="noopener"
            class="fa-link"
          >
            ▶ B站原文
          </a>
          <a
            v-if="item.source_url"
            :href="item.source_url"
            target="_blank"
            rel="noopener"
            class="fa-link"
          >
            🔗 来源
          </a>
        </div>

        <section class="fa-section fa-facts">
          <div class="fa-fact">
            <span>类型</span>
            <b>{{ typeLabel }}</b>
          </div>
          <div class="fa-fact">
            <span>图片</span>
            <b>{{ images.length }} 张</b>
          </div>
          <div class="fa-fact">
            <span>发布时间</span>
            <b>{{ formatDate(item.created_at) }}</b>
          </div>
        </section>
      </aside>
    </div>

    <div v-if="item" class="fa-comments">
      <CommentSection target-type="fanart" :target-id="item.id" />
    </div>

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
import { ref, onMounted, onUnmounted, computed } from 'vue';
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
  let list = [];
  try {
    list = JSON.parse(item.value.images) || [];
  } catch {
    list = [];
  }
  if (!Array.isArray(list) || list.length === 0) {
    list = item.value.image_url ? [item.value.image_url] : [];
  }
  return list.filter((src) => typeof src === 'string' && src);
});

// 当前展示第几张（详情页一次只显示一张，避免长图把页面撑爆）
const activeIndex = ref(0);
const currentImage = computed(() => images.value[activeIndex.value] || '');

function step(delta) {
  const total = images.value.length;
  if (total <= 1) return;
  activeIndex.value = (activeIndex.value + delta + total) % total;
}

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

// 标签
const tagList = computed(() => {
  if (!item.value?.tags) return [];
  try {
    const arr = JSON.parse(item.value.tags);
    return Array.isArray(arr) ? arr.filter((t) => typeof t === 'string' && t) : [];
  } catch {
    return [];
  }
});

const authorInitial = computed(() => {
  const name = item.value?.author || '匿名';
  return Array.from(name)[0] || '匿';
});

function formatSize(bytes) {
  if (typeof bytes !== 'number') return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
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

// 键盘翻页（大图预览打开时由 lightbox 接管）
function onKeydown(event) {
  if (lightboxOpen.value) return;
  const tag = event.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    step(-1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    step(1);
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
  loading.value = true;
  try {
    const data = await fetchAPI(`/fanart/${route.params.id}`);
    if (data && data.id) {
      item.value = data;
      activeIndex.value = 0;
    } else {
      error.value = '作品不存在';
    }
  } catch (err) {
    error.value = '加载失败';
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<style scoped>
/* ===== Pixiv 风格详情页 ===== */
.fanart-detail {
  max-width: 1180px;
  margin: 0 auto;
  padding: 8px 0 48px;
}

.fa-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 348px;
  gap: 28px;
  align-items: start;
}

/* ---- 图片舞台 ---- */
.fa-main {
  min-width: 0;
}

.fa-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  min-height: 260px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background:
    radial-gradient(circle at 50% 0%, rgba(153, 153, 255, 0.07), transparent 62%),
    var(--paper-raised);
}

.fa-image {
  display: block;
  max-width: 100%;
  /* 自适应：以视口高度为准缩放，长图不再占满整屏。
     第一行是给老 WebView 的 calc 兜底，第二行带 860px 上限 */
  max-height: calc(100vh - 240px);
  max-height: min(calc(100vh - 240px), 860px);
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 4px;
  cursor: zoom-in;
  transition: opacity 0.2s var(--ease);
}

.fa-image:hover {
  opacity: 0.94;
}

.fa-image:focus-visible {
  outline: 2px solid var(--cobalt);
  outline-offset: 2px;
}

.fa-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  padding-bottom: 3px;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: rgba(7, 7, 13, 0.72);
  backdrop-filter: blur(4px);
  color: var(--ink);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s var(--ease), border-color 0.2s var(--ease), color 0.2s var(--ease);
}

.fa-stage:hover .fa-nav,
.fa-nav:focus-visible {
  opacity: 1;
}

.fa-nav:hover {
  border-color: var(--cobalt);
  color: var(--cobalt);
}

.fa-nav-prev {
  left: 16px;
}

.fa-nav-next {
  right: 16px;
}

.fa-stage-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  font-family: var(--font-mono);
  font-size: 0.76rem;
  color: var(--ink-muted);
}

.fa-counter {
  color: var(--ink-soft);
  letter-spacing: 0.06em;
}

.fa-hint {
  color: var(--ink-faint);
}

/* ---- 缩略图条 ---- */
.fa-thumbs {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-bottom: 4px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.fa-thumb {
  flex: 0 0 auto;
  width: 64px;
  height: 64px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--paper-raised);
  overflow: hidden;
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 0.2s var(--ease), border-color 0.2s var(--ease);
}

.fa-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.fa-thumb:hover {
  opacity: 0.9;
}

.fa-thumb.active {
  opacity: 1;
  border-color: var(--cobalt);
}

/* ---- 信息栏 ---- */
.fa-side {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.fa-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  line-height: 1.35;
  color: var(--ink);
  word-break: break-word;
}

.fa-author {
  display: flex;
  align-items: center;
  gap: 12px;
}

.fa-avatar {
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid var(--cobalt-soft);
  background: var(--cobalt-wash);
  color: var(--cobalt);
  font-family: var(--font-display);
  font-size: 1.05rem;
  line-height: 1;
}

.fa-author-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.fa-author-name {
  color: var(--ink);
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fa-author-date {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  color: var(--ink-faint);
}

.fa-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.fa-tag {
  display: inline-block;
  padding: 3px 12px;
  border: 1px solid var(--cobalt-soft);
  border-radius: 100px;
  background: var(--cobalt-wash);
  color: var(--cobalt);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  text-decoration: none;
  transition: background 0.2s var(--ease), color 0.2s var(--ease);
}

.fa-tag:hover {
  background: var(--cobalt);
  color: var(--paper);
}

.fa-desc {
  color: var(--ink-soft);
  font-size: 0.94rem;
  line-height: 1.85;
  white-space: pre-wrap;
  word-break: break-word;
}

.fa-section {
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.fa-section-title {
  margin-bottom: 10px;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.fa-attachments {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fa-attachment {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--paper-raised);
  color: var(--ink);
  font-size: 0.85rem;
  text-decoration: none;
  transition: border-color 0.2s var(--ease), color 0.2s var(--ease);
}

.fa-attachment:hover {
  border-color: var(--cobalt);
  color: var(--cobalt);
}

.fa-attachment-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fa-attachment-size {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  color: var(--ink-muted);
}

.fa-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.fa-link {
  padding: 7px 14px;
  border: 1px solid var(--line-strong);
  border-radius: 100px;
  color: var(--ink-soft);
  font-size: 0.82rem;
  text-decoration: none;
  transition: border-color 0.2s var(--ease), color 0.2s var(--ease);
}

.fa-link:hover {
  border-color: var(--cobalt);
  color: var(--cobalt);
}

.fa-facts {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fa-fact {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.84rem;
}

.fa-fact span {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  color: var(--ink-faint);
}

.fa-fact b {
  font-weight: 400;
  color: var(--ink-soft);
  text-align: right;
}

.fa-comments {
  max-width: 860px;
  margin: 0 auto;
}

@media (max-width: 960px) {
  .fa-layout {
    grid-template-columns: 1fr;
    gap: 22px;
  }

  .fa-side {
    position: static;
  }

  .fa-image {
    max-height: 66vh;
    max-height: min(66vh, 620px);
  }

  .fa-nav {
    opacity: 1;
  }
}

@media (max-width: 600px) {
  .fa-stage {
    padding: 8px;
  }

  .fa-image {
    max-height: 56vh;
  }

  .fa-title {
    font-size: 1.25rem;
  }

  .fa-hint {
    display: none;
  }

  .fa-thumb {
    width: 54px;
    height: 54px;
  }
}
</style>
