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
          <label>图片（最多 100 张，每张不超过 15MB）<span class="required">*</span></label>
          <div class="file-input-wrapper">
            <input
              type="file"
              accept="image/*"
              multiple
              :disabled="uploadingImages"
              @change="handleFiles"
            />
            <span v-if="uploadedImages.length > 0" style="color: var(--cobalt);">
              已上传 {{ uploadedImages.length }} / 100 张
            </span>
          </div>
          <div v-if="uploadingImages" style="color: var(--ink-muted); font-size: 0.85rem;">
            上传中... {{ uploadProgress }}%
          </div>
          <ul v-if="uploadedImages.length > 0" class="attachment-list image-list">
            <li v-for="(url, i) in uploadedImages" :key="url + '-' + i">
              <img :src="url" class="image-thumb" :alt="`图片 ${i + 1}`" loading="lazy" />
              <span class="image-name">第 {{ i + 1 }} 张</span>
              <button type="button" @click="removeImage(i)">移除</button>
            </li>
          </ul>
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
            <optgroup v-if="officialTags.length > 0" label="官方分类">
              <option v-for="tag in officialTags" :key="tag.id" :value="tag.name">
                {{ tag.name }}
              </option>
            </optgroup>
            <optgroup label="其他格式">
              <option value="illust">插画</option>
              <option value="video">视频</option>
              <option value="fiction">小说</option>
              <option value="music">音乐</option>
            </optgroup>
          </select>
        </div>

        <!-- 标签多选 -->
        <div class="form-group">
          <label>标签（可选，可多选，最多 10 个）</label>
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
          <label>附件（最多 3 个，每个不超过 500MB）</label>
          <div class="file-input-wrapper">
            <input
              type="file"
              :accept="attachmentAccept"
              multiple
              :disabled="uploadingAttachment"
              @change="handleAttachments"
            />
            <span v-if="attachments.length > 0" style="color: var(--cobalt);">
              已上传 {{ attachments.length }}/3
            </span>
          </div>
          <div v-if="uploadingAttachment" style="color: var(--ink-muted); font-size: 0.85rem;">
            上传中... {{ attachmentProgress }}%（R2 直传，大文件自动分片）
          </div>
          <ul v-if="attachments.length > 0" class="attachment-list">
            <li v-for="(a, i) in attachments" :key="i">
              <span>{{ a.name }} ({{ formatSize(a.size) }})</span>
              <button type="button" @click="removeAttachment(i)">移除</button>
            </li>
          </ul>
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
import { ref, reactive, computed, onMounted } from 'vue';
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
const uploadingImages = ref(false);
const loading = ref(false);
const error = ref('');

// 图片限制（与服务端 /api/upload 一致：单张 15MB，最多 100 张）
const MAX_IMAGES = 100;
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;

// ===== 标签 =====
const availableTags = ref([]);
const showAddTag = ref(false);
const newTagName = ref('');

// 官方分类 = 管理员维护的标签（sort_order < 999），用户自助申请的排在后面
const officialTags = computed(() =>
  availableTags.value.filter((tag) => Number(tag.sort_order) < 999)
);

// ===== 附件 =====
const attachments = ref([]);
const MAX_ATTACHMENT_SIZE = 500 * 1024 * 1024;
// 超过阈值走 R2 分片上传（单请求体 8MB，绕开 Worker 请求体/内存上限）
const ATTACHMENT_CHUNK_SIZE = 8 * 1024 * 1024;
const ATTACHMENT_CHUNK_THRESHOLD = 20 * 1024 * 1024;
const uploadingAttachment = ref(false);
const attachmentProgress = ref(0);
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
  const input = e.target;
  const files = Array.from(input.files || []);
  // 立刻清空 input：否则再次选择同一个文件不会触发 change（点了像没反应）
  input.value = '';
  if (files.length === 0) return;

  const remain = MAX_IMAGES - uploadedImages.value.length;
  if (remain <= 0) {
    showToast(`最多只能上传 ${MAX_IMAGES} 张图片`, 'error');
    return;
  }

  const batch = files.slice(0, remain);
  if (files.length > remain) {
    showToast(`最多 ${MAX_IMAGES} 张，本次只接收前 ${remain} 张`, 'error');
  }

  const accepted = batch.filter((file) => {
    if (file.size > MAX_IMAGE_SIZE) {
      showToast(`「${file.name}」超过 15MB，已跳过`, 'error');
      return false;
    }
    return true;
  });
  if (accepted.length === 0) return;

  error.value = '';
  uploadingImages.value = true;
  uploadProgress.value = 0;

  let ok = 0;
  for (let i = 0; i < accepted.length; i++) {
    const formData = new FormData();
    formData.append('file', accepted[i]);
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');
      // 追加而不是覆盖：分多次选择图片时都保留
      uploadedImages.value.push(data.url);
      form.images = uploadedImages.value.slice();
      ok++;
    } catch (err) {
      error.value = `上传失败：${err.message}`;
      showToast(error.value, 'error');
    }
    uploadProgress.value = Math.round(((i + 1) / accepted.length) * 100);
  }

  uploadingImages.value = false;
  if (ok > 0) showToast(`成功上传 ${ok} 张图片`, 'success');
}

