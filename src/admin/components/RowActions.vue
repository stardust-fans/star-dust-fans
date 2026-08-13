<template>
  <div class="actions">
    <button class="edit-btn" @click="$emit('edit')">编辑</button>
    <button class="delete-btn" @click="$emit('delete')">删除</button>
  </div>
</template>

<script setup>
defineEmits(['edit', 'delete']);
</script>
