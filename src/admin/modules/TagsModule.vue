<template>
  <div class="module-container">
    <div class="module-header">
      <h2>标签管理</h2>
      <div class="module-actions">
        <input
          v-model="newTagName"
          type="text"
          placeholder="新标签名"
          maxlength="32"
          @keydown.enter="addTag"
        />
        <button class="btn btn-primary" @click="addTag">添加</button>
      </div>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>标签名</th>
          <th>排序</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="tag in tags" :key="tag.id">
          <td>{{ tag.id }}</td>
          <td>{{ tag.name }}</td>
          <td>{{ tag.sort_order }}</td>
          <td>
            <button class="btn btn-danger btn-sm" @click="removeTag(tag)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAdminApi } from '../composables/useAdminApi.js';
import { useToast } from '../composables/useToast.js';

const { adminFetch } = useAdminApi();
const { showToast } = useToast();

const tags = ref([]);
const newTagName = ref('');

async function load() {
  try {
    tags.value = await adminFetch('/admin/tags');
  } catch (e) {
    showToast(e.message || '加载失败', 'error');
  }
}

async function addTag() {
  const name = newTagName.value.trim();
  if (!name) return;
  try {
    await adminFetch('/admin/tags', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    newTagName.value = '';
    showToast('已添加', 'success');
    await load();
  } catch (e) {
    showToast(e.message || '添加失败', 'error');
  }
}

async function removeTag(tag) {
  if (!confirm(`删除标签「${tag.name}」？作品上的此标签不会自动移除。`)) return;
  try {
    await adminFetch(`/admin/tags/${tag.id}`, { method: 'DELETE' });
    showToast('已删除', 'success');
    await load();
  } catch (e) {
    showToast(e.message || '删除失败', 'error');
  }
}

onMounted(load);
</script>