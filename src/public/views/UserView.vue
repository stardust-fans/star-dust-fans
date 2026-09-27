<template>
  <div class="user-page" aria-labelledby="user-page-title">
    <div class="page-header">
      <span class="eyebrow page-eyebrow">✦ 个人中心</span>
      <h1 id="user-page-title" class="page-title">用户中心</h1>
      <p class="page-subtitle">管理你的投稿与信息</p>
    </div>

    <!-- 用户基本信息 -->
    <div
      v-if="isLoading"
      class="user-feedback"
      role="status"
      aria-live="polite"
    >
      正在加载你的投稿…
    </div>
    <div
      v-else-if="errorMessage"
      class="user-feedback user-feedback-error"
      role="alert"
    >
      <p>{{ errorMessage }}</p>
      <button type="button" class="btn-hero-secondary" @click="fetchUserData">
        重新加载
      </button>
    </div>

    <template v-else>
      <section class="user-profile-card" aria-labelledby="profile-title">
        <div class="user-avatar">
          <img
            v-if="userInfo.avatar_url"
            :src="userInfo.avatar_url"
            :alt="`${userInfo.username || '用户'}的头像`"
          />
          <span v-else>{{ userInitial }}</span>
        </div>
        <div class="user-info">
          <h2 id="profile-title">{{ userInfo.username || "用户" }}</h2>
          <p v-if="userInfo.email" class="user-email">{{ userInfo.email }}</p>
          <p class="user-register-date">
            <span class="label">注册时间</span>
            {{ formatUserDate(userInfo.created_at) }}
            <span v-if="registerDays !== null" class="days-badge"
              >已注册 {{ registerDays }} 天</span
            >
          </p>
          <p v-if="avatarMessage" class="user-avatar-message">{{ avatarMessage }}</p>
        </div>
        <div class="user-profile-actions">
          <button
            type="button"
            class="user-avatar-action"
            :disabled="isUploading"
            @click="pickAvatar"
          >
            {{
              isUploading
                ? "上传中…"
                : userInfo.avatar_url
                  ? "更换头像"
                  : "设置头像"
            }}
          </button>
          <button
            v-if="userInfo.avatar_url"
            type="button"
            class="user-avatar-action user-avatar-remove"
            :disabled="isUploading"
            @click="clearAvatar"
          >
            移除
          </button>
          <button type="button" class="user-logout" @click="logout">
            退出登录
          </button>
          <input
            ref="avatarInput"
            type="file"
            accept="image/*"
            class="user-avatar-input"
            @change="onAvatarChange"
          />
        </div>
        <RouterLink
          v-if="isAprilFoolsDay"
          to="/aspirateur"
          class="user-secret-link"
          aria-label="发现四月一日隐藏彩蛋"
          >✦</RouterLink
        >
      </section>

      <!-- 统计概览 -->
      <section class="user-stats">
        <div class="stat-item">
          <span class="stat-number">{{ fanartList.length }}</span>
          <span class="stat-label">同人作品</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">{{ shopList.length }}</span>
          <span class="stat-label">量贩商品</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">{{ totalContributions }}</span>
          <span class="stat-label">总投稿</span>
        </div>
      </section>

      <!-- 投稿列表 -->
      <section class="user-contributions">
        <h2 class="section-title">我的投稿</h2>

        <!-- Tab 切换 -->
        <div class="contribution-tabs" role="group" aria-label="投稿类型">
          <button
            type="button"
            :aria-pressed="activeTab === 'fanart'"
            :class="['tab-btn', { active: activeTab === 'fanart' }]"
            @click="activeTab = 'fanart'"
          >
            同人作品 ({{ fanartList.length }})
          </button>
          <button
            type="button"
            :aria-pressed="activeTab === 'shop'"
            :class="['tab-btn', { active: activeTab === 'shop' }]"
            @click="activeTab = 'shop'"
          >
            量贩商品 ({{ shopList.length }})
          </button>
        </div>

        <!-- 同人作品列表 -->
        <div v-if="activeTab === 'fanart'" class="contribution-list">
          <div v-if="fanartList.length === 0" class="empty-state">
            <p>还没有投稿同人作品</p>
            <RouterLink to="/fanart" class="btn-hero-secondary"
              >去投稿 →</RouterLink
            >
          </div>
          <div v-else class="contribution-grid">
            <div
              v-for="item in fanartList"
              :key="item.id"
              class="contribution-card"
            >
              <img
                v-if="item.image_url"
                :src="item.image_url"
                :alt="item.title || '同人作品'"
                class="contribution-image"
              />
              <div class="contribution-info">
                <h3>{{ item.title }}</h3>
                <p class="contribution-meta">
                  <span class="status-badge" :class="`status-${item.status}`">
                    {{ statusLabel(item.status) }}
                  </span>
                  <span class="contribution-date">{{
                    formatUserDate(item.created_at)
                  }}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- 量贩商品列表 -->
        <div v-if="activeTab === 'shop'" class="contribution-list">
          <div v-if="shopList.length === 0" class="empty-state">
            <p>还没有投稿量贩商品</p>
            <RouterLink to="/shop" class="btn-hero-secondary"
              >去投稿 →</RouterLink
            >
          </div>
          <div v-else class="contribution-grid">
            <div
              v-for="item in shopList"
              :key="item.id"
              class="contribution-card"
            >
              <img
                v-if="item.image_url"
                :src="item.image_url"
                :alt="item.title || '量贩商品'"
                class="contribution-image"
              />
              <div class="contribution-info">
                <h3>{{ item.title }}</h3>
                <p class="contribution-meta">
                  <span class="status-badge" :class="`status-${item.status}`">
                    {{ statusLabel(item.status) }}
                  </span>
                  <span class="contribution-date">{{
                    formatUserDate(item.created_at)
                  }}</span>
                  <span class="contribution-price">{{ item.price }}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useLogin } from "../composables/useLogin.js";
