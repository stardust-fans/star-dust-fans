<template>
  <CosmicBackground v-if="!fullBleed" />
  <NavBar />
  <div id="content" :class="{ 'content-full': fullBleed }">
    <RouterView />
  </div>
  <AppFooter v-if="!fullBleed" />
  <ToastContainer />
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import CosmicBackground from './components/CosmicBackground.vue';
import NavBar from './components/NavBar.vue';
import AppFooter from './components/AppFooter.vue';
import ToastContainer from './components/ToastContainer.vue';
import { useSongs } from './composables/useSongs.js';

const route = useRoute();
const { loadSongs } = useSongs();

// 整幅页面不渲染底部栏，也关掉站点背景的 WebGL（被全屏内容完全遮住）
const fullBleed = computed(() => Boolean(route.meta.fullBleed));

onMounted(() => {
  loadSongs();
});
</script>
