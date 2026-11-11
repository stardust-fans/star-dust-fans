<template>
  <SiteComingSoon v-if="comingSoon" :site="site" />

  <template v-else>
    <CosmicBackground v-if="!fullBleed" />
    <NavBar v-if="!hideChrome" />
    <div id="content" :class="{ 'content-full': fullBleed }">
      <RouterView />
    </div>
    <AppFooter v-if="!fullBleed" />
    <ToastContainer />
    <Live2DCompanion v-if="showCompanion" :size="260" />
  </template>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import CosmicBackground from './components/CosmicBackground.vue';
import NavBar from './components/NavBar.vue';
import AppFooter from './components/AppFooter.vue';
import ToastContainer from './components/ToastContainer.vue';
import Live2DCompanion from './components/Live2DCompanion.vue';
import SiteComingSoon from './components/SiteComingSoon.vue';
import { useSite } from './composables/useSite.js';

const route = useRoute();
const { site, load } = useSite();

// 整幅页面不渲染底部栏，也关掉站点背景的 WebGL（被全屏内容完全遮住）
const fullBleed = computed(() => Boolean(route.meta.fullBleed));
const hideChrome = computed(() => Boolean(route.meta.hideChrome));

// 未开放的子站只显示「建设中」，不加载任何现有站点的内容
const comingSoon = computed(() => Boolean(site.value) && site.value.status !== 'live');

// 桌宠按站点开关（模型是豆丁星尘，其他站默认不显示）
const showCompanion = computed(
  () =>
    Boolean(route.name) &&
    !hideChrome.value &&
    !route.meta.hideCompanion &&
    site.value?.features?.live2d !== false
);

onMounted(load);
</script>
