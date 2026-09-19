/**
 * Thin Vue wiring around the pure persistence logic in persistence.ts:
 * reactive app state, automatic localStorage save, and load-on-start.
 * Kept deliberately small — all the logic worth unit-testing lives in
 * persistence.ts, gamedata/loadGameData.ts, and optimizer/*.
 */
import { reactive, watch } from 'vue'
import type { CharacterBuild, InventoryState } from '../types'
import {
  LOCAL_STORAGE_KEY,
  defaultBuild,
  defaultInventory,
  deserializeState,
  serializeState,
} from './persistence'

export interface AppState {
  inventory: InventoryState
  builds: Record<number, CharacterBuild>
  activeCharacterId: number | null
}

function loadInitialState(): AppState {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    if (raw) {
      const result = deserializeState(raw)
      return {
        inventory: result.sanitized.inventory,
        builds: result.sanitized.builds,
        activeCharacterId: result.sanitized.activeCharacterId,
      }
    }
  } catch (e) {
    // localStorage can be unavailable (private browsing, disabled storage, etc.)
    // — fall back to an empty in-memory state rather than crashing the app.
    console.warn('Game Companion: could not read saved data from local storage.', e)
  }
  return { inventory: defaultInventory(), builds: {}, activeCharacterId: null }
}

export const state = reactive<AppState>(loadInitialState())

let saveTimer: ReturnType<typeof setTimeout> | null = null
export function persistNow() {
  try {
    const json = serializeState({
      inventory: state.inventory,
      builds: state.builds,
      activeCharacterId: state.activeCharacterId,
    })
    window.localStorage.setItem(LOCAL_STORAGE_KEY, json)
  } catch (e) {
    console.warn('Game Companion: could not save data to local storage.', e)
  }
}

// Debounced autosave whenever state changes.
watch(
  state,
  () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(persistNow, 300)
  },
  { deep: true },
)

export function getOrCreateBuild(characterId: number): CharacterBuild {
  if (!state.builds[characterId]) {
    state.builds[characterId] = defaultBuild(characterId)
  }
  return state.builds[characterId]
}

export function exportStateAsJson(): string {
  return serializeState({
    inventory: state.inventory,
    builds: state.builds,
    activeCharacterId: state.activeCharacterId,
  })
}

export interface ImportResult {
  ok: boolean
  errors: string[]
}

export function importStateFromJson(json: string): ImportResult {
  const result = deserializeState(json)
  state.inventory = result.sanitized.inventory
  state.builds = result.sanitized.builds
  state.activeCharacterId = result.sanitized.activeCharacterId
  persistNow()
  return { ok: result.valid, errors: result.errors }
}

export function resetAllData() {
  state.inventory = defaultInventory()
  state.builds = {}
  state.activeCharacterId = null
  persistNow()
}
