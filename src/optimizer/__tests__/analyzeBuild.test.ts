import { describe, expect, it } from 'vitest'
import { analyzeBuild } from '../analyzeBuild'
import { filterOwnedPictos } from '../spoilerFilter'
import { loadGameData } from '../../gamedata/loadGameData'
import { suggestPictoLoadout } from '../pictoOptimizer'
import { suggestLuminaCombination } from '../luminaOptimizer'
import { getStrategyProfile } from '../modelConfig'
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

  // Phase 2.2B: same end-to-end wiring confirmation as Phase 2.2A's Break
  // test above, but for the status_burn ("Burn / Mark") profile.
  it('threads structured effect data through to Picto/Lumina reasons under the status_burn profile', () => {
    const inventory = makeInventory()
    const build = { ...makeBuild(), strategyProfile: 'status_burn' as const }

    const injectedEffects = new Map(gameData.pictoEffectsById)
    injectedEffects.set(ownedPictos[0].id, {
      pictoId: ownedPictos[0].id,
      name: ownedPictos[0].name,
      sourceEffectText: ownedPictos[0].effect,
      mechanics: ['burn'],
      triggers: [],
      effects: ['apply_status:burn'],
      targets: [],
      parameters: {},
      classification: 'A',
      taxonomyVersion: 1,
    })
    injectedEffects.set(unlockedLuminas[0].id, {
      pictoId: unlockedLuminas[0].id,
      name: unlockedLuminas[0].name,
      sourceEffectText: unlockedLuminas[0].effect,
      mechanics: ['burn', 'mark'],
      triggers: [],
      effects: ['apply_status:burn'],
      targets: ['marked_enemy'],
      parameters: {},
      classification: 'A',
      taxonomyVersion: 1,
    })
    const gameDataWithInjectedEffects = { ...gameData, pictoEffectsById: injectedEffects }

    const result = analyzeBuild({ build, gameData: gameDataWithInjectedEffects, inventory })
    expect(result.pictos.scores[ownedPictos[0].id].statusBurnReasons).toContain('applies Burn')
    expect(result.luminas.reasons[unlockedLuminas[0].id]).toContain('applies Burn when hitting a Marked enemy')
    // Break must stay untouched by this profile's data.
    expect(result.pictos.scores[ownedPictos[0].id].breakReasons).toEqual([])
  })

  it('leaves non-status_burn profiles (including Break) unaffected by the presence of pictoEffectsById on gameData', () => {
    const inventory = makeInventory()
    for (const strategyProfile of ['damage', 'break', 'defensive', 'balanced', 'custom'] as const) {
      const build = { ...makeBuild(), strategyProfile }
      const result = analyzeBuild({ build, gameData, inventory })
      for (const s of Object.values(result.pictos.scores)) {
        expect(s.statusBurnReasons).toEqual([])
      }
    }
  })

  // active/planned Lumina semantics: analyzeBuild only ever consumes
  // build.activeLuminaIds (via currentLuminaIds), never plannedLuminaIds —
  // this must remain true regardless of strategyProfile, so the Burn/Mark
  // integration doesn't leak planned/wishlist items into the analysis.
  it('ignores plannedLuminaIds under the status_burn profile, exactly as it does for every other profile', () => {
    const inventory = makeInventory()
    const build = {
      ...makeBuild(),
      strategyProfile: 'status_burn' as const,
      activeLuminaIds: [],
      plannedLuminaIds: [unlockedLuminas[0].id, unlockedLuminas[1].id],
    }
    const result = analyzeBuild({ build, gameData, inventory })
    expect(result.luminas.currentLuminaIds).toEqual([])
  })

  // Phase 2.2C: contextual Burn/Mark relationship explanations, wired in
  // strictly after both optimizers finish. Explanation-only — see
  // buildContext.test.ts for the unit-level behavior; these tests cover the
  // end-to-end wiring through analyzeBuild() and the "zero effect on
  // scoring/selection" guarantee specifically.
  describe('Phase 2.2C: contextual build-context explanations', () => {
    function withInjectedEffects(overrides: Record<string, Partial<import('../../types').PictoEffectRecord>>) {
      const injected = new Map(gameData.pictoEffectsById)
      for (const [id, partial] of Object.entries(overrides)) {
        injected.set(id, {
          pictoId: id,
          name: gameData.pictos.find((p) => p.id === id)?.name ?? id,
          sourceEffectText: '',
          mechanics: [],
          triggers: [],
          effects: [],
          targets: [],
          parameters: {},
          classification: 'A',
          taxonomyVersion: 1,
          ...partial,
        })
      }
      return { ...gameData, pictoEffectsById: injected }
    }

    it('produces a currently_supported observation when an equipped Picto producer and an active Lumina consumer are both present', () => {
      const inventory = makeInventory()
      const build = {
        ...makeBuild(),
        equippedPictoIds: [ownedPictos[0].id],
        activeLuminaIds: [unlockedLuminas[0].id],
      }
      const gd = withInjectedEffects({
        [ownedPictos[0].id]: { effects: ['apply_status:burn'], mechanics: ['burn'] },
        [unlockedLuminas[0].id]: { targets: ['burning_enemy'], mechanics: ['burn'] },
      })
      const result = analyzeBuild({ build, gameData: gd, inventory })
      expect(result.buildContext.observations).toEqual([
        expect.objectContaining({
          mechanic: 'burn',
          kind: 'currently_supported',
          subject: { id: unlockedLuminas[0].id, name: unlockedLuminas[0].name },
          counterpart: { id: ownedPictos[0].id, name: ownedPictos[0].name },
        }),
      ])
    })

    it('produces a singular bridge observation for a Mark->Burn bridge item, not a duplicate mark-consumer claim', () => {
      const inventory = makeInventory()
      const build = { ...makeBuild(), equippedPictoIds: [ownedPictos[0].id] }
      const gd = withInjectedEffects({
        [ownedPictos[0].id]: { effects: ['apply_status:burn'], targets: ['marked_enemy'], mechanics: ['burn', 'mark'] },
      })
      const result = analyzeBuild({ build, gameData: gd, inventory })
      expect(result.buildContext.observations).toEqual([
        expect.objectContaining({ kind: 'bridge_active', subject: { id: ownedPictos[0].id, name: ownedPictos[0].name } }),
      ])
    })

    it('never leaks plannedLuminaIds into the build context, even when they are structurally Burn/Mark-relevant', () => {
      const inventory = makeInventory()
      // unlockedLuminas[1] (not [0]) is used deliberately: under the 'damage'
      // profile, unlockedLuminas[0] happens to score in the Picto optimizer's
      // top-3 by raw attributes alone, regardless of current equip or Lumina
      // budget, which would make it a genuine independent recommendation and
      // confound this test. unlockedLuminas[1] is not in that top-3.
      // luminaPointBudget: 0 so the Lumina optimizer recommends nothing, ruling
      // out the wishlist Lumina coincidentally also being a genuine
      // recommendation (which would pass this test for the wrong reason).
      const build = {
        ...makeBuild(),
        equippedPictoIds: [ownedPictos[0].id],
        activeLuminaIds: [],
        plannedLuminaIds: [unlockedLuminas[1].id],
        luminaPointBudget: 0,
      }
      const gd = withInjectedEffects({
        [ownedPictos[0].id]: { effects: ['apply_status:burn'], mechanics: ['burn'] },
        [unlockedLuminas[1].id]: { targets: ['burning_enemy'], mechanics: ['burn'] },
      })
      const result = analyzeBuild({ build, gameData: gd, inventory })
      expect(result.luminas.suggestedLuminaIds).not.toContain(unlockedLuminas[1].id)
      expect(result.pictos.suggestedEquippedIds).not.toContain(unlockedLuminas[1].id)
      // The wishlist Lumina is a real Burn consumer, but it was never activated
      // or recommended, so it must produce no observation at all.
      expect(result.buildContext.observations).toEqual([])
    })

    it('does not leak inventory.colourOfLuminaAvailable into the build context (no such field is consumed)', () => {
      const inventory = { ...makeInventory(), colourOfLuminaAvailable: 999 }
      const build = makeBuild()
      // Simply asserting this runs identically regardless of the value —
      // computeBuildContext's signature has no parameter for it at all.
      const resultA = analyzeBuild({ build, gameData, inventory })
      const resultB = analyzeBuild({ build, gameData, inventory: { ...inventory, colourOfLuminaAvailable: 0 } })
      expect(resultA.buildContext).toEqual(resultB.buildContext)
    })

    it('leaves Picto/Lumina scores and suggestions byte-for-byte identical to calling the optimizers directly (zero scoring effect)', () => {
      const inventory = makeInventory()
      const build = { ...makeBuild(), strategyProfile: 'status_burn' as const }
      const result = analyzeBuild({ build, gameData, inventory })

      const ownedVisible = gameData.pictos.filter((p) => {
        const status = inventory.pictoStatus[p.id]
        return status === 'owned' || status === 'unlocked_lumina'
      })
      const currentEquippedIds = build.equippedPictoIds.filter((id) => ownedVisible.some((p) => p.id === id))
      const directPictos = suggestPictoLoadout({
        ownedPictos: ownedVisible,
        profile: getStrategyProfile(build.strategyProfile),
        currentEquippedIds,
        pictoEffectsById: gameData.pictoEffectsById,
      })
      expect(result.pictos).toEqual(directPictos)

      const unlockedVisible = gameData.pictos.filter((p) => inventory.pictoStatus[p.id] === 'unlocked_lumina')
      const currentLuminaIds = build.activeLuminaIds.filter((id) => unlockedVisible.some((p) => p.id === id))
      const directLuminas = suggestLuminaCombination({
        unlockedLuminas: unlockedVisible,
        profile: getStrategyProfile(build.strategyProfile),
        budget: build.luminaPointBudget,
        currentLuminaIds,
        freePictoIds: currentEquippedIds,
        pictoEffectsById: gameData.pictoEffectsById,
      })
      expect(result.luminas).toEqual(directLuminas)
    })

    it('produces identical pictos/luminas output (ids and scores) for an input with and without a rich buildContext result', () => {
      const inventory = makeInventory()
      // unlockedLuminas[1]/[3] (not [0]) are used deliberately: under the
      // 'damage' profile, unlockedLuminas[0] happens to score in the Picto
      // optimizer's top-3 by raw attributes alone, regardless of current
      // equip or Lumina budget, which would make "sparse" pick up a stray
      // buildContext observation unrelated to this scenario and confound the
      // "sparse has none" assertion. unlockedLuminas[1]/[3] are not in that
      // top-3 (confirmed directly against suggestPictoLoadout output).
      // luminaPointBudget: 0 keeps "sparse" genuinely free of any recommended
      // Lumina, so its buildContext is empty for the right reason.
      const buildSparse = { ...makeBuild(), equippedPictoIds: [], activeLuminaIds: [], luminaPointBudget: 0 }
      const buildRich = {
        ...makeBuild(),
        equippedPictoIds: [ownedPictos[0].id],
        activeLuminaIds: [unlockedLuminas[1].id, unlockedLuminas[3].id],
      }
      const gd = withInjectedEffects({
        [ownedPictos[0].id]: { effects: ['apply_status:burn'], mechanics: ['burn'] },
        [unlockedLuminas[1].id]: { targets: ['burning_enemy'], mechanics: ['burn'] },
        [unlockedLuminas[3].id]: { effects: ['apply_status:mark'], mechanics: ['mark'] },
      })
      const sparse = analyzeBuild({ build: buildSparse, gameData: gd, inventory })
      const rich = analyzeBuild({ build: buildRich, gameData: gd, inventory })
      // Different buildContext results (sparse has none, rich has observations)...
      expect(rich.buildContext.observations.length).toBeGreaterThan(0)
      expect(sparse.buildContext.observations).toEqual([])
      // ...but each build's OWN pictos/luminas scores are unaffected by whether
      // buildContext produced any observations — scores depend only on
      // profile/attributes/structured tags, never on buildContext's output.
      const sparseDirect = suggestPictoLoadout({
        ownedPictos: gameData.pictos.filter((p) => inventory.pictoStatus[p.id] === 'owned' || inventory.pictoStatus[p.id] === 'unlocked_lumina'),
        profile: getStrategyProfile(buildSparse.strategyProfile),
        currentEquippedIds: [],
        pictoEffectsById: gd.pictoEffectsById,
      })
      expect(sparse.pictos).toEqual(sparseDirect)
    })
  })
})
