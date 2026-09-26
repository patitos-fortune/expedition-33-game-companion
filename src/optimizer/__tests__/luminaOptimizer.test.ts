import { describe, expect, it } from 'vitest'
import { suggestLuminaCombination } from '../luminaOptimizer'
import { getStrategyProfile } from '../modelConfig'
import type { NormalizedPicto } from '../../types'

function makeLumina(id: string, cost: number, type: string): NormalizedPicto {
  return {
    id,
    name: id,
    type,
    effect: 'test effect',
    fullUrl: '',
    cost,
    costValid: true,
    levels: [{ level: '1', attributes: {} }],
  }
}

describe('suggestLuminaCombination', () => {
  const luminas = [
    makeLumina('l1', 10, 'Offensive'),
    makeLumina('l2', 15, 'Offensive'),
    makeLumina('l3', 20, 'Defensive'),
    makeLumina('l4', 8, 'Support'),
    makeLumina('l5', 25, 'Offensive'),
  ]

  it('never exceeds the point budget', () => {
    const result = suggestLuminaCombination({
      unlockedLuminas: luminas,
      profile: getStrategyProfile('damage'),
      budget: 30,
      currentLuminaIds: [],
    })
    expect(result.totalCost).toBeLessThanOrEqual(30)
  })

  it('is deterministic for identical inputs', () => {
    const params = {
      unlockedLuminas: luminas,
      profile: getStrategyProfile('damage'),
      budget: 33,
      currentLuminaIds: [],
    }
    const a = suggestLuminaCombination(params)
    const b = suggestLuminaCombination(params)
    expect(a.suggestedLuminaIds).toEqual(b.suggestedLuminaIds)
    expect(a.totalCost).toBe(b.totalCost)
  })

  it('only ever suggests luminas from the unlocked list (spoiler-safety at this level)', () => {
    const result = suggestLuminaCombination({
      unlockedLuminas: luminas,
      profile: getStrategyProfile('balanced'),
      budget: 50,
      currentLuminaIds: [],
    })
    const unlockedIds = new Set(luminas.map((l) => l.id))
    for (const id of result.suggestedLuminaIds) {
      expect(unlockedIds.has(id)).toBe(true)
    }
  })

  it('finds a combination at least as good as taking the single cheapest item when budget allows more', () => {
    const result = suggestLuminaCombination({
      unlockedLuminas: luminas,
      profile: getStrategyProfile('balanced'),
      budget: 18,
      currentLuminaIds: [],
    })
    // budget 18 comfortably fits l1(10)+l4(8)=18, a strictly better combination
    // than any single item alone under a neutral profile.
    expect(result.totalCost).toBe(18)
    expect(result.suggestedLuminaIds.sort()).toEqual(['l1', 'l4'])
  })

  it('charges zero Lumina points for a learned passive supplied by an equipped Picto', () => {
    const result = suggestLuminaCombination({
      unlockedLuminas: luminas,
      profile: getStrategyProfile('balanced'),
      budget: 8,
      currentLuminaIds: ['l1', 'l4'],
      freePictoIds: ['l1'],
    })
    expect(result.suggestedLuminaIds).toContain('l1')
    expect(result.suggestedLuminaIds).toContain('l4')
    expect(result.totalCost).toBe(8)
  })

  it('can include an equipped Picto passive even when its normal Lumina cost exceeds the budget', () => {
    const result = suggestLuminaCombination({
      unlockedLuminas: luminas,
      profile: getStrategyProfile('balanced'),
      budget: 0,
      currentLuminaIds: [],
      freePictoIds: ['l2'],
    })
    expect(result.suggestedLuminaIds).toContain('l2')
    expect(result.totalCost).toBe(0)
  })

  it('returns an empty, valid result for a zero budget instead of throwing', () => {
    const result = suggestLuminaCombination({
      unlockedLuminas: luminas,
      profile: getStrategyProfile('balanced'),
      budget: 0,
      currentLuminaIds: [],
    })
    expect(result.suggestedLuminaIds).toEqual([])
    expect(result.totalCost).toBe(0)
  })

  it('handles an empty unlocked list gracefully', () => {
    const result = suggestLuminaCombination({
      unlockedLuminas: [],
      profile: getStrategyProfile('balanced'),
      budget: 50,
      currentLuminaIds: [],
    })
    expect(result.suggestedLuminaIds).toEqual([])
  })
})
