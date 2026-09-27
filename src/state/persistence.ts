/**
 * Local persistence: serialize/deserialize the whole app state (inventory +
 * per-character builds) to a plain JSON-friendly shape, with validation that
 * tolerates a malformed or partial import rather than crashing the app.
 *
 * This module is pure/plain TypeScript (no Vue, no browser APIs) so it can be
 * unit tested directly. src/state/store.ts wires it to localStorage and to
 * Vue's reactive state.
 */
import type { AttributeName, CharacterBuild, InventoryState, PersistedAppState, PictoStatus, StrategyProfileKey, WeaponStatus } from '../types'
import { ATTRIBUTES } from '../types'

export const SCHEMA_VERSION = 1
export const LOCAL_STORAGE_KEY = 'game-companion:state:v1'

const VALID_PICTO_STATUS: PictoStatus[] = ['undiscovered', 'owned', 'unlocked_lumina']
const VALID_WEAPON_STATUS: WeaponStatus[] = ['undiscovered', 'owned', 'equipped']
const VALID_STRATEGY_KEYS: StrategyProfileKey[] = ['balanced', 'damage', 'defensive', 'break', 'status_burn', 'custom']

export function defaultAttributeAllocation(): Record<AttributeName, number> {
  return { Vitality: 0, Might: 0, Agility: 0, Defense: 0, Luck: 0 }
}

export function defaultBuild(characterId: number): CharacterBuild {
  return {
    characterId,
    level: null,
    attributePointBudget: 0,
    attributeAllocation: defaultAttributeAllocation(),
    weaponId: null,
    weaponLevel: 1,
    equippedPictoIds: [],
    activeLuminaIds: [],
    luminaPointBudget: 0,
    strategyProfile: 'balanced',
  }
}

export function defaultInventory(): InventoryState {
  return { pictoStatus: {}, weaponStatus: {}, spoilerProtection: true, colourOfLuminaAvailable: 0 }
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  /** Best-effort sanitized state: malformed pieces are dropped/defaulted rather than failing the whole import. */
  sanitized: PersistedAppState
}

function sanitizeAllocation(raw: unknown, errors: string[]): Record<AttributeName, number> {
  const out = defaultAttributeAllocation()
  if (typeof raw !== 'object' || raw === null) {
    if (raw !== undefined) errors.push('attributeAllocation was not an object; reset to zeros.')
    return out
  }
  for (const attr of ATTRIBUTES) {
    const v = (raw as Record<string, unknown>)[attr]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isInteger(v)) {
      out[attr] = v
    } else if (v !== undefined) {
      errors.push(`attributeAllocation.${attr} was invalid (${JSON.stringify(v)}); reset to 0.`)
    }
  }
  return out
}

function sanitizeBuild(raw: unknown, characterId: number, errors: string[]): CharacterBuild {
  const fallback = defaultBuild(characterId)
  if (typeof raw !== 'object' || raw === null) {
    errors.push(`Build for character ${characterId} was invalid; reset to defaults.`)
    return fallback
  }
  const r = raw as Record<string, unknown>

  const level = typeof r.level === 'number' && Number.isFinite(r.level) ? r.level : null
  const attributePointBudget =
    typeof r.attributePointBudget === 'number' && Number.isFinite(r.attributePointBudget) && r.attributePointBudget >= 0
      ? r.attributePointBudget
      : 0
  const weaponId = typeof r.weaponId === 'string' ? r.weaponId : null
  const weaponLevel = typeof r.weaponLevel === 'number' && Number.isFinite(r.weaponLevel) && r.weaponLevel >= 1 ? r.weaponLevel : 1
  const equippedPictoIds = Array.isArray(r.equippedPictoIds) ? r.equippedPictoIds.filter((x): x is string => typeof x === 'string') : []
  const activeLuminaIds = Array.isArray(r.activeLuminaIds) ? r.activeLuminaIds.filter((x): x is string => typeof x === 'string') : []
  const luminaPointBudget =
    typeof r.luminaPointBudget === 'number' && Number.isFinite(r.luminaPointBudget) && r.luminaPointBudget >= 0 ? r.luminaPointBudget : 0
  const strategyProfile = VALID_STRATEGY_KEYS.includes(r.strategyProfile as StrategyProfileKey)
    ? (r.strategyProfile as StrategyProfileKey)
    : 'balanced'

  if (equippedPictoIds.length > 3) {
    errors.push(`Build for character ${characterId} had more than 3 equipped Pictos; truncated to 3.`)
  }

  return {
    characterId,
    level,
    attributePointBudget,
    attributeAllocation: sanitizeAllocation(r.attributeAllocation, errors),
    weaponId,
    weaponLevel,
    equippedPictoIds: equippedPictoIds.slice(0, 3),
    activeLuminaIds,
    luminaPointBudget,
    strategyProfile,
  }
}

