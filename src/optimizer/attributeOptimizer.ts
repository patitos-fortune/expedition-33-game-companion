/**
 * HEURISTIC tier: attribute point allocation.
 *
 * Produces a suggested allocation of a fixed point budget across the five
 * attributes, given the equipped weapon's scaling grades (if any) and the
 * selected strategy profile's weights. This deliberately does NOT attempt to
 * compute an exact damage/DPS number — see OPTIMIZER_MODEL.md for why no
 * verified formula exists to do that. It only ever compares relative
 * priority between attributes and explains why.
 */
import type { AttributeName, ScalingGrade, StrategyProfile } from '../types'
import { ATTRIBUTES } from '../types'
import { ATTRIBUTE_ALLOCATION_FLOOR_RATIO, scalingGradeWeight } from './modelConfig'
import { isRoughlyEvenSpread, pointsRemaining, pointsSpent, validateAllocation } from './calculated'
import type { AllocationValidity } from './calculated'

export interface AttributeAllocationSuggestion {
  suggested: Record<AttributeName, number>
  current: Record<AttributeName, number>
  delta: Record<AttributeName, number>
  combinedWeight: Record<AttributeName, number>
  reasons: Record<AttributeName, string>
  summary: string
  calculated: {
    budget: number
    pointsSpentCurrent: number
    pointsRemainingCurrent: number
    isCurrentRoughlyEven: boolean
    allocationValidity: AllocationValidity
  }
}

function zeroRecord(): Record<AttributeName, number> {
  return { Vitality: 0, Might: 0, Agility: 0, Defense: 0, Luck: 0 }
}

/** Deterministic largest-remainder distribution of `total` points across weighted buckets. */
function distributeByWeight(total: number, weights: Record<AttributeName, number>): Record<AttributeName, number> {
  const totalWeight = ATTRIBUTES.reduce((s, a) => s + weights[a], 0)
  const result = zeroRecord()
  if (total <= 0 || totalWeight <= 0) return result

  const raw = ATTRIBUTES.map((a) => ({ attr: a, value: (total * weights[a]) / totalWeight }))
  let flooredSum = 0
  for (const { attr, value } of raw) {
    result[attr] = Math.floor(value)
    flooredSum += result[attr]
  }
  let remainder = total - flooredSum
  // Give remaining points to the attributes with the largest fractional part,
  // breaking ties by fixed attribute order (Vitality, Might, Agility, Defense, Luck)
  // so the result is fully deterministic for identical inputs.
  const byFraction = [...raw]
    .map(({ attr, value }) => ({ attr, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || ATTRIBUTES.indexOf(a.attr) - ATTRIBUTES.indexOf(b.attr))
  for (const { attr } of byFraction) {
    if (remainder <= 0) break
    result[attr] += 1
    remainder -= 1
  }
  return result
}

function reasonFor(
  attr: AttributeName,
  grade: ScalingGrade | null | undefined,
  profile: StrategyProfile,
  suggested: number,
  current: number,
): string {
  const gradeText = grade ? `the equipped weapon scales ${grade} with ${attr}` : `the equipped weapon does not scale ${attr}`
  const profileWeight = profile.attributeWeights[attr]
  const profileText =
    profileWeight === 1
      ? `the ${profile.label} strategy treats it as baseline priority`
      : profileWeight > 1
        ? `the ${profile.label} strategy favors it (weight ×${profileWeight})`
        : `the ${profile.label} strategy deprioritizes it (weight ×${profileWeight})`
  const deltaText =
    suggested === current
      ? `no change from your current ${current}`
      : `suggested ${suggested} vs current ${current} (${suggested > current ? '+' : ''}${suggested - current})`
  return `${gradeText}; ${profileText}. ${deltaText}.`
}

export function suggestAttributeAllocation(params: {
  budget: number
  currentAllocation: Record<AttributeName, number>
  weaponScaling: Record<AttributeName, ScalingGrade | null> | null
  profile: StrategyProfile
}): AttributeAllocationSuggestion {
  const { budget, currentAllocation, weaponScaling, profile } = params

  const combinedWeight = zeroRecord()
  for (const attr of ATTRIBUTES) {
    const grade = weaponScaling ? weaponScaling[attr] : null
    combinedWeight[attr] = profile.attributeWeights[attr] * (1 + scalingGradeWeight(grade) / 5)
  }

  const safeBudget = Number.isFinite(budget) && budget > 0 ? Math.floor(budget) : 0
  const floorTotal = Math.floor(safeBudget * ATTRIBUTE_ALLOCATION_FLOOR_RATIO)
  const floorEach = Math.floor(floorTotal / ATTRIBUTES.length)
  const floorAllocated = floorEach * ATTRIBUTES.length
  const weighted = distributeByWeight(safeBudget - floorAllocated, combinedWeight)

  const suggested = zeroRecord()
  for (const attr of ATTRIBUTES) {
    suggested[attr] = floorEach + weighted[attr]
  }

  const delta = zeroRecord()
  const reasons: Record<AttributeName, string> = { Vitality: '', Might: '', Agility: '', Defense: '', Luck: '' }
  for (const attr of ATTRIBUTES) {
    delta[attr] = suggested[attr] - (currentAllocation[attr] ?? 0)
    reasons[attr] = reasonFor(
      attr,
      weaponScaling ? weaponScaling[attr] : null,
      profile,
      suggested[attr],
      currentAllocation[attr] ?? 0,
    )
  }

  const gainers = ATTRIBUTES.filter((a) => delta[a] > 0).sort((a, b) => delta[b] - delta[a])
  const losers = ATTRIBUTES.filter((a) => delta[a] < 0).sort((a, b) => delta[a] - delta[b])
  let summary: string
  if (gainers.length === 0 && losers.length === 0) {
    summary = 'Your current allocation already matches this suggestion under the selected strategy and weapon.'
  } else {
    const gainText = gainers.slice(0, 2).join(' and ')
    const loseText = losers.slice(0, 2).join(' and ')
    summary = [
      gainText ? `Prioritize ${gainText} more` : null,
      loseText ? `reduce ${loseText}` : null,
    ]
      .filter(Boolean)
      .join(', ') + '.'
  }

  return {
    suggested,
    current: { ...currentAllocation },
    delta,
    combinedWeight,
    reasons,
    summary,
    calculated: {
      budget: safeBudget,
      pointsSpentCurrent: pointsSpent(currentAllocation),
      pointsRemainingCurrent: pointsRemaining(safeBudget, currentAllocation),
      isCurrentRoughlyEven: isRoughlyEvenSpread(currentAllocation),
      allocationValidity: validateAllocation(safeBudget, currentAllocation),
    },
  }
}
