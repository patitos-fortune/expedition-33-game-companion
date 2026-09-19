/**
 * Central, documented configuration for every heuristic weight the optimizer
 * uses. The actual numbers live in data/optimizer_reference.json (edit that
 * file to retune recommendations without touching code) — this module just
 * gives them types and a couple of derived lookups.
 *
 * Everything here is HEURISTIC / ASSUMPTION tier (see OPTIMIZER_MODEL.md).
 * None of it is a verified game formula.
 */
import optimizerReferenceData from '../../data/optimizer_reference.json'
import type { AttributeName, ScalingGrade, StrategyProfile, StrategyProfileKey } from '../types'
import { ATTRIBUTES } from '../types'

const ref = optimizerReferenceData

export const SCALING_GRADE_WEIGHT: Record<ScalingGrade, number> = {
  S: ref.scalingGradeWeight.S,
  A: ref.scalingGradeWeight.A,
  B: ref.scalingGradeWeight.B,
  C: ref.scalingGradeWeight.C,
  D: ref.scalingGradeWeight.D,
}
export const SCALING_GRADE_WEIGHT_UNSCORED = ref.scalingGradeWeight.unscored

export function scalingGradeWeight(grade: ScalingGrade | null | undefined): number {
  if (!grade) return SCALING_GRADE_WEIGHT_UNSCORED
  return SCALING_GRADE_WEIGHT[grade] ?? SCALING_GRADE_WEIGHT_UNSCORED
}

export const ATTRIBUTE_ALLOCATION_FLOOR_RATIO = ref.attributeAllocationFloorRatio.value

const PICTO_STAT_REFERENCE_SCALE = ref.pictoStatReferenceScale as Record<string, number | string>

/** Divisor used to normalize a Picto stat's raw value before applying strategy weight (see data/optimizer_reference.json). */
export function pictoStatReferenceScale(stat: string): number {
  const v = PICTO_STAT_REFERENCE_SCALE[stat]
  return typeof v === 'number' && v > 0 ? v : 1
}

export const STRATEGY_PROFILE_KEYS = Object.keys(ref.strategyProfiles) as StrategyProfileKey[]

export function getStrategyProfile(key: StrategyProfileKey): StrategyProfile {
  const p = (ref.strategyProfiles as Record<string, any>)[key]
  if (!p) {
    throw new Error(`Unknown strategy profile: ${key}`)
  }
  return {
    key,
    label: p.label,
    description: p.description,
    attributeWeights: p.attributeWeights as Record<AttributeName, number>,
    pictoStatWeights: p.pictoStatWeights as Record<string, number>,
    luminaTypeWeights: p.luminaTypeWeights as Record<string, number>,
  }
}

export function listStrategyProfiles(): StrategyProfile[] {
  return STRATEGY_PROFILE_KEYS.map(getStrategyProfile)
}

export const GENERIC_WEAPON_SCALING_THRESHOLD_LEVELS = ref.genericWeaponScalingThresholdLevels.value

export const OPTIMIZER_KNOWN_UNKNOWNS: string[] = ref.knownUnknowns

/** Splits a possibly-combined Picto "type" (e.g. "Defensive / Support") into its component categories. */
export function splitPictoTypeCategories(type: string): string[] {
  return type
    .split('/')
    .map((t) => t.trim())
    .filter(Boolean)
}

/** Average lumina-type weight for a (possibly combined) Picto type, under a strategy profile. */
export function luminaTypeWeightFor(type: string, profile: StrategyProfile): number {
  const categories = splitPictoTypeCategories(type)
  if (categories.length === 0) return 1
  const weights = categories.map((c) => profile.luminaTypeWeights[c] ?? 1)
  return weights.reduce((a, b) => a + b, 0) / weights.length
}

export { ATTRIBUTES }
