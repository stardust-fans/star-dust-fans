<template>
  <LoginPanel v-if="!isAuthenticated" />
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
import { ref } from 'vue';
import { useAdminAuth } from './composables/useAdminAuth.js';
import LoginPanel from './components/LoginPanel.vue';
import Sidebar from './components/Sidebar.vue';
import TopBar from './components/TopBar.vue';
import ToastContainer from './components/ToastContainer.vue';

const { isAuthenticated } = useAdminAuth();
const sidebarOpen = ref(false);

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
}
function closeSidebar() {
  sidebarOpen.value = false;
}
</script>
