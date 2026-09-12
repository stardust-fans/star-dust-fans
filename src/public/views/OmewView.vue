<template>
  <div class="omew-stage" :style="{ top: `${navHeight}px` }">
    <iframe
      class="omew-frame"
      :src="OMEW_DEPLOY_URL"
      title="部署你自己的 OMEW"
      allow="autoplay; clipboard-read; clipboard-write; fullscreen"
      referrerpolicy="strict-origin-when-cross-origin"
      @load="handleLoad"
    ></iframe>

    <div v-if="!loaded || failed" class="omew-status" role="status" aria-live="polite">
      <template v-if="failed">
        <strong>OMEW 自部署向导暂时无法加载</strong>
        <span>请直接打开部署向导继续。</span>
      </template>
      <template v-else>
        <strong>正在打开 OMEW 自部署向导…</strong>
        <span>每位使用者会把 OMEW 部署到自己的 Cloudflare 账户。</span>
      </template>
      <a :href="OMEW_DEPLOY_URL" target="_blank" rel="noopener noreferrer">新标签页打开 ↗</a>
    </div>

    <a
      class="omew-open-link"
      :href="OMEW_DEPLOY_URL"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="在新标签页打开 OMEW 自部署向导"
    >
      ↗
    </a>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { OMEW_DEPLOY_URL } from "../../shared/constants.js";

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

.omew-status a,
.omew-open-link {
  color: #e8c76f;
  text-decoration: none;
}

.omew-status a {
  margin-top: 8px;
  border-bottom: 1px solid rgba(232, 199, 111, 0.55);
}

.omew-open-link {
  position: absolute;
  top: 14px;
  right: 18px;
  z-index: 2;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid rgba(232, 199, 111, 0.5);
  border-radius: 50%;
  background: rgba(7, 7, 13, 0.75);
  font-size: 1rem;
}

.omew-open-link:hover,
.omew-open-link:focus-visible {
  color: #fff1bf;
  border-color: #e8c76f;
}
</style>
