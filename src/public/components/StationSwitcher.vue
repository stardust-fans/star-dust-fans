<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="station-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="station-dialog-title"
      @click.self="close"
    >
      <div ref="panelRef" class="station-panel">
        <header class="station-header">
          <div>
            <h2 id="station-dialog-title" class="station-title">选择站点</h2>
            <p class="station-sub">同一个宇宙，不同的星星</p>
          </div>
          <button ref="closeBtn" type="button" class="station-close" aria-label="关闭" @click="close">
            ✕
          </button>
        </header>

        <div class="station-grid">
          <button
            v-for="station in STATIONS"
            :key="station.key"
            type="button"
            class="station-card"
            :class="{ 'is-live': station.status === 'live', 'is-soon': station.status !== 'live' }"
            :style="cardStyle(station)"
            :aria-label="`${station.name}站${station.status === 'live' ? '，当前站点' : '，敬请期待'}`"
            @click="pick(station)"
          >
            <span class="station-name">{{ station.name }}</span>
            <span class="station-en">{{ station.en }}</span>
            <span class="station-line" aria-hidden="true"></span>
            <span class="station-foot">
              <span v-if="station.status === 'live'" class="station-badge is-live">当前站点</span>
              <span v-else class="station-badge is-soon">敬请期待</span>
              <span v-if="station.tagline" class="station-tagline">{{ station.tagline }}</span>
            </span>
          </button>
        </div>

        <p class="station-hint">其他站点的星星还在汇聚，做好后会出现在这里。</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { STATIONS, stationColors } from '../../shared/stations.js';
import { useToast } from '../composables/useToast.js';

const props = defineProps({
  open: { type: Boolean, default: false },
});

const emit = defineEmits(['update:open', 'select']);

const { showToast } = useToast();
const panelRef = ref(null);
const closeBtn = ref(null);
let previousOverflow = '';

// 单应援色 → 应援色到白；双应援色 → 首色到次色
function cardStyle(station) {
  const [from, to] = stationColors(station);
  return {
    '--station-from': from,
    '--station-to': to,
  };
}

function close() {
  emit('update:open', false);
}

function pick(station) {
  if (station.status !== 'live') {
    showToast(`${station.name}站还在建设中，敬请期待`, 'info');
    return;
  }
  emit('select', station);
  close();
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    close();
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', onKeydown);
      nextTick(() => closeBtn.value?.focus());
    } else {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeydown);
    }
  }
);

onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow;
  window.removeEventListener('keydown', onKeydown);
});
</script>

<style scoped>
.station-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(4, 4, 10, 0.72);
  backdrop-filter: blur(6px);
  animation: station-fade 0.18s var(--ease);
}

.station-panel {
  width: 100%;
  max-width: 760px;
  max-height: min(86vh, 720px);
  overflow-y: auto;
  padding: 22px 22px 18px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: var(--paper-raised);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
  animation: station-rise 0.22s var(--ease);
}

.station-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.station-title {
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--ink);
  letter-spacing: 0.02em;
}

.station-sub {
  margin-top: 4px;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  color: var(--ink-faint);
  text-transform: uppercase;
}

.station-close {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: transparent;
  color: var(--ink-muted);
  font-size: 0.9rem;
  cursor: pointer;
  transition: border-color 0.2s var(--ease), color 0.2s var(--ease);
}

.station-close:hover,
.station-close:focus-visible {
  border-color: var(--cobalt);
  color: var(--cobalt);
}

/* 横向自适应：宽屏 3~5 个，平板 2 个，手机 1 个 */
.station-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 12px;
}

.station-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 14px 14px 12px 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.22s var(--ease), transform 0.22s var(--ease),
    box-shadow 0.22s var(--ease);
}

/* 应援色光晕 */
.station-card::before {
  content: '';
  position: absolute;
  inset: -30% 40% 30% -30%;
  background: radial-gradient(circle at 30% 30%, var(--station-from), transparent 68%);
  opacity: 0.08;
  pointer-events: none;
  transition: opacity 0.22s var(--ease);
}

/* 左侧应援色竖条 */
.station-card::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 3px;
  background: linear-gradient(180deg, var(--station-from), var(--station-to));
  transition: width 0.22s var(--ease);
}

.station-card:hover,
.station-card:focus-visible {
  border-color: var(--line-strong);
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
}

.station-card:hover::before,
.station-card:focus-visible::before {
  opacity: 0.16;
}

.station-card:hover::after {
  width: 4px;
}

.station-card:focus-visible {
  outline: 2px solid var(--cobalt);
  outline-offset: 2px;
}

.station-name {
  position: relative;
  font-family: var(--font-display);
  font-size: 1.12rem;
  color: var(--ink);
  letter-spacing: 0.02em;
}

.station-en {
  position: relative;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

/* 名字下方的应援色短线 */
.station-line {
  position: relative;
  display: block;
  width: 56px;
  height: 2px;
  margin: 8px 0 10px;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--station-from), var(--station-to));
  opacity: 0.9;
}

.station-foot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
}

.station-badge {
  padding: 2px 8px;
  border-radius: 100px;
  border: 1px solid var(--line);
  font-size: 0.68rem;
  font-family: var(--font-mono);
  white-space: nowrap;
}

.station-badge.is-live {
  border-color: var(--station-from);
  color: var(--station-from);
}

.station-badge.is-soon {
  color: var(--ink-faint);
}

.station-card.is-soon {
  opacity: 0.72;
}

.station-card.is-soon:hover {
  opacity: 0.92;
}

.station-tagline {
  font-size: 0.68rem;
  color: var(--ink-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.station-hint {
  margin-top: 16px;
  font-size: 0.74rem;
  text-align: center;
  color: var(--ink-faint);
}

@keyframes station-fade {
  from {
    opacity: 0;
  }
}

@keyframes station-rise {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.99);
  }
}

@media (max-width: 560px) {
  .station-overlay {
    padding: 14px;
    align-items: flex-end;
  }

  .station-panel {
    max-height: 84vh;
    padding: 18px 16px 14px;
  }

  .station-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
  }

  .station-title {
    font-size: 1.15rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .station-overlay,
  .station-panel {
    animation: none;
  }

  .station-card,
  .station-card::before,
  .station-card::after {
    transition: none;
  }
}
</style>
