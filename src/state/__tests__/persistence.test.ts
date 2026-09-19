import { describe, expect, it } from 'vitest'
import { defaultBuild, defaultInventory, deserializeState, serializeState, validatePersistedState } from '../persistence'

describe('serializeState / deserializeState round-trip', () => {
  it('round-trips a populated state exactly', () => {
    const inventory = defaultInventory()
    inventory.pictoStatus['picto-3'] = 'owned'
    inventory.pictoStatus['picto-7'] = 'unlocked_lumina'
    inventory.weaponStatus['gustave-lanceram'] = 'owned'
    inventory.spoilerProtection = false

    const build = defaultBuild(1)
    build.attributePointBudget = 90
    build.attributeAllocation = { Vitality: 20, Might: 10, Agility: 30, Defense: 10, Luck: 20 }
    build.weaponId = 'gustave-lanceram'
    build.equippedPictoIds = ['picto-3']
    build.activeLuminaIds = ['picto-7']
    build.luminaPointBudget = 25
    build.strategyProfile = 'damage'

    const json = serializeState({ inventory, builds: { 1: build }, activeCharacterId: 1 })
    const result = deserializeState(json)

    expect(result.valid).toBe(true)
    expect(result.sanitized.inventory).toEqual(inventory)
    expect(result.sanitized.builds[1]).toEqual(build)
    expect(result.sanitized.activeCharacterId).toBe(1)
  })

  it('round-trips an empty/default state', () => {
    const json = serializeState({ inventory: defaultInventory(), builds: {}, activeCharacterId: null })
    const result = deserializeState(json)
    expect(result.valid).toBe(true)
    expect(result.sanitized.builds).toEqual({})
  })
})

describe('deserializeState with malformed input', () => {
  it('reports an error instead of throwing on invalid JSON text', () => {
    const result = deserializeState('{ this is not json')
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/not valid JSON/)
    // Still returns a usable default state so the app doesn't crash.
    expect(result.sanitized.builds).toEqual({})
  })

  it('handles a JSON value that is not an object', () => {
    const result = deserializeState('[1,2,3]')
    expect(result.valid).toBe(false)
  })

  it('drops an invalid picto status but keeps the rest of the inventory', () => {
    const result = validatePersistedState({
      inventory: { pictoStatus: { 'picto-1': 'owned', 'picto-2': 'not-a-real-status' }, weaponStatus: {}, spoilerProtection: true },
      builds: {},
      activeCharacterId: null,
    })
    expect(result.sanitized.inventory.pictoStatus['picto-1']).toBe('owned')
    expect(result.sanitized.inventory.pictoStatus['picto-2']).toBeUndefined()
    expect(result.errors.some((e) => e.includes('picto-2'))).toBe(true)
    expect(result.valid).toBe(false)
  })

  it('truncates more than 3 equipped pictos rather than rejecting the whole build', () => {
    const result = validatePersistedState({
      inventory: { pictoStatus: {}, weaponStatus: {}, spoilerProtection: true },
      builds: { 1: { characterId: 1, equippedPictoIds: ['a', 'b', 'c', 'd'], attributeAllocation: {} } },
      activeCharacterId: null,
    })
    expect(result.sanitized.builds[1].equippedPictoIds).toHaveLength(3)
    expect(result.errors.some((e) => e.includes('more than 3'))).toBe(true)
  })

  it('falls back an unrecognized strategy profile to balanced', () => {
    const result = validatePersistedState({
      inventory: { pictoStatus: {}, weaponStatus: {}, spoilerProtection: true },
      builds: { 2: { characterId: 2, strategyProfile: 'made-up-profile' } },
      activeCharacterId: null,
    })
    expect(result.sanitized.builds[2].strategyProfile).toBe('balanced')
  })

  it('resets a negative attribute point budget to 0 rather than accepting it', () => {
    const result = validatePersistedState({
      inventory: { pictoStatus: {}, weaponStatus: {}, spoilerProtection: true },
      builds: { 3: { characterId: 3, attributePointBudget: -50 } },
      activeCharacterId: null,
    })
    expect(result.sanitized.builds[3].attributePointBudget).toBe(0)
  })

  it('handles completely empty input gracefully', () => {
    const result = validatePersistedState({})
    expect(result.sanitized.inventory).toEqual(defaultInventory())
    expect(result.sanitized.builds).toEqual({})
  })
})
