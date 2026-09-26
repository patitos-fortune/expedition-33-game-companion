<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { loadGameData } from '../gamedata/loadGameData'
import { state, getOrCreateBuild } from '../state/store'

const gameData = loadGameData()
const router = useRouter()
const characters = computed(() => gameData.characters)

function pictoName(id: string): string {
  return gameData.pictos.find((p) => p.id === id)?.name ?? id
}
function paidLuminaCost(characterId: number): number {
  const build = state.builds[characterId]
  if (!build) return 0
  const equipped = new Set(build.equippedPictoIds)
  return build.activeLuminaIds.reduce((sum, id) => sum + (equipped.has(id) ? 0 : (gameData.pictos.find((p) => p.id === id)?.cost ?? 0)), 0)
}
function extraNeeded(characterId: number): number {
  const build = state.builds[characterId]
  if (!build) return 0
  return Math.max(0, paidLuminaCost(characterId) - build.luminaPointBudget)
}
const totalNeeded = computed(() => characters.value.reduce((sum, c) => sum + extraNeeded(c.id), 0))
const remaining = computed(() => state.inventory.colourOfLuminaAvailable - totalNeeded.value)
function editCharacter(characterId: number) {
  state.activeCharacterId = characterId
  getOrCreateBuild(characterId)
  router.push('/build')
}
</script>

<template>
  <div>
    <h1>Desired Party Build</h1>
    <p class="hint">Your manually selected target builds in one place. Analyze My Build remains a separate optimizer and does not replace these selections.</p>
    <section class="party-budget">
      <div><span>Colours available</span><strong>{{ state.inventory.colourOfLuminaAvailable }}</strong></div>
      <div><span>Needed for desired party</span><strong>{{ totalNeeded }}</strong></div>
      <div><span>{{ remaining >= 0 ? 'Remaining after upgrades' : 'Short by' }}</span><strong :class="{ shortfall: remaining < 0 }">{{ Math.abs(remaining) }}</strong></div>
    </section>
    <div class="party-grid">
      <article v-for="c in characters" :key="c.id" class="party-card">
        <div class="card-head"><h2>{{ c.name }}</h2><button @click="editCharacter(c.id)">Edit build</button></div>
        <template v-if="state.builds[c.id]">
          <div class="numbers">
            <div><span>Current capacity</span><strong>{{ state.builds[c.id].luminaPointBudget }}</strong></div>
            <div><span>Desired paid Luminas</span><strong>{{ paidLuminaCost(c.id) }}</strong></div>
            <div><span>Extra needed</span><strong :class="{ needs: extraNeeded(c.id) > 0 }">+{{ extraNeeded(c.id) }}</strong></div>
          </div>
          <div class="detail">
            <h3>Equipped Pictos</h3>
            <p v-if="state.builds[c.id].equippedPictoIds.length === 0" class="muted">None selected.</p>
            <ul v-else><li v-for="id in state.builds[c.id].equippedPictoIds" :key="id">{{ pictoName(id) }}<span v-if="state.builds[c.id].activeLuminaIds.includes(id)" class="free"> · passive free</span></li></ul>
          </div>
          <div class="detail">
            <h3>Planned active Luminas</h3>
            <p v-if="state.builds[c.id].activeLuminaIds.length === 0" class="muted">None selected.</p>
            <ul v-else><li v-for="id in state.builds[c.id].activeLuminaIds" :key="id">{{ pictoName(id) }}<span v-if="state.builds[c.id].equippedPictoIds.includes(id)" class="free"> · 0 pts via Picto</span><span v-else class="muted"> · {{ gameData.pictos.find((p) => p.id === id)?.cost ?? 0 }} pts</span></li></ul>
          </div>
        </template>
        <div v-else class="empty-card">No desired build entered yet.</div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.hint { color: var(--text-muted); margin-bottom: var(--spacing-lg); }
.party-budget { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:var(--spacing-md); background:var(--bg-panel); border:1px solid var(--border-color); border-radius:var(--border-radius); padding:var(--spacing-lg); margin-bottom:var(--spacing-xl); }
.party-budget div,.numbers div { display:flex; flex-direction:column; gap:2px; }
.party-budget span,.numbers span { color:var(--text-muted); font-size:.82rem; }
.party-budget strong { font-size:1.45rem; }
.party-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:var(--spacing-lg); }
.party-card { background:var(--bg-panel); border:1px solid var(--border-color); border-radius:var(--border-radius); padding:var(--spacing-lg); }
.card-head { display:flex; align-items:center; justify-content:space-between; gap:var(--spacing-sm); }
.card-head h2 { margin:0; }
.card-head button { padding:.45em .8em; }
.numbers { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:var(--spacing-sm); background:var(--bg-item); border-radius:var(--border-radius-sm); padding:var(--spacing-md); margin:var(--spacing-md) 0; }
.numbers strong { font-size:1.15rem; }
.detail h3 { font-size:.95rem; margin-bottom:var(--spacing-xs); }
.detail ul { margin-top:0; padding-left:1.2rem; }
.muted,.empty-card { color:var(--text-muted); }
.free { color:#6fdc8c; }
.needs,.shortfall { color:var(--warning-color); }
.empty-card { padding:var(--spacing-xl) 0; }
@media (max-width:640px) { .party-budget { grid-template-columns:1fr 1fr; } .party-budget div:last-child { grid-column:1/-1; } .party-grid { grid-template-columns:1fr; } .numbers { grid-template-columns:repeat(3,1fr); } }
</style>
