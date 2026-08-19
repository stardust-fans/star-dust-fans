<!-- src/public/views/LoginView.vue -->
<template>
  <div class="page-header">
    <span class="eyebrow page-eyebrow">✦ 登录</span>
    <h1 class="page-title">登录</h1>
    <p class="page-subtitle">登录后即可投稿同人作品或通贩商品</p>
  </div>

  <div class="register-content">
    <form @submit.prevent="handleLogin" class="register-form">
      <div class="form-group">
        <label for="username">用户名</label>
        <input
          id="username"
          v-model="form.username"
          type="text"
          placeholder="请输入用户名"
          required
          :disabled="isLoading"
        />
      </div>

      <div class="form-group">
        <label for="password">密码</label>
        <input
          id="password"
          v-model="form.password"
          type="password"
          placeholder="请输入密码"
          required
          :disabled="isLoading"
        />
      </div>

      <button type="submit" class="btn-submit" :disabled="isLoading">
        {{ isLoading ? '登录中...' : '登录' }}
      </button>

      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    </form>

    <p class="login-link">
      还没有账号？<RouterLink to="/register">去注册</RouterLink>
    </p>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useLogin } from '../composables/useLogin.js';
import { useToast } from '../composables/useToast.js';

const router = useRouter();
const { login, isLoading } = useLogin();
const { showToast } = useToast();

const form = ref({
  username: '',
  password: '',
});

const errorMessage = ref('');

async function handleLogin() {
  errorMessage.value = '';

  try {
    const data = await login({
      username: form.value.username,
      password: form.value.password,
    });

    showToast('🎉 登录成功！欢迎回来', 'success');
    // 登录成功后跳转到首页
    router.push('/');
    window.location.href = '/';
  } catch (err) {
    errorMessage.value = err.message || '登录失败，请稍后重试';
  }
}
</script>