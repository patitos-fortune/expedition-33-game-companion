import { describe, expect, it } from 'vitest'
import { statusBurnLuminaBonus, statusBurnPictoBonus, statusBurnRelevance } from '../statusBurnEffectModel'
import { BURN_MARK_EFFECT_LUMINA_BONUS_PER_SIGNAL, BURN_MARK_EFFECT_PICTO_BONUS_PER_SIGNAL } from '../modelConfig'
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

describe('statusBurnRelevance', () => {
  it('returns zero signals for an undefined record', () => {
    expect(statusBurnRelevance(undefined)).toEqual({ signalCount: 0, reasons: [] })
  })

  it('returns zero signals for a record with no Burn/Mark-related tags', () => {
    const r = record({ mechanics: ['ap'], effects: ['gain_ap'] })
    expect(statusBurnRelevance(r)).toEqual({ signalCount: 0, reasons: [] })
  })

  // Signal A: Burn producer
  it('flags a Burn producer', () => {
    const r = record({ effects: ['apply_status:burn'] })
    expect(statusBurnRelevance(r)).toEqual({ signalCount: 1, reasons: ['applies Burn'] })
  })

  // Signal B: Burn consumer/payoff, three distinct sub-signals
  it('flags a Burn consumer via the burning_enemy target', () => {
    const r = record({ targets: ['burning_enemy'] })
    expect(statusBurnRelevance(r)).toEqual({ signalCount: 1, reasons: ['benefits from Burning enemies'] })
  })

  it('flags a Burn-duration consumer', () => {
    const r = record({ effects: ['extend_status_duration:burn'] })
    expect(statusBurnRelevance(r)).toEqual({ signalCount: 1, reasons: ['extends Burn duration'] })
  })

  it('flags a Burn-amplifying consumer', () => {
    const r = record({ effects: ['multiply_stat:its_burn_amount'] })
    expect(statusBurnRelevance(r)).toEqual({ signalCount: 1, reasons: ['amplifies existing Burn'] })
  })

  // Signal C: Mark producer
  it('flags a Mark producer', () => {
    const r = record({ effects: ['apply_status:mark'] })
    expect(statusBurnRelevance(r)).toEqual({ signalCount: 1, reasons: ['applies Mark'] })
  })

  // Signal D: Mark consumer/payoff
  it('flags a Mark consumer via the marked_enemy target', () => {
    const r = record({ targets: ['marked_enemy'] })
    expect(statusBurnRelevance(r)).toEqual({ signalCount: 1, reasons: ['benefits from Marked enemies'] })
  })

  it('a record that is both a Mark producer and a Mark consumer (Stay Marked-style) gets both non-redundant reasons', () => {
    const r = record({ effects: ['apply_status:mark'], targets: ['marked_enemy'] })
    expect(statusBurnRelevance(r)).toEqual({ signalCount: 2, reasons: ['benefits from Marked enemies', 'applies Mark'] })
  })

  // Signal E: Mark -> Burn bridge — supersedes the redundant generic A + D wording
  it('Mark->Burn bridge: a record that is both a Burn producer and a Mark consumer gets ONE factual bridge reason, not three', () => {
    const r = record({ effects: ['apply_status:burn'], targets: ['marked_enemy'] })
    const relevance = statusBurnRelevance(r)
    expect(relevance.reasons).toEqual(['applies Burn when hitting a Marked enemy'])
    expect(relevance.reasons).not.toContain('applies Burn')
    expect(relevance.reasons).not.toContain('benefits from Marked enemies')
    expect(relevance.signalCount).toBe(1)
  })

  it('the bridge reason still combines with an independent Burn-consumer signal (two distinct facts, not a restatement)', () => {
    const r = record({ effects: ['apply_status:burn'], targets: ['marked_enemy', 'burning_enemy'] })
    const relevance = statusBurnRelevance(r)
    expect(relevance.reasons).toEqual(['applies Burn when hitting a Marked enemy', 'benefits from Burning enemies'])
  })

  it('accumulates multiple distinct non-overlapping signals', () => {
    const r = record({
      effects: ['apply_status:burn', 'extend_status_duration:burn'],
      targets: ['burning_enemy'],
    })
    const relevance = statusBurnRelevance(r)
    expect(relevance.signalCount).toBe(3)
    expect(relevance.reasons).toEqual(['applies Burn', 'benefits from Burning enemies', 'extends Burn duration'])
  })

  it('is pure: the same record always yields the same relevance', () => {
    const r = record({ effects: ['apply_status:burn'], targets: ['marked_enemy'] })
    expect(statusBurnRelevance(r)).toEqual(statusBurnRelevance(r))
  })

  // Explicit exclusions (mirrors the post-2.2A Stun/Break correction) —
  // "mentions a status mechanic" must never imply Burn/Mark relevance.
  it('does NOT credit the generic status_effect mechanic on its own', () => {
    const r = record({ mechanics: ['status_effect'], effects: ['gain_ap'] })
    expect(statusBurnRelevance(r)).toEqual({ signalCount: 0, reasons: [] })
  })

  it.each(['stun', 'shell', 'powerful', 'regen', 'slow', 'defenceless', 'powerless', 'charm', 'blight', 'freeze', 'inverted'])(
    'does NOT credit the unrelated named status "%s" on its own',
    (status) => {
      const r = record({ mechanics: [status], effects: [`apply_status:${status}`] })
      expect(statusBurnRelevance(r)).toEqual({ signalCount: 0, reasons: [] })
    },
  )

  it('Anti-Burn-style immunity (mentions burn, grants no Burn/Mark producer or consumer signal) scores zero', () => {
    const r = record({ mechanics: ['burn'], effects: ['grant_immunity:burn'] })
    expect(statusBurnRelevance(r)).toEqual({ signalCount: 0, reasons: [] })
  })
})

