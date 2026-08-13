<template>
  <div class="form-panel">
    <h3>{{ editing ? '编辑歌曲' : '添加歌曲' }}</h3>
    <div class="form-row">
      <label>BV号</label>
      <input type="text" v-model="bvid" placeholder="例如 BV1K64y1z71C" />
      <button
        class="btn btn-primary"
        style="padding:8px 16px;min-width:auto;"
        :disabled="fetchingBili"
        @click="fetchBiliInfo"
      >
        <i class="fas fa-search"></i> 获取信息
      </button>
    </div>

    <div v-if="showPreview">
      <div class="form-row" style="background:#0a0a12;padding:12px;border-radius:6px;">
        <img
          :src="previewCoverSrc"
          alt="封面"
          style="width:80px;height:45px;object-fit:cover;border-radius:4px;"
          referrerpolicy="no-referrer"
        />
        <div>
          <div><strong>{{ previewTitle }}</strong></div>
          <div style="font-size:0.8rem;color:#666;">{{ previewMeta }}</div>
        </div>
      </div>
    </div>

    <div class="form-row">
      <label>标签</label>
      <div class="checkbox-group" style="display:flex;gap:12px;flex-wrap:wrap;">
        <label><input type="checkbox" v-model="masterpiece" /> 🏆 殿堂曲</label>
        <label><input type="checkbox" v-model="national" /> 🏛️ 国家队</label>
        <label><input type="checkbox" v-model="gods" /> ⭐ 众神下凡</label>
      </div>
    </div>
    <div class="form-row">
      <label>自定义标签</label>
      <input type="text" v-model="tags" placeholder="国风, 神调教, 出道曲" />
    </div>
    <div class="form-row">
      <label>合作详情</label>
      <input type="text" v-model="collaboration" placeholder="合作背景描述（可选）" />
    </div>
    <div class="form-row">
      <label>状态</label>
      <select v-model="status">
        <option value="published">已发布</option>
        <option value="flagged">标记</option>
        <option value="hidden">隐藏</option>
      </select>
    </div>
    <div class="form-row" v-if="status === 'flagged'">
      <label>标记原因</label>
      <input type="text" v-model="flagReason" placeholder="NSFW / 争议 / 敏感内容" />
    </div>
    <div class="form-actions">
      <button class="btn btn-success" :disabled="isConverting || saving" @click="handleSave">
        <i class="fas fa-save"></i> 保存
      </button>
      <button class="btn btn-outline" @click="$emit('cancel')">取消</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAdminApi } from '../composables/useAdminApi.js';
import { useToast } from '../composables/useToast.js';
import { useImageToWebp } from '../composables/useImageToWebp.js';
import { API_BASE } from '../../shared/api.js';
import { formatDate } from '../../shared/format.js';
import { toImageSrc } from '../../shared/image.js';

const props = defineProps({
  editing: { type: Object, default: null },
});
const emit = defineEmits(['saved', 'cancel']);

const { adminFetch } = useAdminApi();
const { showToast } = useToast();
const { convert, isConverting } = useImageToWebp();

const bvid = ref(props.editing?.bvid || '');
const tags = ref((props.editing?.special_tags || []).join('、'));
const collaboration = ref(props.editing?.collaboration_details || '');
const status = ref(props.editing?.status || 'published');
const flagReason = ref(props.editing?.flag_reason || '');
const masterpiece = ref(!!props.editing?.is_masterpiece);
const national = ref(!!props.editing?.is_national_team);
const gods = ref(!!props.editing?.is_gods_descend);

// 本次表单会话内新获取的 B 站快照数据（未重新获取时为 null，保存时不会带上快照字段，
// 交由服务端 COALESCE 保留已有存储值）
const fetchedData = ref(null);
const webpResult = ref(null);
const fetchingBili = ref(false);
const saving = ref(false);

const showPreview = computed(() => !!(fetchedData.value || (props.editing && props.editing.cover)));

const previewTitle = computed(() => {
  if (fetchedData.value) return fetchedData.value.title || '未知标题';
  if (props.editing) return props.editing.title || '未知标题';
  return '';
});

const previewMeta = computed(() => {
  if (fetchedData.value) {
    return `${fetchedData.value.owner?.name || '未知UP主'} · ${formatDate(fetchedData.value.pubdate)}`;
  }
  if (props.editing) {
    return props.editing.owner?.name || '未知UP主';
  }
  return '';
});

const previewCoverSrc = computed(() => {
  if (webpResult.value) return webpResult.value.dataUri;
  if (fetchedData.value) return fetchedData.value.pic || '';
  if (props.editing) return toImageSrc(props.editing.cover);
  return '';
});

async function fetchBiliInfo() {
  const raw = bvid.value.trim();
  if (!raw) {
    showToast('请输入 BV 号', 'error');
    return;
  }
  const match = raw.match(/BV[a-zA-Z0-9]{10}/);
  const clean = match ? match[0] : raw;

  fetchingBili.value = true;
  try {
    const res = await fetch(`${API_BASE}/songs/bili/${clean}`);
    if (!res.ok) throw new Error('获取失败');
    const data = await res.json();
    if (data.code !== undefined && data.code !== 0) throw new Error(data.message || 'B站 API 错误');

    fetchedData.value = data;
    bvid.value = clean;

    if (data.pic_base64) {
      webpResult.value = await convert(data.pic_base64);
    } else {
      webpResult.value = null;
    }

    showToast(`✅ 已获取: ${data.title}`, 'success');
  } catch (error) {
    showToast('❌ ' + error.message, 'error');
  } finally {
    fetchingBili.value = false;
  }
}

async function handleSave() {
  const raw = bvid.value.trim();
  if (!raw) {
    showToast('请输入 BV 号', 'error');
    return;
  }
  const match = raw.match(/BV[a-zA-Z0-9]{10}/);
  const clean = match ? match[0] : raw;

  if (!props.editing && !fetchedData.value) {
    showToast('请先获取B站信息', 'error');
    return;
  }

  const tagList = tags.value.trim().split(/[,，、\s]+/).filter((t) => t);

  const payload = {
    bvid: clean,
    special_tags: tagList,
    collaboration_details: collaboration.value.trim() || null,
    status: status.value,
    flag_reason: status.value === 'flagged' ? flagReason.value.trim() : null,
    is_masterpiece: masterpiece.value ? 1 : 0,
    is_national_team: national.value ? 1 : 0,
    is_gods_descend: gods.value ? 1 : 0,
  };

  // 仅当本次会话重新获取过 B 站信息时才带上快照字段；否则省略以便服务端 COALESCE 保留原值
  if (fetchedData.value) {
    payload.title = fetchedData.value.title;
    payload.description = fetchedData.value.desc;
    payload.duration = fetchedData.value.duration;
    payload.pubdate = fetchedData.value.pubdate;
    payload.owner = fetchedData.value.owner;
    payload.stats = fetchedData.value.stat;
    if (webpResult.value) {
      payload.cover = webpResult.value.base64;
    }
  }

  saving.value = true;
  try {
    const url = props.editing ? `/admin/songs/${props.editing.id}` : '/admin/songs';
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
