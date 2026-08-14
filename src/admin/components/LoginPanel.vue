<template>
  <div class="login-page">
    <div class="login-panel">
      <h2>管理员登录</h2>
      <input
        type="text"
        v-model="username"
        placeholder="用户名"
        autocomplete="username"
        @keydown.enter="handleLogin"
      />
      <input
        type="password"
        v-model="password"
        placeholder="密码"
        autocomplete="current-password"
        @keydown.enter="handleLogin"
      />
      <button @click="handleLogin">登录</button>
      <div class="login-error" :style="{ display: showError ? 'block' : 'none' }">用户名或密码错误，请重试</div>
      <button class="btn-back-to-site" @click="backToSite">返回星尘粉丝站</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useAdminAuth } from '../composables/useAdminAuth.js';
import { useToast } from '../composables/useToast.js';

const { login } = useAdminAuth();
const { showToast } = useToast();

const username = ref('');
const password = ref('');
const showError = ref(false);

async function handleLogin() {
  if (!username.value || !password.value) {
    showToast('请输入用户名和密码', 'error');
    return;
  }
  showError.value = false;
  try {
    const result = await login(username.value, password.value);
    if (result.ok) {
      showToast('登录成功', 'success');
    } else {
      showError.value = true;
    }
  } catch (error) {
    showToast('登录失败：' + error.message, 'error');
  }
}

function backToSite() {
  window.location.href = '/';
}
</script>
