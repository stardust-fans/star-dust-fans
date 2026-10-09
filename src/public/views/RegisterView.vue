<!-- src/public/views/RegisterView.vue -->
<template>
  <div class="page-header">
    <span class="eyebrow page-eyebrow">✦ 注册</span>
    <h1 class="page-title">加入星尘站</h1>
    <p class="page-subtitle">
      {{ step === 1 ? '注册后即可投稿同人作品或通贩商品' : '再花 10 秒，让大家认识你' }}
    </p>
  </div>

  <div class="register-content">
    <!-- ============ Step 1：基本注册 ============ -->
    <form v-if="step === 1" @submit.prevent="handleRegister" class="register-form">
      <div class="form-group">
        <label for="username">用户名</label>
        <input
          id="username"
          v-model="form.username"
          type="text"
          placeholder="2–32 位字母、数字、下划线或短横线"
          required
          minlength="2"
          maxlength="32"
          pattern="[A-Za-z0-9_-]{2,32}"
          autocomplete="username"
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
        {{ isLoading ? '注册中...' : '下一步' }}
      </button>

      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    </form>

    <!-- ============ Step 2：补充资料 ============ -->
    <form v-else @submit.prevent="handleCompleteProfile" class="register-form">
      <p class="step-hint">
        你已注册成功。设置一个显示名，它会出现在评论区、作品页和 OAuth 登录的消费端。
      </p>

      <div class="form-group">
        <label for="display-name">显示名 <span class="required">*</span></label>
        <input
          id="display-name"
          v-model="profile.display_name"
          type="text"
          placeholder="公开显示的称呼，可使用中文"
          maxlength="32"
          autocomplete="nickname"
          :disabled="isLoading"
        />
        <p class="hint">如果跳过，将默认显示你的用户名 @{{ registeredUsername }}</p>
      </div>

      <button type="submit" class="btn-submit" :disabled="isLoading">
        {{ isLoading ? '保存中...' : '完成' }}
      </button>

      <button type="button" class="btn-skip" :disabled="isLoading" @click="handleSkip">
        暂时跳过
      </button>

      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    </form>

    <p v-if="step === 1" class="login-link">
      已有账号？<RouterLink to="/login">去登录</RouterLink>
    </p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useRegister } from '../composables/useRegister.js';
import { useLogin } from '../composables/useLogin.js';
import { useToast } from '../composables/useToast.js';
import { fetchAPI } from '../../shared/api.js';
import {
  isValidDisplayName,
  isValidUsername,
  normalizeDisplayName,
  normalizeUsername,
} from '../../shared/username.js';

const siteKey = '0x4AAAAAAEU2b5YYBVephRaH';

const router = useRouter();
const { register, isLoading } = useRegister();
const { login } = useLogin();
const { showToast } = useToast();

// 当前步骤：1 注册，2 补充资料
const step = ref(1);

const form = ref({
  username: '',
  email: '',
  password: '',
});

const profile = ref({
  display_name: '',
});

// 注册成功后用于展示 fallback 提示
const registeredUsername = ref('');

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

// ============ Step 1：注册 + 自动登录 ============
async function handleRegister() {
  const username = normalizeUsername(form.value.username);
  if (!isValidUsername(username)) {
    errorMessage.value = '用户名需为 2–32 位字母、数字、下划线或短横线';
    return;
  }
  if (!isTurnstileVerified.value) {
    errorMessage.value = '请完成人机验证';
    return;
  }

  try {
    // 1. 注册
    await register({
      username,
      email: form.value.email,
      password: form.value.password,
      'cf-turnstile-response': turnstileToken.value,
    });

    // 2. 注册成功后立即登录，拿到 token 存进 localStorage
    //    这样 Step 2 调 /user/profile 时 fetchAPI 才能带上 Authorization
    try {
      const loginData = await login({
        username,
        password: form.value.password,
      });
      if (loginData?.token) {
        localStorage.setItem('authToken', loginData.token);
      }
    } catch (loginErr) {
      // 登录失败也允许继续（用户可以去登录页手动登录）
      console.warn('注册后自动登录失败：', loginErr?.message);
    }

    registeredUsername.value = username;
    showToast('🎉 注册成功！再花 10 秒完善资料吧', 'success');
    step.value = 2;
  } catch (err) {
    errorMessage.value = err.message || '注册失败，请稍后重试';
    if (window.turnstile) window.turnstile.reset();
    isTurnstileVerified.value = false;
    turnstileToken.value = null;
  }
}

// ============ Step 2：补充资料 ============
async function handleCompleteProfile() {
  const displayName = normalizeDisplayName(profile.value.display_name);
  if (!displayName) {
    errorMessage.value = '请填写显示名，或点击「暂时跳过」';
    return;
  }
  if (!isValidDisplayName(displayName)) {
    errorMessage.value = '显示名需为 1–32 个字符且不能包含控制字符';
    return;
  }

  try {
    await fetchAPI('/user/profile', {
      method: 'PUT',
      body: JSON.stringify({ display_name: displayName }),
    });
    showToast('✨ 资料已保存，欢迎加入星尘站', 'success');
    router.push('/');
  } catch (err) {
    errorMessage.value = err.message || '保存失败，请稍后重试';
  }
}

// ============ Step 2：跳过 ============
function handleSkip() {
  showToast('已跳过，之后可在设置页补充显示名', 'info');
  router.push('/');
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

<style scoped>
.step-hint {
  color: var(--ink-muted);
  font-size: 0.9rem;
  line-height: 1.7;
  margin-bottom: 4px;
}

.required {
  color: #ff6b6b;
  margin-left: 2px;
}

.hint {
  font-size: 0.78rem;
  color: var(--ink-faint);
  margin-top: 6px;
  line-height: 1.6;
}

.btn-skip {
  width: 100%;
  margin-top: 10px;
  padding: 12px;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--ink-muted);
  font-family: var(--font-mono);
  font-size: 0.9rem;
  cursor: pointer;
  transition: color 0.2s var(--ease), border-color 0.2s var(--ease);
}

.btn-skip:hover:not(:disabled) {
  color: var(--ink);
  border-color: var(--line-strong);
}

.btn-skip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>