<template>
  <div id="module-daily" class="module-content">
    <div class="panel-header">
      <h2><i class="fas fa-newspaper"></i> 吸尘器日报</h2>
      <button class="btn btn-primary" @click="openCreate"><i class="fas fa-plus"></i> 添加日报</button>
    </div>

    <DailyForm v-if="formVisible" :editing="editingItem" @saved="handleSaved" @cancel="closeForm" />

    <div class="table-wrapper">
      <table>
        <thead><tr><th>日期</th><th>标题</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-if="loading"><td colspan="4" class="loading-state">加载中...</td></tr>
          <tr v-else-if="loadError"><td colspan="4" style="text-align:center;color:#666;">加载失败</td></tr>
          <tr v-else-if="items.length === 0"><td colspan="4" class="empty-state">暂无日报</td></tr>
          <tr v-else v-for="item in items" :key="item.id">
            <td>{{ item.publish_date || '-' }}</td>
            <td>
              <strong>{{ item.title }}</strong>
              <template v-if="item.content">
                <br />
                <small style="color:#666;">{{ excerpt(item.content, 60) }}</small>
              </template>
            </td>
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
import RowActions from '../components/RowActions.vue';
import DailyForm from './DailyForm.vue';

const { adminFetch } = useAdminApi();
const { showToast } = useToast();

const items = ref([]);
const loading = ref(true);
const loadError = ref(false);
const formVisible = ref(false);
const editingItem = ref(null);

function excerpt(text, len) {
  return text.length > len ? text.substring(0, len) + '...' : text;
}

async function loadItems() {
  loading.value = true;
  loadError.value = false;
  try {
    items.value = (await adminFetch('/admin/daily')) || [];
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
    await adminFetch(`/admin/daily/${id}`, { method: 'DELETE' });
    showToast('已删除', 'info');
    loadItems();
  } catch (error) {
    showToast('❌ ' + error.message, 'error');
  }
}

onMounted(loadItems);
</script>
