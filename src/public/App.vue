<template>
  <CosmicBackground v-if="!fullBleed" />
  <NavBar v-if="!hideChrome" />
  <div id="content" :class="{ 'content-full': fullBleed }">
    <RouterView />
  </div>
  <AppFooter v-if="!fullBleed" />
  <ToastContainer />
  <MysteryDinosaur />
  <Live2DCompanion v-if="!hideChrome" :size="260" />
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import CosmicBackground from './components/CosmicBackground.vue';
import NavBar from './components/NavBar.vue';
import AppFooter from './components/AppFooter.vue';
import ToastContainer from './components/ToastContainer.vue';
import MysteryDinosaur from './components/MysteryDinosaur.vue';
import Live2DCompanion from './components/Live2DCompanion.vue';

const route = useRoute();

// 整幅页面不渲染底部栏，也关掉站点背景的 WebGL（被全屏内容完全遮住）
const fullBleed = computed(() => Boolean(route.meta.fullBleed));
const hideChrome = computed(() => Boolean(route.meta.hideChrome));
</script>
