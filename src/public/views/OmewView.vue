<template>
  <div class="omew-stage" :style="{ top: `${navHeight}px` }">
    <iframe
      ref="omewFrame"
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
        <span>星尘站用户设置会自动同步，无需再次登录。</span>
      </template>
    </div>

  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { OMEW_URL } from "../../shared/constants.js";

const OMEW_ORIGIN = new URL(OMEW_URL).origin;
const STAR_DUST_SESSION_EVENT = "star-dust-session";
const navHeight = ref(68);
const loaded = ref(false);
const failed = ref(false);
const omewFrame = ref(null);
let observer = null;
let loadTimeout = null;

async function postStarDustSession() {
  const target = omewFrame.value?.contentWindow;
  if (!target) return;

  try {
    const response = await fetch("/api/omew/session", { method: "POST" });
    if (!response.ok) return;
    const token = (await response.json()).token;
    if (typeof token === "string" && token) {
      target.postMessage({ type: STAR_DUST_SESSION_EVENT, token }, OMEW_ORIGIN);
    }
  } catch {
    // Anonymous visitors remain in OMEW guest mode when the site session is absent.
  }
}

function handleMessage(event) {
  if (event.origin !== OMEW_ORIGIN || event.source !== omewFrame.value?.contentWindow) return;
  if (event.data?.type === "omew-ready") void postStarDustSession();
}

function handleLoad() {
  loaded.value = true;
  failed.value = false;
  if (loadTimeout) clearTimeout(loadTimeout);
  loadTimeout = null;
  void postStarDustSession();
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

  window.addEventListener("message", handleMessage);
  window.addEventListener("star-dust-auth-changed", postStarDustSession);

  loadTimeout = setTimeout(() => {
    if (!loaded.value) failed.value = true;
  }, 12000);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  window.removeEventListener("message", handleMessage);
  window.removeEventListener("star-dust-auth-changed", postStarDustSession);
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
