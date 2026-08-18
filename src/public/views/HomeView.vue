<template>
  <section class="hero-section">
    <div class="hero-content">
      <div class="hero-text">
        <div class="hero-badge">STARDUST · 中文虚拟歌姬</div>
        <h1 class="hero-title">星尘</h1>
        <p class="hero-subtitle">众星因你，皆降为尘</p>
        <p class="hero-desc">
          诞生于宇宙高次位面「以太之海」，<br />
          发丝蓄满以太的蓝，每首歌里都带着点来处的遥远。
        </p>
        <div class="hero-info">
          <span><span class="label">生日</span>08.12 · 狮子座</span>
          <span><span class="label">体型</span>160cm · 16岁</span>
          <span><span class="label">代表色</span>钴蓝 / 金黄</span>
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
      <p class="section-subtitle">{{ songs.length }} 首，都在这儿了</p>
    </div>
    <template v-if="featuredSongs.length > 0">
      <div class="card-grid">
        <SongCard v-for="song in featuredSongs" :key="song.id" :song="song" />
      </div>
      <div v-if="total > 6" class="section-more">
        <RouterLink to="/videos" class="btn-hero-secondary">查看全部 {{ total }} 首 →</RouterLink>
      </div>
    </template>
    <EmptyState v-else message="还没有收录歌曲，过会儿再来" />
  </section>

  <section class="section" id="about">
    <div class="section-header">
      <span class="eyebrow">Profile</span>
      <h2 class="section-title">关于星尘</h2>
      <p class="section-subtitle">设定档案 · 声库资讯</p>
    </div>
    <div class="about-grid">
      <div class="about-card">
        <span class="index">01 · 声库</span>
        <h3>声源与发行</h3>
        <p>北京福托科技 · 2016.02.20 发售<br />声源：茶理理</p>
      </div>
      <div class="about-card">
        <span class="index">02 · 生日</span>
        <h3>生日与星座</h3>
        <p>8月12日 · 狮子座<br />16岁 · 身高 160cm</p>
      </div>
      <div class="about-card">
        <span class="index">03 · 色彩</span>
        <h3>代表色</h3>
        <p>钴蓝 #9999FF · 黄 #FFFF00<br />「众星因你，皆降为尘」</p>
      </div>
      <div class="about-card">
        <span class="index">04 · 设定</span>
        <h3>世界观</h3>
        <p>诞生于宇宙高次位面「以太之海」<br />头发由以太构成，能发出钴蓝色光晕</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { useSongs } from '../composables/useSongs.js';
import SongCard from '../components/SongCard.vue';
import EmptyState from '../components/EmptyState.vue';

const { songs, total } = useSongs();
const featuredSongs = computed(() => songs.value.slice(0, 6));
</script>