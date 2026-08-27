<template>
  <div class="user-page">
    <div class="page-header">
      <span class="eyebrow page-eyebrow">✦ 个人中心</span>
      <h1 class="page-title">用户中心</h1>
      <p class="page-subtitle">管理你的投稿与信息</p>
    </div>

    <!-- 用户基本信息 -->
    <section class="user-profile-card">
      <div class="user-avatar">
        <span>{{ userInitial }}</span>
      </div>
      <div class="user-info">
        <h2>{{ userInfo.username || '用户' }}</h2>
        <p class="user-email">{{ userInfo.email || '' }}</p>
        <p class="user-register-date">
          <span class="label">注册时间</span>
          {{ formatDate(new Date(userInfo.created_at).getTime() / 1000) }}
          <span class="days-badge">已注册 {{ registerDays }} 天</span>
        </p>
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

    <!-- 投稿列表 -->
    <section class="user-contributions">
      <h2 class="section-title">我的投稿</h2>
      
      <!-- Tab 切换 -->
      <div class="contribution-tabs">
        <button 
          :class="['tab-btn', { active: activeTab === 'fanart' }]"
          @click="activeTab = 'fanart'"
        >
          同人作品 ({{ fanartList.length }})
        </button>
        <button 
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
          <RouterLink to="/fanart" class="btn-hero-secondary">去投稿 →</RouterLink>
        </div>
        <div v-else class="contribution-grid">
          <div v-for="item in fanartList" :key="item.id" class="contribution-card">
            <img :src="item.image_url" :alt="item.title" class="contribution-image" />
            <div class="contribution-info">
              <h3>{{ item.title }}</h3>
              <p class="contribution-meta">
                <span class="status-badge" :class="`status-${item.status}`">
                  {{ statusLabel(item.status) }}
                </span>
                <span class="contribution-date">{{ formatDate(item.created_at) }}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- 量贩商品列表 -->
      <div v-if="activeTab === 'shop'" class="contribution-list">
        <div v-if="shopList.length === 0" class="empty-state">
          <p>还没有投稿量贩商品</p>
          <RouterLink to="/shop" class="btn-hero-secondary">去投稿 →</RouterLink>
        </div>
        <div v-else class="contribution-grid">
          <div v-for="item in shopList" :key="item.id" class="contribution-card">
            <img :src="item.image_url" :alt="item.title" class="contribution-image" />
            <div class="contribution-info">
              <h3>{{ item.title }}</h3>
              <p class="contribution-meta">
                <span class="status-badge" :class="`status-${item.status}`">
                  {{ statusLabel(item.status) }}
                </span>
                <span class="contribution-date">{{ formatDate(item.created_at) }}</span>
                <span class="contribution-price">{{ item.price }}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLogin } from '../composables/useLogin.js';
import { formatDate } from '../../shared/format.js';
import { API_BASE } from '../../shared/api.js';

const router = useRouter();
const { getUser, getToken, isAuthenticated } = useLogin();

const userInfo = ref({});
const fanartList = ref([]);
const shopList = ref([]);
const activeTab = ref('fanart');
const isLoading = ref(false);
const errorMessage = ref('');

const userInitial = computed(() => {
  return (userInfo.value.username || '?')[0].toUpperCase();
});

const registerDays = computed(() => {
  if (!userInfo.value.created_at) return 0;
  const registerDate = new Date(userInfo.value.created_at);
  const now = new Date();
  const diff = now - registerDate;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
});

const totalContributions = computed(() => {
  return fanartList.value.length + shopList.value.length;
});

const statusLabel = (status) => {
  const labels = {
    published: '已发布',
    pending: '待审核',
    rejected: '已驳回',
    waiting: '等待中',
    shipped: '已发货'
  };
  return labels[status] || status;
};

const fetchUserData = async () => {
  if (!isAuthenticated()) {
    router.push('/login');
    return;
  }

  isLoading.value = true;
  try {
    const token = getToken();
    
    // 获取用户信息
    const userResponse = await fetch(`${API_BASE}/user/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (userResponse.ok) {
      userInfo.value = await userResponse.json();
    }

    // 获取同人投稿
    const fanartResponse = await fetch(`${API_BASE}/user/fanart`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (fanartResponse.ok) {
      fanartList.value = await fanartResponse.json();
    }

    // 获取量贩投稿
    const shopResponse = await fetch(`${API_BASE}/user/shop`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (shopResponse.ok) {
      shopList.value = await shopResponse.json();
    }
  } catch (error) {
    console.error('获取用户数据失败:', error);
    errorMessage.value = '加载失败，请稍后重试';
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchUserData();
});
</script>