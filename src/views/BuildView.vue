<script setup lang="ts">
import { computed } from 'vue'
import { loadGameData } from '../gamedata/loadGameData'
import { state, getOrCreateBuild } from '../state/store'
import { GENERIC_WEAPON_SCALING_THRESHOLD_LEVELS, listStrategyProfiles } from '../optimizer/modelConfig'
import { pointsRemaining, pointsSpent } from '../optimizer/calculated'
import { ATTRIBUTES } from '../types'
import type { AttributeName } from '../types'

const gameData = loadGameData()
const profiles = listStrategyProfiles()

const character = computed(() => gameData.characters.find((c) => c.id === state.activeCharacterId) ?? null)
const build = computed(() => (character.value ? getOrCreateBuild(character.value.id) : null))

const ownedWeapons = computed(() => {
  if (!character.value) return []
  return gameData.weapons.filter((w) => w.character === character.value!.name && (!state.inventory.spoilerProtection || ['owned', 'equipped'].includes(state.inventory.weaponStatus[w.id] ?? 'undiscovered')))
})

const selectedWeapon = computed(() => (build.value?.weaponId ? gameData.weapons.find((w) => w.id === build.value!.weaponId) ?? null : null))

const ownedPictos = computed(() =>
  gameData.pictos.filter((p) => !state.inventory.spoilerProtection || ['owned', 'unlocked_lumina'].includes(state.inventory.pictoStatus[p.id] ?? 'undiscovered')),
)
const unlockedLuminas = computed(() =>
  gameData.pictos.filter((p) => !state.inventory.spoilerProtection || state.inventory.pictoStatus[p.id] === 'unlocked_lumina'),
)

function toggleEquipped(id: string) {
  if (!build.value) return
  const idx = build.value.equippedPictoIds.indexOf(id)
  if (idx >= 0) {
    build.value.equippedPictoIds.splice(idx, 1)
  } else if (build.value.equippedPictoIds.length < 3) {
    build.value.equippedPictoIds.push(id)
  }
}

function clearEquippedPictos() {
  if (!build.value) return
  build.value.equippedPictoIds.splice(0)
}

function clearActiveLuminas() {
  if (!build.value) return
  build.value.activeLuminaIds.splice(0)
}

function toggleLumina(id: string) {
  if (!build.value) return
  const idx = build.value.activeLuminaIds.indexOf(id)
  if (idx >= 0) {
    build.value.activeLuminaIds.splice(idx, 1)
  } else {
    build.value.activeLuminaIds.push(id)
  }
}

function luminaPointCost(id: string): number {
  if (!build.value || build.value.equippedPictoIds.includes(id)) return 0
  return gameData.pictos.find((p) => p.id === id)?.cost ?? 0
}

const luminaCost = computed(() => {
  if (!build.value) return 0
  return build.value.activeLuminaIds.reduce((sum, id) => sum + luminaPointCost(id), 0)
})

function setLevelBudget() {
  if (!build.value || build.value.level === null) return
  build.value.attributePointBudget = build.value.level * gameData.attributeProgression.pointsPerLevelUp
}
</script>

