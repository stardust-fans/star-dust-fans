<template>
  <div class="contribute-modal-overlay" @click.self="close">
    <div class="contribute-modal">
      <div class="contribute-modal-header">
        <h2>发布同人</h2>
        <button class="contribute-modal-close" @click="close">✕</button>
      </div>

      <form class="contribute-form" @submit.prevent="submit">
        <div class="form-group">
          <label>标题</label>
          <input v-model="form.title" type="text" placeholder="留空则为「无题」" />
        </div>

        <div class="form-group">
          <label>图片 <span class="required">*</span></label>
          <div class="file-input-wrapper">
            <input type="file" accept="image/*" @change="handleFile" />
            <img v-if="preview" class="upload-preview" :src="preview" />
          </div>
        </div>

        <div class="form-group">
          <label>作者</label>
          <input v-model="form.author" type="text" placeholder="默认当前用户名，多个作者用逗号分隔" />
        </div>

        <div class="form-group">
          <label>描述</label>
          <textarea v-model="form.description" rows="3"></textarea>
        </div>

        <div class="form-group">
          <label>类型</label>
          <select v-model="form.type">
            <option value="illust">插画</option>
            <option value="video">视频</option>
            <option value="fiction">小说</option>
            <option value="music">音乐</option>
          </select>
        </div>

        <div class="form-group">
          <label>B站链接</label>
          <input v-model="form.bilibili_url" type="url" />
        </div>

        <div class="form-group">
          <label>来源链接</label>
          <input v-model="form.source_url" type="url" />
        </div>

        <p v-if="error" class="error-message">{{ error }}</p>

        <div class="form-actions">
          <button type="submit" class="btn-submit-contribute" :disabled="loading">
            {{ loading ? '提交中...' : '发布' }}
          </button>
          <button type="button" class="btn-cancel-contribute" @click="close">取消</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useToast } from '../composables/useToast.js';

const emit = defineEmits(['close', 'success']);
const { showToast } = useToast();

const form = reactive({
  title: '',
  image_url: '',
  author: '',
  description: '',
  type: 'illust',
  bilibili_url: '',
  source_url: '',
});

const loading = ref(false);
const error = ref('');
const preview = ref('');

function close() {
  emit('close');
}

async function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 15 * 1024 * 1024) {
    error.value = '图片不能超过 15MB';
    return;
  }

  preview.value = URL.createObjectURL(file);

  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '上传失败');
    form.image_url = data.url;
    showToast('图片上传成功', 'success');
  } catch (err) {
    error.value = err.message;
  }
}

async function submit() {
  error.value = '';
  loading.value = true;

  try {
    const payload = {
      ...form,
      title: form.title.trim() || '无题',
    };

    const res = await fetch('/api/contributions/fanart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '发布失败');

    showToast('同人发布成功，等待审核', 'success');
    emit('success');
    close();
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}
</script>