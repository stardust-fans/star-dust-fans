<template>
  <Teleport to="body">
    <div
      class="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      @click.self="close"
    >
      <button type="button" class="lightbox-close" aria-label="关闭预览" @click="close">
        ✕
      </button>

      <button
        v-if="hasMultiple"
        type="button"
        class="lightbox-nav lightbox-prev"
        aria-label="上一张"
        @click.stop="step(-1)"
      >
        ‹
      </button>

      <img
        v-if="current"
        class="lightbox-image"
        :src="current"
        :alt="alt || `图片 ${index + 1}`"
        @click.stop
      />

      <button
        v-if="hasMultiple"
        type="button"
        class="lightbox-nav lightbox-next"
        aria-label="下一张"
        @click.stop="step(1)"
      >
        ›
      </button>

      <div v-if="hasMultiple" class="lightbox-counter">{{ index + 1 }} / {{ list.length }}</div>
      <p class="lightbox-hint">点击空白处或按 Esc 关闭<template v-if="hasMultiple">，← → 切换</template></p>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  // 图片地址数组（空值会被过滤）
  images: { type: Array, default: () => [] },
  startIndex: { type: Number, default: 0 },
  alt: { type: String, default: '' },
});

const emit = defineEmits(['close']);

const list = computed(() => (props.images || []).filter((src) => typeof src === 'string' && src));
const hasMultiple = computed(() => list.value.length > 1);

const index = ref(clamp(props.startIndex));

function clamp(value) {
  const max = Math.max(0, list.value.length - 1);
  const n = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(Math.max(n, 0), max);
}

const current = computed(() => list.value[index.value] || '');

function step(delta) {
  const total = list.value.length;
  if (total < 2) return;
  index.value = (index.value + delta + total) % total;
}

function close() {
  emit('close');
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    step(-1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    step(1);
  }
}

// 打开期间锁定页面滚动，并接上键盘控制
let previousOverflow = '';
onMounted(() => {
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  document.body.style.overflow = previousOverflow;
  window.removeEventListener('keydown', onKeydown);
});
</script>
