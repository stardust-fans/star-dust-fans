<template>
  <div class="module-content">
    <div class="panel-header">
      <h2>管理员账户</h2>
      <button v-if="canWrite" class="btn btn-primary" @click="editAccount()">新增账户</button>
    </div>
    <div v-if="canWrite && accountForm" class="form-panel">
      <h3>{{ accountId ? '编辑账户' : '新增账户' }}</h3>
      <div class="form-row">
        <label>用户名</label><input v-model="accountForm.username" :disabled="!!accountId" />
      </div>
      <div class="form-row">
        <label>{{ accountId ? '重置密码（留空不修改）' : '密码' }}</label
        ><input
          v-model="accountForm.password"
          type="password"
          autocomplete="new-password"
          placeholder="至少 8 位"
        />
      </div>
      <div class="form-row">
        <label>权限组</label>
        <div class="choices">
          <label v-for="group in groups" :key="group.id"
            ><input v-model="accountForm.groupIds" type="checkbox" :value="group.id" />
            {{ group.name }}</label
          >
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" :disabled="saving" @click="saveAccount">保存</button
        ><button class="btn btn-outline" @click="accountForm = null">取消</button>
      </div>
    </div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>用户名</th>
            <th>权限组</th>
            <th>有效权限</th>
            <th>创建时间</th>
            <th v-if="canWrite">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="5">加载中…</td>
          </tr>
          <tr v-else-if="loadError">
            <td colspan="5">加载失败</td>
          </tr>
          <tr v-else-if="!admins.length">
            <td colspan="5">暂无账户</td>
          </tr>
          <tr v-for="row in admins" :key="row.id">
            <td>{{ row.username }} <small v-if="row.isSelf">（我）</small></td>
            <td>{{ row.groups.map((g) => g.name).join('、') || '无' }}</td>
            <td>{{ row.permissions.map(permLabel).join('、') || '无' }}</td>
            <td>{{ row.created_at }}</td>
            <td v-if="canWrite">
              <button class="btn btn-outline btn-sm" @click="editAccount(row)">编辑</button>
              <button
                class="btn btn-danger btn-sm"
                :disabled="row.isSelf"
                @click="deleteAccount(row)"
              >
                删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="panel-header group-header">
      <h2>权限组</h2>
      <button v-if="canWrite" class="btn btn-primary" @click="editGroup()">新增权限组</button>
    </div>
    <div v-if="canWrite && groupForm" class="form-panel">
      <h3>{{ groupId ? '编辑权限组' : '新增权限组' }}</h3>
      <div v-if="!groupId" class="form-row">
        <label for="group-preset">从预设创建</label>
        <select id="group-preset" :value="selectedPresetId" @change="selectPreset($event.target.value)">
          <option value="">不使用预设</option>
          <option v-for="preset in ADMIN_GROUP_PRESETS" :key="preset.id" :value="preset.id">
            {{ preset.name }}{{ groups.some((group) => group.id === preset.id) ? '（标识已存在，需填写新标识）' : '' }}
          </option>
        </select>
      </div>
      <template v-if="!groupId && selectedPreset">
        <p class="hint">{{ selectedPreset.description }}</p>
        <p class="hint">预设权限：{{ presetSummary(selectedPreset) }}</p>
        <p v-if="groups.some((group) => group.id === selectedPreset.id)" class="hint">该预设标识已存在，请填写新标识后保存为新权限组。</p>
      </template>
      <div v-if="!groupId" class="form-row">
        <label>标识</label><input v-model="groupForm.id" placeholder="权限组标识" />
      </div>
      <div class="form-row"><label>名称</label><input v-model="groupForm.name" /></div>
      <div class="form-row">
        <label>权限</label>
        <div class="choices">
          <label v-for="permission in ADMIN_PERMISSIONS" :key="permission.key"
            ><input v-model="groupForm.permissions" type="checkbox" :value="permission.key" />
            {{ permission.label }}</label
          >
        </div>
      </div>
      <p class="hint">修改权限包含该资源的读取权限。</p>
      <div class="form-actions">
        <button class="btn btn-primary" :disabled="saving" @click="saveGroup">保存</button
        ><button class="btn btn-outline" @click="groupForm = null">取消</button>
      </div>
    </div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>名称</th>
            <th>标识</th>
            <th>权限</th>
            <th v-if="canWrite">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!loading && !groups.length">
            <td colspan="4">暂无权限组</td>
          </tr>
          <tr v-for="group in groups" :key="group.id">
            <td>{{ group.name }}</td>
            <td>{{ group.id }}</td>
            <td>{{ group.permissions.map(permLabel).join('、') || '无' }}</td>
            <td v-if="canWrite">
              <button class="btn btn-outline btn-sm" @click="editGroup(group)">编辑</button>
              <button class="btn btn-danger btn-sm" @click="deleteGroup(group)">删除</button>
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
import { useAdminAuth } from '../composables/useAdminAuth.js';
import { useToast } from '../composables/useToast.js';
import { ADMIN_PERMISSIONS, adminHasPermission } from '../../shared/adminPermissions.js';
import { ADMIN_GROUP_PRESETS } from '../../shared/adminGroupPresets.js';
const { adminFetch } = useAdminApi();
const { can, fetchMe } = useAdminAuth();
const { showToast } = useToast();
const canWrite = computed(() => can('manage:write'));
const admins = ref([]),
  groups = ref([]),
  loading = ref(true),
  loadError = ref(false),
  saving = ref(false);
