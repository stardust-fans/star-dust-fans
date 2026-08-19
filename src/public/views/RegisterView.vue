<!-- src/public/views/RegisterView.vue -->
<template>
  <div class="page-header">
    <span class="eyebrow page-eyebrow">✦ 注册</span>
    <h1 class="page-title">加入星尘站</h1>
    <p class="page-subtitle">注册后即可投稿同人作品或通贩商品</p>
  </div>

  <div class="register-content">
    <form @submit.prevent="handleRegister" class="register-form">
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
        <label for="email">邮箱</label>
        <input
          id="email"
          v-model="form.email"
          type="email"
          placeholder="请输入邮箱"
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
          placeholder="请输入密码（至少6位）"
          required
          minlength="6"
          :disabled="isLoading"
        />
      </div>

      <div
        class="cf-turnstile"
        :data-sitekey="siteKey"
        data-action="register"
        data-callback="onTurnstileSuccess"
        data-error-callback="onTurnstileError"
        data-expired-callback="onTurnstileExpired"
      ></div>

      <button type="submit" class="btn-submit" :disabled="isLoading || !isTurnstileVerified">
        {{ isLoading ? '注册中...' : '注册' }}
      </button>

      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    </form>

    <p class="login-link">
      已有账号？<RouterLink to="/login">去登录</RouterLink>
    </p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useRegister } from '../composables/useRegister.js';
import { useToast } from '../composables/useToast.js';

const siteKey = '0x4AAAAAAEU2b5YYBVephRaH';

const router = useRouter();
const { register, isLoading } = useRegister();
const { showToast } = useToast();

const form = ref({
  username: '',
  email: '',
  password: '',
});

const isTurnstileVerified = ref(false);
const turnstileToken = ref(null);
const errorMessage = ref('');

window.onTurnstileSuccess = function (token) {
  isTurnstileVerified.value = true;
  turnstileToken.value = token;
  errorMessage.value = '';
};

window.onTurnstileError = function () {
  isTurnstileVerified.value = false;
  turnstileToken.value = null;
  errorMessage.value = '人机验证失败，请刷新页面重试';
};

window.onTurnstileExpired = function () {
  isTurnstileVerified.value = false;
  turnstileToken.value = null;
  errorMessage.value = '验证已过期，请重新验证';
};

async function handleRegister() {
  if (!isTurnstileVerified.value) {
    errorMessage.value = '请完成人机验证';
    return;
  }

  try {
    const userData = {
      username: form.value.username,
      email: form.value.email,
      password: form.value.password,
      'cf-turnstile-response': turnstileToken.value,
    };

    await register(userData);
    showToast('🎉 注册成功！欢迎加入星尘站', 'success');
    router.push('/login');
  } catch (err) {
    errorMessage.value = err.message || '注册失败，请稍后重试';
    if (window.turnstile) {
      window.turnstile.reset();
    }
    isTurnstileVerified.value = false;
    turnstileToken.value = null;
  }
}

onMounted(() => {
  if (!window.turnstile) {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }
});
</script>