<template>
  <div class="toast-container">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="toast"
      :class="toast.type"
      :style="toast.leaving ? { opacity: 0, transition: 'opacity 0.3s' } : {}"
    >
      {{ toast.message }}
    </div>
  </div>
</template>

<script setup>
import { useToast } from '../composables/useToast.js';

const { toasts } = useToast();
</script>
