<template>
  <div class="page-header">
    <span class="eyebrow page-eyebrow">✦ 账号设置</span>
    <h1 class="page-title">更新用户名</h1>
    <p class="page-subtitle">现有用户名不符合论坛登录规则，请先修改，再继续使用账号。</p>
  </div>

  <div class="register-content">
    <form class="register-form" @submit.prevent="saveUsername">
      <div class="form-group">
        <label>当前用户名</label>
        <p>{{ oldUsername }}</p>
      </div>

      <div class="form-group">
        <label for="new-username">新用户名</label>
        <input
          id="new-username"
          v-model="username"
          type="text"
          minlength="2"
          maxlength="32"
          pattern="[A-Za-z0-9_-]{2,32}"
          autocomplete="username"
          required
          :disabled="isLoading || isSaving"
        />
        <p>已根据原用户名移除不支持的字符并给出候选；你可以修改。只允许 2–32 位英文字母、数字、下划线和短横线。</p>
        <p v-if="oldUsername.includes('@')">新用户名会公开显示。候选可能保留原邮箱中的字符，请确认后再保存。</p>
      </div>

      <button class="btn-submit" type="submit" :disabled="isLoading || isSaving">
        {{ isSaving ? '保存中...' : '保存并继续' }}
      </button>
      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    </form>
    <p class="login-link"><a href="/login" @click.prevent="logout">切换账号</a></p>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { API_BASE } from '../../shared/api.js';
import { useLogin } from '../composables/useLogin.js';

const route = useRoute();
const { getToken, refreshUser, logout } = useLogin();
const oldUsername = ref('');
const username = ref('');
const isLoading = ref(true);
const isSaving = ref(false);
const errorMessage = ref('');

const requested = route.query.return_to;
const returnTo = typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//') && !/[\\\u0000-\u001f#]/.test(requested)
  ? requested
  : '/';

onMounted(async () => {
  const token = getToken();
  if (!token) {
    window.location.assign(`/login?return_to=${encodeURIComponent(route.fullPath)}`);
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/user/profile`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) {
      window.location.assign(`/login?return_to=${encodeURIComponent(route.fullPath)}`);
      return;
    }
    const profile = await response.json();
    if (!response.ok) throw new Error(profile.error || '暂时无法读取账号资料');
    if (!profile.username_change_required) {
      window.location.assign(returnTo);
      return;
    }
    oldUsername.value = profile.username;
    username.value = profile.suggested_username;
  } catch (error) {
    errorMessage.value = error.message || '暂时无法读取账号资料';
  } finally {
    isLoading.value = false;
  }
});

async function saveUsername() {
  errorMessage.value = '';
  isSaving.value = true;
  try {
    const response = await fetch(`${API_BASE}/user/username`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ username: username.value }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || '保存失败');
    await refreshUser();
    window.location.assign(returnTo);
  } catch (error) {
    errorMessage.value = error.message || '保存失败，请重试';
  } finally {
    isSaving.value = false;
  }
}
</script>
