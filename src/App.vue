<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell">
    <header class="app-nav">
      <div class="app-title">Game Companion</div>
      <nav class="app-tabs">
        <RouterLink to="/characters" class="app-tab">Characters</RouterLink>
        <RouterLink to="/inventory" class="app-tab">Inventory</RouterLink>
        <RouterLink to="/build" class="app-tab">Current Build</RouterLink>
        <RouterLink to="/analyze" class="app-tab app-tab-primary">Analyze My Build</RouterLink>
        <RouterLink to="/settings" class="app-tab">Settings</RouterLink>
      </nav>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  width: 100%;
}

.app-nav {
  display: flex;
  align-items: center;
  gap: var(--spacing-xl);
  padding: var(--spacing-md) var(--spacing-lg);
  background-color: var(--bg-panel);
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.app-title {
  font-weight: 700;
  font-size: 1.1rem;
  white-space: nowrap;
}

.app-tabs {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.app-tab {
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--border-radius-sm);
  color: var(--text-light);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.95rem;
}

.app-tab:hover {
  background-color: var(--bg-item);
}

.app-tab.router-link-active {
  background-color: var(--primary-color);
  color: #fff;
}

.app-tab-primary {
  border: 1px solid var(--primary-color);
  font-weight: 700;
}

.app-main {
  flex: 1;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: var(--spacing-xl) var(--spacing-lg);
  text-align: left;
}
</style>
