/**
 * HEURISTIC tier: which unlocked Luminas to activate within a Lumina-point
 * budget. This is modeled as a genuine constrained optimization (0/1
 * knapsack: maximize total heuristic value subject to SUM(cost) <= budget),
 * not a simple sort.
 *
 * Value is scored from each Picto's `type` category (Offensive/Defensive/
 * Support) weighted by the selected strategy profile. It deliberately does
 * NOT use the Picto's attribute-bonus table: whether an unlocked Lumina also
 * grants that table (as opposed to only its Picto form doing so) is
 * unverified — see OPTIMIZER_MODEL.md / data/optimizer_reference.json
 * knownUnknowns. Scoring only by the documented `type` field avoids
 * conflating two mechanics that may not both apply.
 */
import type { NormalizedPicto, PictoEffectRecord, StrategyProfile } from '../types'
import { luminaTypeWeightFor } from './modelConfig'
import { breakLuminaBonus, breakRelevance } from './breakEffectModel'
import { statusBurnLuminaBonus, statusBurnRelevance } from './statusBurnEffectModel'

export interface LuminaCombinationSuggestion {
  suggestedLuminaIds: string[]
  currentLuminaIds: string[]
  totalCost: number
  budget: number
  totalValue: number
  additions: string[]
  removals: string[]
  reasons: Record<string, string>
  summary: string
  /** True if solved exactly via dynamic programming; false if the budget was too large and a greedy approximation was used instead (always disclosed). */
  isExactSolution: boolean
}

const VALUE_SCALE = 100
// Above this budget, exact 0/1 knapsack DP (O(items * budget)) is skipped in
// favor of a greedy value/cost ratio approximation, to keep the UI responsive.
const MAX_BUDGET_FOR_EXACT_DP = 2000

function valueOf(picto: NormalizedPicto, profile: StrategyProfile, pictoEffectsById?: Map<string, PictoEffectRecord>): number {
  let value = Math.round(luminaTypeWeightFor(picto.type, profile) * VALUE_SCALE)
  // Phase 2.2A: ONLY the 'break' profile consults structured effect tags.
  // Every other profile's value is computed identically to Phase 2.1.
  if (profile.key === 'break' && pictoEffectsById) {
    value += breakLuminaBonus(pictoEffectsById.get(picto.id))
  }
  // Phase 2.2B: ONLY the 'status_burn' profile ("Burn / Mark") consults
  // structured Burn/Mark effect tags. Every other profile — Break included —
  // is unaffected.
  if (profile.key === 'status_burn' && pictoEffectsById) {
    value += statusBurnLuminaBonus(pictoEffectsById.get(picto.id))
  }
  return value
}

function knapsackExact(
  items: Array<{ id: string; cost: number; value: number }>,
  budget: number,
): { chosenIds: string[]; totalValue: number } {
  const n = items.length
  // dp[c] = best value achievable with capacity c, using items processed so far.
  const dp: number[] = new Array(budget + 1).fill(0)
  // keep[i][c] = whether item i was taken to reach dp[c] at that stage (reconstructed via a full table).
  const take: Uint8Array[] = Array.from({ length: n }, () => new Uint8Array(budget + 1))

  for (let i = 0; i < n; i++) {
    const { cost, value } = items[i]
    for (let c = budget; c >= 0; c--) {
      if (cost <= c && dp[c - cost] + value > dp[c]) {
        dp[c] = dp[c - cost] + value
        take[i][c] = 1
      }
    }
  }

  // Reconstruct: walk backwards through capacities to find which items were taken.
  const chosenIds: string[] = []
  let c = budget
  for (let i = n - 1; i >= 0; i--) {
    if (take[i][c] === 1) {
      chosenIds.push(items[i].id)
      c -= items[i].cost
    }
  }
  return { chosenIds: chosenIds.reverse(), totalValue: dp[budget] }
}

function knapsackGreedyApprox(
  items: Array<{ id: string; cost: number; value: number }>,
  budget: number,
): { chosenIds: string[]; totalValue: number } {
  const byRatio = [...items]
    .filter((i) => i.cost > 0)
    .sort((a, b) => b.value / b.cost - a.value / a.cost || a.id.localeCompare(b.id))
  let remaining = budget
  let totalValue = 0
  const chosenIds: string[] = []
  for (const item of byRatio) {
    if (item.cost <= remaining) {
      chosenIds.push(item.id)
      remaining -= item.cost
      totalValue += item.value
    }
  }
  return { chosenIds, totalValue }
}

