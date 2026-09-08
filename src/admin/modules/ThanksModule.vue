<template>
  <div id="module-thanks" class="module-content">
    <div class="panel-header">
      <h2><i class="fas fa-heart"></i> 特别感谢</h2>
      <button class="btn btn-primary" @click="openCreate"><i class="fas fa-plus"></i> 添加致谢</button>
    </div>

    <ThanksForm
      v-if="formVisible"
      :editing="editingItem"
      @saved="handleSaved"
      @cancel="closeForm"
    />

    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>署名</th>
            <th>致谢理由</th>
            <th>链接</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="4" class="loading-state">加载中...</td></tr>
          <tr v-else-if="loadError"><td colspan="4" style="text-align:center;color:#666;">加载失败</td></tr>
          <tr v-else-if="items.length === 0"><td colspan="4" class="empty-state">暂无致谢</td></tr>
          <tr v-else v-for="(item, index) in items" :key="index">
            <td><strong>{{ item.name }}</strong></td>
            <td>{{ item.reason || '—' }}</td>
            <td>
              <a
                v-if="item.url"
                :href="item.url"
                target="_blank"
                rel="noopener"
                style="color:var(--cobalt, #9999FF);text-decoration:none;"
              >
                🔗 链接
              </a>
              <span v-else>—</span>
            </td>
            <td>
              <RowActions
                @edit="openEdit(item, index)"
                @delete="handleDelete(index)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="loadError" style="text-align:center;margin-top:16px;">
      <button class="btn btn-outline" @click="loadData">重新加载</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAdminApi } from '../composables/useAdminApi.js';
import { useToast } from '../composables/useToast.js';
import RowActions from '../components/RowActions.vue';
import ThanksForm from './ThanksForm.vue';

const { adminFetch } = useAdminApi();
const { showToast } = useToast();

const items = ref([]);
const loading = ref(true);
const loadError = ref(false);
const formVisible = ref(false);
const editingItem = ref(null);
const editingIndex = ref(-1);

async function loadData() {
  loading.value = true;
  loadError.value = false;
  try {
    const res = await fetch('/special-thanks.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    items.value = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('加载特别感谢失败:', error);
    loadError.value = true;
    items.value = [];
  } finally {
    loading.value = false;
  }
}

async function saveData(data) {
  await adminFetch('/admin/thanks', {
    method: 'PUT',
    body: JSON.stringify({ data }),
  });
}

function openCreate() {
  editingItem.value = null;
  editingIndex.value = -1;
  formVisible.value = true;
}

function openEdit(item, index) {
  editingItem.value = { ...item };
  editingIndex.value = index;
  formVisible.value = true;
}

function closeForm() {
  formVisible.value = false;
  editingItem.value = null;
  editingIndex.value = -1;
}

async function handleSaved(formData) {
  try {
    const newItems = [...items.value];
    const entry = {
      name: formData.name.trim(),
      url: formData.url.trim() || undefined,
      reason: formData.reason.trim() || undefined,
    };
    if (editingIndex.value >= 0) {
      newItems[editingIndex.value] = entry;
    } else {
      newItems.push(entry);
    }
    await saveData(newItems);
    items.value = newItems;
    showToast(editingIndex.value >= 0 ? '✅ 更新成功' : '✅ 添加成功', 'success');
    closeForm();
  } catch (error) {
    showToast('❌ ' + error.message, 'error');
  }
}

async function handleDelete(index) {
  const item = items.value[index];
  if (!confirm(`确认删除「${item.name}」的致谢？`)) return;
  try {
    const newItems = items.value.filter((_, i) => i !== index);
    await saveData(newItems);
    items.value = newItems;
    showToast('已删除', 'info');
  } catch (error) {
    showToast('❌ ' + error.message, 'error');
  }
}

onMounted(loadData);
</script>