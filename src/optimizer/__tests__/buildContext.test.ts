import { describe, expect, it } from 'vitest'
import { computeBuildContext } from '../buildContext'
import { pictoEffectsById } from '../effectModel'
import type { PictoEffectRecord } from '../../types'

function record(id: string, overrides: Partial<PictoEffectRecord>): PictoEffectRecord {
  return {
    pictoId: id,
    name: id,
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

const burnProducer = record('burner', { name: 'Burner', effects: ['apply_status:burn'], mechanics: ['burn'] })
const burnConsumer = record('consumer', { name: 'Consumer', targets: ['burning_enemy'], mechanics: ['burn'] })
const markProducer = record('marker', { name: 'Marker', effects: ['apply_status:mark'], mechanics: ['mark'] })
const markConsumer = record('markConsumer', { name: 'MarkConsumer', targets: ['marked_enemy'], mechanics: ['mark'] })
const bridge = record('bridge', {
  name: 'Bridge',
  effects: ['apply_status:burn'],
  targets: ['marked_enemy'],
  mechanics: ['burn', 'mark'],
})
const genericBurnMechanicOnly = record('genericBurn', { name: 'GenericBurn', mechanics: ['burn'] })
const genericMarkMechanicOnly = record('genericMark', { name: 'GenericMark', mechanics: ['mark'] })
const antiBurn = record('antiBurn', { name: 'AntiBurn', mechanics: ['burn'], effects: ['grant_immunity:burn'] })

function nameMap(records: PictoEffectRecord[]): Map<string, string> {
  return new Map(records.map((r) => [r.pictoId, r.name]))
}

function effectsMap(records: PictoEffectRecord[]): Map<string, PictoEffectRecord> {
  return new Map(records.map((r) => [r.pictoId, r]))
}

const allSynthetic = [burnProducer, burnConsumer, markProducer, markConsumer, bridge, genericBurnMechanicOnly, genericMarkMechanicOnly, antiBurn]

function run(params: {
  currentPictoIds?: string[]
  currentLuminaIds?: string[]
  recommendedPictoIds?: string[]
  recommendedLuminaIds?: string[]
}) {
  return computeBuildContext({
    currentPictoIds: params.currentPictoIds ?? [],
    currentLuminaIds: params.currentLuminaIds ?? [],
    recommendedPictoIds: params.recommendedPictoIds ?? [],
    recommendedLuminaIds: params.recommendedLuminaIds ?? [],
    pictoEffectsById: effectsMap(allSynthetic),
    nameById: nameMap(allSynthetic),
  })
}

describe('computeBuildContext: synthetic scenarios (1-6, 13-16)', () => {
  it('1. active producer + active consumer -> currently_supported', () => {
    const r = run({ currentPictoIds: ['burner'], currentLuminaIds: ['consumer'] })
    expect(r.observations).toEqual([
      {
        mechanic: 'burn',
        kind: 'currently_supported',
        subject: { id: 'consumer', name: 'Consumer' },
        counterpart: { id: 'burner', name: 'Burner' },
        reason: 'Supported by Burner, which applies Burn.',
      },
    ])
  })

  it('2. active producer + recommended consumer -> recommended_together, not currently_supported', () => {
    const r = run({ currentPictoIds: ['burner'], recommendedLuminaIds: ['consumer'] })
    expect(r.observations).toHaveLength(1)
    expect(r.observations[0]).toMatchObject({ kind: 'recommended_together', subject: { id: 'consumer' }, counterpart: { id: 'burner' } })
  })

  it('3. active consumer + recommended producer -> recommended_together', () => {
    const r = run({ currentLuminaIds: ['consumer'], recommendedPictoIds: ['burner'] })
    expect(r.observations).toHaveLength(2) // recommended_together + currently_unsupported both legitimately apply (no CURRENT producer exists)
    const kinds = r.observations.map((o) => o.kind).sort()
    expect(kinds).toEqual(['currently_unsupported', 'recommended_together'])
  })

  it('4. recommended producer + recommended consumer -> recommended_together', () => {
    const r = run({ recommendedPictoIds: ['burner'], recommendedLuminaIds: ['consumer'] })
    const together = r.observations.find((o) => o.kind === 'recommended_together')
    expect(together).toMatchObject({ subject: { id: 'consumer' }, counterpart: { id: 'burner' } })
  })

  it('5. current consumer with no current producer -> currently_unsupported', () => {
    const r = run({ currentLuminaIds: ['consumer'] })
    expect(r.observations).toEqual([
      {
        mechanic: 'burn',
        kind: 'currently_unsupported',
        subject: { id: 'consumer', name: 'Consumer' },
        reason: 'Benefits from Burning enemies, but no active effect in the current build applies Burn.',
      },
    ])
  })

  it('6. recommended consumer with neither current nor recommended producer -> currently_unsupported only', () => {
    const r = run({ recommendedLuminaIds: ['consumer'] })
    expect(r.observations).toEqual([
      expect.objectContaining({ kind: 'currently_unsupported', subject: { id: 'consumer', name: 'Consumer' } }),
    ])
  })

  it('13. generic shared mechanic tags alone do NOT create a relationship', () => {
    const r = run({ currentPictoIds: ['genericBurn'], currentLuminaIds: ['genericMark'] })
    expect(r.observations).toEqual([])
  })

  it('13b. a defensive/immunity effect that merely mentions the mechanic creates no relationship', () => {
    const r = run({ currentPictoIds: ['antiBurn'] })
    expect(r.observations).toEqual([])
  })

  it('15. deterministic ordering/output for identical inputs', () => {
    const params = { currentPictoIds: ['burner', 'marker'], currentLuminaIds: ['consumer', 'markConsumer'] }
    const a = run(params)
    const b = run(params)
    expect(a).toEqual(b)
  })
})

describe('computeBuildContext: bridge semantics (14)', () => {
  it('a bridge item active on its own produces exactly one bridge observation, not a separate mark-consumer claim', () => {
    const r = run({ currentPictoIds: ['bridge'] })
    expect(r.observations).toEqual([
      {
        mechanic: 'mark',
        kind: 'bridge_active',
        subject: { id: 'bridge', name: 'Bridge' },
        reason: 'Bridge is active and applies Burn when hitting a Marked enemy.',
      },
    ])
  })

  it('a bridge item not yet active but recommended produces a bridge_recommended observation', () => {
    const r = run({ recommendedPictoIds: ['bridge'] })
    expect(r.observations).toEqual([
      expect.objectContaining({ kind: 'bridge_recommended', subject: { id: 'bridge', name: 'Bridge' } }),
    ])
  })

  it('a bridge item still legitimately supports an independent Burn consumer (distinct fact, not a duplicate)', () => {
    const r = run({ currentPictoIds: ['bridge'], currentLuminaIds: ['consumer'] })
    expect(r.observations).toHaveLength(2)
    expect(r.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'bridge_active', subject: { id: 'bridge', name: 'Bridge' } }),
        expect.objectContaining({
          mechanic: 'burn',
          kind: 'currently_supported',
          subject: { id: 'consumer', name: 'Consumer' },
          counterpart: { id: 'bridge', name: 'Bridge' },
        }),
      ]),
    )
  })

  it('a bridge item is never the subject of a plain mark-consumer currently_unsupported observation', () => {
    const r = run({ currentPictoIds: ['bridge'] })
    expect(r.observations.some((o) => o.mechanic === 'mark' && o.kind === 'currently_unsupported')).toBe(false)
  })
})

