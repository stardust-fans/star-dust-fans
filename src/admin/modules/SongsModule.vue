<template>
  <div id="module-songs" class="module-content">
    <div class="panel-header">
      <h2><i class="fas fa-music"></i> 歌曲管理</h2>
      <button v-if="canWrite" class="btn btn-primary" @click="openCreate"><i class="fas fa-plus"></i> 添加歌曲</button>
    </div>

    <SongForm v-if="canWrite && formVisible" :key="editingSong?.id || 'new'" :editing="editingSong" @saved="handleSaved" @cancel="closeForm" />

    <div class="song-toolbar">
      <label class="song-search">
        搜索歌曲
        <input v-model="query" type="search" maxlength="200" placeholder="标题、BV 号或 UP 主" />
      </label>
      <label>
        排序
        <select v-model="sort">
          <option value="latest">最新</option>
          <option value="oldest">最早</option>
          <option value="view-desc">播放量 ↓</option>
          <option value="view-asc">播放量 ↑</option>
        </select>
      </label>
    </div>

    <div class="table-wrapper">
      <table>
        <thead>
          <tr><th>封面</th><th>标题 / BV号</th><th>标签</th><th>状态</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="5" class="loading-state">加载中...</td></tr>
          <tr v-else-if="error"><td colspan="5" class="empty-state">{{ error }} <button class="btn btn-outline" @click="reload">重试</button></td></tr>
          <tr v-else-if="songs.length === 0"><td colspan="5" class="empty-state">{{ query.trim() ? '没有找到匹配的歌曲' : '暂无歌曲' }}</td></tr>
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
            <td><RowActions v-if="canWrite" @edit="openEdit(song)" @delete="handleDelete(song.id)" /></td>
          </tr>
        </tbody>
      </table>
    </div>
    <SongPagination v-model:page="page" :page-count="pageCount" :total="total" :disabled="loading" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAdminAuth } from '../composables/useAdminAuth.js';
import { useAdminApi } from '../composables/useAdminApi.js';
import { useToast } from '../composables/useToast.js';
import { useSongList } from '../../shared/useSongList.js';
import SongPagination from '../../shared/SongPagination.vue';
import { toImageSrc } from '../../shared/image.js';
import { SONG_STATUS_LABELS } from '../../shared/constants.js';
import StatusBadge from '../components/StatusBadge.vue';
import RowActions from '../components/RowActions.vue';
import SongForm from './SongForm.vue';

const { adminFetch } = useAdminApi();
const { can } = useAdminAuth();
const canWrite = computed(() => can('songs:write'));
const { showToast } = useToast();

const { songs, total, page, pageCount, query, sort, loading, error, reload } = useSongList({
  pageSize: 20,
  endpoint: '/admin/songs',
  request: adminFetch,
});
const formVisible = ref(false);
const editingSong = ref(null);

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
  await reload();
}
async function handleDelete(id) {
  if (!confirm('确认删除？')) return;
  try {
    await adminFetch(`/admin/songs/${id}`, { method: 'DELETE' });
    showToast('已删除', 'info');
    await reload();
  } catch (error) {
    showToast('❌ ' + error.message, 'error');
  }
}

</script>

<style scoped>
.song-toolbar { display: flex; flex-wrap: wrap; align-items: end; gap: 16px; margin-bottom: 20px; }
.song-toolbar label { display: flex; flex-direction: column; gap: 6px; color: var(--ink-soft); }
.song-search { flex: 1; min-width: 200px; }
.song-toolbar input,
.song-toolbar select {
  min-height: 42px;
  padding: 8px 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--paper-raised);
  color: var(--ink);
  font: inherit;
}
.song-toolbar input:focus,
.song-toolbar select:focus { outline: 2px solid var(--cobalt); outline-offset: 2px; }
</style>
