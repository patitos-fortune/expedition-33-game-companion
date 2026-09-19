<script setup lang="ts">
import { computed } from 'vue'
import { loadGameData } from '../gamedata/loadGameData'
import { state, getOrCreateBuild } from '../state/store'
import { analyzeBuild } from '../optimizer/analyzeBuild'
import { ATTRIBUTES } from '../types'
import type { AttributeName } from '../types'

const gameData = loadGameData()

const character = computed(() => gameData.characters.find((c) => c.id === state.activeCharacterId) ?? null)
const build = computed(() => (character.value ? getOrCreateBuild(character.value.id) : null))

const result = computed(() => {
  if (!build.value) return null
  return analyzeBuild({ build: build.value, gameData, inventory: state.inventory })
})

function pictoName(id: string): string {
  return gameData.pictos.find((p) => p.id === id)?.name ?? id
}

function acceptAttributeSuggestion() {
  if (!build.value || !result.value) return
  build.value.attributeAllocation = { ...result.value.attribute.suggested }
}

function acceptPictoSuggestion() {
  if (!build.value || !result.value) return
  build.value.equippedPictoIds = [...result.value.pictos.suggestedEquippedIds]
}

function acceptLuminaSuggestion() {
  if (!build.value || !result.value) return
  build.value.activeLuminaIds = [...result.value.luminas.suggestedLuminaIds]
}
</script>

<template>
  <div>
    <h1>Analyze My Build</h1>

    <div v-if="!character" class="empty-message">No character selected. Go to Characters and pick one first.</div>
    <div v-else-if="!result" class="empty-message">Nothing to analyze yet.</div>

    <div v-else class="analyze-layout">
      <div class="summary-badges">
        <div class="badge">
          <div class="badge-label">Attribute allocation</div>
          <div class="badge-value">{{ result.fixMyBuildSummary.attribute }}</div>
        </div>
        <div class="badge">
          <div class="badge-label">Pictos</div>
          <div class="badge-value">{{ result.fixMyBuildSummary.pictos }}</div>
        </div>
        <div class="badge">
          <div class="badge-label">Luminas</div>
          <div class="badge-value">{{ result.fixMyBuildSummary.luminas }}</div>
        </div>
        <div class="badge muted-badge">
          <div class="badge-label">Skills</div>
          <div class="badge-value">{{ result.fixMyBuildSummary.skills }}</div>
        </div>
      </div>

      <section class="panel-section">
        <h2 class="section-title">
          Attribute allocation <span class="tier-tag heuristic">HEURISTIC</span>
        </h2>
        <p>{{ result.attribute.summary }}</p>
        <table class="compare-table">
          <thead>
            <tr><th>Attribute</th><th>Current</th><th>Suggested</th><th>Change</th></tr>
          </thead>
          <tbody>
            <tr v-for="attr in ATTRIBUTES" :key="attr">
              <td>{{ attr }}</td>
              <td>{{ result.attribute.current[attr as AttributeName] }}</td>
              <td>{{ result.attribute.suggested[attr as AttributeName] }}</td>
              <td :class="{ up: result.attribute.delta[attr as AttributeName] > 0, down: result.attribute.delta[attr as AttributeName] < 0 }">
                {{ result.attribute.delta[attr as AttributeName] > 0 ? '+' : '' }}{{ result.attribute.delta[attr as AttributeName] }}
              </td>
            </tr>
          </tbody>
        </table>
        <ul class="reason-list">
          <li v-for="attr in ATTRIBUTES" :key="attr"><strong>{{ attr }}:</strong> {{ result.attribute.reasons[attr as AttributeName] }}</li>
        </ul>
        <p class="calc-note"><span class="tier-tag calculated">CALCULATED</span> budget {{ result.attribute.calculated.budget }}, currently spent {{ result.attribute.calculated.pointsSpentCurrent }}, remaining {{ result.attribute.calculated.pointsRemainingCurrent }}. Current allocation is {{ result.attribute.calculated.isCurrentRoughlyEven ? '' : 'not ' }}roughly even across all five attributes.</p>
        <p v-if="!result.attribute.calculated.allocationValidity.valid" class="warning-text">{{ result.attribute.calculated.allocationValidity.reasons.join(' ') }}</p>
        <button class="accept-btn" @click="acceptAttributeSuggestion">Accept suggested allocation</button>
      </section>

      <section class="panel-section">
        <h2 class="section-title">Pictos <span class="tier-tag heuristic">HEURISTIC</span></h2>
        <p>{{ result.pictos.summary }}</p>
        <p v-if="result.pictos.additions.length" class="calc-note">Add: {{ result.pictos.additions.map(pictoName).join(', ') }}</p>
        <p v-if="result.pictos.removals.length" class="calc-note">Remove: {{ result.pictos.removals.map(pictoName).join(', ') }}</p>
        <ul class="reason-list">
          <li v-for="id in result.pictos.suggestedEquippedIds" :key="id"><strong>{{ pictoName(id) }}:</strong> {{ result.pictos.reasons[id] }}</li>
        </ul>
        <button class="accept-btn" @click="acceptPictoSuggestion" :disabled="result.pictos.additions.length === 0">Accept suggested Pictos</button>
      </section>

      <section class="panel-section">
        <h2 class="section-title">Luminas <span class="tier-tag heuristic">HEURISTIC</span></h2>
        <p>{{ result.luminas.summary }}</p>
        <p class="calc-note"><span class="tier-tag calculated">CALCULATED</span> uses {{ result.luminas.totalCost }} / {{ result.luminas.budget }} available Lumina points.{{ result.luminas.isExactSolution ? '' : ' (approximate — budget too large for an exact search)' }}</p>
        <ul class="reason-list">
          <li v-for="id in result.luminas.suggestedLuminaIds" :key="id">{{ result.luminas.reasons[id] }}</li>
        </ul>
        <button class="accept-btn" @click="acceptLuminaSuggestion" :disabled="result.luminas.additions.length === 0 && result.luminas.removals.length === 0">Accept suggested Luminas</button>
      </section>

      <section class="panel-section">
        <h2 class="section-title">Skills <span class="tier-tag unknown">UNKNOWN</span></h2>
        <p>{{ result.skills.message }}</p>
      </section>

      <section class="panel-section">
        <h2 class="section-title">What this optimizer does not know <span class="tier-tag unknown">UNKNOWN</span></h2>
        <ul class="reason-list">
          <li v-for="(item, i) in result.knownUnknowns" :key="i">{{ item }}</li>
        </ul>
      </section>

      <p v-if="!result.weapon.visible && build!.weaponId" class="warning-text">
        The selected weapon is not marked as owned/discovered, so it was excluded from this analysis (spoiler protection).
      </p>
    </div>
  </div>
