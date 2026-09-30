import { describe, expect, it } from 'vitest'
import { suggestLuminaCombination } from '../luminaOptimizer'
import { getStrategyProfile } from '../modelConfig'
import type { NormalizedPicto, PictoEffectRecord } from '../../types'

function makeEffectRecord(pictoId: string, overrides: Partial<PictoEffectRecord>): PictoEffectRecord {
  return {
    pictoId,
    name: pictoId,
    sourceEffectText: '',
    mechanics: [],
    triggers: [],
    effects: [],
    targets: [],
    parameters: {},
    classification: 'A',
    taxonomyVersion: 1,
    ...overrides,
  }
}

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

  describe('Phase 2.2A: Break-only structured-effect scoring', () => {
    it('produces IDENTICAL suggestions for every non-Break profile whether or not pictoEffectsById is supplied', () => {
      const pictoEffectsById = new Map<string, PictoEffectRecord>([
        ['l3', makeEffectRecord('l3', { effects: ['grant_break_capability'], mechanics: ['break'] })],
      ])
      for (const key of ['balanced', 'damage', 'defensive', 'status_burn', 'custom'] as const) {
        const profile = getStrategyProfile(key)
        const without = suggestLuminaCombination({ unlockedLuminas: luminas, profile, budget: 30, currentLuminaIds: [] })
        const withEffects = suggestLuminaCombination({
          unlockedLuminas: luminas,
          profile,
          budget: 30,
          currentLuminaIds: [],
          pictoEffectsById,
        })
        expect(withEffects.suggestedLuminaIds).toEqual(without.suggestedLuminaIds)
        expect(withEffects.totalValue).toBe(without.totalValue)
      }
    })

    it('under the Break profile, a Lumina with Break-relevant structured tags is preferred within a tight budget', () => {
      const plain = makeLumina('plain', 10, 'Offensive')
      const breaker = makeLumina('breaker', 10, 'Offensive')
      const pictoEffectsById = new Map<string, PictoEffectRecord>([
        ['breaker', makeEffectRecord('breaker', { effects: ['grant_break_capability'], triggers: ['on_base_attack'] })],
      ])
      const result = suggestLuminaCombination({
        unlockedLuminas: [plain, breaker],
        profile: getStrategyProfile('break'),
        budget: 10,
        currentLuminaIds: [],
        pictoEffectsById,
      })
      expect(result.suggestedLuminaIds).toEqual(['breaker'])
      expect(result.reasons['breaker']).toContain('enables Break on Base Attack')
    })

    it('the Break bonus is inert without a matching structured record, even under the Break profile', () => {
      const result = suggestLuminaCombination({
        unlockedLuminas: luminas,
        profile: getStrategyProfile('break'),
        budget: 30,
        currentLuminaIds: [],
        pictoEffectsById: new Map(),
      })
      const baseline = suggestLuminaCombination({
        unlockedLuminas: luminas,
        profile: getStrategyProfile('break'),
        budget: 30,
        currentLuminaIds: [],
      })
      expect(result.suggestedLuminaIds).toEqual(baseline.suggestedLuminaIds)
      expect(result.totalValue).toBe(baseline.totalValue)
    })
  })
})
