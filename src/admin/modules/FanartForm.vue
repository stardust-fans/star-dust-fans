<template>
  <div class="form-panel">
    <h3>{{ editing ? '编辑同人作品' : '添加同人作品' }}</h3>
    <div class="form-row">
      <label>标题 *</label>
      <input type="text" v-model="title" placeholder="作品标题" />
    </div>
    <div class="form-row">
      <label>作者</label>
      <input type="text" v-model="author" placeholder="作者名称" />
    </div>
    <div class="form-row">
      <label>简介</label>
      <textarea rows="3" v-model="description" placeholder="作品简介"></textarea>
    </div>
    <div class="form-row">
      <label>图片链接</label>
      <input type="text" v-model="imageUrl" placeholder="https://xxx.jpg" />
    </div>
    <div class="form-row">
      <label>B站链接</label>
      <input type="text" v-model="bilibiliUrl" placeholder="https://www.bilibili.com/..." />
    </div>
    <div class="form-row">
      <label>来源链接</label>
      <input type="text" v-model="sourceUrl" placeholder="https://..." />
    </div>
    <div class="form-row">
      <label>类型</label>
      <select v-model="type">
        <option value="illust">插画</option>
        <option value="video">视频</option>
        <option value="fiction">小说</option>
        <option value="music">音乐</option>
      </select>
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

const props = defineProps({
  editing: { type: Object, default: null },
});
const emit = defineEmits(['saved', 'cancel']);

const { adminFetch } = useAdminApi();
const { showToast } = useToast();

const title = ref(props.editing?.title || '');
const author = ref(props.editing?.author || '');
const description = ref(props.editing?.description || '');
const imageUrl = ref(props.editing?.image_url || '');
const bilibiliUrl = ref(props.editing?.bilibili_url || '');
const sourceUrl = ref(props.editing?.source_url || '');
const type = ref(props.editing?.type || 'illust');
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
    author: author.value.trim(),
    description: description.value.trim(),
    image_url: imageUrl.value.trim(),
    bilibili_url: bilibiliUrl.value.trim(),
    source_url: sourceUrl.value.trim(),
    type: type.value,
    status: status.value,
  };
  saving.value = true;
  try {
    const url = props.editing ? `/admin/fanart/${props.editing.id}` : '/admin/fanart';
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
