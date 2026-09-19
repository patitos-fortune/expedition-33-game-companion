import { describe, expect, it } from 'vitest'
import { suggestAttributeAllocation } from '../attributeOptimizer'
import { getStrategyProfile } from '../modelConfig'
import type { AttributeName, ScalingGrade } from '../../types'

const even = (n: number): Record<AttributeName, number> => ({
  Vitality: n,
  Might: n,
  Agility: n,
  Defense: n,
  Luck: n,
})

const scaling = (v: Partial<Record<AttributeName, ScalingGrade | null>>): Record<AttributeName, ScalingGrade | null> => ({
  Vitality: null,
  Might: null,
  Agility: null,
  Defense: null,
  Luck: null,
  ...v,
})

describe('suggestAttributeAllocation', () => {
  it('is deterministic for identical inputs', () => {
    const params = {
      budget: 100,
      currentAllocation: even(20),
      weaponScaling: scaling({ Agility: 'S' as const, Luck: 'A' as const }),
      profile: getStrategyProfile('damage'),
    }
    const first = suggestAttributeAllocation(params)
    const second = suggestAttributeAllocation(params)
    expect(second.suggested).toEqual(first.suggested)
    expect(second.summary).toBe(first.summary)
  })

  it('never suggests spending more than the budget', () => {
    const result = suggestAttributeAllocation({
      budget: 47,
      currentAllocation: even(9),
      weaponScaling: scaling({ Vitality: 'S' as const }),
      profile: getStrategyProfile('balanced'),
    })
    const total = Object.values(result.suggested).reduce((a, b) => a + b, 0)
    expect(total).toBeLessThanOrEqual(47)
    expect(total).toBeGreaterThan(0)
  })

  it('prioritizes an attribute the weapon scales S over one it does not scale, under a neutral profile', () => {
    const result = suggestAttributeAllocation({
      budget: 100,
      currentAllocation: even(20),
      weaponScaling: scaling({ Agility: 'S' as const }),
      profile: getStrategyProfile('balanced'),
    })
    expect(result.suggested.Agility).toBeGreaterThan(result.suggested.Vitality)
  })

  it('flags an even current allocation as roughly even (calculated fact)', () => {
    const result = suggestAttributeAllocation({
      budget: 100,
      currentAllocation: even(20),
      weaponScaling: scaling({ Agility: 'S' as const, Luck: 'A' as const }),
      profile: getStrategyProfile('damage'),
    })
    expect(result.calculated.isCurrentRoughlyEven).toBe(true)
    // and the suggestion should differ meaningfully from a flat split given strong scaling + profile tilt
    expect(result.suggested.Agility).not.toBe(result.suggested.Defense)
  })

  it('never reduces every attribute to zero (floor guardrail)', () => {
    const result = suggestAttributeAllocation({
      budget: 100,
      currentAllocation: even(20),
      weaponScaling: scaling({ Agility: 'S' as const }),
      profile: getStrategyProfile('damage'),
    })
    for (const attr of Object.keys(result.suggested) as AttributeName[]) {
      expect(result.suggested[attr]).toBeGreaterThan(0)
    }
  })

  it('handles a zero budget without throwing and suggests nothing', () => {
    const result = suggestAttributeAllocation({
      budget: 0,
      currentAllocation: even(0),
      weaponScaling: null,
      profile: getStrategyProfile('balanced'),
    })
    expect(Object.values(result.suggested).every((v) => v === 0)).toBe(true)
  })

  it('handles a missing weapon (null scaling) without throwing', () => {
    const result = suggestAttributeAllocation({
      budget: 30,
      currentAllocation: even(6),
      weaponScaling: null,
      profile: getStrategyProfile('defensive'),
    })
    expect(result.suggested.Vitality).toBeGreaterThanOrEqual(result.suggested.Might)
  })
})
