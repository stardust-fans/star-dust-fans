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
          <label>图片（最多 100 张）<span class="required">*</span></label>
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
          <label>作者</label>
          <input v-model="form.author" type="text" placeholder="默认当前用户名" />
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

        <!-- 标签多选 -->
        <div class="form-group">
          <label>标签（可多选，最多 10 个）</label>
          <div class="tag-selector">
            <label
              v-for="tag in availableTags"
              :key="tag.id"
              class="tag-option"
              :class="{ active: form.tags.includes(tag.name) }"
            >
              <input
                type="checkbox"
                :value="tag.name"
                v-model="form.tags"
                style="display: none;"
              />
              {{ tag.name }}
            </label>
            <button
              type="button"
              class="tag-option tag-add"
              @click="showAddTag = !showAddTag"
            >
              + 自定义
            </button>
          </div>

          <div v-if="showAddTag" class="tag-add-row">
            <input
              v-model="newTagName"
              type="text"
              maxlength="32"
              placeholder="输入新标签名"
              @keydown.enter.prevent="addTag"
            />
            <button type="button" @click="addTag">添加</button>
            <button type="button" @click="showAddTag = false">取消</button>
          </div>
        </div>

        <!-- 附件 -->
        <div class="form-group">
          <label>附件（最多 3 个，每个不超过 150MB）</label>
          <div class="file-input-wrapper">
            <input
              type="file"
              :accept="attachmentAccept"
              multiple
              @change="handleAttachments"
            />
            <span v-if="attachments.length > 0" style="color: var(--cobalt);">
              已上传 {{ attachments.length }}/3
            </span>
          </div>
          <ul v-if="attachments.length > 0" class="attachment-list">
            <li v-for="(a, i) in attachments" :key="i">
              <span>{{ a.name }} ({{ formatSize(a.size) }})</span>
              <button type="button" @click="removeAttachment(i)">移除</button>
            </li>
          </ul>
          <p class="hint">
            允许：{{ attachmentAcceptHint }}
          </p>
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
import { ref, reactive, onMounted } from 'vue';
import { useToast } from '../composables/useToast.js';
import { fetchAPI } from '../../shared/api.js';

const emit = defineEmits(['close', 'success']);
const { showToast } = useToast();

const form = reactive({
  title: '',
  images: [],
  author: '',
  description: '',
  type: 'illust',
  bilibili_url: '',
  source_url: '',
  tags: [],
});

const uploadedImages = ref([]);
const uploadProgress = ref(0);
const loading = ref(false);
const error = ref('');

// ===== 标签 =====
const availableTags = ref([]);
const showAddTag = ref(false);
const newTagName = ref('');

// ===== 附件 =====
const attachments = ref([]);
const ATTACHMENT_ALLOWED = [
  'zip', '7z', 'rar', 'tar', 'gz', 'bz2', 'xz', 'zst',
  'pdf', 'txt', 'md', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'mp3', 'wav', 'flac', 'ogg', 'm4a',
  'mp4', 'webm', 'mov', 'mkv', 'avi',
  'psd', 'clip', 'sai2', 'kra', 'procreate', 'ai', 'sketch',
  'aseprite', 'aup3', 'flp', 'als',
];
const attachmentAccept = ATTACHMENT_ALLOWED.map((e) => `.${e}`).join(',');
const attachmentAcceptHint = ATTACHMENT_ALLOWED.map((e) => `.${e}`).join('、');

async function loadTags() {
  try {
    const data = await fetchAPI('/tags');
    availableTags.value = Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('加载标签失败', e);
  }
}

async function addTag() {
  const name = newTagName.value.trim();
  if (!name) return;
  if (form.tags.length >= 10) {
    showToast('最多只能选 10 个标签', 'error');
    return;
  }
  if (form.tags.includes(name)) {
    showAddTag.value = false;
    newTagName.value = '';
    return;
  }
  try {
    const res = await fetch('/api/tags/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (res.ok) {
      if (!availableTags.value.find((t) => t.name === data.name)) {
        availableTags.value.push({ id: data.id, name: data.name });
      }
      form.tags.push(data.name);
      showToast('标签已添加', 'success');
    } else if (res.status === 409) {
      if (!form.tags.includes(name)) form.tags.push(name);
      if (!availableTags.value.find((t) => t.name === name)) {
        availableTags.value.push({ id: 0, name });
      }
    } else {
      showToast(data.error || '添加失败', 'error');
    }
  } catch (e) {
    showToast('添加失败', 'error');
  }
  showAddTag.value = false;
  newTagName.value = '';
}

function close() {
  emit('close');
}

async function handleFiles(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  if (files.length > 100) {
    error.value = '最多只能上传 100 张图片';
    return;
  }

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  if (totalSize > 100 * 1024 * 1024) {
    error.value = '图片总大小不能超过 100MB';
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

async function handleAttachments(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  if (attachments.value.length + files.length > 3) {
    showToast('最多只能上传 3 个附件', 'error');
    e.target.value = '';
    return;
  }

  for (const file of files) {
    if (file.size > 150 * 1024 * 1024) {
      showToast(`「${file.name}」超过 150MB`, 'error');
      continue;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ATTACHMENT_ALLOWED.includes(ext)) {
      showToast(`不允许 .${ext} 类型`, 'error');
      continue;
    }

    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload-attachment', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');
      attachments.value.push({
        url: data.url,
        name: data.name,
        size: data.size,
        hash: data.hash,
      });
    } catch (err) {
      showToast(`「${file.name}」上传失败：${err.message}`, 'error');
    }
  }

  e.target.value = '';
}

function removeAttachment(i) {
  attachments.value.splice(i, 1);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

async function submit() {
  error.value = '';
  loading.value = true;

  try {
    const payload = {
      ...form,
      title: form.title.trim() || '无题',
      tags: form.tags.slice(0, 10),
      attachments: attachments.value,
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

onMounted(loadTags);
</script>

<style scoped>
.tag-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}

.tag-option {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border: 1px solid var(--line);
  border-radius: 100px;
  background: var(--paper);
  color: var(--ink-muted);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s var(--ease);
  user-select: none;
}

.tag-option:hover {
  border-color: var(--cobalt-soft);
  color: var(--ink);
}

.tag-option.active {
  border-color: var(--cobalt);
  color: var(--cobalt);
  background: var(--cobalt-wash);
}

.tag-add {
  border-style: dashed;
}

.tag-add-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.tag-add-row input {
  flex: 1;
  padding: 6px 12px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--ink);
  font-size: 0.85rem;
}

.tag-add-row button {
  padding: 6px 16px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: transparent;
  color: var(--ink);
  font-size: 0.8rem;
  cursor: pointer;
}

.attachment-list {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.attachment-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  font-size: 0.82rem;
}

.attachment-list li button {
  padding: 2px 8px;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--ink-muted);
  font-size: 0.75rem;
  cursor: pointer;
}

.attachment-list li button:hover {
  color: #ff6b6b;
  border-color: #ff6b6b;
}

.hint {
  font-size: 0.78rem;
  color: var(--ink-faint);
  margin-top: 6px;
  line-height: 1.6;
}
</style>