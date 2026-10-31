<template>
  <div class="module-content">
    <div class="panel-header">
      <h2><i class="fas fa-user-gear"></i> 管理员账户</h2>
      <button class="btn btn-primary" @click="openCreate">
        <i class="fas fa-plus"></i> 新增账户
      </button>
    </div>

    <p class="module-hint">
      <strong>超级管理员</strong>拥有全部权限，也可以管理这里的账号；
      <strong>普通管理员</strong>只能看到被勾选的模块，未勾选任何模块则登录后无可操作页面。
    </p>

    <div v-if="formVisible" class="form-panel">
      <h3>{{ editing ? `编辑「${form.username}」` : '新增管理员' }}</h3>

      <div class="form-row">
        <label>用户名</label>
        <input v-model="form.username" type="text" :disabled="Boolean(editing)" placeholder="用户名" />
      </div>

      <div class="form-row">
        <label>{{ editing ? '重置密码（留空不修改）' : '密码' }}</label>
        <input
          v-model="form.password"
          type="password"
          autocomplete="new-password"
          placeholder="至少 8 位"
        />
      </div>

      <div class="form-row">
        <label>角色</label>
        <select v-model="form.role">
          <option v-for="role in ADMIN_ROLES" :key="role.key" :value="role.key">
            {{ role.label }}
          </option>
        </select>
        <small class="form-hint">{{ roleDesc }}</small>
      </div>

      <div v-if="form.role === 'admin'" class="form-row form-row-block">
        <label>权限范围</label>
        <div class="perm-grid">
          <label
            v-for="perm in ADMIN_PERMISSIONS"
            :key="perm.key"
            class="perm-item"
            :class="{ checked: form.permissions.includes(perm.key) }"
          >
            <input
              v-model="form.permissions"
              type="checkbox"
              :value="perm.key"
            />
            <span class="perm-label">{{ perm.label }}</span>
            <small class="perm-desc">{{ perm.desc }}</small>
          </label>
        </div>
        <small class="form-hint">
          例如只勾「投稿审核」，该账号就只能审核投稿，看不到其他模块；一个都不勾则登录后没有可操作页面。
          <template v-if="isEditingSelf">这是你自己的账号，改完立即生效。</template>
        </small>
        <p v-if="isEditingSelf" class="warn-text">
          ⚠️ 把自己降成普通管理员后，你会失去「管理员账户」页面，只能靠另一个超级管理员改回来。
        </p>
      </div>

      <div class="form-actions">
        <button class="btn btn-primary" :disabled="saving" @click="handleSave">
          <i class="fas fa-check"></i> {{ editing ? '保存' : '创建' }}
        </button>
        <button class="btn btn-outline" @click="closeForm">取消</button>
      </div>
    </div>

    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>用户名</th>
            <th>角色</th>
            <th>权限范围</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="5" class="loading-state">加载中...</td></tr>
          <tr v-else-if="loadError"><td colspan="5" style="text-align:center;color:#666;">加载失败</td></tr>
          <tr v-else-if="admins.length === 0"><td colspan="5" class="empty-state">暂无账户</td></tr>
          <tr v-else v-for="row in admins" :key="row.id">
            <td>
              <strong>{{ row.username }}</strong>
              <span v-if="row.isSelf" class="badge-self">我</span>
            </td>
            <td>
              <span class="role-badge" :class="{ super: row.role === 'super' || row.allAccess }">
                {{ row.role === 'super' || row.allAccess ? '超级管理员' : '普通管理员' }}
              </span>
            </td>
            <td>
              <span v-if="row.allAccess" class="perm-tag all">全部</span>
              <template v-else-if="Array.isArray(row.permissions) && row.permissions.length">
                <span v-for="key in row.permissions" :key="key" class="perm-tag">
                  {{ permLabel(key) }}
                </span>
              </template>
              <span v-else class="perm-tag none">无</span>
            </td>
            <td><small style="color:#888;">{{ row.created_at }}</small></td>
            <td>
              <div class="actions">
                <button class="edit-btn" @click="openEdit(row)">编辑</button>
                <button
                  class="delete-btn"
                  :disabled="row.isSelf || admins.length <= 1"
                  :title="row.isSelf ? '不能删除自己' : '删除'"
                  @click="handleDelete(row)"
                >
                  删除
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAdminApi } from '../composables/useAdminApi.js';
import { useToast } from '../composables/useToast.js';
import { ADMIN_PERMISSION_KEYS, ADMIN_PERMISSIONS, ADMIN_ROLES } from '../../shared/adminPermissions.js';

const { adminFetch } = useAdminApi();
const { showToast } = useToast();

const admins = ref([]);
const loading = ref(true);
const loadError = ref(false);
const formVisible = ref(false);
const saving = ref(false);
const editing = ref(null);

const form = ref({ username: '', password: '', role: 'admin', permissions: [] });

const isEditingSelf = computed(() => Boolean(editing.value?.isSelf));
const roleDesc = computed(
  () => ADMIN_ROLES.find((role) => role.key === form.value.role)?.desc || ''
);

