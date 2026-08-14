<template>
  <div class="module-content">
    <div class="panel-header">
      <h2><i class="fas fa-user-gear"></i> 管理员账户</h2>
      <button class="btn btn-primary" @click="formVisible = !formVisible">
        <i class="fas fa-plus"></i> 新增账户
      </button>
    </div>

    <div v-if="formVisible" class="form-panel">
      <h3>新增管理员</h3>
      <div class="form-row">
        <label>用户名</label>
        <input type="text" v-model="newUsername" placeholder="用户名" />
        <label>密码</label>
        <input type="password" v-model="newPassword" placeholder="至少 8 位" />
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" @click="handleCreate"><i class="fas fa-check"></i> 创建</button>
        <button class="btn btn-outline" @click="formVisible = false">取消</button>
      </div>
    </div>

    <div class="table-wrapper">
      <table>
        <thead>
          <tr><th>用户名</th><th>创建时间</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="3" class="loading-state">加载中...</td></tr>
          <tr v-else-if="loadError"><td colspan="3" style="text-align:center;color:#666;">加载失败</td></tr>
          <tr v-else-if="admins.length === 0"><td colspan="3" class="empty-state">暂无账户</td></tr>
          <tr v-else v-for="admin in admins" :key="admin.id">
            <td><strong>{{ admin.username }}</strong></td>
            <td><small style="color:#888;">{{ admin.created_at }}</small></td>
            <td>
              <div class="actions">
                <button
                  class="delete-btn"
                  :disabled="admins.length <= 1"
                  :title="admins.length <= 1 ? '不能删除最后一个管理员账号' : '删除'"
                  @click="handleDelete(admin)"
                >删除</button>
              </div>
            </td>
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

const { adminFetch } = useAdminApi();
const { showToast } = useToast();

const admins = ref([]);
const loading = ref(true);
const loadError = ref(false);
const formVisible = ref(false);
const newUsername = ref('');
const newPassword = ref('');

async function loadAdmins() {
  loading.value = true;
  loadError.value = false;
  try {
    admins.value = await adminFetch('/admin/admins');
  } catch (error) {
    loadError.value = true;
    showToast('❌ ' + error.message, 'error');
  } finally {
    loading.value = false;
  }
}

async function handleCreate() {
  if (!newUsername.value.trim() || !newPassword.value) {
    showToast('请输入用户名和密码', 'error');
    return;
  }
  try {
    await adminFetch('/admin/admins', {
      method: 'POST',
      body: JSON.stringify({ username: newUsername.value.trim(), password: newPassword.value }),
    });
    showToast('账户已创建', 'success');
    newUsername.value = '';
    newPassword.value = '';
    formVisible.value = false;
    loadAdmins();
  } catch (error) {
    showToast('❌ ' + error.message, 'error');
  }
}

async function handleDelete(admin) {
  if (!confirm(`确认删除账户「${admin.username}」？此操作不可撤销。`)) return;
  try {
    await adminFetch(`/admin/admins/${admin.id}`, { method: 'DELETE' });
    showToast('已删除', 'info');
    loadAdmins();
  } catch (error) {
    showToast('❌ ' + error.message, 'error');
  }
}

onMounted(loadAdmins);
</script>
