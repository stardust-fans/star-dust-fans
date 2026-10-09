<template>
  <CosmicBackground v-if="!fullBleed" />
  <NavBar v-if="!hideChrome" />
  <div id="content" :class="{ 'content-full': fullBleed }">
    <RouterView />
  </div>
  <AppFooter v-if="!fullBleed" />
  <ToastContainer />
  <MysteryDinosaur />
  <!-- 新增：看板娘，特殊全屏页面不显示 -->
  <Live2DCompanion v-if="!hideChrome" :size="450" />
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import CosmicBackground from './components/CosmicBackground.vue';
import NavBar from './components/NavBar.vue';
import AppFooter from './components/AppFooter.vue';
import ToastContainer from './components/ToastContainer.vue';
import MysteryDinosaur from './components/MysteryDinosaur.vue';
import Live2DCompanion from './components/Live2DCompanion.vue'; // 新增
import { useSongs } from './composables/useSongs.js';

const route = useRoute();
const { loadSongs } = useSongs();

const fullBleed = computed(() => Boolean(route.meta.fullBleed));
const hideChrome = computed(() => Boolean(route.meta.hideChrome));

onMounted(() => {
  loadSongs();
});
</script>