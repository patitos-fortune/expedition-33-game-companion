import { describe, expect, it } from 'vitest'
import { suggestPictoLoadout } from '../pictoOptimizer'
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

function makePicto(id: string, attrs: Record<string, number>): NormalizedPicto {
  return {
    id,
    name: id,
    type: 'Offensive',
    effect: 'test',
    fullUrl: '',
    cost: 3,
    costValid: true,
    levels: [{ level: '20', attributes: attrs }],
  }
}

describe('suggestPictoLoadout', () => {
  const pictos = [
    makePicto('p1', { 'Critical Rate': 20, Speed: 5 }),
    makePicto('p2', { Health: 500 }),
    makePicto('p3', { 'Critical Rate': 15, Speed: 15 }),
    makePicto('p4', { Defense: 50 }),
    makePicto('p5', { Health: 100, Defense: 10 }),
  ]

  it('is deterministic for identical inputs', () => {
    const params = {
      ownedPictos: pictos,
      profile: getStrategyProfile('damage'),
      currentEquippedIds: [],
    }
    const a = suggestPictoLoadout(params)
    const b = suggestPictoLoadout(params)
    expect(a.suggestedEquippedIds).toEqual(b.suggestedEquippedIds)
  })

  it('never suggests more than the slot cap', () => {
    const result = suggestPictoLoadout({
      ownedPictos: pictos,
      profile: getStrategyProfile('balanced'),
      currentEquippedIds: [],
    })
    expect(result.suggestedEquippedIds.length).toBeLessThanOrEqual(3)
  })

  it('only ever suggests pictos from the owned list (spoiler-safety at the loadout level)', () => {
    const result = suggestPictoLoadout({
      ownedPictos: pictos,
      profile: getStrategyProfile('balanced'),
      currentEquippedIds: [],
    })
    const ownedIds = new Set(pictos.map((p) => p.id))
    for (const id of result.suggestedEquippedIds) {
      expect(ownedIds.has(id)).toBe(true)
    }
  })

  it('favors high Critical Rate/Speed pictos under the Damage profile', () => {
    const result = suggestPictoLoadout({
      ownedPictos: pictos,
      profile: getStrategyProfile('damage'),
      currentEquippedIds: [],
    })
    expect(result.suggestedEquippedIds).toContain('p1')
    expect(result.suggestedEquippedIds).toContain('p3')
  })

  it('reports zero additions when current equip already matches the suggestion', () => {
    const result = suggestPictoLoadout({
      ownedPictos: pictos,
      profile: getStrategyProfile('damage'),
      currentEquippedIds: ['p1', 'p3', 'p5'],
    })
    // p1/p3 should be in the top set; whatever the third pick is, additions should
    // only include picto(s) not already equipped.
    for (const id of result.additions) {
      expect(['p1', 'p3', 'p5']).not.toContain(id)
    }
  })

  it('does not crash on a Picto with no attribute-level data (a real upstream data gap) and never suggests it', () => {
    const brokenPicto = makePicto('broken', {})
    brokenPicto.levels = []
    const result = suggestPictoLoadout({
      ownedPictos: [...pictos, brokenPicto],
      profile: getStrategyProfile('balanced'),
      currentEquippedIds: [],
    })
    expect(result.suggestedEquippedIds).not.toContain('broken')
  })

  describe('Phase 2.2A: Break-only structured-effect scoring', () => {
    it('produces IDENTICAL scores/order for every non-Break profile whether or not pictoEffectsById is supplied', () => {
      const pictoEffectsById = new Map<string, PictoEffectRecord>([
        ['p2', makeEffectRecord('p2', { effects: ['grant_break_capability'], mechanics: ['break'] })],
      ])
      for (const key of ['balanced', 'damage', 'defensive', 'status_burn', 'custom'] as const) {
        const profile = getStrategyProfile(key)
        const without = suggestPictoLoadout({ ownedPictos: pictos, profile, currentEquippedIds: [] })
        const withEffects = suggestPictoLoadout({ ownedPictos: pictos, profile, currentEquippedIds: [], pictoEffectsById })
        expect(withEffects.suggestedEquippedIds).toEqual(without.suggestedEquippedIds)
        expect(withEffects.scores).toEqual(without.scores)
      }
    })

    it('under the Break profile, a Picto with Break-relevant structured tags scores higher than an identical one without', () => {
      const plain = makePicto('plain', { 'Critical Rate': 10, Speed: 10 })
      const breaker = makePicto('breaker', { 'Critical Rate': 10, Speed: 10 })
      const pictoEffectsById = new Map<string, PictoEffectRecord>([
        ['breaker', makeEffectRecord('breaker', { effects: ['grant_break_capability'], mechanics: ['break'], triggers: ['on_base_attack'] })],
      ])
      const result = suggestPictoLoadout({
        ownedPictos: [plain, breaker],
        profile: getStrategyProfile('break'),
        currentEquippedIds: [],
        pictoEffectsById,
      })
      expect(result.scores['breaker'].score).toBeGreaterThan(result.scores['plain'].score)
      expect(result.scores['breaker'].breakReasons).toContain('enables Break on Base Attack')
      expect(result.scores['plain'].breakReasons).toEqual([])
    })

    it('the Break bonus is inert without a matching structured record, even under the Break profile', () => {
      const result = suggestPictoLoadout({
        ownedPictos: pictos,
        profile: getStrategyProfile('break'),
        currentEquippedIds: [],
        pictoEffectsById: new Map(),
      })
      for (const s of Object.values(result.scores)) {
        expect(s.breakReasons).toEqual([])
      }
    })

    it('exposes Break-relevance reasons in the reasons text for a suggested Picto', () => {
      const breaker = makePicto('breaker', { 'Critical Rate': 30, Speed: 30 })
      const pictoEffectsById = new Map<string, PictoEffectRecord>([
        ['breaker', makeEffectRecord('breaker', { effects: ['grant_break_capability'] })],
      ])
      const result = suggestPictoLoadout({
        ownedPictos: [...pictos, breaker],
        profile: getStrategyProfile('break'),
        currentEquippedIds: [],
        pictoEffectsById,
      })
      expect(result.suggestedEquippedIds).toContain('breaker')
      expect(result.reasons['breaker']).toContain('enables Break')
    })
  })

  describe('Phase 2.2B: Burn/Mark-only structured-effect scoring', () => {
    it('produces IDENTICAL scores/order for every non-status_burn profile (including Break) whether or not pictoEffectsById is supplied', () => {
      const pictoEffectsById = new Map<string, PictoEffectRecord>([
        ['p2', makeEffectRecord('p2', { effects: ['apply_status:burn'], mechanics: ['burn'] })],
      ])
      for (const key of ['balanced', 'damage', 'defensive', 'break', 'custom'] as const) {
        const profile = getStrategyProfile(key)
        const without = suggestPictoLoadout({ ownedPictos: pictos, profile, currentEquippedIds: [] })
        const withEffects = suggestPictoLoadout({ ownedPictos: pictos, profile, currentEquippedIds: [], pictoEffectsById })
        expect(withEffects.suggestedEquippedIds).toEqual(without.suggestedEquippedIds)
        expect(withEffects.scores).toEqual(without.scores)
      }
    })

    it('under the status_burn profile, a Picto with Burn/Mark-relevant structured tags scores higher than an identical one without', () => {
      const plain = makePicto('plain', { 'Critical Rate': 10, Speed: 10 })
      const burner = makePicto('burner', { 'Critical Rate': 10, Speed: 10 })
      const pictoEffectsById = new Map<string, PictoEffectRecord>([
        ['burner', makeEffectRecord('burner', { effects: ['apply_status:burn'], mechanics: ['burn'] })],
      ])
      const result = suggestPictoLoadout({
        ownedPictos: [plain, burner],
        profile: getStrategyProfile('status_burn'),
        currentEquippedIds: [],
        pictoEffectsById,
      })
      expect(result.scores['burner'].score).toBeGreaterThan(result.scores['plain'].score)
      expect(result.scores['burner'].statusBurnReasons).toContain('applies Burn')
      expect(result.scores['plain'].statusBurnReasons).toEqual([])
      // Cross-check: this profile never populates breakReasons, even when relevant.
      expect(result.scores['burner'].breakReasons).toEqual([])
    })

    it('the Burn/Mark bonus is inert without a matching structured record, even under the status_burn profile', () => {
      const result = suggestPictoLoadout({
        ownedPictos: pictos,
        profile: getStrategyProfile('status_burn'),
        currentEquippedIds: [],
        pictoEffectsById: new Map(),
      })
      for (const s of Object.values(result.scores)) {
        expect(s.statusBurnReasons).toEqual([])
      }
    })

    it('the Burn/Mark bonus is NOT applied under the Break profile, even for a Burn/Mark-tagged Picto', () => {
      const burner = makePicto('burner', { 'Critical Rate': 10, Speed: 10 })
      const pictoEffectsById = new Map<string, PictoEffectRecord>([
        ['burner', makeEffectRecord('burner', { effects: ['apply_status:burn'], mechanics: ['burn'] })],
      ])
      const result = suggestPictoLoadout({
        ownedPictos: [burner],
        profile: getStrategyProfile('break'),
        currentEquippedIds: [],
        pictoEffectsById,
      })
      expect(result.scores['burner'].statusBurnReasons).toEqual([])
      expect(result.scores['burner'].breakReasons).toEqual([])
    })

    it('a mentions-a-status-but-unrelated Picto (e.g. Stun-tagged) does NOT receive Burn/Mark relevance', () => {
      const stunner = makePicto('stunner', { 'Critical Rate': 10, Speed: 10 })
      const pictoEffectsById = new Map<string, PictoEffectRecord>([
        ['stunner', makeEffectRecord('stunner', { effects: ['apply_status:stun'], mechanics: ['stun'] })],
      ])
      const result = suggestPictoLoadout({
        ownedPictos: [stunner],
        profile: getStrategyProfile('status_burn'),
        currentEquippedIds: [],
        pictoEffectsById,
      })
      expect(result.scores['stunner'].statusBurnReasons).toEqual([])
    })

    it('exposes Burn/Mark-relevance reasons in the reasons text for a suggested Picto', () => {
      const burner = makePicto('burner', { 'Critical Rate': 30, Speed: 30 })
      const pictoEffectsById = new Map<string, PictoEffectRecord>([
        ['burner', makeEffectRecord('burner', { effects: ['apply_status:burn'] })],
      ])
      const result = suggestPictoLoadout({
        ownedPictos: [...pictos, burner],
        profile: getStrategyProfile('status_burn'),
        currentEquippedIds: [],
        pictoEffectsById,
      })
      expect(result.suggestedEquippedIds).toContain('burner')
      expect(result.reasons['burner']).toContain('applies Burn')
    })
  })
})
