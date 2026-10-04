<template>
  <div class="settings-page">
    <div class="page-header">
      <span class="eyebrow page-eyebrow">✦ 账号设置</span>
      <h1 class="page-title">设置</h1>
      <p class="page-subtitle">管理你的资料、安全与账号</p>
    </div>

    <div v-if="isLoading" class="user-feedback" role="status">正在加载资料…</div>
    <div v-else-if="loadError" class="user-feedback user-feedback-error" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" class="btn-hero-secondary" @click="loadProfile">重新加载</button>
    </div>

    <template v-else>
      <!-- 头像 -->
      <section class="settings-card">
        <h2 class="settings-card-title">头像</h2>
        <div class="settings-avatar-row">
          <div class="user-avatar">
            <img
              v-if="profile.avatar_url"
              :src="profile.avatar_url"
              :alt="`${displayName}的头像`"
            />
            <span v-else>{{ initial }}</span>
          </div>
          <div class="settings-avatar-actions">
            <button
              type="button"
              class="user-avatar-action"
              :disabled="isUploading"
              @click="pickAvatar"
            >
              {{ isUploading ? "上传中…" : profile.avatar_url ? "更换头像" : "上传头像" }}
            </button>
            <button
              v-if="profile.avatar_url"
              type="button"
              class="user-avatar-action"
              :disabled="isUploading"
              @click="removeAvatar"
            >
              移除
            </button>
            <input
              ref="avatarInput"
              type="file"
              accept="image/*"
              class="user-avatar-input"
              @change="onAvatarChange"
            />
            <p class="settings-hint">
              会自动裁成正方形并压缩到 256×256，存放在站内图床（R2）。
            </p>
          </div>
        </div>
        <p v-if="avatarMessage" class="settings-message">{{ avatarMessage }}</p>
      </section>

      <!-- 基本资料 -->
      <section class="settings-card">
        <h2 class="settings-card-title">基本资料</h2>
        <form class="settings-form" @submit.prevent="saveProfile">
          <div class="form-group">
            <label for="display-name">显示名</label>
            <input
              id="display-name"
              v-model="form.displayName"
              type="text"
              maxlength="32"
              placeholder="留空则显示用户名"
            />
            <p class="settings-hint">站内展示用的名字，1–32 个字符。</p>
          </div>
          <div class="form-group">
            <label for="bio">简介</label>
            <textarea
              id="bio"
              v-model="form.bio"
              rows="3"
              maxlength="200"
              placeholder="介绍一下自己（选填）"
            ></textarea>
            <p class="settings-hint">{{ form.bio.length }}/200</p>
          </div>
          <p v-if="profileMessage" class="settings-message">{{ profileMessage }}</p>
          <button type="submit" class="btn-hero-primary" :disabled="isSavingProfile">
            {{ isSavingProfile ? "保存中…" : "保存资料" }}
          </button>
        </form>
      </section>

      <!-- 用户名 -->
      <section class="settings-card">
        <h2 class="settings-card-title">用户名</h2>
        <form class="settings-form" @submit.prevent="saveUsername">
          <div class="form-group">
            <label for="username">用户名</label>
            <input
              id="username"
              v-model="form.username"
              type="text"
              minlength="2"
              maxlength="32"
              pattern="[A-Za-z0-9_-]{2,32}"
              autocomplete="username"
            />
            <p class="settings-hint">
              2–32 位英文字母、数字、下划线或短横线。用户名同时是登录凭据，改完请用新用户名登录。
            </p>
          </div>
          <p v-if="usernameMessage" class="settings-message">{{ usernameMessage }}</p>
          <button type="submit" class="btn-hero-primary" :disabled="isSavingUsername">
            {{ isSavingUsername ? "提交中…" : "修改用户名" }}
          </button>
        </form>
      </section>

      <!-- 密码 -->
      <section class="settings-card">
        <h2 class="settings-card-title">修改密码</h2>
        <form class="settings-form" @submit.prevent="savePassword">
          <div class="form-group">
            <label for="current-password">当前密码</label>
            <input
              id="current-password"
              v-model="form.currentPassword"
              type="password"
              autocomplete="current-password"
            />
          </div>
          <div class="form-group">
            <label for="new-password">新密码</label>
            <input
              id="new-password"
              v-model="form.newPassword"
              type="password"
              minlength="6"
              autocomplete="new-password"
            />
            <p class="settings-hint">至少 6 位。</p>
          </div>
          <div class="form-group">
            <label for="confirm-password">确认新密码</label>
            <input
              id="confirm-password"
              v-model="form.confirmPassword"
              type="password"
              minlength="6"
              autocomplete="new-password"
            />
          </div>
          <p v-if="passwordMessage" class="settings-message">{{ passwordMessage }}</p>
          <button type="submit" class="btn-hero-primary" :disabled="isSavingPassword">
            {{ isSavingPassword ? "更新中…" : "更新密码" }}
          </button>
        </form>
      </section>

      <!-- 注销 -->
      <section class="settings-card settings-danger">
        <h2 class="settings-card-title">注销账号</h2>
        <p class="settings-hint">
          注销后无法再登录，用户名与邮箱会被释放，头像和简介会被清空；你已发布的投稿与评论会保留，作者显示为「已注销用户」。此操作不可撤销。
        </p>
        <form class="settings-form" @submit.prevent="deleteAccount">
          <div class="form-group">
            <label for="delete-password">输入当前密码以确认</label>
            <input
              id="delete-password"
              v-model="deletePassword"
              type="password"
              autocomplete="current-password"
            />
          </div>
          <p v-if="deleteMessage" class="settings-message">{{ deleteMessage }}</p>
          <button type="submit" class="btn-danger" :disabled="isDeleting">
            {{ isDeleting ? "处理中…" : "注销我的账号" }}
          </button>
        </form>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { API_BASE } from "../../shared/api.js";
