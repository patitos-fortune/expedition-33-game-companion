<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { loadGameData } from '../gamedata/loadGameData'
import { state, getOrCreateBuild } from '../state/store'

const gameData = loadGameData()
const router = useRouter()

const characterIconUrls = import.meta.glob('../assets/*.avif', { eager: true, import: 'default' }) as Record<string, string>

function iconUrl(icon?: string): string | undefined {
  if (!icon) return undefined
  const match = Object.entries(characterIconUrls).find(([path]) => path.endsWith('/' + icon))
  return match?.[1]
}

const characters = computed(() => gameData.characters)

const plannedColourSpend = computed(() => 0)
const colourRemaining = computed(() => Math.max(0, state.inventory.colourOfLuminaAvailable - plannedColourSpend.value))

function selectCharacter(characterId: number) {
  state.activeCharacterId = characterId
  getOrCreateBuild(characterId)
  router.push('/build')
}
</script>

<template>
  <div>
    <h1>Characters</h1>
    <p class="hint">Pick a character to set up their current build.</p>

    <section class="lumina-wallet">
      <label>
        Shared Colours of Lumina available
        <input type="number" min="0" step="1" v-model.number="state.inventory.colourOfLuminaAvailable" />
      </label>
      <div class="wallet-summary">Unspent: {{ colourRemaining }} · Current character capacities are shown on their build screens.</div>
      <p class="hint">Colours of Lumina are the shared currency used to raise individual character Lumina capacity. Learned Luminas themselves are tracked globally in Inventory.</p>
    </section>

    <div class="character-grid">
      <button
        v-for="c in characters"
        :key="c.id"
        class="character-card"
        :class="{ active: state.activeCharacterId === c.id }"
        @click="selectCharacter(c.id)"
      >
        <img v-if="iconUrl(c.icon)" :src="iconUrl(c.icon)" :alt="c.name" class="character-icon" />
        <div class="character-name">{{ c.name }}</div>
        <div class="character-skill-count">{{ c.skills.length }} skills on record</div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.hint {
  color: var(--text-muted);
  margin-bottom: var(--spacing-lg);
}

.lumina-wallet {
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.lumina-wallet label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 280px;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.lumina-wallet input {
  background-color: var(--bg-item);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  border-radius: var(--border-radius-sm);
  padding: var(--spacing-sm);
  font-size: 1rem;
}

.wallet-summary {
  font-weight: 700;
}

.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--spacing-lg);
}

.character-card {
  background-color: var(--bg-panel);
  border: 2px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  cursor: pointer;
  color: var(--text-color);
  font-family: inherit;
}

.character-card:hover {
  border-color: var(--primary-color);
}

.character-card.active {
  border-color: var(--primary-color);
  background-color: var(--bg-item);
}

.character-icon {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 50%;
}

.character-name {
  font-weight: 700;
  font-size: 1.05rem;
}

.character-skill-count {
  font-size: 0.8rem;
  color: var(--text-muted);
}
</style>