function sanitizeInventory(raw: unknown, errors: string[]): InventoryState {
  const out = defaultInventory()
  if (typeof raw !== 'object' || raw === null) {
    if (raw !== undefined) errors.push('inventory was not an object; reset to defaults.')
    return out
  }
  const r = raw as Record<string, unknown>

  if (typeof r.pictoStatus === 'object' && r.pictoStatus !== null) {
    for (const [id, status] of Object.entries(r.pictoStatus as Record<string, unknown>)) {
      if (VALID_PICTO_STATUS.includes(status as PictoStatus)) {
        out.pictoStatus[id] = status as PictoStatus
      } else {
        errors.push(`Picto status for "${id}" was invalid (${JSON.stringify(status)}); dropped.`)
      }
    }
  }
  if (typeof r.weaponStatus === 'object' && r.weaponStatus !== null) {
    for (const [id, status] of Object.entries(r.weaponStatus as Record<string, unknown>)) {
      if (VALID_WEAPON_STATUS.includes(status as WeaponStatus)) {
        out.weaponStatus[id] = status as WeaponStatus
      } else {
        errors.push(`Weapon status for "${id}" was invalid (${JSON.stringify(status)}); dropped.`)
      }
    }
  }
  out.spoilerProtection = typeof r.spoilerProtection === 'boolean' ? r.spoilerProtection : true
  out.colourOfLuminaAvailable =
    typeof r.colourOfLuminaAvailable === 'number' &&
    Number.isFinite(r.colourOfLuminaAvailable) &&
    r.colourOfLuminaAvailable >= 0 &&
    Number.isInteger(r.colourOfLuminaAvailable)
      ? r.colourOfLuminaAvailable
      : 0

  return out
}

/**
 * Validates and sanitizes an arbitrary parsed-JSON value into a usable
 * PersistedAppState. Never throws: unparseable/malformed pieces are dropped
 * or defaulted and reported in `errors`, so a partially-corrupt file can
 * still be imported for the parts that are salvageable.
 */
export function validatePersistedState(raw: unknown): ValidationResult {
  const errors: string[] = []

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      valid: false,
      errors: ['Top-level data was not a JSON object.'],
      sanitized: { schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString(), inventory: defaultInventory(), builds: {}, activeCharacterId: null },
    }
  }
  const r = raw as Record<string, unknown>

  const inventory = sanitizeInventory(r.inventory, errors)

  const builds: Record<number, CharacterBuild> = {}
  if (typeof r.builds === 'object' && r.builds !== null) {
    for (const [key, value] of Object.entries(r.builds as Record<string, unknown>)) {
      const characterId = Number(key)
      if (!Number.isFinite(characterId)) {
        errors.push(`Build key "${key}" is not a valid character id; skipped.`)
        continue
      }
      builds[characterId] = sanitizeBuild(value, characterId, errors)
    }
  } else if (r.builds !== undefined) {
    errors.push('builds was not an object; reset to empty.')
  }

  const activeCharacterId = typeof r.activeCharacterId === 'number' ? r.activeCharacterId : null

  const sanitized: PersistedAppState = {
    schemaVersion: SCHEMA_VERSION,
    savedAt: typeof r.savedAt === 'string' ? r.savedAt : new Date().toISOString(),
    inventory,
    builds,
    activeCharacterId,
  }

  return { valid: errors.length === 0, errors, sanitized }
}

export function serializeState(state: { inventory: InventoryState; builds: Record<number, CharacterBuild>; activeCharacterId: number | null }): string {
  const payload: PersistedAppState = {
    schemaVersion: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    inventory: state.inventory,
    builds: state.builds,
    activeCharacterId: state.activeCharacterId,
  }
  return JSON.stringify(payload, null, 2)
}

export function deserializeState(json: string): ValidationResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    return {
      valid: false,
      errors: [`File was not valid JSON: ${(e as Error).message}`],
      sanitized: { schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString(), inventory: defaultInventory(), builds: {}, activeCharacterId: null },
    }
  }
  return validatePersistedState(parsed)
}
