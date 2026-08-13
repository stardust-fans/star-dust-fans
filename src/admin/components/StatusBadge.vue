<template>
  <span class="status-badge" :class="'status-' + status">{{ labelMap[status] || status }}</span>
</template>

<script setup>
defineProps({
  status: { type: String, required: true },
  labelMap: { type: Object, required: true },
});
</script>
