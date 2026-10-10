<script setup>
import { onMounted, onBeforeUnmount, ref, computed } from 'vue';

const props = defineProps({
  size: { type: Number, default: 260 },
  offsetRight: { type: Number, default: 20 },
  offsetBottom: { type: Number, default: 20 },
});

const containerRef = ref(null);
const stageRef = ref(null);
let instance = null;

const MESSAGES = [
  '今天也要元气满满哦～',
  '诶嘿，被你发现了！',
  '喵？',
  '嗨～好久不见呐，想我了吗～',
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

const EXPRESSIONS = ['哭哭', '嘴', '脸红', '脸黑'];

// 记录上一次触发的表情，避免连续重复
let lastExpression = null;

// 记录是否发生了拖动，拖动后不触发点击
let moved = false;
let dragging = false;
let dragStart = { mouseX: 0, mouseY: 0, offsetX: 0, offsetY: 0 };
const offset = ref({ x: 0, y: 0 });

const RATIO = 1.4;

const stageStyle = computed(() => ({
  width: props.size + 'px',
  height: props.size * RATIO + 'px',
}));

// ===== "摸" 检测状态 =====
let lastPetX = null;
let lastPetY = null;
let petStartTime = 0;
let petCooldownUntil = 0;
let lastPetActivityTime = 0;
let petAccumulatedDistance = 0;

// 参数
const PET_MIN_DURATION = 1000;    // 至少移动 1000ms
const PET_MAX_DURATION = 5000;   // 超过 5 秒重置
const PET_COOLDOWN = 2000;       // 触发后 2 秒冷却
const PET_IDLE_TIMEOUT = 600;    // 超过 600ms 没动，视为停下
const PET_MIN_DISTANCE = 40;     // 累计移动 ≥ 40px

function resetPet() {
  lastPetX = null;
  lastPetY = null;
  petStartTime = 0;
  lastPetActivityTime = 0;
  petAccumulatedDistance = 0;
}

function onGlobalMouseMoveForPet(e) {
  if (dragging) return;
  if (Date.now() < petCooldownUntil) return;
  if (!isInContainer(e)) {
    resetPet();
    return;
  }

  const now = Date.now();
  const x = e.clientX;
  const y = e.clientY;

  if (lastPetX === null) {
    lastPetX = x;
    lastPetY = y;
    petStartTime = now;
    lastPetActivityTime = now;
    petAccumulatedDistance = 0;
    return;
  }

  if (now - lastPetActivityTime > PET_IDLE_TIMEOUT) {
    resetPet();
    lastPetX = x;
    lastPetY = y;
    petStartTime = now;
    lastPetActivityTime = now;
    petAccumulatedDistance = 0;
    return;
  }
  lastPetActivityTime = now;

  const dx = x - lastPetX;
  const dy = y - lastPetY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  lastPetX = x;
  lastPetY = y;

  petAccumulatedDistance += dist;

  const elapsed = now - petStartTime;

  if (elapsed > PET_MAX_DURATION) {
    resetPet();
    lastPetX = x;
    lastPetY = y;
    petStartTime = now;
    lastPetActivityTime = now;
    petAccumulatedDistance = 0;
    return;
  }

  if (elapsed >= PET_MIN_DURATION && petAccumulatedDistance >= PET_MIN_DISTANCE) {
    triggerPetReaction();
    resetPet();
    petCooldownUntil = now + PET_COOLDOWN;
  }
}

function triggerPetReaction() {
  if (!instance) return;

  const action = Math.random() < 0.3 ? 'expression' : 'message';

  if (action === 'expression') {
    const name = pickExpression();
    try {
      instance.models.model.expression(name);
      lastExpression = name;
      console.log('[Live2D] 摸出表情:', name);
    } catch (err) {
      console.warn('[Live2D] 摸出表情失败：', err?.message);
    }
  } else {
    const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    try {
      instance.tipsMessage(msg, 3000, 8);
      console.log('[Live2D] 摸出文案:', msg);
    } catch (err) {
      console.warn('[Live2D] 摸出文案失败：', err?.message);
    }
  }

  applyOffset();
}

function applyOffset() {
  if (!containerRef.value) return;
  containerRef.value.style.transform = `translate(${offset.value.x}px, ${offset.value.y}px)`;
}

function isInContainer(e) {
  if (!containerRef.value) return false;
  const r = containerRef.value.getBoundingClientRect();
  return e.clientX >= r.left && e.clientX <= r.right &&
         e.clientY >= r.top && e.clientY <= r.bottom;
}

function onGlobalMouseDown(e) {
  if (e.button !== 0) return;
  if (!isInContainer(e)) return;

  moved = false;
  dragging = true;
  dragStart = {
    mouseX: e.clientX,
    mouseY: e.clientY,
    offsetX: offset.value.x,
    offsetY: offset.value.y,
  };
}

function onGlobalMouseMove(e) {
  if (dragging) {
    const dx = e.clientX - dragStart.mouseX;
    const dy = e.clientY - dragStart.mouseY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      moved = true;
    }

    offset.value = {
      x: dragStart.offsetX + dx,
      y: dragStart.offsetY + dy,
    };
    applyOffset();
  }

  onGlobalMouseMoveForPet(e);
}

function onGlobalMouseUp(e) {
  if (e.button !== 0) return;

  if (dragging) {
    dragging = false;
    if (!moved && isInContainer(e)) {
      onModelClick();
    }
    moved = false;
  }
}

onMounted(async () => {
  if (window.matchMedia('(max-width: 768px)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  try {
    const { loadOml2d } = await import('oh-my-live2d');
    instance = loadOml2d({
      models: [
        {
          name: '豆丁星尘',
          path: '/stardust.live2d/豆丁星尘.model3.json',
          scale: 0.15,
          position: [0, 120],
          stageStyle: {
            width: props.size,
            height: props.size * RATIO,
          },
        },
      ],
      parentElement: stageRef.value,
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

function onReset() {
  offset.value = { x: 0, y: 0 };
}

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onGlobalMouseDown);
  document.removeEventListener('mousemove', onGlobalMouseMove);
  document.removeEventListener('mouseup', onGlobalMouseUp);
  if (instance) {
    try { instance.destroy(); } catch (e) {}
    instance = null;
  }
});
</script>