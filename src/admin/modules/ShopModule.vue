<template>
  <div id="module-shop" class="module-content">
    <div class="panel-header">
      <h2><i class="fas fa-store"></i> 量贩管理</h2>
      <button class="btn btn-primary" @click="openCreate"><i class="fas fa-plus"></i> 添加商品</button>
    </div>

    <ShopForm v-if="formVisible" :editing="editingItem" @saved="handleSaved" @cancel="closeForm" />

    <div class="table-wrapper">
      <table>
        <thead><tr><th>图片</th><th>标题</th><th>价格</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-if="loading"><td colspan="5" class="loading-state">加载中...</td></tr>
          <tr v-else-if="loadError"><td colspan="5" style="text-align:center;color:#666;">加载失败</td></tr>
          <tr v-else-if="items.length === 0"><td colspan="5" class="empty-state">暂无商品</td></tr>
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
              <strong>{{ item.title }}</strong>
              <template v-if="item.description">
                <br />
                <small style="color:#666;">{{ excerpt(item.description, 40) }}</small>
              </template>
            </td>
            <td>{{ item.price || '-' }}</td>
            <td>
              <span class="status-badge" :class="item.status === 'shipped' ? 'status-shipped' : 'status-waiting'">
                {{ item.status === 'shipped' ? '🚀 已发车' : '⏳ 等待发车' }}
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
import ShopForm from './ShopForm.vue';

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
    items.value = (await adminFetch('/admin/shop')) || [];
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
    await adminFetch(`/admin/shop/${id}`, { method: 'DELETE' });
    showToast('已删除', 'info');
    loadItems();
  } catch (error) {
    showToast('❌ ' + error.message, 'error');
  }
}

onMounted(loadItems);
</script>
