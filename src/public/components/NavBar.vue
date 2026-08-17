<template>
  <nav class="navbar">
    <div class="nav-container">
      <RouterLink to="/" class="nav-brand">
        <img class="nav-brand-logo" src="/logo.svg" alt="" width="26" height="26" />
        星尘
        <span class="nav-brand-mark">吸尘器聚集地</span>
      </RouterLink>
      <ul class="nav-menu" :class="{ open: menuOpen }">
        <li><RouterLink to="/" @click="closeMenu">主页</RouterLink></li>
        <li><RouterLink to="/videos" @click="closeMenu">视频</RouterLink></li>
        <li><RouterLink to="/fanart" @click="closeMenu">同人</RouterLink></li>
        <li><RouterLink to="/shop" @click="closeMenu">量贩</RouterLink></li>
        <li><RouterLink to="/daily" @click="closeMenu">日报</RouterLink></li>
        <li><RouterLink to="/about" @click="closeMenu">关于</RouterLink></li>
      </ul>
      <button class="nav-toggle" aria-label="菜单" @click="menuOpen = !menuOpen">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const menuOpen = ref(false);

function closeMenu() {
  menuOpen.value = false;
}

watch(() => route.fullPath, () => {
  menuOpen.value = false;
});
</script>