const accountForm = ref(null),
  accountId = ref(null),
  groupForm = ref(null),
  groupId = ref(null);
const selectedPresetId = ref('');
const selectedPreset = computed(() => ADMIN_GROUP_PRESETS.find((preset) => preset.id === selectedPresetId.value));
const permLabel = (key) => ADMIN_PERMISSIONS.find((p) => p.key === key)?.label || key;
const presetSummary = (preset) => ADMIN_PERMISSIONS.filter((permission) =>
  adminHasPermission({ permissions: preset.permissions }, permission.key)
).map((permission) => permission.label).join('、') || '无后台权限';
function selectPreset(id) {
  selectedPresetId.value = id;
  const preset = selectedPreset.value;
  if (!preset) return;
  groupForm.value = {
    id: groups.value.some((group) => group.id === preset.id) ? '' : preset.id,
    name: preset.name,
    permissions: [...preset.permissions],
  };
}
async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    [admins.value, groups.value] = await Promise.all([
      adminFetch('/admin/admins'),
      adminFetch('/admin/groups'),
    ]);
  } catch (error) {
    loadError.value = true;
    showToast(error.message, 'error');
  } finally {
    loading.value = false;
  }
}
function editAccount(row) {
  accountId.value = row?.id || null;
  accountForm.value = {
    username: row?.username || '',
    password: '',
    groupIds: [...(row?.groupIds || (groups.value.some((group) => group.id === 'ordinary') ? ['ordinary'] : []))],
  };
}
function editGroup(group) {
  groupId.value = group?.id || null;
  selectedPresetId.value = '';
  groupForm.value = {
    id: group?.id || '',
    name: group?.name || '',
    permissions: [...(group?.permissions || [])],
  };
}
async function saveAccount() {
  const f = accountForm.value;
  if (
    !f.username.trim() ||
    (!accountId.value && f.password.length < 8) ||
    (f.password && f.password.length < 8)
  ) {
    showToast('请输入用户名和至少 8 位的密码', 'error');
    return;
  }
  const payload = { groupIds: f.groupIds };
  if (f.password) payload.password = f.password;
  if (!accountId.value) payload.username = f.username.trim();
  saving.value = true;
  try {
    await adminFetch(
      accountId.value ? `/admin/admins/${encodeURIComponent(accountId.value)}` : '/admin/admins',
      { method: accountId.value ? 'PUT' : 'POST', body: JSON.stringify(payload) }
    );
    accountForm.value = null;
    await fetchMe();
    if (can('manage:read')) await load();
    showToast('已保存', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    saving.value = false;
  }
}
async function saveGroup() {
  const f = groupForm.value;
  if (!f.name.trim() || (!groupId.value && !f.id.trim())) {
    showToast('请输入权限组标识和名称', 'error');
    return;
  }
  if (!groupId.value && groups.value.some((group) => group.id === f.id.trim())) {
    showToast('权限组标识已存在，请填写新标识', 'error');
    return;
  }
  const payload = { name: f.name.trim(), permissions: f.permissions };
  if (!groupId.value) payload.id = f.id.trim();
  saving.value = true;
  try {
    await adminFetch(
      groupId.value ? `/admin/groups/${encodeURIComponent(groupId.value)}` : '/admin/groups',
      { method: groupId.value ? 'PUT' : 'POST', body: JSON.stringify(payload) }
    );
    groupForm.value = null;
    await fetchMe();
    if (can('manage:read')) await load();
    showToast('已保存', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    saving.value = false;
  }
}
async function deleteAccount(row) {
  if (!confirm(`确认删除账户「${row.username}」？`)) return;
  try {
    await adminFetch(`/admin/admins/${encodeURIComponent(row.id)}`, { method: 'DELETE' });
    await load();
    showToast('已删除', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}
async function deleteGroup(group) {
  if (!confirm(`确认删除权限组「${group.name}」？账户将移除此组。`)) return;
  try {
    await adminFetch(`/admin/groups/${encodeURIComponent(group.id)}`, { method: 'DELETE' });
    await fetchMe();
    if (can('manage:read')) await load();
    showToast('已删除', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}
onMounted(load);
</script>
<style scoped>
.group-header {
  margin-top: 32px;
}
.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
}
.choices label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.hint {
  color: var(--ink-soft);
  font-size: 0.82rem;
  margin: 12px 0;
}
</style>
