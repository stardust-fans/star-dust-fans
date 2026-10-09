<template>
  <section class="comment-section">
    <div class="comment-header">
      <h2>💬 评论</h2>
      <span v-if="!loading && !loadError" class="comment-count">{{ comments.length }}</span>
    </div>

    <div v-if="loading" class="loading-state">评论加载中...</div>
    <template v-else>
      <p v-if="loadError" class="error-state">{{ loadError }}</p>

      <!-- 已登录：发表框 -->
      <div v-if="isLoggedIn" class="comment-form">
        <textarea
          v-model="draft"
          rows="3"
          maxlength="2000"
          placeholder="说点什么吧…（Ctrl + Enter 发送）"
          @keydown.ctrl.enter="submit"
        ></textarea>
        <div class="comment-form-actions">
          <span class="comment-hint">{{ draft.length }}/2000</span>
          <button
            type="button"
            class="btn-hero-primary"
            :disabled="submitting || !draft.trim()"
            @click="submit"
          >
            {{ submitting ? '发送中...' : '发表评论' }}
          </button>
        </div>
        <p v-if="formError" class="error-state">{{ formError }}</p>
      </div>

      <!-- 未登录：引导登录并带回跳 -->
      <div v-else class="comment-login-hint">
        <span>登录后即可参与评论</span>
        <RouterLink class="btn-hero-secondary" :to="loginTarget">去登录</RouterLink>
      </div>

      <div v-if="comments.length === 0 && !loadError" class="empty-state comment-empty">
        <p>还没有评论，来抢第一个沙发~</p>
      </div>

      <ul v-else-if="comments.length > 0" class="comment-list">
        <li v-for="item in comments" :key="item.id" class="comment-item">
          <div class="comment-meta">
            <RouterLink :to="`/user/${item.user_id}`" class="comment-avatar-link">
              <img
                v-if="item.avatar_url"
                class="comment-avatar"
                :src="item.avatar_url"
                :alt="`${item.username || '匿名'}的头像`"
                loading="lazy"
              />
              <span v-else class="comment-avatar comment-avatar-placeholder">
                {{ (item.username || '?')[0].toUpperCase() }}
              </span>
            </RouterLink>
            <RouterLink :to="`/user/${item.user_id}`" class="comment-author">
              {{ item.username || '匿名' }}
            </RouterLink>
            <span class="comment-time">{{ relativeTime(item.created_at) }}</span>
            <button
              v-if="isMine(item)"
              type="button"
              class="comment-delete"
              :disabled="deletingId === item.id"
              @click="remove(item)"
            >
              {{ deletingId === item.id ? '删除中' : '删除' }}
            </button>
          </div>
          <p class="comment-content">{{ item.content }}</p>
        </li>
      </ul>
    </template>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { fetchAPI } from '../../shared/api.js';
import { useLogin } from '../composables/useLogin.js';

const props = defineProps({
  targetType: { type: String, required: true },
  targetId: { type: [Number, String], required: true },
});

const route = useRoute();
const { getToken, getUser } = useLogin();

const comments = ref([]);
const loading = ref(true);
const loadError = ref('');
const formError = ref('');
const draft = ref('');
const submitting = ref(false);
const deletingId = ref(null);
const isLoggedIn = ref(false);

const me = computed(() => getUser());

const loginTarget = computed(() => ({
  name: 'login',
  query: { return_to: route.fullPath },
}));

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function isMine(item) {
  const user = me.value;
  return !!user && item.user_id === user.id;
}

function parseServerTime(value) {
  if (!value) return 0;
  const text = String(value);
  const iso = text.includes('T') ? text : `${text.replace(' ', 'T')}Z`;
  const ts = new Date(iso).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function relativeTime(value) {
  const ts = parseServerTime(value);
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 0) return '刚刚';
  if (diff < 60e3) return '刚刚';
  if (diff < 3600e3) return `${Math.floor(diff / 60e3)} 分钟前`;
  if (diff < 86400e3) return `${Math.floor(diff / 3600e3)} 小时前`;
  if (diff < 7 * 86400e3) return `${Math.floor(diff / 86400e3)} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const data = await fetchAPI(
      `/comments?target_type=${encodeURIComponent(props.targetType)}&target_id=${encodeURIComponent(props.targetId)}`
    );
    comments.value = Array.isArray(data) ? data : [];
  } catch (error) {
    loadError.value = '评论加载失败';
  } finally {
    loading.value = false;
  }
}

async function submit() {
  const content = draft.value.trim();
  if (!content || submitting.value) return;

  submitting.value = true;
  formError.value = '';
  try {
    await fetchAPI('/comments', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        target_type: props.targetType,
        target_id: Number(props.targetId),
        content,
      }),
    });
    draft.value = '';
    await load();
  } catch (error) {
    formError.value = error.message || '评论发送失败';
  } finally {
    submitting.value = false;
  }
}

async function remove(item) {
  if (deletingId.value) return;
  if (!window.confirm('确认删除这条评论？')) return;

  deletingId.value = item.id;
  try {
    await fetchAPI(`/comments/${item.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    comments.value = comments.value.filter((c) => c.id !== item.id);
  } catch (error) {
    formError.value = error.message || '删除失败';
  } finally {
    deletingId.value = null;
  }
}

onMounted(() => {
  isLoggedIn.value = !!getToken();
  load();
});

watch(
  () => [props.targetType, props.targetId],
  () => {
    isLoggedIn.value = !!getToken();
    load();
  }
);
</script>