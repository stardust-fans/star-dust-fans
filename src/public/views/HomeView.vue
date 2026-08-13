<template>
  <section class="hero-section">
    <div class="hero-bg"></div>
    <div class="hero-content">
      <div class="hero-text">
        <div class="hero-badge">✦ VOCALOID 中文虚拟歌姬</div>
        <h1 class="hero-title">星尘</h1>
        <p class="hero-subtitle">众星因你，皆降为尘</p>
        <p class="hero-desc">
          诞生于宇宙高次位面"以太之海"，<br />
          用歌声连接星辰与大地。
        </p>
        <div class="hero-info">
          <span>🎂 8月12日 · 狮子座</span>
          <span>📏 160cm · 16岁</span>
          <span>🌈 #9999FF · #FFFF00</span>
        </div>
        <div class="hero-actions">
          <a href="#songs" class="btn-hero-primary">🎵 听歌</a>
          <a href="#about" class="btn-hero-secondary">了解更多</a>
        </div>
      </div>
      <div class="hero-visual">
        <div class="hero-stardust">✦</div>
      </div>
    </div>
  </section>

  <section class="section" id="songs">
    <div class="section-header">
      <h2 class="section-title">🎵 最新歌曲</h2>
      <p class="section-subtitle">收录 {{ songs.length }} 首星尘的歌声</p>
    </div>
    <template v-if="featuredSongs.length > 0">
      <div class="card-grid">
        <SongCard v-for="song in featuredSongs" :key="song.id" :song="song" />
      </div>
      <div v-if="songs.length > 6" style="text-align:center;margin-top:20px;">
        <RouterLink to="/videos" class="btn-hero-secondary" style="display:inline-block;">查看全部 {{ songs.length }} 首 →</RouterLink>
      </div>
    </template>
    <EmptyState v-else icon="fa-music" message="暂无歌曲数据，请稍后再来~" />
  </section>

  <section class="section" id="about">
    <div class="section-header">
      <h2 class="section-title">✦ 关于星尘</h2>
      <p class="section-subtitle">VOCALOID 中文虚拟歌姬 · 用爱发电</p>
    </div>
    <div class="about-grid">
      <div class="about-card">
        <h3>🎤 声库</h3>
        <p>北京福托科技开发 · VOCALOID 中文声库<br />声源：茶理理 · 2016年2月20日发售</p>
      </div>
      <div class="about-card">
        <h3>🎂 生日</h3>
        <p>8月12日 · 狮子座<br />16岁 · 身高 160cm</p>
      </div>
      <div class="about-card">
        <h3>🌈 代表色</h3>
        <p>钴蓝 #9999FF · 黄 #FFFF00<br />「众星因你，皆降为尘」</p>
      </div>
      <div class="about-card">
        <h3>🌌 世界观</h3>
        <p>诞生于宇宙高次位面"以太之海"<br />头发由以太构成，能发出钴蓝色光晕</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { useSongs } from '../composables/useSongs.js';
import SongCard from '../components/SongCard.vue';
import EmptyState from '../components/EmptyState.vue';

const { songs } = useSongs();
const featuredSongs = computed(() => songs.value.slice(0, 6));
</script>
