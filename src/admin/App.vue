<template>
  <LoginPanel v-if="!isAuthenticated" />
  <template v-else>
    <Sidebar :active-module="activeModule" :sidebar-open="sidebarOpen" @select="selectModule" @close-sidebar="closeSidebar" />
    <div class="main-content">
      <TopBar :active-module="activeModule" @toggle-sidebar="toggleSidebar" />

      <SongsModule v-if="activeModule === 'songs'" />
      <DailyModule v-else-if="activeModule === 'daily'" />
      <FanartModule v-else-if="activeModule === 'fanart'" />
      <ShopModule v-else-if="activeModule === 'shop'" />
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
import SongsModule from './modules/SongsModule.vue';
import DailyModule from './modules/DailyModule.vue';
import FanartModule from './modules/FanartModule.vue';
import ShopModule from './modules/ShopModule.vue';

const { isAuthenticated } = useAdminAuth();
const activeModule = ref('songs');
const sidebarOpen = ref(false);

function selectModule(mod) {
  activeModule.value = mod;
  sidebarOpen.value = false;
}
function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
}
function closeSidebar() {
  sidebarOpen.value = false;
}
</script>
