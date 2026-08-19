<template>
  <div id="module-pending" class="module-content">
    <div class="panel-header">
      <h2><i class="fas fa-clock"></i> 投稿审核</h2>
      <span style="color: var(--ink-muted); font-size: 0.85rem;">
        待审核：{{ pendingCount }}
      </span>
    </div>

    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>类型</th>
            <th>标题</th>
            <th>作者</th>
            <th>图片</th>
            <th>提交时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="6" class="loading-state">加载中...</td></tr>
          <tr v-else-if="loadError"><td colspan="6" style="text-align:center;color:#666;">加载失败</td></tr>
          <tr v-else-if="items.length === 0"><td colspan="6" class="empty-state">暂无待审核投稿</td></tr>
          <tr v-else v-for="item in items" :key="`${item.type}-${item.id}`">
            <td>
              <span class="status-badge" :class="item.type === 'fanart' ? 'status-published' : 'status-shipped'">
                {{ item.type === 'fanart' ? '同人' : '量贩' }}
              </span>
            </td>
            <td>
              <strong>{{ item.title || '无题' }}</strong>
              <br />
              <small style="color:#666;">{{ item.description || '' }}</small>
            </td>
            <td>{{ item.author || '匿名' }}</td>
            <td>
              <img
                v-if="item.image_url"
                class="table-cover"
                :src="item.image_url"
                referrerpolicy="no-referrer"
                @error="$event.target.style.display = 'none'"
              />
              <span v-else>-</span>
            </td>
            <td>{{ formatDate(item.created_at) }}</td>
            <td>
              <div class="actions">
                <button class="edit-btn" @click="approve(item)">通过</button>
                <button class="delete-btn" @click="reject(item)">驳回</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useAdminApi } from '../composables/useAdminApi.js';
import { useToast } from '../composables/useToast.js';

const { adminFetch } = useAdminApi();
const { showToast } = useToast();

const items = ref([]);
const loading = ref(true);
const loadError = ref(false);

const pendingCount = computed(() => items.value.length);

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('zh-CN', { hour12: false });
}

async function loadItems() {
  loading.value = true;
  loadError.value = false;
  try {
    const data = await adminFetch('/admin/pending');
    items.value = data || [];
  } catch (error) {
    loadError.value = true;
    console.error('加载待审核列表失败:', error);
  } finally {
    loading.value = false;
  }
}

async function approve(item) {
  if (!confirm(`确认通过「${item.title || '无题'}」？`)) return;
  try {
    await adminFetch(`/admin/pending/${item.type}/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({ action: 'approve' }),
    });
    showToast('已通过', 'success');
    await loadItems();
  } catch (error) {
    showToast('❌ ' + error.message, 'error');
  }
}

async function reject(item) {
  if (!confirm(`确认驳回「${item.title || '无题'}」？`)) return;
  try {
    await adminFetch(`/admin/pending/${item.type}/${item.id}`, {
      method: 'DELETE',
    });
    showToast('已驳回', 'info');
    await loadItems();
  } catch (error) {
    showToast('❌ ' + error.message, 'error');
  }
}

onMounted(loadItems);
</script>