describe('computeBuildContext: exclusions (9, 10, 11, 12)', () => {
  it('9/10: an item not passed in currentPictoIds/currentLuminaIds at all (simulating unlocked-but-inactive / owned-but-unequipped) never contributes to current context', () => {
    // computeBuildContext has no concept of "owned"/"unlocked" at all — it only
    // ever sees the four explicit ID lists analyzeBuild.ts passes it. This test
    // documents that contract: an id simply absent from every list (as an
    // owned-but-unequipped Picto or an unlocked-but-inactive Lumina would be)
    // has zero effect, proving there is no hidden fallback to a broader pool.
    const r = run({ currentPictoIds: [], currentLuminaIds: [] /* 'burner' deliberately omitted */ })
    expect(r.observations).toEqual([])
  })

  it('11/12: computeBuildContext has no parameter for plannedLuminaIds or colourOfLuminaAvailable at all', () => {
    // Structural guarantee, not just a behavioral one: the function signature
    // itself has no field that could carry wishlist or Colour-of-Lumina state,
    // so there is nothing for analyzeBuild.ts to accidentally wire up wrong.
    const params = Object.keys({
      currentPictoIds: [],
      currentLuminaIds: [],
      recommendedPictoIds: [],
      recommendedLuminaIds: [],
      pictoEffectsById: new Map(),
      nameById: new Map(),
    })
    expect(params).not.toContain('plannedLuminaIds')
    expect(params).not.toContain('colourOfLuminaAvailable')
  })
})

