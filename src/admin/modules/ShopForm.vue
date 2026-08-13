<template>
  <div class="form-panel">
    <h3>{{ editing ? '编辑商品' : '添加商品' }}</h3>
    <div class="form-row">
      <label>标题 *</label>
      <input type="text" v-model="title" placeholder="商品名称" />
    </div>
    <div class="form-row">
      <label>简介</label>
      <textarea rows="3" v-model="description" placeholder="商品描述"></textarea>
    </div>
    <div class="form-row">
      <label>价格</label>
      <input type="text" v-model="price" placeholder="¥45 或 待定" />
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
      <label>闲鱼链接</label>
      <input type="text" v-model="xianyuUrl" placeholder="https://m.tb.cn/..." />
    </div>
    <div class="form-row">
      <label>状态</label>
      <select v-model="status">
        <option value="waiting">⏳ 等待发车</option>
        <option value="shipped">🚀 已经发车</option>
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
const description = ref(props.editing?.description || '');
const price = ref(props.editing?.price || '');
const imageUrl = ref(props.editing?.image_url || '');
const bilibiliUrl = ref(props.editing?.bilibili_url || '');
const xianyuUrl = ref(props.editing?.xianyu_url || '');
const status = ref(props.editing?.status || 'waiting');
const saving = ref(false);

async function handleSave() {
  const t = title.value.trim();
  if (!t) {
    showToast('请输入标题', 'error');
    return;
  }
  const payload = {
    title: t,
    description: description.value.trim(),
    price: price.value.trim(),
    image_url: imageUrl.value.trim(),
    bilibili_url: bilibiliUrl.value.trim(),
    xianyu_url: xianyuUrl.value.trim(),
    status: status.value,
  };
  saving.value = true;
  try {
    const url = props.editing ? `/admin/shop/${props.editing.id}` : '/admin/shop';
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
