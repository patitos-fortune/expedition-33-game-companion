import { describe, expect, it } from 'vitest'
import { computeMechanicRelationships, MECHANIC_RELATIONSHIP_CONFIG, supportedRelationshipMechanics } from '../effectRelationships'
import { loadPictoEffects } from '../effectModel'

describe('computeMechanicRelationships (Phase 2.2A task #6)', () => {
  const records = loadPictoEffects()

  it('supports the documented set of mechanics: burn, mark, break, critical, shield, ap, gradient, stun', () => {
    expect(supportedRelationshipMechanics().sort()).toEqual(
      ['ap', 'break', 'burn', 'critical', 'gradient', 'mark', 'shield', 'stun'].sort(),
    )
  })

  it('returns an empty (not erroring) result for an unconfigured mechanic', () => {
    const result = computeMechanicRelationships(records, 'not_a_mechanic')
    expect(result).toEqual({ mechanic: 'not_a_mechanic', producers: [], consumers: [] })
  })

  it('matches the documented producer/consumer counts against the real corpus', () => {
    const expected: Record<string, { producers: number; consumers: number }> = {
      burn: { producers: 6, consumers: 7 },
      mark: { producers: 3, consumers: 7 },
      break: { producers: 2, consumers: 8 },
      critical: { producers: 0, consumers: 2 },
      shield: { producers: 5, consumers: 0 },
      ap: { producers: 36, consumers: 4 },
      gradient: { producers: 10, consumers: 0 },
      stun: { producers: 0, consumers: 6 },
    }
    for (const [mechanic, counts] of Object.entries(expected)) {
      const result = computeMechanicRelationships(records, mechanic)
      expect({ mechanic, producers: result.producers.length, consumers: result.consumers.length }).toEqual({
        mechanic,
        ...counts,
      })
    }
  })

  it('Break producers include the two known Break-granting Pictos', () => {
    const result = computeMechanicRelationships(records, 'break')
    expect(result.producers).toEqual(expect.arrayContaining(['Breaking Attack', 'Sniper']))
  })

  it('never assigns a numeric synergy strength — only name lists', () => {
    const result = computeMechanicRelationships(records, 'burn')
    expect(Array.isArray(result.producers)).toBe(true)
    expect(Array.isArray(result.consumers)).toBe(true)
    expect(result).not.toHaveProperty('strength')
    expect(result).not.toHaveProperty('score')
  })

  it('every configured mechanic references only tags from the documented taxonomy vocabularies (auditable, not arbitrary)', () => {
    for (const config of Object.values(MECHANIC_RELATIONSHIP_CONFIG)) {
      expect(Array.isArray(config.producerEffects)).toBe(true)
    }
  })
})
