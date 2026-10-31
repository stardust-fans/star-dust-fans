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
      <div v-if="admin" class="sidebar-user">
        <span class="sidebar-user-name">{{ admin.username }}</span>
        <span class="sidebar-user-role" :class="{ 'is-super': isSuperAdmin }">
          {{ isSuperAdmin ? '超级管理员' : '普通管理员' }}
        </span>
      </div>
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
import { computed } from 'vue';
import { useAdminAuth } from '../composables/useAdminAuth.js';
import { useToast } from '../composables/useToast.js';
import { NAV_ITEMS } from '../navItems.js';

defineProps({
  sidebarOpen: { type: Boolean, default: false },
});
defineEmits(['close-sidebar']);

const { logout, can, admin, isSuperAdmin } = useAdminAuth();
const { showToast } = useToast();

function backToSite() {
  window.location.href = '/';
}

// 只显示当前账号有权限的模块
const items = computed(() => NAV_ITEMS.filter((item) => can(item.scope)));

function handleLogout() {
  logout();
  showToast('已退出', 'info');
}
</script>