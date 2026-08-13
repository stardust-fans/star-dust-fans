<template>
  <div class="empty-state">
    <i :class="['fas', icon]"></i>
    <p>{{ message }}</p>
  </div>
</template>

<script setup>
defineProps({
  icon: { type: String, required: true },
  message: { type: String, required: true },
});
</script>
