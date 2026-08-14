<template>
  <div class="form-panel">
    <h3>{{ editing ? '编辑歌曲' : '添加歌曲' }}</h3>
    <p class="form-hint">
      B 站接口目前会拦截本站服务器出口（详见 agents/decisions.md），信息需要手动录入。
      可在自己电脑上跑 <code>python3 tool/bili_analyze.py &lt;BV号&gt;</code>，把输出的 JSON 粘贴到下面一键填充，省去逐项抄录。
    </p>
    <div class="form-row">
      <label>JSON 快速填充</label>
      <textarea v-model="quickFillJson" rows="3" placeholder="粘贴 tool/bili_analyze.py 输出的 JSON"></textarea>
      <button class="btn btn-outline" type="button" style="margin-top:6px;" @click="applyQuickFill">解析并填充</button>
    </div>

    <div class="form-row">
      <label>BV号</label>
      <input type="text" v-model="bvid" placeholder="例如 BV1K64y1z71C" />
    </div>
    <div class="form-row">
      <label>标题</label>
      <input type="text" v-model="title" placeholder="视频标题" />
    </div>
    <div class="form-row">
      <label>简介</label>
      <textarea v-model="description" rows="3" placeholder="视频简介（可选）"></textarea>
    </div>
    <div class="form-row form-row-split">
      <div>
        <label>时长</label>
        <input type="text" v-model="durationStr" placeholder="mm:ss，如 4:24" />
      </div>
      <div>
        <label>发布日期</label>
        <input type="date" v-model="pubdateStr" />
      </div>
    </div>
    <div class="form-row form-row-split">
      <div>
        <label>UP主名称</label>
        <input type="text" v-model="ownerName" placeholder="UP主昵称" />
      </div>
      <div>
        <label>UP主UID</label>
        <input type="number" v-model.number="ownerMid" placeholder="可选" />
      </div>
    </div>

    <div class="form-row">
      <label>播放数据</label>
      <div class="stats-grid">
        <label>播放 <input type="number" v-model.number="statView" min="0" /></label>
        <label>点赞 <input type="number" v-model.number="statLike" min="0" /></label>
        <label>投币 <input type="number" v-model.number="statCoin" min="0" /></label>
        <label>收藏 <input type="number" v-model.number="statFavorite" min="0" /></label>
        <label>弹幕 <input type="number" v-model.number="statDanmaku" min="0" /></label>
        <label>评论 <input type="number" v-model.number="statReply" min="0" /></label>
        <label>分享 <input type="number" v-model.number="statShare" min="0" /></label>
      </div>
    </div>

    <div class="form-row">
      <label>封面</label>
      <div v-if="previewCoverSrc" style="margin-bottom:8px;">
        <img :src="previewCoverSrc" alt="封面预览" style="width:120px;height:67px;object-fit:cover;border-radius:4px;" referrerpolicy="no-referrer" />
      </div>
      <div class="cover-input-row">
        <input type="text" v-model="coverUrl" placeholder="封面图片直链（右键复制图片地址）" />
        <button class="btn btn-outline" type="button" :disabled="isConverting || !coverUrl.trim()" @click="fetchCoverFromUrl">
          抓取并转码
        </button>
      </div>
      <div class="cover-input-row">
        <input type="file" accept="image/*" @change="handleCoverFile" />
      </div>
    </div>

    <div class="form-row">
      <label>标签</label>
      <div class="checkbox-group" style="display:flex;gap:12px;flex-wrap:wrap;">
        <label><input type="checkbox" v-model="masterpiece" @change="tierManuallySet = true" /> 🏆 殿堂曲</label>
        <label><input type="checkbox" v-model="legend" @change="tierManuallySet = true" /> 🌟 传说曲</label>
        <label><input type="checkbox" v-model="national" /> 🏛️ 国家队</label>
        <label><input type="checkbox" v-model="gods" /> ⭐ 众神下凡</label>
      </div>
      <p class="form-hint">殿堂曲/传说曲会根据播放数据自动预判（殿堂≥10万，传说≥100万），勾选后可手动覆盖。</p>
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
import { ref, computed, watch } from 'vue';
import { useAdminApi } from '../composables/useAdminApi.js';
import { useToast } from '../composables/useToast.js';
import { useImageToWebp } from '../composables/useImageToWebp.js';
import { formatDate, formatDuration, parseDuration, parseDateToPubdate } from '../../shared/format.js';
import { toImageSrc } from '../../shared/image.js';
import { MASTERPIECE_VIEW_THRESHOLD, LEGEND_VIEW_THRESHOLD } from '../../shared/constants.js';

const props = defineProps({
  editing: { type: Object, default: null },
});
const emit = defineEmits(['saved', 'cancel']);

const { adminFetch } = useAdminApi();
const { showToast } = useToast();
const { convert, isConverting } = useImageToWebp();

const e = props.editing;

const quickFillJson = ref('');

