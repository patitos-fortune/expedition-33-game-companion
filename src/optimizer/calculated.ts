/**
 * CALCULATED tier: facts derived directly and deterministically from the
 * user's input and known constraints, with no heuristic judgement involved.
 * Every function here is pure and side-effect free so it stays independently
 * testable and reusable outside of Vue.
 */
import type { AttributeName, NormalizedPicto } from '../types'
import { ATTRIBUTES } from '../types'

export function pointsSpent(allocation: Record<AttributeName, number>): number {
  return ATTRIBUTES.reduce((sum, attr) => sum + (allocation[attr] ?? 0), 0)
}

export function pointsRemaining(budget: number, allocation: Record<AttributeName, number>): number {
  return budget - pointsSpent(allocation)
}

export interface AllocationValidity {
  valid: boolean
  reasons: string[]
}

/** Validates an attribute allocation against its budget: no negatives, no overspend, integers only. */
export function validateAllocation(
  budget: number,
  allocation: Record<AttributeName, number>,
): AllocationValidity {
  const reasons: string[] = []
  if (!Number.isFinite(budget) || budget < 0) {
    reasons.push('Budget must be a non-negative number.')
  }
  for (const attr of ATTRIBUTES) {
    const v = allocation[attr]
    if (!Number.isFinite(v)) {
      reasons.push(`${attr} allocation must be a number.`)
    } else if (v < 0) {
      reasons.push(`${attr} allocation cannot be negative.`)
    } else if (!Number.isInteger(v)) {
      reasons.push(`${attr} allocation must be a whole number.`)
    }
  }
  if (reasons.length === 0 && pointsSpent(allocation) > budget) {
    reasons.push(`Allocation spends ${pointsSpent(allocation)} points but only ${budget} are available.`)
  }
  return { valid: reasons.length === 0, reasons }
}

/**
 * Whether an allocation is "roughly even" across all five attributes — a
 * purely statistical/calculated property of the numbers themselves, with no
 * strategy or weapon judgement involved. Used to flag the "I spread my points
 * evenly, is that inefficient?" case before the heuristic layer suggests a fix.
 */
export function isRoughlyEvenSpread(
  allocation: Record<AttributeName, number>,
  toleranceRatio = 0.15,
): boolean {
  const values = ATTRIBUTES.map((a) => allocation[a] ?? 0)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const total = values.reduce((a, b) => a + b, 0)
  if (total === 0) return true
  const avg = total / values.length
  if (avg === 0) return true
  return (max - min) / avg <= toleranceRatio
}

export function luminaCostTotal(luminaIds: string[], pictosById: Map<string, NormalizedPicto>): number {
  return luminaIds.reduce((sum, id) => {
    const p = pictosById.get(id)
    return sum + (p ? p.cost : 0)
  }, 0)
}

export function isWithinLuminaBudget(
  luminaIds: string[],
  pictosById: Map<string, NormalizedPicto>,
  budget: number,
): boolean {
  return luminaCostTotal(luminaIds, pictosById) <= budget
}

export function toPictosById(pictos: NormalizedPicto[]): Map<string, NormalizedPicto> {
  return new Map(pictos.map((p) => [p.id, p]))
}
