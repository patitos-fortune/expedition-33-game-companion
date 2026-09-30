/**
 * Colour of Lumina planning: how many extra Lumina points (funded by the
 * shared, unspent Colour of Lumina currency) a character's build needs.
 *
 * This is the single source of truth for "current paid cost" / "planned
 * paid cost" / "extra Colours needed" so that every screen showing these
 * numbers (Characters, Party Summary) agrees. "Planned" always means the
 * union of the character's current active Luminas and their wishlist
 * (plannedLuminaIds) — a Lumina supplied free by an equipped Picto never
 * costs Lumina points, matching the equipped-Picto-passive rule already
 * enforced in src/optimizer/luminaOptimizer.ts.
 *
 * Pure/plain TypeScript (no Vue) so it can be unit tested directly, per the
 * project's existing state/optimizer module convention.
 */
import type { CharacterBuild, NormalizedPicto } from '../types'

function luminaCost(id: string, equippedIds: Set<string>, pictosById: Map<string, NormalizedPicto>): number {
  if (equippedIds.has(id)) return 0
  return pictosById.get(id)?.cost ?? 0
}

/** Paid Lumina points currently spent on this character's real, in-game active Luminas. */
export function currentPaidLuminaCost(build: CharacterBuild, pictosById: Map<string, NormalizedPicto>): number {
  const equipped = new Set(build.equippedPictoIds)
  return build.activeLuminaIds.reduce((sum, id) => sum + luminaCost(id, equipped, pictosById), 0)
}

/** Paid Lumina points required if every current AND wishlist Lumina were active (the "planned" build). */
export function plannedPaidLuminaCost(build: CharacterBuild, pictosById: Map<string, NormalizedPicto>): number {
  const equipped = new Set(build.equippedPictoIds)
  const targetIds = new Set([...build.activeLuminaIds, ...build.plannedLuminaIds])
  return [...targetIds].reduce((sum, id) => sum + luminaCost(id, equipped, pictosById), 0)
}

/** Extra Lumina-point capacity (funded by Colours of Lumina) this character's planned build needs beyond its current capacity. */
export function extraColourNeeded(build: CharacterBuild, pictosById: Map<string, NormalizedPicto>): number {
  return Math.max(0, plannedPaidLuminaCost(build, pictosById) - build.luminaPointBudget)
}

/** Total extra Colours of Lumina the whole party's planned builds need beyond current capacities. */
export function totalColourNeeded(builds: CharacterBuild[], pictosById: Map<string, NormalizedPicto>): number {
  return builds.reduce((sum, build) => sum + extraColourNeeded(build, pictosById), 0)
}
