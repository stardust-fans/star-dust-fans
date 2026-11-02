<template>
  <LoginPanel v-if="!isAuthenticated" />

  <div v-else-if="!profileLoaded" class="admin-gate">
    <p>正在加载权限信息…</p>
  </div>

  <div v-else-if="!admin || !hasAnyAccess" class="admin-gate">
    <h2>没有可用权限</h2>
    <p>
      当前账号「{{ admin?.username }}」还没有被分配任何模块权限，
      请联系权限管理员分配权限组。
    </p>
    <button class="btn btn-outline" @click="handleLogout">退出登录</button>
  </div>

  <template v-else>
    <Sidebar :sidebar-open="sidebarOpen" @close-sidebar="closeSidebar" />
    <div class="main-content">
      <TopBar @toggle-sidebar="toggleSidebar" />
      <router-view v-if="routeAllowed" />
      <div v-else class="admin-gate"><h2>没有此页面的访问权限</h2><p>请从侧边栏选择有权访问的页面。</p></div>
    </div>
  </template>

  <ToastContainer />
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAdminAuth } from './composables/useAdminAuth.js';
import { NAV_ITEMS, scopeOfRoute } from './navItems.js';
import { useToast } from './composables/useToast.js';
import LoginPanel from './components/LoginPanel.vue';
import Sidebar from './components/Sidebar.vue';
import TopBar from './components/TopBar.vue';
import ToastContainer from './components/ToastContainer.vue';

const { isAuthenticated, admin, profileLoaded, can, logout } = useAdminAuth();
const { showToast } = useToast();
const route = useRoute();

const sidebarOpen = ref(false);

// 一条权限都没有的账号既看不到菜单，也没有可用页面
const hasAnyAccess = computed(() => NAV_ITEMS.some((item) => can(item.scope)));

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
}
function closeSidebar() {
  sidebarOpen.value = false;
}

function handleLogout() {
  logout();
  showToast('已退出', 'info');
}

const routeAllowed = computed(() => {
  const scope = scopeOfRoute(route.name);
  return Boolean(admin.value && scope && can(scope));
});

</script>

<style scoped>
.admin-gate {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-height: 100vh;
  padding: 32px;
  text-align: center;
  color: var(--ink-soft, #b9bce0);
}

.admin-gate h2 {
  font-size: 1.3rem;
  color: var(--ink, #e7e8f2);
}

.admin-gate p {
  max-width: 420px;
  line-height: 1.8;
  font-size: 0.9rem;
}
</style>
