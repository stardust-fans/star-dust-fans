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
            <th>标题 / 内容</th>
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
              <strong class="clickable" @click="openPreview(item)">{{ item.title || '无题' }}</strong>
              <br />
              <small style="color:#666; cursor:pointer;" @click="openPreview(item)">
                {{ truncate(item.description || '', 60) }}
              </small>
            </td>
            <td>{{ item.author || '匿名' }}</td>
            <td>
              <img
                v-if="item.image_url"
                class="table-cover clickable"
                :src="item.image_url"
                referrerpolicy="no-referrer"
                @error="$event.target.style.display = 'none'"
                @click="openPreview(item)"
                style="cursor:pointer;"
              />
              <span v-else>-</span>
            </td>
            <td>{{ formatDate(item.created_at) }}</td>
            <td>
              <div class="actions">
                <button class="edit-btn" @click="approve(item)">通过</button>
                <button class="delete-btn" @click="openRejectModal(item)">驳回</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 驳回弹窗 -->
    <div v-if="showRejectModal" class="modal-overlay" @click.self="showRejectModal = false">
      <div class="modal-content">
        <h3>驳回投稿</h3>
        <p class="modal-hint">请输入驳回理由（将发送给投稿人）</p>
        <textarea
          v-model="rejectReason"
          class="reject-textarea"
          placeholder="请输入驳回理由..."
          rows="4"
        ></textarea>
        <div class="modal-actions">
          <button class="btn btn-danger" @click="confirmReject">确认驳回</button>
          <button class="btn btn-outline" @click="showRejectModal = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 内容预览弹窗 -->
    <div v-if="showPreview" class="preview-overlay" @click.self="showPreview = false">
      <div class="preview-content">
        <div class="preview-title">{{ previewItem.title || '无题' }}</div>
        <div class="preview-meta">
          作者：{{ previewItem.author || '匿名' }} · 类型：{{ previewItem.type === 'fanart' ? '同人' : '量贩' }}
          <span v-if="previewItem.price"> · 价格：{{ previewItem.price }}</span>
          <span v-if="previewItem.ship_time"> · 发车：{{ formatDate(previewItem.ship_time) }}</span>
        </div>
        <img
          v-if="previewItem.image_url"
          :src="previewItem.image_url"
          referrerpolicy="no-referrer"
          @error="$event.target.style.display = 'none'"
        />
        <div v-if="previewItem.description" class="preview-desc">{{ previewItem.description }}</div>
        <div class="preview-links">
          <a v-if="previewItem.bilibili_url" :href="previewItem.bilibili_url" target="_blank">▶ B站链接</a>
          <a v-if="previewItem.source_url" :href="previewItem.source_url" target="_blank">🔗 来源链接</a>
          <a v-if="previewItem.xianyu_url" :href="previewItem.xianyu_url" target="_blank">🛒 闲鱼链接</a>
        </div>
      </div>
      <div class="preview-close-hint">点击任意处关闭预览</div>
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

const showRejectModal = ref(false);
const rejectReason = ref('');
const currentRejectItem = ref(null);

const showPreview = ref(false);
const previewItem = ref({});

const pendingCount = computed(() => items.value.length);

function truncate(text, len) {
  if (!text) return '';
  return text.length > len ? text.slice(0, len) + '...' : text;
}

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

function openPreview(item) {
  previewItem.value = item;
  showPreview.value = true;
}

function openRejectModal(item) {
  currentRejectItem.value = item;
  rejectReason.value = '';
  showRejectModal.value = true;
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

async function confirmReject() {
  if (!rejectReason.value.trim()) {
    showToast('请输入驳回理由', 'error');
    return;
  }
  const item = currentRejectItem.value;
  try {
    await adminFetch(`/admin/pending/${item.type}/${item.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason: rejectReason.value.trim() }),
    });
    showToast('已驳回', 'info');
    showRejectModal.value = false;
    await loadItems();
  } catch (error) {
    showToast('❌ ' + error.message, 'error');
  }
}

onMounted(loadItems);
</script>