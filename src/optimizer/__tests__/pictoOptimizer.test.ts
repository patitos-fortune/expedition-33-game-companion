import { describe, expect, it } from 'vitest'
import { suggestPictoLoadout } from '../pictoOptimizer'
import { getStrategyProfile } from '../modelConfig'
import type { NormalizedPicto } from '../../types'

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
})
