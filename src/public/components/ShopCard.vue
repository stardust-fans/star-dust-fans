<template>
  <div class="shop-card" @click="goDetail">
    <img
      v-if="coverSrc && !imageError"
      class="shop-image"
      :src="coverSrc"
      :alt="item.title"
      referrerpolicy="no-referrer"
      @error="imageError = true"
    />
    <div class="shop-info">
      <h3>{{ item.title }}</h3>
      <p v-if="item.description" class="shop-desc">{{ item.description }}</p>
      <div class="shop-meta">
        <span class="shop-price">{{ item.price || '-' }}</span>
        <span class="shop-status" :class="'status-' + item.status">
          {{ item.status === 'shipped' ? '已发车' : '等待发车' }}
        </span>
      </div>
      <div class="shop-links">
        <a v-if="item.xianyu_url" :href="item.xianyu_url" target="_blank" rel="noopener" class="link" @click.stop>闲鱼链接</a>
        <a v-if="item.bilibili_url" :href="item.bilibili_url" target="_blank" rel="noopener" class="link" @click.stop>B站链接</a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

const props = defineProps({
  item: { type: Object, required: true },
});

const router = useRouter();
const imageError = ref(false);

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
  router.push(`/shop/${props.item.id}`);
}
</script>