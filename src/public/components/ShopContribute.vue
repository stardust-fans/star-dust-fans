<template>
  <div class="contribute-modal-overlay" @click.self="close">
    <div class="contribute-modal">
      <div class="contribute-modal-header">
        <h2>发布量贩</h2>
        <button class="contribute-modal-close" @click="close">✕</button>
      </div>

      <form class="contribute-form" @submit.prevent="submit">
        <div class="form-group">
          <label>标题 <span class="required">*</span></label>
          <input v-model="form.title" type="text" required />
        </div>

        <div class="form-group">
          <label>描述</label>
          <textarea v-model="form.description" rows="3"></textarea>
        </div>

        <div class="form-group">
          <label>价格 <span class="required">*</span></label>
          <input v-model="form.price" type="text" required />
        </div>

        <div class="form-group">
          <label>图片（最多 30 张）<span class="required">*</span></label>
          <div class="file-input-wrapper">
            <input type="file" accept="image/*" multiple @change="handleFiles" />
            <span v-if="uploadedImages.length > 0" style="color: var(--cobalt);">
              已上传 {{ uploadedImages.length }} 张
            </span>
          </div>
          <div v-if="uploadProgress > 0 && uploadProgress < 100" style="color: var(--ink-muted); font-size: 0.85rem;">
            上传中... {{ uploadProgress }}%
          </div>
        </div>

        <div class="form-group">
          <label>闲鱼链接 <span class="required">*</span></label>
          <input v-model="form.xianyu_url" type="url" required />
        </div>

        <div class="form-group">
          <label>B站链接</label>
          <input v-model="form.bilibili_url" type="url" />
        </div>

        <div class="form-group">
          <label>发车时间 <span class="required">*</span></label>
          <input v-model="form.ship_time" type="datetime-local" required />
        </div>

        <p v-if="error" class="error-message">{{ error }}</p>

        <div class="form-actions">
          <button type="submit" class="btn-submit-contribute" :disabled="loading || uploadedImages.length === 0">
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
  description: '',
  price: '',
  images: [],
  xianyu_url: '',
  bilibili_url: '',
  ship_time: '',
});

const uploadedImages = ref([]);
const uploadProgress = ref(0);
const loading = ref(false);
const error = ref('');

function close() {
  emit('close');
}

async function handleFiles(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  if (files.length > 30) {
    error.value = '量贩最多只能上传 30 张图片';
    return;
  }

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  if (totalSize > 30 * 1024 * 1024) {
    error.value = '图片总大小不能超过 30MB';
    return;
  }

  error.value = '';
  const urls = [];
  let completed = 0;

  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');
      urls.push(data.url);
    } catch (err) {
      error.value = `上传失败：${err.message}`;
      showToast(error.value, 'error');
      return;
    }
    completed++;
    uploadProgress.value = Math.round((completed / files.length) * 100);
  }

  uploadedImages.value = urls;
  form.images = urls;
  showToast(`成功上传 ${urls.length} 张图片`, 'success');
}

async function submit() {
  error.value = '';
  loading.value = true;

  try {
    const res = await fetch('/api/contributions/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '发布失败');

    showToast('量贩发布成功，等待审核', 'success');
    emit('success');
    close();
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}
</script>