<template>
  <nav v-if="total > 0" class="song-pagination" :aria-label="label">
    <span class="page-summary" aria-live="polite">共 {{ total }} {{ unit }} · 第 {{ page }} / {{ pageCount }} 页</span>
    <div class="page-buttons">
      <button type="button" :disabled="disabled || page <= 1" @click="$emit('update:page', page - 1)">上一页</button>
      <template v-for="(item, index) in pages" :key="index">
        <span v-if="item === '…'" class="page-ellipsis">…</span>
        <button v-else type="button" :aria-label="`第 ${item} 页`" :aria-current="item === page ? 'page' : undefined"
          :disabled="disabled" @click="$emit('update:page', item)">{{ item }}</button>
      </template>
      <button type="button" :disabled="disabled || page >= pageCount" @click="$emit('update:page', page + 1)">下一页</button>
    </div>
  </nav>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  page: { type: Number, required: true },
  pageCount: { type: Number, required: true },
  total: { type: Number, required: true },
  disabled: { type: Boolean, default: false },
  unit: { type: String, default: '首' },
  label: { type: String, default: '歌曲分页' },
});
defineEmits(['update:page']);

const pages = computed(() => {
  const start = Math.max(1, Math.min(props.page - 1, props.pageCount - 2));
  const end = Math.min(props.pageCount, start + 2);
  const items = [];
  if (start > 1) items.push(1);
  if (start > 2) items.push('…');
  for (let page = start; page <= end; page++) items.push(page);
  if (end < props.pageCount - 1) items.push('…');
  if (end < props.pageCount) items.push(props.pageCount);
  return items;
});
</script>

<style scoped>
.song-pagination {
  position: relative;
  z-index: 901;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
  color: var(--ink-soft);
  font-size: 0.85rem;
}
.page-buttons { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.page-buttons button {
  min-height: 36px;
  min-width: 36px;
  padding: 6px 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--paper-raised);
  color: var(--ink-soft);
  font: inherit;
  cursor: pointer;
}
.page-buttons button:hover:not(:disabled),
.page-buttons button[aria-current="page"] { border-color: var(--cobalt); color: var(--cobalt); }
.page-buttons button:focus-visible { outline: 2px solid var(--cobalt); outline-offset: 2px; }
.page-buttons button:disabled { opacity: 0.4; cursor: default; }
.page-ellipsis { padding: 0 2px; }
@media (max-width: 480px) {
  .song-pagination { justify-content: center; }
  .page-summary { width: 100%; text-align: center; }
}
</style>
