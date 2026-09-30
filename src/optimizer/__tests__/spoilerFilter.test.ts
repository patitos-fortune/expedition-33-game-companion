import { describe, expect, it } from 'vitest'
import { filterOwnedWeapons, isWeaponVisible } from '../spoilerFilter'
import type { InventoryState, Weapon } from '../../types'

function makeWeapon(id: string): Weapon {
  return {
    id,
    character: 'Gustave',
    name: id,
    element: null,
    scaling: { Vitality: null, Might: null, Agility: null, Defense: null, Luck: null },
    maxPower: null,
    maxPowerReferenceLevel: null,
    scalingChangesWithLevel: false,
    passives: [],
    confidence: 'test',
  }
}

function makeInventory(weaponStatus: InventoryState['weaponStatus']): InventoryState {
  return { pictoStatus: {}, weaponStatus, spoilerProtection: true, colourOfLuminaAvailable: 0 }
}

// Regression coverage for the "Fix equipped weapons being excluded from
// analysis" fix (see OPTIMIZER_MODEL.md / git history): an 'equipped' weapon
// must remain just as visible as an 'owned' one under spoiler protection.
describe('equipped weapon visibility (regression)', () => {
  const equippedWeapon = makeWeapon('w-equipped')
  const ownedWeapon = makeWeapon('w-owned')
  const undiscoveredWeapon = makeWeapon('w-undiscovered')
  const weapons = [equippedWeapon, ownedWeapon, undiscoveredWeapon]

  it('isWeaponVisible treats an equipped weapon the same as an owned one', () => {
    const inventory = makeInventory({ [equippedWeapon.id]: 'equipped', [ownedWeapon.id]: 'owned' })
    expect(isWeaponVisible(equippedWeapon, inventory)).toBe(true)
    expect(isWeaponVisible(ownedWeapon, inventory)).toBe(true)
    expect(isWeaponVisible(undiscoveredWeapon, inventory)).toBe(false)
  })

  it('filterOwnedWeapons includes equipped weapons alongside owned ones', () => {
    const inventory = makeInventory({ [equippedWeapon.id]: 'equipped', [ownedWeapon.id]: 'owned' })
    const visible = filterOwnedWeapons(weapons, inventory)
    const visibleIds = new Set(visible.map((w) => w.id))
    expect(visibleIds.has(equippedWeapon.id)).toBe(true)
    expect(visibleIds.has(ownedWeapon.id)).toBe(true)
    expect(visibleIds.has(undiscoveredWeapon.id)).toBe(false)
  })
})
