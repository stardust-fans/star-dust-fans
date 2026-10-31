<template>
  <LoginPanel v-if="!isAuthenticated" />

  <div v-else-if="!profileLoaded" class="admin-gate">
    <p>正在加载权限信息…</p>
  </div>

  <div v-else-if="!hasAnyAccess" class="admin-gate">
    <h2>没有可用权限</h2>
    <p>
      当前账号「{{ admin?.username }}」还没有被分配任何模块权限，
      请联系超级管理员在「管理员账户」里为你勾选。
    </p>
    <button class="btn btn-outline" @click="handleLogout">退出登录</button>
  </div>

  <template v-else>
    <Sidebar :sidebar-open="sidebarOpen" @close-sidebar="closeSidebar" />
    <div class="main-content">
      <TopBar @toggle-sidebar="toggleSidebar" />
      <router-view />
    </div>
  </template>

  <ToastContainer />
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAdminAuth } from './composables/useAdminAuth.js';
import { NAV_ITEMS, scopeOfRoute } from './navItems.js';
import { useToast } from './composables/useToast.js';
import LoginPanel from './components/LoginPanel.vue';
import Sidebar from './components/Sidebar.vue';
import TopBar from './components/TopBar.vue';
import ToastContainer from './components/ToastContainer.vue';

const { isAuthenticated, admin, profileLoaded, can, fetchMe, logout } = useAdminAuth();
const { showToast } = useToast();
const route = useRoute();
const router = useRouter();

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

onMounted(async () => {
  // 带着本地 token 刷新页面时，补拉一次权限档案，并把没权限的落地页挪走
  if (!isAuthenticated.value || profileLoaded.value) return;
  await fetchMe();
  if (!admin.value) return;
  const scope = scopeOfRoute(route.name);
  if (scope && !can(scope)) {
    const fallback = NAV_ITEMS.find((item) => can(item.scope));
    if (fallback) router.replace({ name: fallback.key });
  }
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