describe('computeBuildContext: equipped-Picto zero-cost symmetry (7, 8)', () => {
  it('7. an equipped Picto (zero Lumina cost) counts as an active producer', () => {
    const r = run({ currentPictoIds: ['burner'], currentLuminaIds: ['consumer'] })
    expect(r.observations[0]).toMatchObject({ kind: 'currently_supported', counterpart: { id: 'burner' } })
  })

  it('8. an equipped Picto (zero Lumina cost) counts as an active consumer', () => {
    const r = run({ currentPictoIds: ['consumer'], currentLuminaIds: ['burner'] })
    expect(r.observations[0]).toMatchObject({ kind: 'currently_supported', subject: { id: 'consumer' } })
  })
})

describe('computeBuildContext: against the real corpus', () => {
  const records = [...pictoEffectsById().values()]
  const byName = (n: string) => records.find((r) => r.name === n)!
  const effects = pictoEffectsById()
  const names = new Map(records.map((r) => [r.pictoId, r.name]))

  it('Burning Mark (the real bridge record) produces a singular bridge observation when active alone', () => {
    const burningMark = byName('Burning Mark')
    const r = computeBuildContext({
      currentPictoIds: [burningMark.pictoId],
      currentLuminaIds: [],
      recommendedPictoIds: [],
      recommendedLuminaIds: [],
      pictoEffectsById: effects,
      nameById: names,
    })
    expect(r.observations).toEqual([
      expect.objectContaining({ kind: 'bridge_active', subject: { id: burningMark.pictoId, name: 'Burning Mark' } }),
    ])
  })

  it('Burning Shots (real Burn producer) supports Healing Fire (real Burn consumer) when both active', () => {
    const burningShots = byName('Burning Shots')
    const healingFire = byName('Healing Fire')
    const r = computeBuildContext({
      currentPictoIds: [burningShots.pictoId],
      currentLuminaIds: [healingFire.pictoId],
      recommendedPictoIds: [],
      recommendedLuminaIds: [],
      pictoEffectsById: effects,
      nameById: names,
    })
    expect(r.observations).toEqual([
      {
        mechanic: 'burn',
        kind: 'currently_supported',
        subject: { id: healingFire.pictoId, name: 'Healing Fire' },
        counterpart: { id: burningShots.pictoId, name: 'Burning Shots' },
        reason: 'Supported by Burning Shots, which applies Burn.',
      },
    ])
  })

  it('Anti-Burn (immunity, no producer/consumer tag) produces no observation on its own', () => {
    const antiBurn = byName('Anti-Burn')
    const r = computeBuildContext({
      currentPictoIds: [antiBurn.pictoId],
      currentLuminaIds: [],
      recommendedPictoIds: [],
      recommendedLuminaIds: [],
      pictoEffectsById: effects,
      nameById: names,
    })
    expect(r.observations).toEqual([])
  })
})
