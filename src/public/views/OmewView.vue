<template>
  <div class="omew-stage" :style="{ top: `${navHeight}px` }">
    <iframe
      class="omew-frame"
      :src="OMEW_URL"
      title="星尘论坛"
      allow="autoplay; clipboard-read; clipboard-write; fullscreen; publickey-credentials-get *; publickey-credentials-create *"
      referrerpolicy="strict-origin-when-cross-origin"
      @load="handleLoad"
    ></iframe>

    <div v-if="!loaded || failed" class="omew-status" role="status" aria-live="polite">
      <template v-if="failed">
        <strong>论坛暂时无法加载</strong>
        <span>请返回星尘站稍后重试。</span>
      </template>
      <template v-else>
        <strong>正在打开论坛…</strong>
        <span>需要登录时，会通过星尘站统一身份验证。</span>
      </template>
    </div>

  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { OMEW_URL } from "../../shared/constants.js";

const navHeight = ref(68);
const loaded = ref(false);
const failed = ref(false);
let observer = null;
let loadTimeout = null;

function handleLoad() {
  loaded.value = true;
  failed.value = false;
  if (loadTimeout) clearTimeout(loadTimeout);
  loadTimeout = null;
}

onMounted(() => {
  const nav = document.querySelector(".navbar");
  if (nav) {
    const sync = () => {
      navHeight.value = Math.round(nav.getBoundingClientRect().height);
    };
    sync();
    observer = new ResizeObserver(sync);
    observer.observe(nav);
  }

  loadTimeout = setTimeout(() => {
    if (!loaded.value) failed.value = true;
  }, 12000);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  if (loadTimeout) clearTimeout(loadTimeout);
  loadTimeout = null;
});
</script>

<style scoped>
.omew-stage {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  overflow: hidden;
  background: #07070d;
}

.omew-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #07070d;
}

.omew-status {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  padding: 24px;
  color: #e7e8f2;
  background: rgba(7, 7, 13, 0.92);
  font-family: var(--font-body);
  text-align: center;
}

.omew-status span {
  color: #b9bce0;
  font-size: 0.9rem;
}

</style>
