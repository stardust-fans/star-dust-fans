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
          <label>图片 <span class="required">*</span></label>
          <div class="file-input-wrapper">
            <input type="file" accept="image/*" @change="handleFile" />
            <img v-if="preview" class="upload-preview" :src="preview" />
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
  description: '',
  price: '',
  image_url: '',
  xianyu_url: '',
  bilibili_url: '',
  ship_time: '',
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