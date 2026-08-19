<template>
  <div class="sidebar-overlay" :class="{ active: sidebarOpen }" @click="$emit('close-sidebar')"></div>
  <nav class="sidebar" :class="{ open: sidebarOpen }">
    <div class="sidebar-brand">
      <h2><img class="brand-logo" src="/logo.svg" alt="" />星尘</h2>
      <small>后台管理</small>
    </div>
    <ul class="sidebar-menu">
      <li v-for="item in items" :key="item.key">
        <RouterLink :to="{ name: item.key }" @click="$emit('close-sidebar')">
          <i class="fas" :class="item.icon"></i> {{ item.label }}
        </RouterLink>
      </li>
    </ul>
    <div class="sidebar-footer">
      <button class="btn btn-outline btn-sm" style="width:100%;" @click="backToSite">
        <i class="fas fa-arrow-left"></i> 返回前台
      </button>
      <button class="btn btn-outline btn-sm" style="width:100%;" @click="handleLogout">
        <i class="fas fa-sign-out-alt"></i> 退出登录
      </button>
    </div>
  </nav>
</template>

<script setup>
import { useAdminAuth } from '../composables/useAdminAuth.js';
import { useToast } from '../composables/useToast.js';

defineProps({
  sidebarOpen: { type: Boolean, default: false },
});
defineEmits(['close-sidebar']);

const { logout } = useAdminAuth();
const { showToast } = useToast();

function backToSite() {
  window.location.href = '/';
}

const items = [
  { key: 'songs', label: '歌曲管理', icon: 'fa-music' },
  { key: 'daily', label: '吸尘器日报', icon: 'fa-newspaper' },
  { key: 'fanart', label: '同人作品', icon: 'fa-palette' },
  { key: 'shop', label: '量贩管理', icon: 'fa-store' },
  { key: 'audit-log', label: '安全记录', icon: 'fa-shield-halved' },
  { key: 'admins', label: '管理员账户', icon: 'fa-user-gear' },
  { key: 'pending', label: '投稿审核', icon: 'fa-clock' },
];

function handleLogout() {
  logout();
  showToast('已退出', 'info');
}
</script>
