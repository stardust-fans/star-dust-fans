<template>
  <div class="shop-card">
    <img
      v-if="item.image_url && !imageError"
      class="shop-image"
      :src="item.image_url"
      :alt="item.title"
      referrerpolicy="no-referrer"
      @error="imageError = true"
    />
    <div class="shop-info">
      <h3>{{ item.title }}</h3>
      <p v-if="item.description" class="shop-desc">{{ item.description }}</p>
      <div class="shop-meta">
        <span class="shop-price">{{ item.price || '价格待定' }}</span>
        <span class="shop-status" :class="item.status === 'shipped' ? 'status-shipped' : 'status-waiting'">
          {{ item.status === 'shipped' ? '已发车' : '等待发车' }}
        </span>
      </div>
      <div class="shop-links">
        <a v-if="item.bilibili_url" :href="item.bilibili_url" target="_blank" rel="noopener" class="link">B站</a>
        <a v-if="item.xianyu_url" :href="item.xianyu_url" target="_blank" rel="noopener" class="link">闲鱼</a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

defineProps({
  item: { type: Object, required: true },
});

const imageError = ref(false);
</script>
