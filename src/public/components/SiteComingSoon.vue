<template>
  <div class="soon-page" :style="themeStyle">
    <div class="soon-card">
      <p class="soon-kicker">正在建设中</p>
      <h1 class="soon-name">{{ site?.name || '未命名站点' }}</h1>
      <p class="soon-en">{{ site?.en }}</p>

      <span class="soon-line" aria-hidden="true"></span>

      <p class="soon-desc">这颗星星还在汇聚，站点做好后会在这里开放。</p>

      <a v-if="homeUrl" class="soon-link" :href="homeUrl">先去看看{{ homeName }}</a>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { stationColors } from '../../shared/sites.js';

const props = defineProps({
  site: { type: Object, default: null },
});

const themeStyle = computed(() => {
  const [from, to] = stationColors(props.site);
  return {
    '--soon-from': from,
    '--soon-to': to,
  };
});

// 有已开放的站点就指回去（默认星尘站）
const liveOrigin = computed(() => {
  return 'stardustinfinity.top';
});

const homeUrl = computed(() => (liveOrigin.value ? `https://${liveOrigin.value}` : ''));
const homeName = computed(() => '星尘站');
</script>

<style scoped>
.soon-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background:
    radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--soon-from) 16%, transparent), transparent 58%),
    var(--paper);
}

.soon-card {
  position: relative;
  max-width: 460px;
  width: 100%;
  padding: 40px 32px 34px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: var(--paper-raised);
  text-align: center;
}

.soon-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  border-radius: 12px 12px 0 0;
  background: linear-gradient(90deg, var(--soon-from), var(--soon-to));
}

.soon-kicker {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.soon-name {
  margin-top: 12px;
  font-family: var(--font-display);
  font-size: 2.4rem;
  line-height: 1.2;
  color: var(--ink);
  letter-spacing: 0.04em;
}

.soon-en {
  margin-top: 4px;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.soon-line {
  display: block;
  width: 72px;
  height: 2px;
  margin: 22px auto;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--soon-from), var(--soon-to));
}

.soon-desc {
  font-size: 0.9rem;
  line-height: 1.9;
  color: var(--ink-soft);
}

.soon-link {
  display: inline-block;
  margin-top: 26px;
  padding: 9px 22px;
  border: 1px solid var(--line-strong);
  border-radius: 100px;
  color: var(--ink-soft);
  font-size: 0.85rem;
  text-decoration: none;
  transition: border-color 0.2s var(--ease), color 0.2s var(--ease);
}

.soon-link:hover {
  border-color: var(--soon-from);
  color: var(--soon-from);
}
</style>
