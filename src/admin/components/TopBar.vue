<template>
  <div class="topbar">
    <div>
      <button class="hamburger" @click="$emit('toggle-sidebar')"><i class="fas fa-bars"></i></button>
      <h1><img class="brand-logo" src="/logo.svg" alt="" />星尘粉丝站 <span>· 后台管理</span></h1>
      <div class="subtitle">{{ title }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

defineEmits(['toggle-sidebar']);

const route = useRoute();

const titles = {
  songs: '管理歌曲数据',
  daily: '管理吸尘器日报',
  fanart: '管理同人作品',
  shop: '管理量贩商品',
  'audit-log': '安全记录',
  admins: '管理员账户',
};

const title = computed(() => titles[route.name] || '');
</script>
