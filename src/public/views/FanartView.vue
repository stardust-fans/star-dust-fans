<template>
  <div>
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <span class="eyebrow page-eyebrow">02 · Archive</span>
        <h1 class="page-title">同人</h1>
        <p class="page-subtitle">
          来自吸尘器的爱<template v-if="filteredItems.length"> · 共 {{ filteredItems.length }} 件作品</template>
        </p>
        <p class="guide-entry">
          <RouterLink to="/guide" class="guide-link">投稿指南</RouterLink>
        </p>
      </div>
      <button class="btn-hero-primary" @click="showModal = true">发布同人</button>
    </div>

    <!-- 搜索 + 标签筛选 -->
    <div class="filter-bar">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索标题 / 作者…"
        class="search-input"
      />
      <div class="tag-tabs">
        <button
          class="tag-tab"
          :class="{ active: activeTag === '' }"
          @click="activeTag = ''"
        >
          全部
        </button>
        <button
          v-for="tag in tags"
          :key="tag.id"
          class="tag-tab"
          :class="{ active: activeTag === tag.name }"
          @click="activeTag = tag.name"
        >
          {{ tag.name }}
        </button>
      </div>
    </div>

    <div v-if="filteredItems.length > 0" class="card-grid">
      <FanartCard v-for="item in filteredItems" :key="item.id" :item="item" />
    </div>
    <EmptyState v-else message="没有找到匹配的同人作品" />

    <FanartContribute
      v-if="showModal"
      @close="showModal = false"
      @success="refresh"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { fetchAPI } from '../../shared/api.js';
import FanartCard from '../components/FanartCard.vue';
import EmptyState from '../components/EmptyState.vue';
import FanartContribute from '../components/FanartContribute.vue';

const items = ref([]);
const tags = ref([]);
const showModal = ref(false);
const searchQuery = ref('');
const activeTag = ref('');

function getItemTags(item) {
  if (!item.tags) return [];
  try {
    const arr = JSON.parse(item.tags);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return items.value.filter((item) => {
    // 标签筛选：作品 type 命中，或者 tags 数组包含
    if (activeTag.value) {
      const itemTags = getItemTags(item);
      const matchType = item.type === activeTag.value;
      const matchTag = itemTags.includes(activeTag.value);
      if (!matchType && !matchTag) return false;
    }
    // 搜索：标题或作者包含关键词
    if (q) {
      const title = (item.title || '').toLowerCase();
      const author = (item.author || '').toLowerCase();
      if (!title.includes(q) && !author.includes(q)) return false;
    }
    return true;
  });
});

async function loadItems() {
  try {
    const [listData, tagsData] = await Promise.all([
      fetchAPI('/fanart'),
      fetchAPI('/tags'),
    ]);
    items.value = Array.isArray(listData) ? listData : [];
    tags.value = Array.isArray(tagsData) ? tagsData : [];
  } catch (e) {
    console.error('加载同人数据失败:', e);
  }
}

function refresh() {
  loadItems();
}

onMounted(loadItems);
</script>

<style scoped>
.filter-bar {
  margin-bottom: 24px;
  padding: 16px 20px;
  background: var(--paper-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.search-input {
  width: 100%;
  padding: 10px 16px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--ink);
  font-size: 0.92rem;
  margin-bottom: 12px;
}

.search-input:focus {
  outline: none;
  border-color: var(--cobalt-soft);
}

.tag-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-tab {
  padding: 4px 14px;
  border: 1px solid var(--line);
  border-radius: 100px;
  background: transparent;
  color: var(--ink-muted);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s var(--ease);
}

.tag-tab:hover {
  border-color: var(--cobalt-soft);
  color: var(--ink);
}

.tag-tab.active {
  border-color: var(--cobalt);
  color: var(--cobalt);
  background: var(--cobalt-wash);
}
</style>