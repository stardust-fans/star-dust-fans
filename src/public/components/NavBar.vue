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
        <li><RouterLink to="/starmap" @click="closeMenu">星图</RouterLink></li>
        <li><RouterLink to="/about" @click="closeMenu">关于</RouterLink></li>
        <li v-if="!user">
          <RouterLink to="/login" @click="closeMenu">登录</RouterLink>
        </li>
        <li v-else>
          <span class="nav-user" @click="handleLogout">{{ user.username }}</span>
        </li>
      </ul>
      <button class="nav-toggle" aria-label="菜单" @click="menuOpen = !menuOpen">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useLogin } from '../composables/useLogin.js';

const route = useRoute();
const menuOpen = ref(false);
const { getUser, logout } = useLogin();

const user = computed(() => getUser());

function closeMenu() {
  menuOpen.value = false;
}

function handleLogout() {
  if (confirm('确定要退出吗？')) {
    logout();
  }
}

watch(() => route.fullPath, () => {
  menuOpen.value = false;
});
</script>