function removeImage(index) {
  uploadedImages.value.splice(index, 1);
  form.images = uploadedImages.value.slice();
}

// R2 直传：先向 Worker 要一个预签名地址，然后浏览器直接 PUT 到 R2
// 字节不经过 Worker，所以完全绕开 Worker 的请求体/内存上限
async function directUpload(file, onProgress) {
  const presignRes = await fetch('/api/upload-attachment/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
    }),
  });

  // 501 = 服务端没配置 R2 直传凭据，交给分片上传兜底
  if (presignRes.status === 501) return null;

  const presign = await presignRes.json();
  if (!presignRes.ok) throw new Error(presign.error || '签发直传地址失败');

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presign.uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 直传失败（HTTP ${xhr.status}）`));
    };
    xhr.onerror = () => reject(new Error('R2 直传网络错误，检查存储桶 CORS 配置'));
    xhr.send(file);
  });

  const confirmRes = await fetch('/api/upload-attachment/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ key: presign.key, name: file.name }),
  });
  const confirm = await confirmRes.json();
  if (!confirmRes.ok) throw new Error(confirm.error || '确认上传失败');
  return confirm;
}

async function uploadAttachment(file, onProgress) {
  // 1) 优先走 R2 直传
  try {
    const direct = await directUpload(file, onProgress);
    if (direct) return direct;
  } catch (err) {
    console.warn('R2 直传不可用，回退到 Worker 上传：', err.message);
    if (onProgress) onProgress(0);
  }

  // 2) 回退：小文件单请求直传
  if (file.size <= ATTACHMENT_CHUNK_THRESHOLD) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload-attachment', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '上传失败');
    return data;
  }

  // 大文件：R2 multipart 分片上传
  const initRes = await fetch('/api/upload-attachment/multipart/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
    }),
  });
  const init = await initRes.json();
  if (!initRes.ok) throw new Error(init.error || '初始化上传失败');

  const { key, uploadId } = init;
  const partSize = Math.max(Number(init.partSize) || ATTACHMENT_CHUNK_SIZE, 5 * 1024 * 1024);
  const totalParts = Math.ceil(file.size / partSize);
  const parts = [];

  try {
    for (let i = 0; i < totalParts; i++) {
      const chunk = file.slice(i * partSize, Math.min(file.size, (i + 1) * partSize));
      const res = await fetch(
        `/api/upload-attachment/multipart/part?key=${encodeURIComponent(key)}` +
          `&uploadId=${encodeURIComponent(uploadId)}&partNumber=${i + 1}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: chunk,
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `第 ${i + 1} 片上传失败`);
      parts.push({ partNumber: data.partNumber, etag: data.etag });
      if (onProgress) onProgress(Math.round(((i + 1) / totalParts) * 100));
    }

    const doneRes = await fetch('/api/upload-attachment/multipart/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ key, uploadId, parts, name: file.name, size: file.size }),
    });
    const done = await doneRes.json();
    if (!doneRes.ok) throw new Error(done.error || '合并分片失败');
    return done;
  } catch (err) {
    // 失败时放弃这次分片上传，避免 R2 里留下未完成的上传
    fetch('/api/upload-attachment/multipart/abort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ key, uploadId }),
    }).catch(() => {});
    throw err;
  }
}

async function handleAttachments(e) {
  const input = e.target;
  const files = Array.from(input.files || []);
  input.value = '';
  if (files.length === 0) return;

  if (attachments.value.length + files.length > 3) {
    showToast('最多只能上传 3 个附件', 'error');
    return;
  }

  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_SIZE) {
      showToast(`「${file.name}」超过 ${Math.round(MAX_ATTACHMENT_SIZE / 1024 / 1024)}MB`, 'error');
      continue;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ATTACHMENT_ALLOWED.includes(ext)) {
      showToast(`不允许 .${ext} 类型`, 'error');
      continue;
    }

    uploadingAttachment.value = true;
    attachmentProgress.value = 0;
    try {
      const data = await uploadAttachment(file, (percent) => {
        attachmentProgress.value = percent;
      });
      attachments.value.push({
        url: data.url,
        name: data.name,
        size: data.size,
        hash: data.hash,
      });
      showToast(
        `「${file.name}」上传完成${data.mode === 'direct' ? '（R2 直传）' : ''}`,
        'success'
      );
    } catch (err) {
      showToast(`「${file.name}」上传失败：${err.message}`, 'error');
    } finally {
      uploadingAttachment.value = false;
      attachmentProgress.value = 0;
    }
  }
}

function removeAttachment(i) {
  attachments.value.splice(i, 1);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
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

.image-list li {
  gap: 10px;
}

.image-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--line);
  flex: 0 0 auto;
  background: var(--paper);
}

.image-name {
  flex: 1;
  color: var(--ink-muted);
}

.hint {
  font-size: 0.78rem;
  color: var(--ink-faint);
  margin-top: 6px;
  line-height: 1.6;
}
</style>