const bvid = ref(e?.bvid || '');
const title = ref(e?.title || '');
const description = ref(e?.description || '');
const durationStr = ref(e?.duration ? formatDuration(e.duration) : '');
const pubdateStr = ref(e?.pubdate ? formatDate(e.pubdate) : '');
const ownerName = ref(e?.owner?.name || '');
const ownerMid = ref(e?.owner?.mid || null);
const statView = ref(e?.stats?.view || 0);
const statLike = ref(e?.stats?.like || 0);
const statCoin = ref(e?.stats?.coin || 0);
const statFavorite = ref(e?.stats?.favorite || 0);
const statDanmaku = ref(e?.stats?.danmaku || 0);
const statReply = ref(e?.stats?.reply || 0);
const statShare = ref(e?.stats?.share || 0);

const tags = ref((e?.special_tags || []).join('、'));
const collaboration = ref(e?.collaboration_details || '');
const status = ref(e?.status || 'published');
const flagReason = ref(e?.flag_reason || '');
const masterpiece = ref(!!e?.is_masterpiece);
const legend = ref(!!e?.is_legend);
const national = ref(!!e?.is_national_team);
const gods = ref(!!e?.is_gods_descend);
const tierManuallySet = ref(false);

watch(statView, (view) => {
  if (tierManuallySet.value) return;
  masterpiece.value = view >= MASTERPIECE_VIEW_THRESHOLD;
  legend.value = view >= LEGEND_VIEW_THRESHOLD;
});

const coverUrl = ref('');
const newCoverResult = ref(null);
const saving = ref(false);

const previewCoverSrc = computed(() => {
  if (newCoverResult.value) return newCoverResult.value.dataUri;
  if (e) return toImageSrc(e.cover);
  return '';
});

function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('封面读取失败'));
    reader.readAsDataURL(blob);
  });
}

async function fetchCoverFromUrl() {
  const url = coverUrl.value.trim().replace(/^http:\/\//, 'https://');
  if (!url) return;
  try {
    const res = await fetch(url, { referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`封面拉取失败 (HTTP ${res.status})`);
    const blob = await res.blob();
    const dataUri = await blobToDataUri(blob);
    newCoverResult.value = await convert(dataUri);
    showToast('✅ 封面已转码', 'success');
  } catch (error) {
    showToast('❌ ' + error.message, 'error');
  }
}

async function applyQuickFill() {
  let data;
  try {
    data = JSON.parse(quickFillJson.value);
  } catch {
    showToast('❌ JSON 解析失败，检查粘贴内容是否完整', 'error');
    return;
  }

  if (data.bvid) bvid.value = data.bvid;
  if (data.title) title.value = data.title;
  if (data.description) description.value = data.description;
  if (data.duration) durationStr.value = formatDuration(data.duration);
  if (data.pubdate) pubdateStr.value = formatDate(data.pubdate);
  if (data.owner_name) ownerName.value = data.owner_name;
  if (data.owner_mid) ownerMid.value = data.owner_mid;
  const s = data.stats || {};
  if (s.view !== undefined) statView.value = s.view;
  if (s.like !== undefined) statLike.value = s.like;
  if (s.coin !== undefined) statCoin.value = s.coin;
  if (s.favorite !== undefined) statFavorite.value = s.favorite;
  if (s.danmaku !== undefined) statDanmaku.value = s.danmaku;
  if (s.reply !== undefined) statReply.value = s.reply;
  if (s.share !== undefined) statShare.value = s.share;

  showToast('✅ 已填充，检查无误后可保存', 'success');

  if (data.cover_url) {
    coverUrl.value = data.cover_url;
    await fetchCoverFromUrl();
  }
}

async function handleCoverFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const dataUri = await blobToDataUri(file);
    newCoverResult.value = await convert(dataUri);
    showToast('✅ 封面已转码', 'success');
  } catch (error) {
    showToast('❌ ' + error.message, 'error');
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

  if (!title.value.trim()) {
    showToast('请输入标题', 'error');
    return;
  }

  const tagList = tags.value.trim().split(/[,，、\s]+/).filter((t) => t);

  const payload = {
    bvid: clean,
    title: title.value.trim(),
    description: description.value.trim() || null,
    duration: parseDuration(durationStr.value),
    pubdate: parseDateToPubdate(pubdateStr.value),
    owner: { name: ownerName.value.trim() || null, mid: ownerMid.value || null, face: e?.owner?.face || null },
    stats: {
      view: statView.value || 0,
      like: statLike.value || 0,
      coin: statCoin.value || 0,
      favorite: statFavorite.value || 0,
      danmaku: statDanmaku.value || 0,
      reply: statReply.value || 0,
      share: statShare.value || 0,
    },
    special_tags: tagList,
    collaboration_details: collaboration.value.trim() || null,
    status: status.value,
    flag_reason: status.value === 'flagged' ? flagReason.value.trim() : null,
    is_masterpiece: masterpiece.value ? 1 : 0,
    is_legend: legend.value ? 1 : 0,
    is_national_team: national.value ? 1 : 0,
    is_gods_descend: gods.value ? 1 : 0,
  };

  if (newCoverResult.value) {
    payload.cover = newCoverResult.value.base64;
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

<style scoped>
.form-hint {
  font-size: 0.8rem;
  color: #888;
  margin: 4px 0 0;
}
.form-row-split {
  display: flex;
  gap: 16px;
}
.form-row-split > div {
  flex: 1;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}
.stats-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
}
.cover-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}
.cover-input-row input[type="text"] {
  flex: 1;
}
</style>
