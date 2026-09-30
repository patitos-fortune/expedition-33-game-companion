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
    colourOfLuminaAvailable: 13,
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
    plannedLuminaIds: [],
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

  // Regression for "Fix equipped weapons being excluded from analysis":
  // marking the selected weapon 'equipped' (not just 'owned') must still
  // include it in the analysis, since attribute suggestions depend on it.
  it('includes an equipped weapon in the analysis (not just owned)', () => {
    const inventory = makeInventory()
    inventory.weaponStatus[firstWeapon.id] = 'equipped'
    const build = makeBuild()
    const result = analyzeBuild({ build, gameData, inventory })
    expect(result.weapon.visible).toBe(true)
    expect(result.weapon.selected?.id).toBe(firstWeapon.id)
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

  // Phase 2.2A: confirms gameData.pictoEffectsById is actually wired end-to-end
  // through analyzeBuild() into both optimizers, not just implemented in isolation.
  it('threads structured effect data through to Picto/Lumina reasons under the Break profile', () => {
    const inventory = makeInventory()
    const build = { ...makeBuild(), strategyProfile: 'break' as const }

    // Inject a synthetic Break-relevant record for one owned and one unlocked
    // Picto so the test doesn't depend on which real corpus entries happen to
    // land in the fixed slice(0,10)/slice(10,15) sample.
    const injectedEffects = new Map(gameData.pictoEffectsById)
    injectedEffects.set(ownedPictos[0].id, {
      pictoId: ownedPictos[0].id,
      name: ownedPictos[0].name,
      sourceEffectText: ownedPictos[0].effect,
      mechanics: ['break'],
      triggers: ['on_base_attack'],
      effects: ['grant_break_capability'],
      targets: [],
      parameters: {},
      classification: 'A',
      taxonomyVersion: 1,
    })
    injectedEffects.set(unlockedLuminas[0].id, {
      pictoId: unlockedLuminas[0].id,
      name: unlockedLuminas[0].name,
      sourceEffectText: unlockedLuminas[0].effect,
      mechanics: ['break'],
      triggers: ['on_base_attack'],
      effects: ['grant_break_capability'],
      targets: [],
      parameters: {},
      classification: 'A',
      taxonomyVersion: 1,
    })
    const gameDataWithInjectedEffects = { ...gameData, pictoEffectsById: injectedEffects }

    const result = analyzeBuild({ build, gameData: gameDataWithInjectedEffects, inventory })
    expect(result.pictos.scores[ownedPictos[0].id].breakReasons).toContain('enables Break on Base Attack')
    expect(result.luminas.reasons[unlockedLuminas[0].id]).toContain('enables Break on Base Attack')
  })

  it('leaves non-Break profiles unaffected by the presence of pictoEffectsById on gameData', () => {
    const inventory = makeInventory()
    const build = makeBuild() // 'damage' profile
    const result = analyzeBuild({ build, gameData, inventory })
    for (const s of Object.values(result.pictos.scores)) {
      expect(s.breakReasons).toEqual([])
    }
  })
})
