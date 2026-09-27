<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { loadGameData } from '../gamedata/loadGameData'
import { state, getOrCreateBuild } from '../state/store'

const gameData = loadGameData()
const router = useRouter()
const characters = computed(() => gameData.characters)
const matrixSort = ref<'alphabetical' | 'cost-asc' | 'cost-desc'>('alphabetical')
const unlockedLuminas = computed(() => {
  const items = gameData.pictos
    .filter((p) => state.inventory.pictoStatus[p.id] === 'unlocked_lumina')
    .slice()
  if (matrixSort.value === 'cost-asc') return items.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name))
  if (matrixSort.value === 'cost-desc') return items.sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name))
  return items.sort((a, b) => a.name.localeCompare(b.name))
})

function pictoName(id: string): string {
  return gameData.pictos.find((p) => p.id === id)?.name ?? id
}
function currentPaidLuminaCost(characterId: number): number {
  const build = state.builds[characterId]
  if (!build) return 0
  const equipped = new Set(build.equippedPictoIds)
  return build.activeLuminaIds.reduce((sum, id) => sum + (equipped.has(id) ? 0 : (gameData.pictos.find((p) => p.id === id)?.cost ?? 0)), 0)
}
function paidLuminaCost(characterId: number): number {
  const build = state.builds[characterId]
  if (!build) return 0
  const targetIds = new Set([...build.activeLuminaIds, ...build.plannedLuminaIds])
  const equipped = new Set(build.equippedPictoIds)
  return [...targetIds].reduce((sum, id) => sum + (equipped.has(id) ? 0 : (gameData.pictos.find((p) => p.id === id)?.cost ?? 0)), 0)
}
function extraNeeded(characterId: number): number {
  const build = state.builds[characterId]
  if (!build) return 0
  return Math.max(0, paidLuminaCost(characterId) - build.luminaPointBudget)
}
const totalNeeded = computed(() => characters.value.reduce((sum, c) => sum + extraNeeded(c.id), 0))
const remaining = computed(() => state.inventory.colourOfLuminaAvailable - totalNeeded.value)
function luminaState(characterId: number, pictoId: string): 'off' | 'planned' | 'active' | 'equipped' {
  const build = state.builds[characterId]
  if (!build) return 'off'
  if (build.equippedPictoIds.includes(pictoId)) return 'equipped'
  if (build.activeLuminaIds.includes(pictoId)) return 'active'
  if (build.plannedLuminaIds.includes(pictoId)) return 'planned'
  return 'off'
}

