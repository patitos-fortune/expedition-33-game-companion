<script setup lang="ts">
import { computed, ref } from 'vue'
import { loadGameData } from '../gamedata/loadGameData'
import { state, getOrCreateBuild } from '../state/store'
import type { PictoStatus, WeaponStatus } from '../types'

const gameData = loadGameData()

const tab = ref<'pictos' | 'weapons'>('pictos')
const search = ref('')
const characterFilter = ref<string>('all')
const pictoFilter = ref<'all' | 'owned' | 'unlocked'>('all')

const pictoStatusLabels: Record<PictoStatus, string> = {
  undiscovered: 'Not discovered',
  owned: 'Owned',
  unlocked_lumina: 'Unlocked as Lumina',
}
const pictoStatusOrder: PictoStatus[] = ['undiscovered', 'owned', 'unlocked_lumina']

const weaponStatusLabels: Record<WeaponStatus, string> = {
  undiscovered: 'Not discovered',
  owned: 'Owned',
  equipped: 'Equipped',
}
const weaponStatusOrder: WeaponStatus[] = ['undiscovered', 'owned', 'equipped']

function pictoStatus(id: string): PictoStatus {
  return state.inventory.pictoStatus[id] ?? 'undiscovered'
}
function cyclePictoStatus(id: string) {
  const current = pictoStatus(id)
  const idx = pictoStatusOrder.indexOf(current)
  const next = pictoStatusOrder[(idx + 1) % pictoStatusOrder.length]
  state.inventory.pictoStatus[id] = next
}

function weaponStatus(id: string): WeaponStatus {
  return state.inventory.weaponStatus[id] ?? 'undiscovered'
}
function cycleWeaponStatus(id: string) {
  const current = weaponStatus(id)
  const idx = weaponStatusOrder.indexOf(current)
  const next = weaponStatusOrder[(idx + 1) % weaponStatusOrder.length]
  const weapon = gameData.weapons.find((w) => w.id === id)
  if (!weapon) return

  if (next === 'equipped') {
    // A character can only have one equipped weapon. Demote any previous one to owned.
    for (const other of gameData.weapons.filter((w) => w.character === weapon.character && w.id !== id)) {
      if (weaponStatus(other.id) === 'equipped') state.inventory.weaponStatus[other.id] = 'owned'
    }
    const character = gameData.characters.find((c) => c.name === weapon.character)
    if (character) {
      const build = state.builds[character.id] ?? getOrCreateBuild(character.id)
      build.weaponId = id
    }
  } else if (current === 'equipped') {
    const character = gameData.characters.find((c) => c.name === weapon.character)
    if (character && state.builds[character.id]?.weaponId === id) state.builds[character.id].weaponId = null
  }

  state.inventory.weaponStatus[id] = next
}

const filteredPictos = computed(() => {
  const q = search.value.trim().toLowerCase()
  return gameData.pictos.filter((p) => {
    const status = pictoStatus(p.id)
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.type.toLowerCase().includes(q)
    const matchesStatus =
      pictoFilter.value === 'all' ||
      (pictoFilter.value === 'owned' && (status === 'owned' || status === 'unlocked_lumina')) ||
      (pictoFilter.value === 'unlocked' && status === 'unlocked_lumina')
    return matchesSearch && matchesStatus
  })
})

const characterNames = computed(() => gameData.characters.map((c) => c.name))

const filteredWeapons = computed(() => {
  const q = search.value.trim().toLowerCase()
  return gameData.weapons.filter((w) => {
    const matchesChar = characterFilter.value === 'all' || w.character === characterFilter.value
    const matchesSearch = !q || w.name.toLowerCase().includes(q)
    return matchesChar && matchesSearch
  })
})

const pictoOwnedCount = computed(() => Object.values(state.inventory.pictoStatus).filter((s) => s === 'owned' || s === 'unlocked_lumina').length)
const luminaUnlockedCount = computed(() => Object.values(state.inventory.pictoStatus).filter((s) => s === 'unlocked_lumina').length)
const weaponOwnedCount = computed(() => Object.values(state.inventory.weaponStatus).filter((s) => s === 'owned' || s === 'equipped').length)
</script>

