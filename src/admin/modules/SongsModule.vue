<template>
  <div id="module-songs" class="module-content">
    <div class="panel-header">
      <h2><i class="fas fa-music"></i> 歌曲管理</h2>
      <button class="btn btn-primary" @click="openCreate"><i class="fas fa-plus"></i> 添加歌曲</button>
    </div>

    <SongForm v-if="formVisible" :editing="editingSong" @saved="handleSaved" @cancel="closeForm" />

    <div class="table-wrapper">
      <table>
        <thead>
          <tr><th>封面</th><th>标题 / BV号</th><th>标签</th><th>状态</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="5" class="loading-state">加载中...</td></tr>
          <tr v-else-if="loadError"><td colspan="5" style="text-align:center;color:#666;">加载失败</td></tr>
          <tr v-else-if="songs.length === 0"><td colspan="5" class="empty-state">暂无歌曲</td></tr>
          <tr v-else v-for="song in songs" :key="song.id">
            <td>
              <img
                class="table-cover"
                :src="toImageSrc(song.cover)"
                referrerpolicy="no-referrer"
                @error="$event.target.style.display = 'none'"
              />
            </td>
            <td>
              <strong>{{ song.title || '未知标题' }}</strong><br />
              <small style="color:#666;">{{ song.bvid || '' }}</small>
            </td>
            <td>
              <div class="tag-list">
                <span v-for="(tag, i) in song.special_tags || []" :key="i" class="tag-item">{{ tag }}</span>
                <span
                  v-if="song.is_masterpiece"
                  class="tag-item"
                  style="background:rgba(255,215,0,0.15);color:#ffd700;"
                >🏆殿堂曲</span>
                <span
                  v-if="song.is_legend"
                  class="tag-item"
                  style="background:rgba(255,95,162,0.15);color:#ff5fa2;"
                >🌟传说曲</span>
                <span
                  v-if="song.is_national_team"
                  class="tag-item"
                  style="background:rgba(255,50,50,0.12);color:#ff6b6b;"
                >🏛️国家队</span>
                <span
                  v-if="song.is_gods_descend"
                  class="tag-item"
                  style="background:rgba(200,100,255,0.12);color:#c084fc;"
                >⭐众神下凡</span>
              </div>
            </td>
            <td><StatusBadge :status="song.status || 'published'" :label-map="SONG_STATUS_LABELS" /></td>
            <td><RowActions @edit="openEdit(song)" @delete="handleDelete(song.id)" /></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAdminApi } from '../composables/useAdminApi.js';
import { useToast } from '../composables/useToast.js';
import { API_BASE } from '../../shared/api.js';
import { toImageSrc } from '../../shared/image.js';
import { SONG_STATUS_LABELS } from '../../shared/constants.js';
import StatusBadge from '../components/StatusBadge.vue';
import RowActions from '../components/RowActions.vue';
import SongForm from './SongForm.vue';

const { adminFetch } = useAdminApi();
const { showToast } = useToast();

const songs = ref([]);
const loading = ref(true);
const loadError = ref(false);
const formVisible = ref(false);
const editingSong = ref(null);

async function loadSongs() {
  loading.value = true;
  loadError.value = false;
  try {
    const res = await fetch(`${API_BASE}/songs`);
    songs.value = (await res.json()) || [];
  } catch (error) {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingSong.value = null;
  formVisible.value = true;
}
function openEdit(song) {
  editingSong.value = song;
  formVisible.value = true;
}
function closeForm() {
  formVisible.value = false;
  editingSong.value = null;
}
async function handleSaved() {
  closeForm();
  await loadSongs();
}
async function handleDelete(id) {
  if (!confirm('确认删除？')) return;
  try {
    await adminFetch(`/admin/songs/${id}`, { method: 'DELETE' });
    showToast('已删除', 'info');
    loadSongs();
  } catch (error) {
    showToast('❌ ' + error.message, 'error');
  }
}

onMounted(loadSongs);
</script>
