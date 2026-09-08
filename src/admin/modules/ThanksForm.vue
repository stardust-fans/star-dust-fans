<template>
  <div class="form-panel">
    <h3>{{ editing ? '编辑致谢' : '添加致谢' }}</h3>
    <div class="form-row">
      <label>署名 *</label>
      <input type="text" v-model="name" placeholder="如：小土在哪" />
    </div>
    <div class="form-row">
      <label>致谢理由</label>
      <input type="text" v-model="reason" placeholder="如：项目启发与参考" />
    </div>
    <div class="form-row">
      <label>链接</label>
      <input type="url" v-model="url" placeholder="https://github.com/..." />
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
import { useToast } from '../composables/useToast.js';

const props = defineProps({
  editing: { type: Object, default: null },
});
const emit = defineEmits(['saved', 'cancel']);

const { showToast } = useToast();

const name = ref(props.editing?.name || '');
const reason = ref(props.editing?.reason || '');
const url = ref(props.editing?.url || '');
const saving = ref(false);

function handleSave() {
  const trimmedName = name.value.trim();
  if (!trimmedName) {
    showToast('请输入署名', 'error');
    return;
  }
  saving.value = true;
  try {
    emit('saved', {
      name: trimmedName,
      reason: reason.value.trim() || undefined,
      url: url.value.trim() || undefined,
    });
  } finally {
    saving.value = false;
  }
}
</script>