function toggleMatrixLumina(characterId: number, pictoId: string) {
  const build = getOrCreateBuild(characterId)
  // Current active Luminas and equipped-Picto passives are snapshots of the real build.
  // Matrix clicks only edit the wishlist so planning never overwrites the current build.
  if (build.equippedPictoIds.includes(pictoId) || build.activeLuminaIds.includes(pictoId)) return
  const idx = build.plannedLuminaIds.indexOf(pictoId)
  if (idx >= 0) build.plannedLuminaIds.splice(idx, 1)
  else build.plannedLuminaIds.push(pictoId)
}

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
    <section class="matrix-section">
      <div class="matrix-heading">
        <div>
          <h2>Party Lumina Matrix</h2>
          <p class="hint">Edit the whole party at once. ✓ = currently active Lumina, ◆ = passive supplied free by an equipped Picto, ★ = wishlist addition. Current-build symbols are read-only here; click an empty cell to add/remove a wishlist item.</p>
        </div>
        <label class="sort-control">Sort
          <select v-model="matrixSort">
            <option value="alphabetical">Alphabetical</option>
            <option value="cost-asc">Cost: low → high</option>
            <option value="cost-desc">Cost: high → low</option>
          </select>
        </label>
      </div>
      <div class="matrix-scroll">
        <table class="lumina-matrix">
          <thead>
            <tr>
              <th class="lumina-name">Lumina</th>
              <th class="cost-col">Cost</th>
              <th v-for="c in characters" :key="c.id">
                {{ c.name }}
                <small>{{ currentPaidLuminaCost(c.id) }} current · {{ paidLuminaCost(c.id) }} planned / {{ state.builds[c.id]?.luminaPointBudget ?? 0 }}</small>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in unlockedLuminas" :key="p.id">
              <th class="lumina-name">{{ p.name }}</th>
              <td class="cost-col">{{ p.cost }}</td>
              <td v-for="c in characters" :key="c.id" class="matrix-cell">
                <button
                  type="button"
                  class="matrix-toggle"
                  :class="luminaState(c.id, p.id)"
                  :title="luminaState(c.id, p.id) === 'equipped' ? 'Current: free passive from equipped Picto.' : luminaState(c.id, p.id) === 'active' ? 'Current active Lumina. Change it on the character sheet.' : 'Toggle wishlist Lumina for ' + c.name"
                  @click="toggleMatrixLumina(c.id, p.id)"
                >
                  <span v-if="luminaState(c.id, p.id) === 'equipped'">◆</span>
                  <span v-else-if="luminaState(c.id, p.id) === 'active'">✓</span>
                  <span v-else-if="luminaState(c.id, p.id) === 'planned'">★</span>
                  <span v-else>·</span>
                </button>
              </td>
            </tr>
            <tr v-if="unlockedLuminas.length === 0">
              <td :colspan="characters.length + 2" class="empty-card">Mark Pictos as Lumina learned in Inventory to populate the matrix.</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th class="lumina-name">Planned paid points</th>
              <td></td>
              <td v-for="c in characters" :key="c.id" :class="{ over: paidLuminaCost(c.id) > (state.builds[c.id]?.luminaPointBudget ?? 0) }">
                <strong>{{ paidLuminaCost(c.id) }} / {{ state.builds[c.id]?.luminaPointBudget ?? 0 }}</strong>
                <small v-if="extraNeeded(c.id)">+{{ extraNeeded(c.id) }} needed</small>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
    <div class="party-grid">
      <article v-for="c in characters" :key="c.id" class="party-card">
        <div class="card-head"><h2>{{ c.name }}</h2><button @click="editCharacter(c.id)">Edit build</button></div>
        <template v-if="state.builds[c.id]">
          <div class="numbers">
            <div><span>Current capacity</span><strong>{{ state.builds[c.id].luminaPointBudget }}</strong></div>
            <div><span>Current → planned</span><strong>{{ currentPaidLuminaCost(c.id) }} → {{ paidLuminaCost(c.id) }}</strong></div>
            <div><span>Extra needed</span><strong :class="{ needs: extraNeeded(c.id) > 0 }">+{{ extraNeeded(c.id) }}</strong></div>
          </div>
          <div class="detail">
            <h3>Equipped Pictos</h3>
            <p v-if="state.builds[c.id].equippedPictoIds.length === 0" class="muted">None selected.</p>
            <ul v-else><li v-for="id in state.builds[c.id].equippedPictoIds" :key="id">{{ pictoName(id) }}<span v-if="state.builds[c.id].activeLuminaIds.includes(id)" class="free"> · passive free</span></li></ul>
          </div>
          <div class="detail">
            <h3>Current + wishlist Luminas</h3>
            <p v-if="state.builds[c.id].activeLuminaIds.length === 0" class="muted">None selected.</p>
            <ul v-else><li v-for="id in state.builds[c.id].activeLuminaIds" :key="id">{{ pictoName(id) }}<span v-if="state.builds[c.id].equippedPictoIds.includes(id)" class="free"> · 0 pts via Picto</span><span v-else class="muted"> · {{ gameData.pictos.find((p) => p.id === id)?.cost ?? 0 }} pts</span></li></ul>
            <p v-if="state.builds[c.id].plannedLuminaIds.length" class="wishlist">Wishlist: {{ state.builds[c.id].plannedLuminaIds.map(pictoName).join(', ') }}</p>
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
.matrix-section { background:var(--bg-panel); border:1px solid var(--border-color); border-radius:var(--border-radius); padding:var(--spacing-lg); margin-bottom:var(--spacing-xl); }
.matrix-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:var(--spacing-lg); }
.matrix-heading h2 { margin-top:0; margin-bottom:var(--spacing-xs); }
.sort-control { display:flex; align-items:center; gap:8px; color:var(--text-muted); white-space:nowrap; }
.sort-control select { background:var(--bg-item); color:var(--text-color); border:1px solid var(--border-color); border-radius:var(--border-radius-sm); padding:6px 8px; }
.matrix-scroll { overflow-x:auto; }
.lumina-matrix { width:100%; border-collapse:collapse; min-width:760px; }
.lumina-matrix th,.lumina-matrix td { border-bottom:1px solid var(--border-color); padding:8px 10px; text-align:center; }
.lumina-matrix thead th { position:sticky; top:0; background:var(--bg-panel); z-index:1; }
.lumina-matrix .lumina-name { text-align:left; min-width:190px; }
.cost-col { width:55px; color:var(--text-muted); }
.lumina-matrix thead small,.lumina-matrix tfoot small { display:block; color:var(--text-muted); font-weight:normal; margin-top:2px; }
.matrix-toggle { width:38px; height:34px; padding:0; border:1px solid var(--border-color); border-radius:var(--border-radius-sm); background:var(--bg-item); color:var(--text-muted); cursor:pointer; font-size:1.05rem; }
.matrix-toggle.active { background:var(--primary-color); color:white; border-color:var(--primary-color); cursor:default; }
.matrix-toggle.planned { color:#ffd54f; border-color:#ffd54f; background:#2d2410; }
.matrix-toggle.equipped { color:#6fdc8c; border-color:#6fdc8c; cursor:default; }
.lumina-matrix tfoot td { padding-top:12px; }
.lumina-matrix tfoot .over { color:var(--warning-color); }
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
.wishlist { color:#ffd54f; font-size:.85rem; }
.needs,.shortfall { color:var(--warning-color); }
.empty-card { padding:var(--spacing-xl) 0; }
@media (max-width:640px) { .party-budget { grid-template-columns:1fr 1fr; } .party-budget div:last-child { grid-column:1/-1; } .party-grid { grid-template-columns:1fr; } .numbers { grid-template-columns:repeat(3,1fr); } }
</style>
