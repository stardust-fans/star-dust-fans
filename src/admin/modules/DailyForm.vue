<template>
  <div class="form-panel">
    <h3>{{ editing ? '编辑日报' : '添加日报' }}</h3>
    <div class="form-row">
      <label>标题 *</label>
      <input type="text" v-model="title" placeholder="日报标题" />
    </div>
    <div class="form-row">
      <label>内容</label>
      <textarea rows="4" v-model="content" placeholder="日报正文"></textarea>
    </div>
    <div class="form-row">
      <label>来源链接</label>
      <input type="text" v-model="sourceUrl" placeholder="https://..." />
    </div>
    <div class="form-row">
      <label>配图链接</label>
      <input type="text" v-model="coverUrl" placeholder="https://xxx.jpg" />
    </div>
    <div class="form-row">
      <label>发布日期</label>
      <input type="date" v-model="publishDate" />
    </div>
    <div class="form-row">
      <label>状态</label>
      <select v-model="status">
        <option value="published">已发布</option>
        <option value="hidden">隐藏</option>
      </select>
    </div>
    <div class="form-actions">
      <button class="btn btn-success" :disabled="saving" @click="handleSave">
        <i class="fas fa-save"></i> 保存
      </button>
      <button class="btn btn-outline" @click="$emit('cancel')">取消</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useAdminApi } from '../composables/useAdminApi.js';
import { useToast } from '../composables/useToast.js';
import { todayStr } from '../../shared/format.js';

const props = defineProps({
  editing: { type: Object, default: null },
});
const emit = defineEmits(['saved', 'cancel']);

const { adminFetch } = useAdminApi();
const { showToast } = useToast();

const title = ref(props.editing?.title || '');
const content = ref(props.editing?.content || '');
const sourceUrl = ref(props.editing?.source_url || '');
const coverUrl = ref(props.editing?.cover_url || '');
const publishDate = ref(props.editing?.publish_date || todayStr());
const status = ref(props.editing?.status || 'published');
const saving = ref(false);

async function handleSave() {
  const t = title.value.trim();
  if (!t) {
    showToast('请输入标题', 'error');
    return;
  }
  const payload = {
    title: t,
    content: content.value.trim(),
    source_url: sourceUrl.value.trim(),
    cover_url: coverUrl.value.trim(),
    publish_date: publishDate.value || null,
    status: status.value,
  };
  saving.value = true;
  try {
    const url = props.editing ? `/admin/daily/${props.editing.id}` : '/admin/daily';
    const method = props.editing ? 'PUT' : 'POST';
    await adminFetch(url, { method, body: JSON.stringify(payload) });
    showToast(props.editing ? '✅ 更新成功' : '✅ 添加成功', 'success');
    emit('saved');
  } catch (error) {
    showToast('❌ ' + error.message, 'error');
  } finally {
    saving.value = false;
  }
}
</script>