</template>

<style scoped>
.analyze-layout {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xl);
}

.summary-badges {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--spacing-md);
}

.badge {
  background-color: var(--bg-panel);
  border: 1px solid var(--primary-color);
  border-radius: var(--border-radius);
  padding: var(--spacing-md);
}

.muted-badge {
  border-color: var(--border-color);
}

.badge-label {
  font-size: 0.8rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.badge-value {
  font-weight: 700;
  margin-top: 4px;
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.tier-tag {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: var(--spacing-sm);
  vertical-align: middle;
  text-transform: uppercase;
}

.tier-tag.calculated { background-color: #263238; color: #80cbc4; }
.tier-tag.heuristic { background-color: #2d2410; color: #ffd54f; }
.tier-tag.unknown { background-color: #2d1a1a; color: #ff8a80; }

.compare-table {
  width: 100%;
  border-collapse: collapse;
}

.compare-table th,
.compare-table td {
  padding: 6px 10px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.compare-table td.up { color: #4caf50; font-weight: 700; }
.compare-table td.down { color: #ff8a80; font-weight: 700; }

.reason-list {
  margin: 0;
  padding-left: 1.2em;
  color: var(--text-light);
  font-size: 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.calc-note {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0;
}

.warning-text {
  color: var(--warning-color);
  font-size: 0.9rem;
}

.accept-btn {
  align-self: flex-start;
  background-color: var(--primary-color);
  color: #fff;
  border: none;
}

.accept-btn:disabled {
  background-color: var(--bg-item);
  color: var(--text-muted);
  cursor: not-allowed;
}
</style>
