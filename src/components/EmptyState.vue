<script setup lang="ts">
defineProps<{
  title: string;
  instruction: string;
  icon?: string;
}>();
</script>

<template>
  <div class="empty-message">
    <div class="empty-icon">{{ icon }}</div>
    <div class="empty-title">{{ title }}</div>
    <div class="empty-instruction">{{ instruction }}</div>
  </div>
</template>

<style scoped>
/* Using global styles defined in style.css */
</style>
