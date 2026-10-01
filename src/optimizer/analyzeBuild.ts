/**
 * Top-level "Analyze My Build" orchestrator. Combines the calculated and
 * heuristic layers, enforces spoiler protection, and produces the
 * CALCULATED / HEURISTIC / UNKNOWN-tagged result the UI renders.
 *
 * This module has no Vue dependency — it is plain, deterministic TypeScript,
 * so it can be tested and reused independently of the UI (see
 * src/optimizer/__tests__/analyzeBuild.test.ts).
 */
import type { CharacterBuild, InventoryState, Weapon } from '../types'
import type { GameData } from '../gamedata/loadGameData'
import { getStrategyProfile, OPTIMIZER_KNOWN_UNKNOWNS } from './modelConfig'
import { suggestAttributeAllocation } from './attributeOptimizer'
import type { AttributeAllocationSuggestion } from './attributeOptimizer'
import { suggestPictoLoadout } from './pictoOptimizer'
import type { PictoLoadoutSuggestion } from './pictoOptimizer'
import { suggestLuminaCombination } from './luminaOptimizer'
import type { LuminaCombinationSuggestion } from './luminaOptimizer'
import { filterOwnedPictos, filterUnlockedLuminas, isWeaponVisible } from './spoilerFilter'
import { computeBuildContext } from './buildContext'
import type { BuildContextResult } from './buildContext'

export interface FixMyBuildSummary {
  attribute: string
  pictos: string
  luminas: string
  skills: string
}

export interface AnalysisResult {
  characterId: number
  weapon: { selected: Weapon | null; visible: boolean }
  attribute: AttributeAllocationSuggestion
  pictos: PictoLoadoutSuggestion
  luminas: LuminaCombinationSuggestion
  skills: { status: 'insufficient_model'; message: string }
  knownUnknowns: string[]
  fixMyBuildSummary: FixMyBuildSummary
  /**
   * Phase 2.2C: contextual Burn/Mark relationship explanations only — computed
   * strictly AFTER pictos/luminas above, read-only with respect to them. Never
   * affects any score, selection, or ranking above. See buildContext.ts /
   * OPTIMIZER_MODEL.md.
   */
  buildContext: BuildContextResult
}

export function analyzeBuild(params: {
  build: CharacterBuild
  gameData: GameData
  inventory: InventoryState
}): AnalysisResult {
  const { build, gameData, inventory } = params
  const profile = getStrategyProfile(build.strategyProfile)

  const weaponCandidate = build.weaponId ? gameData.weapons.find((w) => w.id === build.weaponId) ?? null : null
  const weaponVisible = isWeaponVisible(weaponCandidate ?? undefined, inventory)
  const weapon = weaponVisible ? weaponCandidate : null

  const attribute = suggestAttributeAllocation({
    budget: build.attributePointBudget,
    currentAllocation: build.attributeAllocation,
    weaponScaling: weapon ? weapon.scaling : null,
    profile,
  })

  const ownedPictos = filterOwnedPictos(gameData.pictos, inventory)
  const ownedIds = new Set(ownedPictos.map((p) => p.id))
  const currentEquippedIds = build.equippedPictoIds.filter((id) => ownedIds.has(id))
  const pictos = suggestPictoLoadout({
    ownedPictos,
    profile,
    currentEquippedIds,
    pictoEffectsById: gameData.pictoEffectsById,
  })

  const unlockedLuminas = filterUnlockedLuminas(gameData.pictos, inventory)
  const unlockedIds = new Set(unlockedLuminas.map((p) => p.id))
  const currentLuminaIds = build.activeLuminaIds.filter((id) => unlockedIds.has(id))
  const luminas = suggestLuminaCombination({
    unlockedLuminas,
    profile,
    budget: build.luminaPointBudget,
    currentLuminaIds,
    freePictoIds: currentEquippedIds,
    pictoEffectsById: gameData.pictoEffectsById,
  })

  const skills = {
    status: 'insufficient_model' as const,
    message:
      'Skills are described only as flavor text in the source data (no structured numeric effects), so no skill recommendation is made in v0.1. See OPTIMIZER_MODEL.md.',
  }

  // Phase 2.2C: computed strictly AFTER both optimizers above have finished,
  // read-only — never passed back into suggestPictoLoadout/suggestLuminaCombination.
  // Uses only the already spoiler-filtered current/recommended ID lists; never
  // build.plannedLuminaIds (Party Matrix wishlist) or inventory.colourOfLuminaAvailable.
  const nameById = new Map(gameData.pictos.map((p) => [p.id, p.name]))
  const buildContext = computeBuildContext({
    currentPictoIds: currentEquippedIds,
    currentLuminaIds,
    recommendedPictoIds: pictos.suggestedEquippedIds,
    recommendedLuminaIds: luminas.suggestedLuminaIds,
    pictoEffectsById: gameData.pictoEffectsById,
    nameById,
  })

  const fixMyBuildSummary: FixMyBuildSummary = {
    attribute: Object.values(attribute.delta).some((d) => d !== 0)
      ? 'Suggested change available'
      : 'No change suggested',
    pictos:
      pictos.additions.length > 0
        ? `${pictos.additions.length} possible improvement${pictos.additions.length === 1 ? '' : 's'}`
        : 'No changes suggested',
    luminas:
      luminas.additions.length > 0 || luminas.removals.length > 0
        ? 'Higher-scoring combination available'
        : 'No higher-scoring combination found',
    skills: 'No recommendation / insufficient model',
  }

  return {
    characterId: build.characterId,
    weapon: { selected: weapon, visible: weaponVisible },
    attribute,
    pictos,
    luminas,
    skills,
    knownUnknowns: OPTIMIZER_KNOWN_UNKNOWNS,
    fixMyBuildSummary,
    buildContext,
  }
}
