<template>
  <div ref="hostRef" class="cosmic-host" aria-hidden="true"></div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { mountCrystalBackground } from '../lib/crystalBackground.js';
import { mountParticles } from '../lib/sparkParticles.js';

const hostRef = ref(null);
let unmountCrystal = null;
let unmountParticles = null;

onMounted(() => {
  unmountCrystal = mountCrystalBackground(hostRef.value, {
    color: [1, 0.84, 0.29],
    halo: [0.11, 0.48, 1],
    opacity: [1, 1],
    motion: 'diagonal',
  });
  unmountParticles = mountParticles(hostRef.value, {
    colors: ['#ffe9a8', '#bcd0ff', '#ffffff', '#c7a2ff'],
    density: 74,
  });
});

onUnmounted(() => {
  unmountCrystal?.();
  unmountParticles?.();
});
</script>
