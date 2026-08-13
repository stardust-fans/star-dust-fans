<template>
  <div class="empty-state">
    <div class="empty-mark">✦</div>
    <p>{{ message }}</p>
  </div>
</template>

<script setup>
defineProps({
  message: { type: String, required: true },
});
</script>