<template>
  <div>
    <h1>My Inventory</h1>
    <p class="hint">
      Mark what you actually have. For Pictos, click each row to cycle <strong>Not discovered → Owned → Lumina unlocked</strong>. For weapons, click to cycle <strong>Not discovered → Owned → Equipped</strong>; marking one Equipped automatically sets that character's equipped weapon.
      “Lumina unlocked” means you still own the Picto, and its passive is now available to every character; each character
      has their own Lumina-point capacity. Recommendations only use what is marked here — turn off spoiler protection in
      Settings to browse the full reference database instead.
    </p>

    <div class="toolbar">
      <div class="tabs">
        <button :class="{ active: tab === 'pictos' }" @click="tab = 'pictos'">Pictos & Luminas ({{ pictoOwnedCount }} owned · {{ luminaUnlockedCount }} Luminas unlocked)</button>
        <button :class="{ active: tab === 'weapons' }" @click="tab = 'weapons'">Weapons ({{ weaponOwnedCount }}/{{ gameData.weapons.length }})</button>
      </div>
      <input v-model="search" type="search" placeholder="Search by name..." class="search-input" />
      <div v-if="tab === 'pictos'" class="status-filters" aria-label="Filter Pictos by inventory status">
        <button :class="{ active: pictoFilter === 'all' }" @click="pictoFilter = 'all'">All</button>
        <button :class="{ active: pictoFilter === 'owned' }" @click="pictoFilter = 'owned'">Owned ({{ pictoOwnedCount }})</button>
        <button :class="{ active: pictoFilter === 'unlocked' }" @click="pictoFilter = 'unlocked'">Lumina learned ({{ luminaUnlockedCount }})</button>
      </div>
      <select v-if="tab === 'weapons'" v-model="characterFilter" class="character-select">
        <option value="all">All characters</option>
        <option v-for="name in characterNames" :key="name" :value="name">{{ name }}</option>
      </select>
    </div>

    <div v-if="tab === 'pictos'" class="row-list">
      <button v-for="p in filteredPictos" :key="p.id" class="inv-row" :class="pictoStatus(p.id)" @click="cyclePictoStatus(p.id)">
        <span class="inv-row-name">{{ p.name }}</span>
        <span class="inv-row-meta">{{ p.type }} &middot; cost {{ p.cost }}<span v-if="!p.costValid" title="Cost value was malformed in source data and defaulted to 0"> ⚠</span></span>
        <span class="inv-row-status">{{ pictoStatusLabels[pictoStatus(p.id)] }}</span>
      </button>
      <div v-if="filteredPictos.length === 0" class="empty-message">No Pictos match your search.</div>
    </div>

    <div v-else class="row-list">
      <button v-for="w in filteredWeapons" :key="w.id" class="inv-row" :class="weaponStatus(w.id)" @click="cycleWeaponStatus(w.id)">
        <span class="inv-row-name">{{ w.name }}</span>
        <span class="inv-row-meta">{{ w.character }} &middot; {{ w.element ?? 'unknown element' }}</span>
        <span class="inv-row-status">{{ weaponStatusLabels[weaponStatus(w.id)] }}</span>
      </button>
      <div v-if="filteredWeapons.length === 0" class="empty-message">No weapons match your search.</div>
    </div>
  </div>
</template>

<style scoped>
.hint {
  color: var(--text-muted);
  margin-bottom: var(--spacing-lg);
  max-width: 70ch;
}

.toolbar {
  display: flex;
  gap: var(--spacing-md);
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: var(--spacing-lg);
}

.tabs {
  display: flex;
  gap: var(--spacing-sm);
}

.tabs button,
.status-filters button,
.search-input,
.character-select {
  background-color: var(--bg-item);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  border-radius: var(--border-radius-sm);
  padding: var(--spacing-sm) var(--spacing-md);
}

.tabs button.active,
.status-filters button.active {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
}

.status-filters {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 200px;
}

.row-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 65vh;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
}

.inv-row {
  display: grid;
  grid-template-columns: 2fr 2fr 1fr;
  gap: var(--spacing-md);
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--bg-panel);
  border: none;
  color: var(--text-color);
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.9rem;
}

.inv-row:hover {
  background-color: var(--bg-item);
}

.inv-row-name {
  font-weight: 600;
}

.inv-row-meta {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.inv-row-status {
  text-align: right;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.inv-row.undiscovered .inv-row-status {
  color: var(--text-muted);
}

.inv-row.owned .inv-row-status {
  color: #4caf50;
}

.inv-row.equipped .inv-row-status {
  color: var(--primary-color);
}

.inv-row.unlocked_lumina .inv-row-status {
  color: var(--primary-color);
}
</style>