<template>
  <div>
    <h1>Current Build</h1>

    <div v-if="!character" class="empty-message">
      No character selected. Go to Characters and pick one first.
    </div>

    <div v-else class="build-form">
      <h2>{{ character.name }}</h2>

      <section class="panel-section">
        <h3 class="section-title">1. Level &amp; attribute points</h3>
        <div class="field-row">
          <label>Character level (optional, auto-fills budget at {{ gameData.attributeProgression.pointsPerLevelUp }} pts/level)
            <input type="number" min="1" :max="gameData.attributeProgression.levelCap" v-model.number="build!.level" @change="setLevelBudget" />
          </label>
          <label>Available attribute point budget
            <input type="number" min="0" v-model.number="build!.attributePointBudget" />
          </label>
        </div>
        <div class="attribute-grid">
          <label v-for="attr in ATTRIBUTES" :key="attr" class="attribute-input">
            {{ attr }}
            <input type="number" min="0" v-model.number="build!.attributeAllocation[attr as AttributeName]" />
          </label>
        </div>
        <p class="calc-note">
          Spent {{ pointsSpent(build!.attributeAllocation) }} / {{ build!.attributePointBudget }}
          (remaining {{ pointsRemaining(build!.attributePointBudget, build!.attributeAllocation) }})
        </p>
      </section>

      <section class="panel-section">
        <h3 class="section-title">2. Equipped Weapon</h3>
        <div class="field-row">
          <label>Equipped weapon
            <select v-model="build!.weaponId">
              <option :value="null">-- none selected --</option>
              <option v-for="w in ownedWeapons" :key="w.id" :value="w.id">{{ w.name }} ({{ w.element ?? 'unknown' }})</option>
            </select>
          </label>
          <label>Weapon level
            <input type="number" min="1" max="33" v-model.number="build!.weaponLevel" />
          </label>
        </div>
        <p v-if="ownedWeapons.length === 0" class="calc-note">
          No weapons marked "owned" for {{ character.name }} yet — mark some in Inventory, or turn off spoiler protection in Settings to see the full list.
        </p>
        <div v-if="selectedWeapon" class="scaling-display">
          <span v-for="attr in ATTRIBUTES" :key="attr" class="scaling-chip" :class="selectedWeapon.scaling[attr] ?? 'none'">
            {{ attr }}: {{ selectedWeapon.scaling[attr] ?? '—' }}
          </span>
        </div>
        <p v-if="selectedWeapon?.scalingChangesWithLevel" class="calc-note">
          Scaling grades typically improve as this weapon levels up, commonly around levels
          {{ GENERIC_WEAPON_SCALING_THRESHOLD_LEVELS.join(' / ') }} — this is only a generic, unverified approximation
          (see OPTIMIZER_MODEL.md), not an exact per-weapon table.
        </p>
      </section>

      <section class="panel-section">
        <div class="section-heading-row">
          <h3 class="section-title">3. Equipped Pictos ({{ build!.equippedPictoIds.length }}/3)</h3>
          <button type="button" class="clear-button" :disabled="build!.equippedPictoIds.length === 0" @click="clearEquippedPictos">Clear all</button>
        </div>
        <div class="checkbox-list picto-grid">
          <label v-for="p in ownedPictos" :key="p.id" class="checkbox-row">
            <input
              type="checkbox"
              :checked="build!.equippedPictoIds.includes(p.id)"
              :disabled="!build!.equippedPictoIds.includes(p.id) && build!.equippedPictoIds.length >= 3"
              @change="toggleEquipped(p.id)"
            />
            {{ p.name }} <span class="muted">({{ p.type }})</span>
          </label>
          <div v-if="ownedPictos.length === 0" class="empty-message">No Pictos marked "owned" yet.</div>
        </div>
      </section>

      <section class="panel-section">
        <div class="section-heading-row">
          <h3 class="section-title">4. Planned active Luminas</h3>
          <button type="button" class="clear-button" :disabled="build!.activeLuminaIds.length === 0" @click="clearActiveLuminas">Clear all</button>
        </div>
        <p class="calc-note">Lumina unlocks are shared across the party. The point capacity below belongs only to {{ character.name }}. A passive supplied by one of this character's 3 equipped Pictos costs 0 Lumina points; the same learned passive only costs points when activated as a Lumina.</p>
        <label class="field-row">Current Lumina capacity for {{ character.name }}
          <input type="number" min="0" v-model.number="build!.luminaPointBudget" />
        </label>
        <p class="calc-note" :class="{ 'warning-text': luminaCost > build!.luminaPointBudget }">
          Planned build uses {{ luminaCost }} / {{ build!.luminaPointBudget }} current capacity.
          <span v-if="luminaCost > build!.luminaPointBudget"> Needs +{{ luminaCost - build!.luminaPointBudget }} Colours of Lumina.</span>
          <span v-else> Fits current capacity.</span>
        </p>
        <div class="checkbox-list lumina-grid">
          <label v-for="p in unlockedLuminas" :key="p.id" class="checkbox-row">
            <input type="checkbox" :checked="build!.activeLuminaIds.includes(p.id)" @change="toggleLumina(p.id)" />
            {{ p.name }} <span class="muted" v-if="build!.equippedPictoIds.includes(p.id)">(equipped Picto · 0 Lumina points)</span><span class="muted" v-else>(cost {{ p.cost }})</span>
          </label>
          <div v-if="unlockedLuminas.length === 0" class="empty-message">No shared Luminas unlocked yet. In Inventory → Pictos & Luminas, click a Picto until it is marked “Lumina unlocked”.</div>
        </div>
      </section>

      <section class="panel-section">
        <h3 class="section-title">5. Strategy profile</h3>
        <select v-model="build!.strategyProfile">
          <option v-for="p in profiles" :key="p.key" :value="p.key">{{ p.label }}</option>
        </select>
        <p class="calc-note">{{ profiles.find((p) => p.key === build!.strategyProfile)?.description }}</p>
      </section>

      <RouterLink to="/analyze" class="analyze-cta">Analyze My Build →</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.build-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.field-row {
  display: flex;
  gap: var(--spacing-lg);
  flex-wrap: wrap;
}

.field-row label,
.attribute-input {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
  color: var(--text-muted);
}

input,
select {
  background-color: var(--bg-item);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  border-radius: var(--border-radius-sm);
  padding: var(--spacing-sm);
  font-size: 1rem;
}

.attribute-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--spacing-md);
}

.calc-note {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0;
}

.scaling-display {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.scaling-chip {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.8rem;
  background-color: var(--bg-item);
  border: 1px solid var(--border-color);
}

.scaling-chip.S { border-color: #ffd700; color: #ffd700; }
.scaling-chip.A { border-color: #4caf50; color: #4caf50; }
.scaling-chip.B { border-color: var(--primary-color); color: var(--primary-color); }
.scaling-chip.C { border-color: var(--text-muted); }
.scaling-chip.D { border-color: var(--text-muted); opacity: 0.7; }

.section-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
}

.section-heading-row .section-title {
  margin: 0;
}

.clear-button {
  background-color: var(--bg-item);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  border-radius: var(--border-radius-sm);
  padding: 6px 12px;
  cursor: pointer;
  white-space: nowrap;
}

.clear-button:disabled {
  opacity: 0.45;
  cursor: default;
}

.checkbox-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 240px;
  overflow-y: auto;
}

.lumina-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px var(--spacing-lg);
  align-content: start;
}

@media (max-width: 900px) {
  .lumina-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .lumina-grid {
    grid-template-columns: 1fr;
  }
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 0.9rem;
}

.muted {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.analyze-cta {
  align-self: flex-start;
  background-color: var(--primary-color);
  color: #fff;
  padding: var(--spacing-md) var(--spacing-xl);
  border-radius: var(--border-radius);
  font-weight: 700;
  text-decoration: none;
}
</style>
