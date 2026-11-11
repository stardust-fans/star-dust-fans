<template>
  <div ref="hostRef" class="cosmic-host" aria-hidden="true"></div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { mountCrystalBackground } from '../lib/crystalBackground.js';
import { mountParticles } from '../lib/sparkParticles.js';
import { useSite } from '../composables/useSite.js';
import { siteBackground, hexToRgb01 } from '../../shared/sites.js';

const hostRef = ref(null);
const { site, load } = useSite();
let unmountCrystal = null;
let unmountParticles = null;

onMounted(async () => {
  // 等站点配置（拉不到也不阻塞，回落到默认背景）
  await load();
  if (!hostRef.value) return;
  const background = siteBackground(site.value?.key);

  unmountCrystal = mountCrystalBackground(hostRef.value, {
    color: hexToRgb01(background.crystal.color),
    halo: hexToRgb01(background.crystal.halo),
    opacity: background.crystal.opacity,
    motion: background.crystal.motion,
  });
  unmountParticles = mountParticles(hostRef.value, {
    colors: background.particles.colors,
    density: background.particles.density,
  });
});

onUnmounted(() => {
  unmountCrystal?.();
  unmountParticles?.();
});
</script>
