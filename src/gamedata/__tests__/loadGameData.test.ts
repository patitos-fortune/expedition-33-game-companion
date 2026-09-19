import { describe, expect, it } from 'vitest'
import { loadGameData, normalizeCost, normalizePicto, validateWeapon } from '../loadGameData'
import type { RawPictoItem, Weapon } from '../../types'

describe('normalizeCost', () => {
  it('accepts a plain number', () => {
    expect(normalizeCost(3)).toEqual({ value: 3, valid: true })
  })

  it('accepts a numeric string (upstream data quirk)', () => {
    expect(normalizeCost('4')).toEqual({ value: 4, valid: true })
  })

  it('rounds a fractional value', () => {
    expect(normalizeCost(2.6)).toEqual({ value: 3, valid: true })
  })

  it('flags a negative number as invalid and falls back to 0', () => {
    expect(normalizeCost(-1)).toEqual({ value: 0, valid: false })
  })

  it('flags a non-numeric string as invalid and falls back to 0', () => {
    expect(normalizeCost('free')).toEqual({ value: 0, valid: false })
  })

  it('flags null/undefined as invalid and falls back to 0', () => {
    expect(normalizeCost(null)).toEqual({ value: 0, valid: false })
    expect(normalizeCost(undefined)).toEqual({ value: 0, valid: false })
  })
})

describe('normalizePicto', () => {
  const base: RawPictoItem = {
    full_url: 'https://example.com/x',
    name: 'Test Picto',
    type: 'Support',
    effect: 'Does a thing.',
    cost: '5',
    attributes: [
      { level: '1', attributes: { Health: '65', Defense: '2' } },
      { level: '2', attributes: { Health: '76', Defense: '2' } },
    ],
  }

  it('normalizes a numeric-string cost and marks it valid', () => {
    const result = normalizePicto(base, 0)
    expect(result.cost).toBe(5)
    expect(result.costValid).toBe(true)
    expect(result.id).toBe('picto-0')
  })

  it('parses per-level attribute values to numbers', () => {
    const result = normalizePicto(base, 0)
    expect(result.levels[0].attributes.Health).toBe(65)
    expect(result.levels[0].attributes.Defense).toBe(2)
  })

  it('flags a malformed cost while still producing a usable record', () => {
    const malformed: RawPictoItem = { ...base, cost: 'N/A' }
    const result = normalizePicto(malformed, 1)
    expect(result.costValid).toBe(false)
    expect(result.cost).toBe(0)
  })
})

describe('validateWeapon', () => {
  const validWeapon: Weapon = {
    id: 'gustave-test',
    character: 'Gustave',
    name: 'Test Blade',
    element: 'Fire',
    scaling: { Vitality: 'S', Might: null, Agility: 'A', Defense: null, Luck: null },
    maxPower: 3000,
    maxPowerReferenceLevel: 33,
    scalingChangesWithLevel: true,
    passives: [],
    confidence: 'test',
    notes: null,
  }

  it('accepts a well-formed weapon', () => {
    expect(validateWeapon(validWeapon)).toEqual([])
  })

  it('rejects an invalid scaling grade', () => {
    const bad = { ...validWeapon, scaling: { ...validWeapon.scaling, Might: 'Z' as any } }
    expect(validateWeapon(bad).length).toBeGreaterThan(0)
  })

  it('rejects a negative maxPower', () => {
    const bad = { ...validWeapon, maxPower: -5 }
    expect(validateWeapon(bad).length).toBeGreaterThan(0)
  })

  it('rejects a missing id/name', () => {
    const bad = { ...validWeapon, id: '', name: '' }
    const problems = validateWeapon(bad)
    expect(problems).toContain('missing id')
    expect(problems).toContain('missing name')
  })
})

describe('loadGameData (integration over the real bundled data files)', () => {
  it('loads all 6 characters', () => {
    const data = loadGameData()
    expect(data.characters).toHaveLength(6)
  })

  it('loads all 233 pictos from the upstream dataset', () => {
    const data = loadGameData()
    expect(data.pictos.length).toBe(233)
  })

  it('loads a non-trivial number of weapons across all 6 characters', () => {
    const data = loadGameData()
    const characters = new Set(data.weapons.map((w) => w.character))
    expect(characters.size).toBe(6)
    expect(data.weapons.length).toBeGreaterThan(100)
  })

  it('flags the two known upstream Pictos with no attribute-level data, and nothing else', () => {
    const data = loadGameData()
    // "Energising Gradient" and "Marking Break" ship with an empty `attributes: []`
    // in the upstream picto-builder dataset — this is a real data-quality gap,
    // not something we should paper over or crash on.
    expect(data.loadWarnings).toHaveLength(2)
    expect(data.loadWarnings.some((w) => w.includes('Energising Gradient'))).toBe(true)
    expect(data.loadWarnings.some((w) => w.includes('Marking Break'))).toBe(true)
  })
})
