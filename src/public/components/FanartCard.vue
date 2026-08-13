<template>
  <div class="fanart-card">
    <img
      v-if="item.image_url && !imageError"
      class="fanart-image"
      :src="item.image_url"
      :alt="item.title"
      referrerpolicy="no-referrer"
      @error="imageError = true"
    />
    <div class="fanart-info">
      <div class="fanart-type">{{ typeLabel }}</div>
      <h3>{{ item.title }}</h3>
      <p class="fanart-author">✎ {{ item.author || '匿名' }}</p>
      <p v-if="item.description" class="fanart-desc">{{ item.description }}</p>
      <div class="fanart-links">
        <a v-if="item.bilibili_url" :href="item.bilibili_url" target="_blank" rel="noopener" class="link">B站观看</a>
        <a v-if="item.source_url" :href="item.source_url" target="_blank" rel="noopener" class="link">查看原帖</a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { FANART_TYPE_LABELS } from '../../shared/constants.js';

const props = defineProps({
  item: { type: Object, required: true },
});

const imageError = ref(false);
const typeLabel = computed(() => FANART_TYPE_LABELS[props.item.type] || props.item.type || '插画');
</script>
