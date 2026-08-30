<template>
  <aside v-if="visible" class="dino-egg" :class="{ 'is-open': isOpen }">
    <div
      v-if="isOpen"
      id="mystery-dinosaur-message"
      class="dino-egg__bubble"
      role="status"
      aria-live="polite"
    >
      {{ message }}
    </div>
    <button
      class="dino-egg__trigger"
      type="button"
      :aria-expanded="isOpen"
      aria-controls="mystery-dinosaur-message"
      aria-label="发现神秘星尘小恐龙"
      @click="toggle"
    >
      <svg viewBox="0 0 80 56" aria-hidden="true">
        <path class="dino-body" d="M8 44c1-18 9-29 24-29h16c9 0 17 6 20 15h6v10H57c-5 7-14 9-24 6l-9-2H8z" />
        <path class="dino-neck" d="M40 17C39 8 44 4 54 6c9 1 13 7 11 13l-8 1" />
        <circle class="dino-eye" cx="57" cy="11" r="2.5" />
        <path class="dino-foot" d="M21 43v8M47 44v8" />
        <path class="dino-spike" d="M19 16l3-9 6 8 6-10 5 10" />
      </svg>
    </button>
  </aside>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const isOpen = ref(false);
const hasVisited = ref(false);
const hasOpened = ref(false);
const messages = [
  '嘘……我在这里数星星。',
  '你发现了我，奖励一颗星尘！',
  '今天也要好好发光。',
];
const messageIndex = ref(0);
let revealTimer;

const visible = computed(() => hasVisited.value && !route.meta.fullBleed);
const message = computed(() => messages[messageIndex.value]);

const toggle = () => {
  if (isOpen.value) {
    isOpen.value = false;
    return;
  }

  if (hasOpened.value) {
    messageIndex.value = (messageIndex.value + 1) % messages.length;
  }
  hasOpened.value = true;
  isOpen.value = true;
};

onMounted(() => {
  revealTimer = window.setTimeout(() => {
    hasVisited.value = true;
  }, 7000);
});

onUnmounted(() => {
  window.clearTimeout(revealTimer);
});
</script>

<style scoped>
.dino-egg {
  position: fixed;
  z-index: 20;
  right: max(1rem, env(safe-area-inset-right));
  bottom: max(1rem, env(safe-area-inset-bottom));
  display: flex;
  align-items: flex-end;
  gap: 0.65rem;
  pointer-events: none;
}

.dino-egg__trigger,
.dino-egg__bubble {
  pointer-events: auto;
}

.dino-egg__trigger {
  display: grid;
  width: 3.25rem;
  height: 2.6rem;
  place-items: center;
  border: 1px solid rgba(224, 211, 255, 0.55);
  border-radius: 1.4rem 1.4rem 0.35rem 1.4rem;
  padding: 0.35rem;
  background: rgba(32, 23, 58, 0.88);
  box-shadow: 0 5px 18px rgba(15, 8, 32, 0.25);
  cursor: pointer;
}

.dino-egg__trigger:hover {
  background: #46336c;
}

.dino-egg__trigger:focus-visible {
  outline: 2px solid #b5e8db;
  outline-offset: 3px;
}

.dino-egg__trigger svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.dino-body {
  fill: #8e70bf;
  stroke: #f1eaff;
  stroke-width: 2;
  stroke-linejoin: round;
}

.dino-neck {
  fill: #9f80cf;
  stroke: #f1eaff;
  stroke-width: 2;
}

.dino-eye {
  fill: #f6ca7e;
}

.dino-foot,
.dino-spike {
  fill: none;
  stroke: #f6ca7e;
  stroke-linecap: round;
  stroke-width: 2.5;
}

.dino-egg__bubble {
  max-width: 13rem;
  border: 1px solid rgba(224, 211, 255, 0.55);
  border-radius: 0.8rem 0.8rem 0.8rem 0.2rem;
  padding: 0.6rem 0.75rem;
  color: #f1eaff;
  background: rgba(32, 23, 58, 0.94);
  font-size: 0.78rem;
  line-height: 1.5;
  box-shadow: 0 5px 18px rgba(15, 8, 32, 0.25);
}

.is-open .dino-egg__trigger {
  border-color: #f6ca7e;
}

@media (prefers-reduced-motion: no-preference) {
  .dino-egg__trigger {
    animation: dino-bob 3s ease-in-out infinite;
  }
}

@keyframes dino-bob {
  50% {
    transform: translateY(-3px);
  }
}

@media (max-width: 480px) {
  .dino-egg__bubble {
    max-width: 10rem;
  }
}
</style>