import { useLogin } from "../composables/useLogin.js";
import { useAvatarUpload } from "../composables/useAvatarUpload.js";

const router = useRouter();
const { getToken, isAuthenticated, refreshUser, logout } = useLogin();
const { uploadAvatar, isUploading } = useAvatarUpload();

const profile = ref({});
const isLoading = ref(true);
const loadError = ref("");

const avatarInput = ref(null);
const avatarMessage = ref("");
const profileMessage = ref("");
const usernameMessage = ref("");
const passwordMessage = ref("");
const deleteMessage = ref("");
const deletePassword = ref("");

const isSavingProfile = ref(false);
const isSavingUsername = ref(false);
const isSavingPassword = ref(false);
const isDeleting = ref(false);

const form = reactive({
  displayName: "",
  bio: "",
  username: "",
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});

const displayName = computed(
  () => profile.value.display_name || profile.value.username || "用户",
);
const initial = computed(() => (displayName.value || "?")[0].toUpperCase());

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败（HTTP ${response.status}）`);
  return data;
}

async function loadProfile() {
  if (!isAuthenticated()) {
    router.replace({ name: "login", query: { return_to: "/settings" } });
    return;
  }

  isLoading.value = true;
  loadError.value = "";
  try {
    const data = await api("/user/profile");
    profile.value = data;
    form.displayName = data.display_name === data.username ? "" : data.display_name || "";
    form.bio = data.bio || "";
    form.username = data.username || "";
  } catch (error) {
    if (/未登录/.test(error.message)) {
      router.replace({ name: "login", query: { return_to: "/settings" } });
      return;
    }
    loadError.value = error.message || "加载失败，请稍后重试";
  } finally {
    isLoading.value = false;
  }
}

// ---------- 头像 ----------
function pickAvatar() {
  avatarInput.value?.click();
}

async function onAvatarChange(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  avatarMessage.value = "";
  try {
    const url = await uploadAvatar(file, getToken());
    const saved = await api("/user/profile", {
      method: "PUT",
      body: JSON.stringify({ avatar_url: url }),
    });
    profile.value = { ...profile.value, avatar_url: saved.avatar_url ?? null };
    avatarMessage.value = "头像已更新";
  } catch (error) {
    avatarMessage.value = error.message || "头像更新失败";
  }
}

async function removeAvatar() {
  avatarMessage.value = "";
  try {
    await api("/user/profile", {
      method: "PUT",
      body: JSON.stringify({ avatar_url: null }),
    });
    profile.value = { ...profile.value, avatar_url: null };
    avatarMessage.value = "头像已移除";
  } catch (error) {
    avatarMessage.value = error.message || "操作失败";
  }
}

// ---------- 基本资料 ----------
async function saveProfile() {
  profileMessage.value = "";
  isSavingProfile.value = true;
  try {
    const saved = await api("/user/profile", {
      method: "PUT",
      body: JSON.stringify({
        display_name: form.displayName.trim() || null,
        bio: form.bio.trim() || null,
      }),
    });
    profile.value = { ...profile.value, ...saved };
    form.bio = saved.bio || "";
    await refreshUser();
    profileMessage.value = "资料已保存";
  } catch (error) {
    profileMessage.value = error.message || "保存失败";
  } finally {
    isSavingProfile.value = false;
  }
}

// ---------- 用户名 ----------
async function saveUsername() {
  usernameMessage.value = "";
  isSavingUsername.value = true;
  try {
    const result = await api("/user/username", {
      method: "PUT",
      body: JSON.stringify({ username: form.username.trim() }),
    });
    profile.value = {
      ...profile.value,
      username: result.username,
      display_name: result.display_name,
    };
    form.username = result.username;
    await refreshUser();
    usernameMessage.value = "用户名已更新，下次登录请使用新用户名";
  } catch (error) {
    usernameMessage.value = error.message || "修改失败";
  } finally {
    isSavingUsername.value = false;
  }
}

// ---------- 密码 ----------
async function savePassword() {
  passwordMessage.value = "";

  if (form.newPassword !== form.confirmPassword) {
    passwordMessage.value = "两次输入的新密码不一致";
    return;
  }
  if (form.newPassword.length < 6) {
    passwordMessage.value = "新密码至少 6 位";
    return;
  }

  isSavingPassword.value = true;
  try {
    await api("/user/password", {
      method: "PUT",
      body: JSON.stringify({
        current_password: form.currentPassword,
        new_password: form.newPassword,
      }),
    });
    form.currentPassword = "";
    form.newPassword = "";
    form.confirmPassword = "";
    passwordMessage.value = "密码已更新";
  } catch (error) {
    passwordMessage.value = error.message || "修改失败";
  } finally {
    isSavingPassword.value = false;
  }
}

// ---------- 注销 ----------
async function deleteAccount() {
  deleteMessage.value = "";

  if (!deletePassword.value) {
    deleteMessage.value = "请输入当前密码";
    return;
  }
  if (!window.confirm("确定要注销账号吗？此操作不可撤销。")) return;

  isDeleting.value = true;
  try {
    await api("/user/account", {
      method: "DELETE",
      body: JSON.stringify({ password: deletePassword.value }),
    });
    window.alert("账号已注销，感谢曾经的陪伴。");
    logout();
  } catch (error) {
    deleteMessage.value = error.message || "注销失败";
  } finally {
    isDeleting.value = false;
  }
}

onMounted(loadProfile);
</script>
