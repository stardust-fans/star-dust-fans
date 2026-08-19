<template>
  <div class="fanart-card" @click="goDetail">
    <img
      v-if="coverSrc && !imageError"
      class="fanart-image"
      :src="coverSrc"
      :alt="item.title"
      referrerpolicy="no-referrer"
      @error="imageError = true"
    />
    <div class="fanart-info">
      <div class="fanart-type">{{ typeLabel }}</div>
      <h3>{{ item.title }}</h3>
      <p class="fanart-author">作者：{{ item.author || '匿名' }}</p>
      <p v-if="item.description" class="fanart-desc">{{ item.description }}</p>
      <div class="fanart-links">
        <a v-if="item.bilibili_url" :href="item.bilibili_url" target="_blank" rel="noopener" class="link" @click.stop>B站观看</a>
        <a v-if="item.source_url" :href="item.source_url" target="_blank" rel="noopener" class="link" @click.stop>查看原帖</a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { FANART_TYPE_LABELS } from '../../shared/constants.js';

const props = defineProps({
  item: { type: Object, required: true },
});

const router = useRouter();
const imageError = ref(false);

const typeLabel = computed(() => FANART_TYPE_LABELS[props.item.type] || props.item.type || '插画');

const coverSrc = computed(() => {
  if (props.item.images) {
    try {
      const arr = JSON.parse(props.item.images);
      if (arr.length > 0) return arr[0];
    } catch {}
  }
  return props.item.image_url || '';
});

function goDetail() {
  router.push(`/fanart/${props.item.id}`);
}
</script>