export function suggestLuminaCombination(params: {
  unlockedLuminas: NormalizedPicto[]
  profile: StrategyProfile
  budget: number
  currentLuminaIds: string[]
  /** Passives supplied by equipped Pictos consume no Lumina-point capacity. */
  freePictoIds?: string[]
  /** Structured effect data, consulted only when profile.key === 'break' (Phase 2.2A) or 'status_burn' (Phase 2.2B). */
  pictoEffectsById?: Map<string, PictoEffectRecord>
}): LuminaCombinationSuggestion {
  const { unlockedLuminas, profile, currentLuminaIds, pictoEffectsById } = params
  const freePictoIds = new Set(params.freePictoIds ?? [])
  const budget = Number.isFinite(params.budget) && params.budget > 0 ? Math.floor(params.budget) : 0

  const freeItems = unlockedLuminas
    .filter((p) => freePictoIds.has(p.id))
    .map((p) => ({ id: p.id, cost: 0, value: valueOf(p, profile, pictoEffectsById) }))
  const paidItems = unlockedLuminas
    .filter((p) => !freePictoIds.has(p.id) && p.cost > 0 && p.cost <= budget)
    .map((p) => ({ id: p.id, cost: p.cost, value: valueOf(p, profile, pictoEffectsById) }))
  const isExactSolution = budget <= MAX_BUDGET_FOR_EXACT_DP
  const freeValue = freeItems.reduce((sum, item) => sum + item.value, 0)
  const paidResult =
    budget === 0 || paidItems.length === 0
      ? { chosenIds: [] as string[], totalValue: 0 }
      : isExactSolution
        ? knapsackExact(paidItems, budget)
        : knapsackGreedyApprox(paidItems, budget)
  const chosenIds = [...freeItems.map((item) => item.id), ...paidResult.chosenIds]
  const totalValue = freeValue + paidResult.totalValue

  const pictoById = new Map(unlockedLuminas.map((p) => [p.id, p]))
  const suggestedSet = new Set(chosenIds)
  const currentSet = new Set(currentLuminaIds)
  const additions = chosenIds.filter((id) => !currentSet.has(id))
  const removals = currentLuminaIds.filter((id) => !suggestedSet.has(id))
  const totalCost = chosenIds.reduce(
    (sum, id) => sum + (freePictoIds.has(id) ? 0 : (pictoById.get(id)?.cost ?? 0)),
    0,
  )

  const reasons: Record<string, string> = {}
  for (const id of chosenIds) {
    const p = pictoById.get(id)
    if (p) {
      // Phase 2.2A/2.2B: ONLY the matching profile appends structured-effect
      // reasons; at most one of these is ever non-empty for a given profile.
      const breakReasons = profile.key === 'break' ? breakRelevance(pictoEffectsById?.get(id)).reasons : []
      const statusBurnReasons = profile.key === 'status_burn' ? statusBurnRelevance(pictoEffectsById?.get(id)).reasons : []
      const extraReasons = [...breakReasons, ...statusBurnReasons]
      const extraSuffix = extraReasons.length > 0 ? ` Also: ${extraReasons.join('; ')}.` : ''
      reasons[id] = `"${p.name}" (${p.type}, ${freePictoIds.has(id) ? '0 Lumina points because its Picto is equipped' : `cost ${p.cost}`}) matches the ${profile.label} profile's Lumina-type priorities.${extraSuffix}`
    }
  }
  for (const id of removals) {
    const p = pictoById.get(id)
    if (p) {
      reasons[id] = `"${p.name}" (${p.type}, cost ${p.cost}) did not make the highest-scoring combination within budget under the ${profile.label} profile.`
    }
  }

  const summary =
    additions.length === 0 && removals.length === 0
      ? `Your current Lumina selection already matches the highest-scoring combination found (${totalCost}/${budget} points used).`
      : `Suggested combination uses ${totalCost}/${budget} available Lumina points${isExactSolution ? '' : ' (approximate solution — budget too large for an exact search)'}.`

  return {
    suggestedLuminaIds: chosenIds,
    currentLuminaIds: [...currentLuminaIds],
    totalCost,
    budget,
    totalValue,
    additions,
    removals,
    reasons,
    summary,
    isExactSolution,
  }
}
