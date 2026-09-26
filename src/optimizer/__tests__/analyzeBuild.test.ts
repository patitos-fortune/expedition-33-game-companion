import { describe, expect, it } from 'vitest'
import { analyzeBuild } from '../analyzeBuild'
import { filterOwnedPictos } from '../spoilerFilter'
import { loadGameData } from '../../gamedata/loadGameData'
import type { CharacterBuild, InventoryState } from '../../types'

const gameData = loadGameData()
const firstCharacter = gameData.characters[0]
const firstWeapon = gameData.weapons.find((w) => w.character === firstCharacter.name)!
const ownedPictos = gameData.pictos.slice(0, 10)
const unlockedLuminas = gameData.pictos.slice(10, 15)

function makeInventory(): InventoryState {
  const pictoStatus: InventoryState['pictoStatus'] = {}
  for (const p of ownedPictos) pictoStatus[p.id] = 'owned'
  for (const p of unlockedLuminas) pictoStatus[p.id] = 'unlocked_lumina'
  return {
    pictoStatus,
    weaponStatus: { [firstWeapon.id]: 'owned' },
    spoilerProtection: true,
  }
}

function makeBuild(): CharacterBuild {
  return {
    characterId: firstCharacter.id,
    level: 50,
    attributePointBudget: 90,
    attributeAllocation: { Vitality: 18, Might: 18, Agility: 18, Defense: 18, Luck: 18 },
    weaponId: firstWeapon.id,
    weaponLevel: 20,
    equippedPictoIds: [],
    activeLuminaIds: [],
    luminaPointBudget: 40,
    strategyProfile: 'damage',
  }
}

describe('analyzeBuild', () => {
  it('treats Lumina-unlocked Pictos as still owned/equippable', () => {
    const inventory = makeInventory()
    const visible = filterOwnedPictos(gameData.pictos, inventory)
    const visibleIds = new Set(visible.map((p) => p.id))
    expect(visibleIds.has(ownedPictos[0].id)).toBe(true)
    expect(visibleIds.has(unlockedLuminas[0].id)).toBe(true)
  })

  it('is fully deterministic for identical inputs', () => {
    const inventory = makeInventory()
    const build = makeBuild()
    const a = analyzeBuild({ build, gameData, inventory })
    const b = analyzeBuild({ build, gameData, inventory })
    expect(a.attribute.suggested).toEqual(b.attribute.suggested)
    expect(a.pictos.suggestedEquippedIds).toEqual(b.pictos.suggestedEquippedIds)
    expect(a.luminas.suggestedLuminaIds).toEqual(b.luminas.suggestedLuminaIds)
  })

  it('never recommends an undiscovered/unowned picto when spoiler protection is on', () => {
    const inventory = makeInventory()
    const build = makeBuild()
    const result = analyzeBuild({ build, gameData, inventory })
    // A Picto whose Lumina has been unlocked is still owned and remains a valid
    // Picto-slot candidate; mastery adds the Lumina, it does not consume the Picto.
    const ownedIds = new Set([...ownedPictos, ...unlockedLuminas].map((p) => p.id))
    for (const id of result.pictos.suggestedEquippedIds) {
      expect(ownedIds.has(id)).toBe(true)
    }
  })

  it('never recommends an unlocked lumina outside the owned/unlocked set', () => {
    const inventory = makeInventory()
    const build = makeBuild()
    const result = analyzeBuild({ build, gameData, inventory })
    const unlockedIds = new Set(unlockedLuminas.map((p) => p.id))
    for (const id of result.luminas.suggestedLuminaIds) {
      expect(unlockedIds.has(id)).toBe(true)
    }
  })

  it('hides an undiscovered weapon from the analysis even if selected in build state', () => {
    const inventory = makeInventory()
    inventory.weaponStatus[firstWeapon.id] = 'undiscovered'
    const build = makeBuild()
    const result = analyzeBuild({ build, gameData, inventory })
    expect(result.weapon.visible).toBe(false)
    expect(result.weapon.selected).toBeNull()
  })

  it('never exceeds the Lumina point budget', () => {
    const inventory = makeInventory()
    const build = makeBuild()
    const result = analyzeBuild({ build, gameData, inventory })
    expect(result.luminas.totalCost).toBeLessThanOrEqual(build.luminaPointBudget)
  })

  it('always reports skills as insufficient_model (never fabricated)', () => {
    const inventory = makeInventory()
    const build = makeBuild()
    const result = analyzeBuild({ build, gameData, inventory })
    expect(result.skills.status).toBe('insufficient_model')
    expect(result.fixMyBuildSummary.skills).toMatch(/insufficient model/i)
  })

  it('respects spoilerProtection=false by allowing all pictos/weapons to be considered', () => {
    const inventory = makeInventory()
    inventory.spoilerProtection = false
    inventory.weaponStatus = {}
    const build = makeBuild()
    const result = analyzeBuild({ build, gameData, inventory })
    // weapon should be visible even though weaponStatus has no entry for it
    expect(result.weapon.visible).toBe(true)
  })
})
