<template>
  <section class="hero-section">
    <div class="hero-content">
      <div class="hero-text">
        <div class="hero-badge">{{ copy.hero.badge }}</div>
        <h1 class="hero-title">{{ copy.hero.title }}</h1>
        <p class="hero-subtitle">{{ copy.hero.subtitle }}</p>
        <p class="hero-desc">
          <template v-for="(line, i) in copy.hero.desc" :key="i">
            {{ line }}<br v-if="i < copy.hero.desc.length - 1" />
          </template>
        </p>
        <div class="hero-info">
          <span v-for="item in copy.hero.info" :key="item.label">
            <span class="label">{{ item.label }}</span>{{ item.value }}
          </span>
        </div>
      </div>
      <div class="hero-visual">
        <svg class="constellation" viewBox="0 0 220 260" aria-hidden="true">
          <path class="link-line" d="M40 30 L90 70 L70 130 L120 150 L100 210 L160 230" />
          <path class="link-line" d="M90 70 L150 60" />
          <path class="link-line" d="M70 130 L30 160" />
          <circle class="star twinkle" cx="40" cy="30" r="2.5" />
          <circle class="star" cx="90" cy="70" r="3.5" />
          <circle class="star accent twinkle delay" cx="150" cy="60" r="2" />
          <circle class="star" cx="70" cy="130" r="2.5" />
          <circle class="star twinkle" cx="30" cy="160" r="1.8" />
          <circle class="star" cx="120" cy="150" r="3" />
          <circle class="star accent" cx="100" cy="210" r="2.2" />
          <circle class="star twinkle delay" cx="160" cy="230" r="4" />
        </svg>
      </div>
    </div>
  </section>

  <section class="section" id="songs">
    <div class="section-header">
      <span class="eyebrow">Discography</span>
      <h2 class="section-title">最新歌曲</h2>
      <p class="section-subtitle">{{ total }} 首，都在这儿了</p>
    </div>
    <template v-if="featuredSongs.length > 0">
      <div class="card-grid">
        <SongCard v-for="song in featuredSongs" :key="song.id" :song="song" />
      </div>
      <div v-if="total > 6" class="section-more">
        <RouterLink to="/videos" class="btn-hero-secondary">查看全部 {{ total }} 首 →</RouterLink>
      </div>
    </template>
    <div v-else-if="error" class="empty-state" role="alert">{{ error }} <button class="sort-btn" @click="loadFeatured">重试</button></div>
    <EmptyState v-else :message="loaded ? '还没有收录歌曲，过会儿再来' : '加载中...'" />
  </section>

  <section class="section" id="about">
    <div class="section-header">
      <span class="eyebrow">Profile</span>
      <h2 class="section-title">{{ copy.hero.aboutTitle }}</h2>
      <p class="section-subtitle">{{ copy.hero.aboutSubtitle }}</p>
    </div>
    <div class="about-grid">
      <div v-for="card in copy.hero.aboutCards" :key="card.index" class="about-card">
        <span class="index">{{ card.index }}</span>
        <h3>{{ card.title }}</h3>
        <p>
          <template v-for="(line, i) in card.lines" :key="i">
            {{ line }}<br v-if="i < card.lines.length - 1" />
          </template>
        </p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useSongs } from '../composables/useSongs.js';
import { useSite } from '../composables/useSite.js';
import SongCard from '../components/SongCard.vue';
import EmptyState from '../components/EmptyState.vue';
import { siteCopy } from '../../shared/sites.js';

const { songs, total, loaded, loadSongs } = useSongs();
const { site } = useSite();

// 站点文案（没写 copy 的站回落尘站）
const copy = computed(() => siteCopy(site.value?.key));
const error = ref('');
const featuredSongs = computed(() => songs.value.slice(0, 6));
async function loadFeatured() {
  error.value = '';
  try {
    await loadSongs();
  } catch (err) {
    error.value = err.message || '歌曲加载失败';
  }
}
onMounted(loadFeatured);
</script>
