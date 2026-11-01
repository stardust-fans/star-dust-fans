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
        <option v-if="extraType" :value="extraType">{{ extraType }}</option>
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
import { ref, computed, onMounted } from 'vue';
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

// ===== 类型：官方分类（tags 表，sort_order < 999）+ 内置格式 =====
const BUILTIN_TYPES = ['illust', 'video', 'fiction', 'music'];
const officialTags = ref([]);
const editingType = props.editing?.type || '';

// 编辑已有作品时，若它的 type 不在候选项里（自定义标签等），补一个选项，避免被静默改掉
const extraType = computed(() => {
  if (!editingType) return '';
  if (BUILTIN_TYPES.includes(editingType)) return '';
  if (officialTags.value.some((tag) => tag.name === editingType)) return '';
  return editingType;
});

async function loadTags() {
  try {
    const data = await adminFetch('/tags');
    const list = Array.isArray(data) ? data : [];
    officialTags.value = list.filter((tag) => Number(tag.sort_order) < 999);
  } catch (error) {
    // 拿不到标签时退回内置格式，不影响编辑
    officialTags.value = [];
  }
}

onMounted(loadTags);

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
