<template>
  <div
    ref="containerRef"
    class="live2d-companion"
    :class="{ dragging }"
    :style="stageStyle"
    @mousedown="onDragStart"
    @dblclick="onReset"
    @click="onModelClick"
  ></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, computed } from 'vue';

const props = defineProps({
  size: { type: Number, default: 260 },
  offsetRight: { type: Number, default: 20 },
  offsetBottom: { type: Number, default: 20 },
});

const containerRef = ref(null);
let instance = null;

// ===== 随机文案库 =====
const MESSAGES = [
  '今天也要元气满满哦～',
  '诶嘿，被你发现了！',
  '星尘在此，为你闪耀 ✨',
  '要一起听歌吗？',
  '唔…有点困了呢',
  '你在看哪里呀？',
  '今天也要加油鸭！',
  '摸摸头 (´・ω・`)',
  '嘿嘿，被你戳到了',
  '好久不见，想我了吗？',
  '哼，才不是特意等你的',
  '一起来看星星吧',
];

// 模型的表情名称（必须跟 model3.json 里的 Name 一致）
const EXPRESSIONS = ['哭哭', '嘴', '脸红', '脸黑'];

// 记录上一次触发的表情，避免连续重复
let lastExpression = null;

// 记录是否发生了拖动，拖动后不触发点击
let moved = false;

// ===== 拖动状态 =====
const dragging = ref(false);
const offset = ref({ x: 0, y: 0 });
let dragStart = { mouseX: 0, mouseY: 0, offsetX: 0, offsetY: 0 };

const stageStyle = computed(() => ({
  width: props.size + 'px',
  height: props.size + 'px',
  transform: `translate(${offset.value.x}px, ${offset.value.y}px)`,
}));

onMounted(async () => {
  if (window.matchMedia('(max-width: 768px)').matches) return;

  try {
    const { loadOml2d } = await import('oh-my-live2d');
    instance = loadOml2d({
      models: [
        {
          name: '豆丁星尘',
          path: '/stardust.live2d/豆丁星尘.model3.json',
          scale: 0.15,
          position: [0, 60],
          stageStyle: {
            width: props.size,
            height: props.size,
          },
        },
      ],
      parentElement: containerRef.value,
      dockedPosition: 'none',
      menus: { items: [] },
      statusBar: { disable: true },
      tips: {
        idleTips: { interval: 0 },
        welcomeTips: { priority: -1 },
      },
    });
    console.log('[Live2D] oh-my-live2d 加载成功', instance);
  } catch (err) {
    console.warn('[Live2D] 加载失败：', err?.message || err);
  }
});

// ===== 点击模型：表情 / 文案 二选一 =====
function onModelClick() {
  if (moved) {
    moved = false;
    return;
  }
  if (!instance) return;

  // 五五开
  const action = Math.random() < 0.5 ? 'expression' : 'message';

  if (action === 'expression') {
    const name = pickExpression();
    try {
      instance.models.model.expression(name);
      lastExpression = name;
      console.log('[Live2D] 触发表情:', name);
    } catch (err) {
      console.warn('[Live2D] 表情触发失败：', err?.message);
    }
  } else {
    const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    try {
      instance.tipsMessage(msg, 3000, 8);
      console.log('[Live2D] 触发文案:', msg);
    } catch (err) {
      console.warn('[Live2D] tipsMessage 失败：', err?.message);
    }
  }
}

// 随机选一个表情，保证不跟上一次重复
function pickExpression() {
  if (EXPRESSIONS.length <= 1) return EXPRESSIONS[0];

  let name;
  let guard = 0;
  do {
    name = EXPRESSIONS[Math.floor(Math.random() * EXPRESSIONS.length)];
    guard++;
  } while (name === lastExpression && guard < 20);
  return name;
}

// ===== 拖动逻辑 =====
function onDragStart(e) {
  if (e.button !== 0) return;

  moved = false;
  dragStart = {
    mouseX: e.clientX,
    mouseY: e.clientY,
    offsetX: offset.value.x,
    offsetY: offset.value.y,
  };
  dragging.value = true;

  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);
  e.preventDefault();
}

function onDragMove(e) {
  if (!dragging.value) return;

  const dx = e.clientX - dragStart.mouseX;
  const dy = e.clientY - dragStart.mouseY;

  // 移动超过 3px 视为拖动，不触发点击
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    moved = true;
  }

  offset.value = {
    x: dragStart.offsetX + dx,
    y: dragStart.offsetY + dy,
  };
}

function onDragEnd() {
  dragging.value = false;
  window.removeEventListener('mousemove', onDragMove);
  window.removeEventListener('mouseup', onDragEnd);
}

// ===== 双击回到默认位置 =====
function onReset() {
  offset.value = { x: 0, y: 0 };
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onDragMove);
  window.removeEventListener('mouseup', onDragEnd);
  if (instance) {
    try { instance.destroy(); } catch (e) {}
    instance = null;
  }
});
</script>

<style scoped>
.live2d-companion {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 900;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.live2d-companion.dragging {
  cursor: grabbing;
}

.live2d-companion.dragging :deep(canvas) {
  pointer-events: none;
}

.live2d-companion:not(.dragging) :deep(canvas) {
  pointer-events: auto;
}
</style>