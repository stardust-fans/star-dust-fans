<template>
  <CosmicBackground />
  <NavBar />
  <div id="content">
    <RouterView />
  </div>
  <AppFooter />
</template>

<script setup>
import { onMounted } from 'vue';
import CosmicBackground from './components/CosmicBackground.vue';
import NavBar from './components/NavBar.vue';
import AppFooter from './components/AppFooter.vue';
import { useSongs } from './composables/useSongs.js';

const { loadSongs } = useSongs();

onMounted(() => {
  loadSongs();
});
</script>
