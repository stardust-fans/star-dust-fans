<template>
  <div class="daily-card">
    <img
      v-if="item.cover_url && !coverError"
      class="daily-cover"
      :src="item.cover_url"
      :alt="item.title"
      referrerpolicy="no-referrer"
      @error="coverError = true"
    />
    <div class="daily-body">
      <div class="daily-meta">
        <span class="daily-date">{{ item.publish_date || '' }}</span>
      </div>
      <h3>{{ item.title }}</h3>
      <p>{{ item.content || '' }}</p>
      <a v-if="item.source_url" :href="item.source_url" target="_blank" rel="noopener" class="link">查看原文 →</a>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

defineProps({
  item: { type: Object, required: true },
});

const coverError = ref(false);
</script>
