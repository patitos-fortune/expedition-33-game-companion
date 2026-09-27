/**
 * Spoiler protection: recommendations must only ever surface content the
 * player has marked as owned/unlocked/discovered, unless spoiler protection
 * has been deliberately turned off. This is enforced here, once, so no
 * individual optimizer module can accidentally leak undiscovered content.
 */
import type { InventoryState, NormalizedPicto, Weapon } from '../types'

export function filterOwnedPictos(pictos: NormalizedPicto[], inventory: InventoryState): NormalizedPicto[] {
  if (!inventory.spoilerProtection) return pictos
  return pictos.filter((p) => {
    const status = inventory.pictoStatus[p.id]
    // Unlocking a Picto's Lumina does not consume or replace the Picto itself.
    // `unlocked_lumina` therefore means "owned AND Lumina unlocked".
    return status === 'owned' || status === 'unlocked_lumina'
  })
}

export function filterUnlockedLuminas(pictos: NormalizedPicto[], inventory: InventoryState): NormalizedPicto[] {
  if (!inventory.spoilerProtection) return pictos
  return pictos.filter((p) => inventory.pictoStatus[p.id] === 'unlocked_lumina')
}

export function filterOwnedWeapons(weapons: Weapon[], inventory: InventoryState): Weapon[] {
  if (!inventory.spoilerProtection) return weapons
  return weapons.filter((w) => inventory.weaponStatus[w.id] === 'owned' || inventory.weaponStatus[w.id] === 'equipped')
}

export function isWeaponVisible(weapon: Weapon | undefined, inventory: InventoryState): boolean {
  if (!weapon) return false
  if (!inventory.spoilerProtection) return true
  return inventory.weaponStatus[weapon.id] === 'owned' || inventory.weaponStatus[weapon.id] === 'equipped'
}