describe('statusBurnPictoBonus / statusBurnLuminaBonus', () => {
  it('scale linearly with signal count using the documented per-signal constants', () => {
    const r = record({ effects: ['apply_status:burn'], targets: ['marked_enemy', 'burning_enemy'] })
    const signals = statusBurnRelevance(r).signalCount
    expect(statusBurnPictoBonus(r)).toBe(signals * BURN_MARK_EFFECT_PICTO_BONUS_PER_SIGNAL)
    expect(statusBurnLuminaBonus(r)).toBe(signals * BURN_MARK_EFFECT_LUMINA_BONUS_PER_SIGNAL)
  })

  it('is zero for an undefined record', () => {
    expect(statusBurnPictoBonus(undefined)).toBe(0)
    expect(statusBurnLuminaBonus(undefined)).toBe(0)
  })
})

describe('statusBurnRelevance against the real corpus', () => {
  it('Burning Mark: the canonical Mark->Burn bridge', () => {
    const r = pictoEffectsById().get('picto-39')
    expect(r?.name).toBe('Burning Mark')
    expect(statusBurnRelevance(r).reasons).toEqual(['applies Burn when hitting a Marked enemy'])
  })

  it('Breaking Burn: a Burn consumer (benefits from Burning enemies)', () => {
    const byName = [...pictoEffectsById().values()].find((rec) => rec.name === 'Breaking Burn')
    expect(byName).toBeDefined()
    expect(statusBurnRelevance(byName).reasons).toEqual(['benefits from Burning enemies'])
  })

  it('Burning Break: a Burn producer', () => {
    const byName = [...pictoEffectsById().values()].find((rec) => rec.name === 'Burning Break')
    expect(byName).toBeDefined()
    expect(statusBurnRelevance(byName).reasons).toEqual(['applies Burn'])
  })

  it('Marking Shots: a Mark producer', () => {
    const byName = [...pictoEffectsById().values()].find((rec) => rec.name === 'Marking Shots')
    expect(byName).toBeDefined()
    expect(statusBurnRelevance(byName).reasons).toEqual(['applies Mark'])
  })

  it('Healing Mark: a Mark consumer', () => {
    const byName = [...pictoEffectsById().values()].find((rec) => rec.name === 'Healing Mark')
    expect(byName).toBeDefined()
    expect(statusBurnRelevance(byName).reasons).toEqual(['benefits from Marked enemies'])
  })

  it('Anti-Burn: a defensive Burn-immunity effect receives zero structured Burn/Mark bonus', () => {
    const byName = [...pictoEffectsById().values()].find((rec) => rec.name === 'Anti-Burn')
    expect(byName).toBeDefined()
    expect(byName?.mechanics).toContain('burn')
    const relevance = statusBurnRelevance(byName)
    expect(relevance).toEqual({ signalCount: 0, reasons: [] })
    expect(statusBurnPictoBonus(byName)).toBe(0)
    expect(statusBurnLuminaBonus(byName)).toBe(0)
  })

  it('Auto Shell: an unrelated named-status effect (Shell) receives zero Burn/Mark relevance', () => {
    const byName = [...pictoEffectsById().values()].find((rec) => rec.name === 'Auto Shell')
    expect(byName).toBeDefined()
    expect(statusBurnRelevance(byName)).toEqual({ signalCount: 0, reasons: [] })
  })

  it('Tainted: a generic status_effect-only effect receives zero Burn/Mark relevance', () => {
    const byName = [...pictoEffectsById().values()].find((rec) => rec.name === 'Tainted')
    expect(byName).toBeDefined()
    expect(byName?.mechanics).toContain('status_effect')
    expect(statusBurnRelevance(byName)).toEqual({ signalCount: 0, reasons: [] })
  })
})
