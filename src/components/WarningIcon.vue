<script setup lang="ts">
defineProps<{
  message: string;
  title?: string;
}>();
</script>

<template>
  <span class="warning-icon" :title="message">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
    <div class="warning-tooltip">
      <div class="tooltip-title">{{ title || 'Warning' }}</div>
      <div class="tooltip-content">
        {{ message }}
      </div>
    </div>
  </span>
</template>

<style scoped>
/* Using global styles defined in style.css */
</style>
