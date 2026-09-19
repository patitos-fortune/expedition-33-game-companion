/**
 * Game data loading & normalization layer.
 *
 * This is the ONLY place that reads the raw upstream picto-builder JSON
 * (src/assets/characters.json, src/assets/pictos_list.json) and our own
 * researched datasets (data/weapons.json, data/attribute_progression.json,
 * data/optimizer_reference.json). Everything downstream (optimizer, state,
 * UI) works only with the normalized types in src/types/index.ts.
 *
 * Upstream files are never mutated on disk — normalization happens here,
 * in memory, every time the app loads.
 */
import rawCharacters from '../assets/characters.json'
import rawPictos from '../assets/pictos_list.json'
import weaponsData from '../../data/weapons.json'
import attributeProgressionData from '../../data/attribute_progression.json'
import optimizerReferenceData from '../../data/optimizer_reference.json'
import type {
  AttributeName,
  NormalizedCharacter,
  NormalizedPicto,
  RawCharacter,
  RawPictoItem,
  Weapon,
} from '../types'
import { ATTRIBUTES } from '../types'

export interface CostNormalizationResult {
  value: number
  valid: boolean
}

/**
 * Normalizes a Picto/Lumina cost value to a non-negative integer.
 * The upstream dataset stores `cost` inconsistently (sometimes a number,
 * sometimes a numeric string), and could in principle contain missing or
 * malformed values — this is the single validation point for that field.
 */
export function normalizeCost(raw: unknown): CostNormalizationResult {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return { value: Math.round(raw), valid: true }
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed !== '' && /^\d+(\.\d+)?$/.test(trimmed)) {
      const parsed = Number.parseFloat(trimmed)
      if (Number.isFinite(parsed) && parsed >= 0) {
        return { value: Math.round(parsed), valid: true }
      }
    }
  }
  // Malformed/missing cost: fall back to 0 but flag it so the UI/optimizer
  // can warn rather than silently treat this item as free.
  return { value: 0, valid: false }
}

function normalizePictoAttributes(attrs: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(attrs)) {
    const numeric = Number.parseFloat(String(value).replace(/[^0-9.]/g, ''))
    out[key] = Number.isFinite(numeric) ? numeric : 0
  }
  return out
}

export function normalizePicto(raw: RawPictoItem, index: number): NormalizedPicto {
  const { value, valid } = normalizeCost(raw.cost)
  const id = `picto-${index}`
  return {
    id,
    name: raw.name,
    type: raw.type,
    effect: raw.effect,
    fullUrl: raw.full_url,
    cost: value,
    costValid: valid,
    levels: raw.attributes.map((lvl) => ({
      level: lvl.level,
      attributes: normalizePictoAttributes(lvl.attributes),
    })),
  }
}

export function normalizeCharacter(raw: RawCharacter): NormalizedCharacter {
  return {
    id: raw.id,
    name: raw.name,
    icon: raw.icon,
    skills: raw.skills.map((s) => ({
      id: s.id,
      name: s.name,
      effect: s.effect,
      cost: s.cost,
      fullUrl: s.full_url,
    })),
  }
}

function isAttributeName(value: string): value is AttributeName {
  return (ATTRIBUTES as readonly string[]).includes(value)
}

/** Validates a single weapon record from data/weapons.json. Returns a list of problems (empty = valid). */
export function validateWeapon(w: Weapon): string[] {
  const problems: string[] = []
  if (!w.id) problems.push('missing id')
  if (!w.character) problems.push('missing character')
  if (!w.name) problems.push('missing name')
  for (const attr of ATTRIBUTES) {
    const grade = w.scaling[attr]
    if (grade !== null && !['S', 'A', 'B', 'C', 'D'].includes(grade)) {
      problems.push(`invalid scaling grade for ${attr}: ${String(grade)}`)
    }
  }
  if (w.maxPower !== null && (!Number.isFinite(w.maxPower) || w.maxPower < 0)) {
    problems.push('invalid maxPower')
  }
  return problems
}

export interface GameData {
  characters: NormalizedCharacter[]
  pictos: NormalizedPicto[]
  weapons: Weapon[]
  attributeProgression: typeof attributeProgressionData
  optimizerReference: typeof optimizerReferenceData
  /** Any data-quality issues discovered while loading, for surfacing in Settings rather than failing silently. */
  loadWarnings: string[]
}

let cached: GameData | null = null

export function loadGameData(): GameData {
  if (cached) return cached

  const loadWarnings: string[] = []

  const characters = (rawCharacters as RawCharacter[]).map(normalizeCharacter)

  const pictos = (rawPictos as RawPictoItem[]).map((raw, i) => {
    const normalized = normalizePicto(raw, i)
    if (!normalized.costValid) {
      loadWarnings.push(`Picto "${normalized.name}" had a malformed cost value; treated as 0 and flagged.`)
    }
    if (normalized.levels.length === 0) {
      loadWarnings.push(
        `Picto "${normalized.name}" has no attribute-level data in the source file; it still appears in Inventory but is excluded from Picto-equip scoring.`,
      )
    }
    return normalized
  })

  const weaponsRaw = (weaponsData as { weapons: Weapon[] }).weapons
  const weapons = weaponsRaw.filter((w) => {
    const problems = validateWeapon(w)
    if (problems.length > 0) {
      loadWarnings.push(`Weapon "${w.name ?? w.id}" skipped: ${problems.join('; ')}`)
      return false
    }
    // Guard against unknown attribute keys sneaking in from data edits.
    for (const key of Object.keys(w.scaling)) {
      if (!isAttributeName(key)) {
        loadWarnings.push(`Weapon "${w.name}" has unrecognized scaling attribute "${key}"`)
      }
    }
    return true
  })

  cached = {
    characters,
    pictos,
    weapons,
    attributeProgression: attributeProgressionData,
    optimizerReference: optimizerReferenceData,
    loadWarnings,
  }
  return cached
}

/** Test-only helper to bypass the module-level cache between test cases. */
export function _resetGameDataCacheForTests() {
  cached = null
}
