<template>
  <div class="module-content">
    <div class="panel-header">
      <h2><i class="fas fa-shield-halved"></i> 安全记录</h2>
    </div>

    <div class="form-panel">
      <div class="form-row">
        <label>事件类型</label>
        <select v-model="filters.event_type">
          <option value="">全部</option>
          <option v-for="(label, key) in AUDIT_EVENT_LABELS" :key="key" :value="key">{{ label }}</option>
        </select>
        <label>操作者</label>
        <input type="text" v-model="filters.actor" placeholder="用户名包含..." />
        <label>起</label>
        <input type="date" v-model="filters.from" />
        <label>止</label>
        <input type="date" v-model="filters.to" />
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" @click="loadLogs"><i class="fas fa-magnifying-glass"></i> 筛选</button>
        <button class="btn btn-outline" @click="resetFilters">重置</button>
      </div>
    </div>

    <p style="color:var(--ink-muted, #888); font-size:0.8rem; margin-bottom:12px;">显示最近 200 条记录</p>

    <div class="table-wrapper">
      <table>
        <thead>
          <tr><th>事件</th><th>操作者</th><th>对象</th><th>详情</th><th>IP</th><th>时间</th></tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="6" class="loading-state">加载中...</td></tr>
          <tr v-else-if="loadError"><td colspan="6" style="text-align:center;color:#666;">加载失败</td></tr>
          <tr v-else-if="logs.length === 0"><td colspan="6" class="empty-state">暂无记录</td></tr>
          <tr v-else v-for="log in logs" :key="log.id">
            <td><StatusBadge :status="log.event_type" :label-map="AUDIT_EVENT_LABELS" /></td>
            <td>{{ log.actor_username || '—' }}</td>
            <td>
              <span v-if="log.target_table">
                {{ AUDIT_TARGET_TABLE_LABELS[log.target_table] || log.target_table }} #{{ log.target_id }}
              </span>
              <span v-else>—</span>
            </td>
            <td><small style="color:#888;">{{ summaryText(log.summary) }}</small></td>
            <td><small style="color:#888;">{{ log.ip_address || '—' }}</small></td>
            <td><small style="color:#888;">{{ log.created_at }}</small></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useAdminApi } from '../composables/useAdminApi.js';
import { useToast } from '../composables/useToast.js';
import { AUDIT_EVENT_LABELS, AUDIT_TARGET_TABLE_LABELS } from '../../shared/constants.js';
import StatusBadge from '../components/StatusBadge.vue';

const { adminFetch } = useAdminApi();
const { showToast } = useToast();

const logs = ref([]);
const loading = ref(true);
const loadError = ref(false);
const filters = reactive({ event_type: '', actor: '', from: '', to: '' });

function summaryText(raw) {
  if (!raw) return '—';
  try {
    const obj = JSON.parse(raw);
    return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(', ');
  } catch {
    return raw;
  }
}

async function loadLogs() {
  loading.value = true;
  loadError.value = false;
  try {
    const params = new URLSearchParams();
    if (filters.event_type) params.set('event_type', filters.event_type);
    if (filters.actor) params.set('actor', filters.actor);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    const qs = params.toString();
    logs.value = await adminFetch(`/admin/audit-logs${qs ? '?' + qs : ''}`);
  } catch (error) {
    loadError.value = true;
    showToast('❌ ' + error.message, 'error');
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  filters.event_type = '';
  filters.actor = '';
  filters.from = '';
  filters.to = '';
  loadLogs();
}

onMounted(loadLogs);
</script>
