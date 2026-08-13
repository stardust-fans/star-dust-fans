<template>
  <nav class="navbar">
    <div class="nav-container">
      <RouterLink to="/" class="nav-brand">吸尘器聚集地·星尘粉丝站</RouterLink>
      <ul class="nav-menu" :class="{ open: menuOpen }">
        <li><RouterLink to="/" @click="closeMenu">主页</RouterLink></li>
        <li><RouterLink to="/videos" @click="closeMenu">视频</RouterLink></li>
        <li><RouterLink to="/fanart" @click="closeMenu">同人</RouterLink></li>
        <li><RouterLink to="/shop" @click="closeMenu">量贩</RouterLink></li>
        <li><RouterLink to="/daily" @click="closeMenu">吸尘器日报</RouterLink></li>
      </ul>
      <button class="nav-toggle" @click="menuOpen = !menuOpen">
        <i class="fas fa-bars"></i>
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
