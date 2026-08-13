<template>
  <div class="login-panel">
    <h2>🔐 管理员登录</h2>
    <input
      type="password"
      v-model="password"
      placeholder="请输入管理密码"
      @keydown.enter="handleLogin"
    />
    <button @click="handleLogin">登录</button>
    <div class="login-error" :style="{ display: showError ? 'block' : 'none' }">❌ 密码错误，请重试</div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useAdminAuth } from '../composables/useAdminAuth.js';
import { useToast } from '../composables/useToast.js';

const { login } = useAdminAuth();
const { showToast } = useToast();

const password = ref('');
const showError = ref(false);

async function handleLogin() {
  if (!password.value) {
    showToast('请输入密码', 'error');
    return;
  }
  try {
    const result = await login(password.value);
    if (result.ok) {
      showToast('✅ 登录成功', 'success');
    } else {
      showError.value = true;
    }
  } catch (error) {
    showToast('❌ 登录失败: ' + error.message, 'error');
  }
}
</script>
