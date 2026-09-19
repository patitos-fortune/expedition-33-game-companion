<script setup lang="ts">
import { ref } from 'vue'
import { state, exportStateAsJson, importStateFromJson, resetAllData } from '../state/store'

const importErrors = ref<string[]>([])
const importOk = ref<boolean | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

function downloadExport() {
  const json = exportStateAsJson()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `game-companion-backup-${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function triggerImport() {
  fileInput.value?.click()
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const text = String(reader.result ?? '')
    const result = importStateFromJson(text)
    importOk.value = result.ok
    importErrors.value = result.errors
  }
  reader.readAsText(file)
  input.value = ''
}

function handleReset() {
  if (confirm('This will erase all saved inventory and build data in this browser. Continue?')) {
    resetAllData()
  }
}
</script>

<template>
  <div>
    <h1>Settings</h1>

    <section class="panel-section">
      <h2 class="section-title">Spoiler protection</h2>
      <label class="toggle-row">
        <input type="checkbox" v-model="state.inventory.spoilerProtection" />
        Only recommend Pictos, Luminas, and weapons I've marked as owned/discovered
      </label>
      <p class="calc-note">
        Turning this off lets you browse the complete reference database (all Pictos and weapons) as a deliberate,
        separate action — recommendations will then be able to suggest content you haven't marked as owned.
      </p>
    </section>

    <section class="panel-section">
      <h2 class="section-title">Backup &amp; restore</h2>
      <div class="button-row">
        <button @click="downloadExport">Export Save / Backup to JSON</button>
        <button @click="triggerImport">Import Save / Restore from JSON</button>
        <input ref="fileInput" type="file" accept="application/json" class="hidden-file-input" @change="handleFileChange" />
      </div>
      <p v-if="importOk === true" class="ok-text">Import successful.</p>
      <div v-else-if="importOk === false" class="warning-text">
        <p>Import completed with warnings (malformed parts were reset to defaults rather than rejected entirely):</p>
        <ul>
          <li v-for="(e, i) in importErrors" :key="i">{{ e }}</li>
        </ul>
      </div>
    </section>

    <section class="panel-section">
      <h2 class="section-title">Reset</h2>
      <button class="danger-btn" @click="handleReset">Erase all saved data</button>
    </section>

    <section class="panel-section">
      <h2 class="section-title">About</h2>
      <p>
        Game Companion v0.1 — a personal local build-analysis tool for Clair Obscur: Expedition 33, adapted in part
        from the open-source <a href="https://github.com/fmarlats/picto-builder" target="_blank" rel="noopener">picto-builder</a>
        project (MIT licensed). See README.md, OPTIMIZER_MODEL.md, and SOURCE_ATTRIBUTION.md in the project folder for
        full details on what data this app uses, where it came from, and what the optimizer does and doesn't know.
      </p>
    </section>
  </div>
</template>

<style scoped>
.panel-section {
  margin-bottom: var(--spacing-xl);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.calc-note {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.button-row {
  display: flex;
  gap: var(--spacing-md);
}

.hidden-file-input {
  display: none;
}

.ok-text {
  color: #4caf50;
}

.warning-text {
  color: var(--warning-color);
}

.danger-btn {
  align-self: flex-start;
  background-color: #b71c1c;
  color: #fff;
  border: none;
}
</style>