function permLabel(key) {
  return ADMIN_PERMISSIONS.find((perm) => perm.key === key)?.label || key;
}

function openCreate() {
  editing.value = null;
  form.value = { username: '', password: '', role: 'admin', permissions: [] };
  formVisible.value = true;
}

function openEdit(row) {
  editing.value = row;
  form.value = {
    username: row.username,
    password: '',
    role: row.role,
    // 旧的全权账号（permissions = NULL）默认全选，避免一保存就把权限清空
    permissions: Array.isArray(row.permissions)
      ? [...row.permissions]
      : ADMIN_PERMISSION_KEYS.slice(),
  };
  formVisible.value = true;
}

function closeForm() {
  formVisible.value = false;
  editing.value = null;
}

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

async function handleSave() {
  const password = form.value.password;

  if (!editing.value && !form.value.username.trim()) {
    showToast('请输入用户名', 'error');
    return;
  }
  if (!editing.value && (!password || password.length < 8)) {
    showToast('密码至少 8 位', 'error');
    return;
  }
  if (editing.value && password && password.length < 8) {
    showToast('密码至少 8 位', 'error');
    return;
  }

  const payload = {
    role: form.value.role,
    permissions: form.value.role === 'super' ? null : form.value.permissions,
  };
  if (password) payload.password = password;

  if (
    editing.value?.isSelf &&
    form.value.role !== 'super' &&
    !confirm('确定降低自己的权限？降级后你将无法再打开「管理员账户」，需要另一个超级管理员帮你改回来。')
  ) {
    return;
  }

  saving.value = true;
  try {
    if (editing.value) {
      await adminFetch(`/admin/admins/${editing.value.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      showToast('已保存', 'success');
    } else {
      await adminFetch('/admin/admins', {
        method: 'POST',
        body: JSON.stringify({
          username: form.value.username.trim(),
          password,
          ...payload,
        }),
      });
      showToast('账户已创建', 'success');
    }
    closeForm();
    loadAdmins();
  } catch (error) {
    showToast('❌ ' + error.message, 'error');
  } finally {
    saving.value = false;
  }
}

async function handleDelete(row) {
  if (!confirm(`确认删除账户「${row.username}」？此操作不可撤销。`)) return;
  try {
    await adminFetch(`/admin/admins/${row.id}`, { method: 'DELETE' });
    showToast('已删除', 'info');
    loadAdmins();
  } catch (error) {
    showToast('❌ ' + error.message, 'error');
  }
}

onMounted(loadAdmins);
</script>

<style scoped>
.module-hint {
  margin: 0 0 18px;
  font-size: 0.82rem;
  line-height: 1.8;
  color: #9aa0b5;
}

.form-hint {
  display: block;
  margin-top: 6px;
  font-size: 0.76rem;
  color: #8a90a6;
}

.warn-text {
  margin-top: 8px;
  font-size: 0.76rem;
  line-height: 1.7;
  color: #e8a76f;
}

.form-row-block {
  align-items: stretch;
}

.perm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 10px;
  margin-top: 8px;
}

.perm-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid #2a2d3f;
  border-radius: 6px;
  background: #14161f;
  cursor: pointer;
  transition: border-color 0.2s;
}

.perm-item.checked {
  border-color: #9999ff;
  box-shadow: inset 0 0 0 1px rgba(153, 153, 255, 0.35);
}

.perm-item input {
  margin-bottom: 4px;
  accent-color: #9999ff;
}

.perm-label {
  font-size: 0.86rem;
  color: #e7e8f2;
}

.perm-desc {
  font-size: 0.72rem;
  line-height: 1.5;
  color: #8a90a6;
}

.role-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 100px;
  font-size: 0.74rem;
  border: 1px solid #2a2d3f;
  color: #b9bce0;
}

.role-badge.super {
  border-color: rgba(232, 199, 111, 0.6);
  color: #e8c76f;
  background: rgba(232, 199, 111, 0.08);
}

.badge-self {
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 100px;
  font-size: 0.68rem;
  color: #9999ff;
  border: 1px solid rgba(153, 153, 255, 0.45);
}

.perm-tag {
  display: inline-block;
  margin: 2px 4px 2px 0;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 0.72rem;
  color: #b9bce0;
  background: rgba(153, 153, 255, 0.1);
}

.perm-tag.all {
  color: #e8c76f;
  background: rgba(232, 199, 111, 0.1);
}

.perm-tag.none {
  color: #8a90a6;
  background: rgba(255, 255, 255, 0.05);
}

.edit-btn {
  margin-right: 8px;
  padding: 3px 10px;
  border: 1px solid #2a2d3f;
  border-radius: 4px;
  background: transparent;
  color: #b9bce0;
  font-size: 0.76rem;
  cursor: pointer;
}

.edit-btn:hover {
  border-color: #9999ff;
  color: #9999ff;
}
</style>
