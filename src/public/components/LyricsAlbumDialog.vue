<template>
  <dialog ref="dialog" class="album-dialog" :aria-labelledby="titleId" @close="emit('close')" @click="closeOnBackdrop">
    <header class="album-dialog-header">
      <img v-if="album.cover" class="album-dialog-cover" :src="album.cover.url" :width="album.cover.width" :height="album.cover.height" alt="" />
      <div class="album-dialog-heading">
        <p class="album-dialog-meta">{{ releaseDate(album) || '发行日期不适用' }} · {{ album.song_count }} 首</p>
        <h2 :id="titleId">{{ album.name }}</h2>
        <div class="album-dialog-actions">
          <a class="album-dialog-download" :href="album.download_url" :download="`${album.folder}.zip`">专辑 ZIP ↓ · {{ formatBytes(album.download_bytes) }}</a>
          <a class="link" :href="album.source_url" target="_blank" rel="noopener">专辑资料 ↗</a>
        </div>
      </div>
      <button type="button" class="album-dialog-close" aria-label="关闭" @click="dialog.close()">✕</button>
    </header>

    <dl class="album-facts">
      <template v-for="[label, values] in credits" :key="label">
        <dt>{{ label }}</dt>
        <dd>{{ values.join('、') }}</dd>
      </template>
      <template v-if="album.release_links.length">
        <dt>发布</dt>
        <dd><a v-for="link in album.release_links" :key="link.url" :href="link.url" target="_blank" rel="noopener">{{ link.label }}</a></dd>
      </template>
      <template v-for="[type, offers] in offerGroups" :key="type">
        <dt>{{ OFFER_TYPES[type] }}</dt>
        <dd>
          <span v-for="(offer, index) in offers" :key="index" :class="{ unavailable: !offer.available }">
            <a v-if="offer.url" :href="offer.url" target="_blank" rel="noopener nofollow">{{ offer.label }}</a>
            <template v-else-if="offer.label">{{ offer.label }}</template>
            {{ [offer.prices.join(' / '), offer.note].filter(Boolean).join(' · ') }}
          </span>
        </dd>
      </template>
    </dl>

    <h3 class="album-tracks-title">单曲 LRC（{{ album.song_count }}）</h3>
    <ul class="album-tracks">
      <li v-for="song in album.songs" :key="song.title">
        <span>{{ song.title }}</span>
        <a :href="song.download_url" :download="`${song.title}.lrc`" :aria-label="`下载《${song.title}》LRC 歌词`">LRC ↓</a>
      </li>
    </ul>
  </dialog>
</template>

<script setup>
import { computed, onMounted, onUnmounted, useId, useTemplateRef } from 'vue';
import { OFFER_TYPES, formatBytes, names, releaseDate } from '../../shared/lrc.js';

const CREDIT_FIELDS = [
  ['produce', '出品'],
  ['vocal', '演唱'],
  ['lyricist', '作词'],
  ['composer', '作曲'],
  ['arranger', '编曲'],
  ['tuning', '调校'],
  ['mixer', '混音'],
  ['illustrator', '曲绘'],
  ['lyric_maker', '歌词制作'],
];

const props = defineProps({
  album: { type: Object, required: true },
});
const emit = defineEmits(['close']);

const dialog = useTemplateRef('dialog');
const titleId = useId();
const credits = computed(() => CREDIT_FIELDS
  .map(([field, label]) => [label, names(props.album[field])])
  .filter(([, values]) => values.length));
const offerGroups = computed(() => Object.keys(OFFER_TYPES)
  .map(type => [type, props.album.offers.filter(offer => offer.type === type)])
  .filter(([, offers]) => offers.length));

// 点击落在 dialog 自身而非内容上，说明点的是遮罩
function closeOnBackdrop(event) {
  if (event.target === dialog.value) dialog.value.close();
}

let previousOverflow = '';
onMounted(() => {
  previousOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  dialog.value.showModal();
});
onUnmounted(() => {
  document.documentElement.style.overflow = previousOverflow;
});
</script>

<style scoped>
.album-dialog {
  width: min(640px, calc(100vw - 32px));
  max-height: min(85vh, 900px);
  margin: auto;
  padding: 28px 32px;
  overflow-y: auto;
  overflow-wrap: anywhere;
  overscroll-behavior: contain;
  background: var(--paper-raised);
  color: var(--ink);
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  animation: slideUp 0.3s var(--ease);
}
.album-dialog::backdrop { background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px); }
.album-dialog-header { display: flex; align-items: flex-start; gap: 18px; padding-bottom: 20px; margin-bottom: 20px; border-bottom: 1px solid var(--line); }
.album-dialog-cover { flex-shrink: 0; width: 112px; height: auto; border-radius: var(--radius); background: #0a0a14; }
.album-dialog-heading { flex: 1; min-width: 0; }
.album-dialog-meta { color: var(--ink-muted); font-family: var(--font-mono); font-size: 0.74rem; margin-bottom: 4px; }
.album-dialog-heading h2 { font-family: var(--font-display); font-size: 1.3rem; font-weight: 600; line-height: 1.4; }
.album-dialog-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin-top: 12px; }
.album-dialog-download {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 8px 14px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  text-decoration: none;
  transition: border-color 0.2s var(--ease), background 0.2s var(--ease);
}
.album-dialog-download:hover { border-color: var(--cobalt); background: var(--cobalt-wash); }
.album-dialog-close {
  flex-shrink: 0;
  min-width: 40px;
  min-height: 40px;
  background: none;
  border: none;
  color: var(--ink-muted);
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
  transition: color 0.2s var(--ease);
}
.album-dialog-close:hover { color: var(--ink); }
.album-dialog-close:focus-visible { outline: 2px solid var(--cobalt); outline-offset: 2px; }
.album-facts { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; font-size: 0.82rem; }
.album-facts dt { color: var(--ink-muted); }
.album-facts dd { display: flex; flex-direction: column; gap: 2px; color: var(--ink-soft); }
.album-facts a { color: var(--cobalt); text-underline-offset: 3px; }
.album-facts .unavailable,
.album-facts .unavailable a { color: var(--ink-muted); }
.album-tracks-title { margin-top: 24px; color: var(--ink-muted); font-family: var(--font-mono); font-size: 0.78rem; font-weight: 400; }
.album-tracks { list-style: none; margin-top: 8px; }
.album-tracks li { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-top: 1px solid var(--line); font-size: 0.85rem; }
.album-tracks li a { flex-shrink: 0; display: inline-flex; align-items: center; min-height: 40px; color: var(--cobalt); font-family: var(--font-mono); font-size: 0.74rem; text-decoration: none; }
@media (max-width: 480px) {
  .album-dialog { padding: 20px 18px; }
  .album-dialog-header { flex-wrap: wrap; }
  .album-dialog-cover { width: 88px; }
}
</style>