import { useAvatarUpload } from "../composables/useAvatarUpload.js";
import { formatDate } from "../../shared/format.js";
import { API_BASE } from "../../shared/api.js";

const router = useRouter();
const { getToken, isAuthenticated, logout } = useLogin();

const userInfo = ref({});
const fanartList = ref([]);
const shopList = ref([]);
const activeTab = ref("fanart");
const isLoading = ref(false);
const errorMessage = ref("");

const isAprilFoolsDay = computed(() => {
  const today = new Date();
  return today.getMonth() === 3 && today.getDate() === 1;
});

const userInitial = computed(() => {
  return (userInfo.value.username || "?")[0].toUpperCase();
});

// ---------- 头像 ----------
const { uploadAvatar, isUploading } = useAvatarUpload();
const avatarInput = ref(null);
const avatarMessage = ref("");

function pickAvatar() {
  avatarInput.value?.click();
}

async function saveAvatar(url) {
  const token = getToken();
  const response = await fetch(`${API_BASE}/user/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ avatar_url: url }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "保存失败");
  userInfo.value = { ...userInfo.value, avatar_url: data.avatar_url ?? null };
}

async function onAvatarChange(event) {
  const file = event.target.files?.[0];
  event.target.value = ""; // 允许再次选择同一个文件
  if (!file) return;

  avatarMessage.value = "";
  try {
    const url = await uploadAvatar(file, getToken());
    await saveAvatar(url);
    avatarMessage.value = "头像已更新";
  } catch (error) {
    avatarMessage.value = error.message || "头像更新失败";
  }
}

async function clearAvatar() {
  avatarMessage.value = "";
  try {
    await saveAvatar(null);
    avatarMessage.value = "头像已移除";
  } catch (error) {
    avatarMessage.value = error.message || "操作失败";
  }
}

const registerDays = computed(() => {
  if (!userInfo.value.created_at) return null;
  const registerDate = parseUserDate(userInfo.value.created_at);
  if (!registerDate) return null;
  const now = new Date();
  const diff = now - registerDate;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
});

const totalContributions = computed(() => {
  return fanartList.value.length + shopList.value.length;
});

const statusLabel = (status) => {
  const labels = {
    published: "已发布",
    pending: "待审核",
    rejected: "已驳回",
    waiting: "等待发车",
    shipped: "已发车",
  };
  return labels[status] || status;
};

const parseUserDate = (value) => {
  if (
    typeof value === "number" ||
    (typeof value === "string" && /^\d+(\.\d+)?$/.test(value))
  ) {
    const numeric = Number(value);
    return new Date(numeric < 1e12 ? numeric * 1000 : numeric);
  }
  const parsed = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatUserDate = (value) => {
  const date = parseUserDate(value);
  if (!date) return "未知";
  return formatDate(Math.floor(date.getTime() / 1000));
};

const fetchJson = async (path, token) => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const error = new Error(
      response.status === 401
        ? "登录已失效，请重新登录"
        : "暂时无法加载用户数据",
    );
    error.status = response.status;
    throw error;
  }
  return response.json();
};

const fetchUserData = async () => {
  if (!isAuthenticated()) {
    router.replace("/login");
    return;
  }

  isLoading.value = true;
  errorMessage.value = "";
  try {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    const [profile, fanart, shop] = await Promise.all([
      fetchJson("/user/profile", token),
      fetchJson("/user/fanart", token),
      fetchJson("/user/shop", token),
    ]);
    userInfo.value = profile || {};
    fanartList.value = Array.isArray(fanart) ? fanart : [];
    shopList.value = Array.isArray(shop) ? shop : [];
  } catch (error) {
    console.error("获取用户数据失败:", error);
    if (error.status === 401) {
      router.replace("/login");
      return;
    }
    errorMessage.value = error.message || "加载失败，请稍后重试";
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchUserData();
});
</script>
