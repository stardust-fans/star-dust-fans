<template>
  <div class="user-page" aria-labelledby="user-public-title">
    <div class="page-header">
      <span class="eyebrow page-eyebrow">✦ 用户主页</span>
      <h1 id="user-public-title" class="page-title">
        {{ userInfo.display_name || userInfo.username || "用户" }}
      </h1>
      <p class="page-subtitle">TA 的公开投稿</p>
    </div>

    <!-- 加载 / 错误 -->
    <div
      v-if="isLoading"
      class="user-feedback"
      role="status"
      aria-live="polite"
    >
      正在加载…
    </div>
    <div
      v-else-if="errorMessage"
      class="user-feedback user-feedback-error"
      role="alert"
    >
      <p>{{ errorMessage }}</p>
      <RouterLink to="/" class="btn-hero-secondary">返回首页</RouterLink>
    </div>

    <template v-else>
      <!-- 用户基本信息 -->
      <section class="user-profile-card" aria-labelledby="profile-title">
        <div class="user-avatar">
          <img
            v-if="userInfo.avatar_url"
            :src="userInfo.avatar_url"
            :alt="`${userInfo.display_name || userInfo.username || '用户'}的头像`"
          />
          <span v-else>{{ userInitial }}</span>
        </div>
        <div class="user-info">
          <h2 id="profile-title">{{ userInfo.display_name || userInfo.username || "用户" }}</h2>
          <p v-if="userInfo.username" class="user-email">@{{ userInfo.username }}</p>
          <p v-if="userInfo.id" class="user-email">UID: {{ userInfo.id }}</p>
          <p class="user-register-date">
            <span class="label">注册时间</span>
            {{ formatUserDate(userInfo.created_at) }}
            <span v-if="registerDays !== null" class="days-badge"
              >已注册 {{ registerDays }} 天</span
            >
          </p>
          <p v-if="userInfo.bio" class="user-bio">{{ userInfo.bio }}</p>
        </div>
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

      <!-- 同人作品 -->
      <section v-if="fanartList.length > 0" class="user-contributions">
        <h2 class="section-title">同人作品</h2>
        <div class="contribution-grid">
          <RouterLink
            v-for="item in fanartList"
            :key="item.id"
            :to="`/fanart/${item.id}`"
            class="contribution-card contribution-card-link"
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
                <span class="contribution-date">{{ formatUserDate(item.created_at) }}</span>
              </p>
            </div>
          </RouterLink>
        </div>
      </section>

      <!-- 量贩商品 -->
      <section v-if="shopList.length > 0" class="user-contributions">
        <h2 class="section-title">量贩商品</h2>
        <div class="contribution-grid">
          <RouterLink
            v-for="item in shopList"
            :key="item.id"
            :to="`/shop/${item.id}`"
            class="contribution-card contribution-card-link"
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
                <span class="contribution-price">{{ item.price }}</span>
                <span class="contribution-date">{{ formatUserDate(item.created_at) }}</span>
              </p>
            </div>
          </RouterLink>
        </div>
      </section>

      <!-- 全空 -->
      <div v-if="fanartList.length === 0 && shopList.length === 0" class="empty-state">
        <p>TA 还没有公开投稿</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { fetchAPI } from "../../shared/api.js";
import { formatDate } from "../../shared/format.js";

const route = useRoute();

const userInfo = ref({});
const fanartList = ref([]);
const shopList = ref([]);
const isLoading = ref(false);
const errorMessage = ref("");

const userInitial = computed(() => {
  return (userInfo.value.display_name || userInfo.value.username || "?")[0].toUpperCase();
});

const registerDays = computed(() => {
  if (!userInfo.value.created_at) return null;
  const registerDate = parseUserDate(userInfo.value.created_at);
  if (!registerDate) return null;
  const diff = Date.now() - registerDate;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
});

const totalContributions = computed(() => {
  return fanartList.value.length + shopList.value.length;
});

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

async function load() {
  isLoading.value = true;
  errorMessage.value = "";
  try {
    const data = await fetchAPI(`/users/${route.params.id}`);
    userInfo.value = data || {};
    fanartList.value = Array.isArray(data?.fanart) ? data.fanart : [];
    shopList.value = Array.isArray(data?.shop) ? data.shop : [];
  } catch (error) {
    errorMessage.value = error.message || "用户不存在或已注销";
  } finally {
    isLoading.value = false;
  }
}

onMounted(load);
watch(() => route.params.id, load);
</script>

<style scoped>
.contribution-card-link {
  display: block;
  text-decoration: none;
  color: inherit;
}
</style>