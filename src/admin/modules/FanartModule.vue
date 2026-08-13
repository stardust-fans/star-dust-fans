<template>
  <div id="module-fanart" class="module-content">
    <div class="panel-header">
      <h2><i class="fas fa-palette"></i> 同人作品</h2>
      <button class="btn btn-primary" @click="openCreate"><i class="fas fa-plus"></i> 添加作品</button>
    </div>

    <FanartForm v-if="formVisible" :editing="editingItem" @saved="handleSaved" @cancel="closeForm" />

    <div class="table-wrapper">
      <table>
        <thead><tr><th>图片</th><th>标题 / 作者</th><th>类型</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-if="loading"><td colspan="5" class="loading-state">加载中...</td></tr>
          <tr v-else-if="loadError"><td colspan="5" style="text-align:center;color:#666;">加载失败</td></tr>
          <tr v-else-if="items.length === 0"><td colspan="5" class="empty-state">暂无作品</td></tr>
          <tr v-else v-for="item in items" :key="item.id">
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
            <td>
              <strong>{{ item.title }}</strong><br />
              <small style="color:#666;">✎ {{ item.author || '匿名' }}</small>
            </td>
            <td>{{ FANART_TYPE_LABELS[item.type] || item.type || '插画' }}</td>
            <td>
              <span class="status-badge" :class="item.status === 'published' ? 'status-published' : 'status-hidden'">
                {{ item.status === 'published' ? '已发布' : '隐藏' }}
              </span>
            </td>
            <td><RowActions @edit="openEdit(item)" @delete="handleDelete(item.id)" /></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAdminApi } from '../composables/useAdminApi.js';
import { useToast } from '../composables/useToast.js';
import { FANART_TYPE_LABELS } from '../../shared/constants.js';
import RowActions from '../components/RowActions.vue';
import FanartForm from './FanartForm.vue';

const { adminFetch } = useAdminApi();
const { showToast } = useToast();

const items = ref([]);
const loading = ref(true);
const loadError = ref(false);
const formVisible = ref(false);
const editingItem = ref(null);

async function loadItems() {
  loading.value = true;
  loadError.value = false;
  try {
    items.value = (await adminFetch('/admin/fanart')) || [];
  } catch (error) {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingItem.value = null;
  formVisible.value = true;
}
function openEdit(item) {
  editingItem.value = item;
  formVisible.value = true;
}
function closeForm() {
  formVisible.value = false;
  editingItem.value = null;
}
async function handleSaved() {
  closeForm();
  await loadItems();
}
async function handleDelete(id) {
  if (!confirm('确认删除？')) return;
  try {
    await adminFetch(`/admin/fanart/${id}`, { method: 'DELETE' });
    showToast('已删除', 'info');
    loadItems();
  } catch (error) {
    showToast('❌ ' + error.message, 'error');
  }
}

onMounted(loadItems);
</script>
