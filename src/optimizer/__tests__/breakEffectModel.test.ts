import { describe, expect, it } from 'vitest'
import { breakLuminaBonus, breakPictoBonus, breakRelevance } from '../breakEffectModel'
import { BREAK_EFFECT_LUMINA_BONUS_PER_SIGNAL, BREAK_EFFECT_PICTO_BONUS_PER_SIGNAL } from '../modelConfig'
import { pictoEffectsById } from '../effectModel'
import type { PictoEffectRecord } from '../../types'

function record(overrides: Partial<PictoEffectRecord>): PictoEffectRecord {
  return {
    pictoId: 'p',
    name: 'Test',
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

describe('breakRelevance', () => {
  it('returns zero signals for an undefined record', () => {
    expect(breakRelevance(undefined)).toEqual({ signalCount: 0, reasons: [] })
  })

  it('returns zero signals for a record with no Break-related tags', () => {
    const r = record({ mechanics: ['ap'], effects: ['gain_ap'] })
    expect(breakRelevance(r)).toEqual({ signalCount: 0, reasons: [] })
  })

  it('flags grant_break_capability on Base Attack distinctly from a generic grant', () => {
    const onBase = record({ effects: ['grant_break_capability'], triggers: ['on_base_attack'] })
    expect(breakRelevance(onBase).reasons).toContain('enables Break on Base Attack')

    const generic = record({ effects: ['grant_break_capability'] })
    expect(breakRelevance(generic).reasons).toContain('enables Break')
    expect(breakRelevance(generic).reasons).not.toContain('enables Break on Base Attack')
  })

  it('flags a Break-damage stat increase', () => {
    const r = record({ effects: ['increase_stat_pct:break_damage'] })
    expect(breakRelevance(r).reasons).toContain('increases Break damage')
  })

  it('flags an on_break trigger payoff', () => {
    const r = record({ triggers: ['on_break'] })
    expect(breakRelevance(r).reasons).toContain('triggers after Breaking an enemy')
  })

  it('flags benefiting from a Stunned target, via either the target tag or the stun mechanic', () => {
    expect(breakRelevance(record({ targets: ['stunned_enemy'] })).reasons).toContain(
      'benefits from a Stunned target (Stun commonly follows a Break)',
    )
    expect(breakRelevance(record({ mechanics: ['stun'] })).reasons).toContain(
      'benefits from a Stunned target (Stun commonly follows a Break)',
    )
  })

  it('falls back to a generic Break-mechanic reference only when no more specific signal matched', () => {
    const r = record({ mechanics: ['break'] })
    expect(breakRelevance(r).reasons).toEqual(['references the Break mechanic'])
  })

  it('does not add the generic fallback reason when a more specific Break signal already matched', () => {
    const r = record({ mechanics: ['break'], triggers: ['on_break'] })
    expect(breakRelevance(r).reasons).toEqual(['triggers after Breaking an enemy'])
  })

  it('accumulates multiple distinct signals for a Picto that matches several', () => {
    const r = record({
      effects: ['grant_break_capability', 'increase_stat_pct:break_damage'],
      triggers: ['on_base_attack', 'on_break'],
    })
    const relevance = breakRelevance(r)
    expect(relevance.signalCount).toBe(3)
    expect(relevance.reasons).toEqual([
      'enables Break on Base Attack',
      'increases Break damage',
      'triggers after Breaking an enemy',
    ])
  })

  it('is pure: the same record always yields the same relevance', () => {
    const r = record({ effects: ['grant_break_capability'], triggers: ['on_break'] })
    expect(breakRelevance(r)).toEqual(breakRelevance(r))
  })
})

describe('breakPictoBonus / breakLuminaBonus', () => {
  it('scale linearly with signal count using the documented per-signal constants', () => {
    const r = record({ effects: ['grant_break_capability', 'increase_stat_pct:break_damage'] })
    const signals = breakRelevance(r).signalCount
    expect(breakPictoBonus(r)).toBe(signals * BREAK_EFFECT_PICTO_BONUS_PER_SIGNAL)
    expect(breakLuminaBonus(r)).toBe(signals * BREAK_EFFECT_LUMINA_BONUS_PER_SIGNAL)
  })

  it('is zero for an undefined record', () => {
    expect(breakPictoBonus(undefined)).toBe(0)
    expect(breakLuminaBonus(undefined)).toBe(0)
  })
})

describe('breakRelevance against the real corpus', () => {
  it('Breaking Attack: grants Break specifically via Base Attack', () => {
    const record = pictoEffectsById().get('picto-32') // Breaking Attack
    expect(record?.name).toBe('Breaking Attack')
    expect(breakRelevance(record).reasons).toContain('enables Break on Base Attack')
  })

  it('Sniper: grants Break via a Free Aim shot (not Base Attack) and boosts damage', () => {
    const record = pictoEffectsById().get('picto-193') // Sniper
    expect(record?.name).toBe('Sniper')
    const relevance = breakRelevance(record)
    expect(relevance.reasons).toContain('enables Break')
    expect(relevance.reasons).not.toContain('enables Break on Base Attack')
  })
})
