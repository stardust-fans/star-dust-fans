<template>
  <div class="starmap-stage" :style="{ top: `${navHeight}px` }">
    <iframe
      class="starmap-frame"
      src="/starmap-app/index.html"
      title="十光年的距离 · 曲目星图"
      allow="autoplay; fullscreen"
    ></iframe>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

// 导航栏高度按断点变化，运行时测量，不写死数值
const navHeight = ref(68);
let observer = null;

onMounted(() => {
  const nav = document.querySelector('.navbar');
  if (!nav) return;
  const sync = () => {
    navHeight.value = Math.round(nav.getBoundingClientRect().height);
  };
  sync();
  observer = new ResizeObserver(sync);
  observer.observe(nav);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});
</script>

<style scoped>
/* 固定定位铺满导航栏以下的视口，绕开 #app 的 max-width 与内边距 */
.starmap-stage {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  overflow: hidden;
  background: #05070f;
}

.starmap-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
</style>
