/**
 * Phase 2.2C: contextual Burn/Mark relationship EXPLANATIONS ONLY.
 *
 * This module is purely descriptive. It is called from analyzeBuild.ts AFTER
 * both the Picto and Lumina optimizers have already finished, and its output
 * is never fed back into either optimizer. It changes no score, no selection,
 * and no ranking — see OPTIMIZER_MODEL.md's "Phase 2.2C" section for the full
 * rationale (why explanation-only, why not build-aware scoring or pairwise
 * optimization).
 *
 * Two explicitly separate contexts:
 *
 *  - CURRENT build context: effects actually active in the persisted build —
 *    equipped Pictos, active Luminas, and (automatically, since they share
 *    the same id/record) effects supplied by an equipped Picto at zero
 *    Lumina cost. Never includes owned-but-unequipped Pictos, unlocked-but-
 *    inactive Luminas, Party Matrix plannedLuminaIds, or Colour-of-Lumina
 *    planning.
 *
 *  - RECOMMENDED build context: the optimizers' own output (suggested
 *    Pictos ∪ suggested Luminas), computed strictly after both optimizers
 *    have run. Used only to describe structural facts about the final
 *    recommended set ("it happens to contain both a producer and a
 *    consumer") — never to imply one item was recommended because of
 *    another.
 *
 * Producer/consumer semantics are strict and source-grounded, reusing the
 * exact tag lists already defined in effectRelationships.ts's
 * MECHANIC_RELATIONSHIP_CONFIG (no new vocabulary, no duplicated magic
 * strings): a PRODUCER is a record whose structured `effects` explicitly
 * apply the mechanic (e.g. `apply_status:burn`); a CONSUMER is a record whose
 * structured `targets`/`effects` demonstrate it benefits from/reacts to the
 * mechanic (e.g. the `burning_enemy` target). A generic shared `mechanics`
 * tag (e.g. both records merely tagged `mechanics: ['burn']`) is deliberately
 * NOT enough on its own — see effectRelationships.ts's own doc comment and
 * the post-2.2A Stun/Break correction this mirrors.
 *
 * No numeric synergy strength is computed or implied anywhere in this file.
 */
import type { PictoEffectRecord } from '../types'
import { MECHANIC_RELATIONSHIP_CONFIG } from './effectRelationships'

type BuildContextMechanic = 'burn' | 'mark'

const MECHANIC_LABEL: Record<BuildContextMechanic, string> = { burn: 'Burn', mark: 'Mark' }

export interface BuildContextItem {
  id: string
  name: string
}

export type BuildContextObservationKind =
  | 'currently_supported'
  | 'currently_unsupported'
  | 'recommended_together'
  | 'bridge_active'
  | 'bridge_recommended'

export interface BuildContextObservation {
  mechanic: BuildContextMechanic
  kind: BuildContextObservationKind
  subject: BuildContextItem
  /** The other item involved, when this observation describes a relationship between two distinct items. */
  counterpart?: BuildContextItem
  /** Factual, source-grounded, non-causal explanation text (see module doc comment). */
  reason: string
}

export interface BuildContextResult {
  observations: BuildContextObservation[]
}

function isProducer(record: PictoEffectRecord | undefined, mechanic: BuildContextMechanic): boolean {
  if (!record) return false
  const config = MECHANIC_RELATIONSHIP_CONFIG[mechanic]
  return record.effects.some((e) => config.producerEffects.includes(e))
}

function isConsumer(record: PictoEffectRecord | undefined, mechanic: BuildContextMechanic): boolean {
  if (!record) return false
  const config = MECHANIC_RELATIONSHIP_CONFIG[mechanic]
  return (
    (config.consumerTargets ?? []).some((t) => record.targets.includes(t)) ||
    (config.consumerTriggers ?? []).some((t) => record.triggers.includes(t)) ||
    (config.consumerEffects ?? []).some((e) => record.effects.includes(e))
  )
}

/** Mark→Burn bridge: a single record that both consumes Mark and produces Burn (e.g. "Burning Mark"). */
function isBridge(record: PictoEffectRecord | undefined): boolean {
  return isProducer(record, 'burn') && isConsumer(record, 'mark')
}

/** The specific, source-grounded reason a record counts as a consumer of this mechanic (first match, deterministic). */
function consumerFact(record: PictoEffectRecord, mechanic: BuildContextMechanic): string {
  if (mechanic === 'burn') {
    if (record.targets.includes('burning_enemy')) return 'benefits from Burning enemies'
    if (record.effects.includes('extend_status_duration:burn')) return 'extends Burn duration'
    if (record.effects.includes('multiply_stat:its_burn_amount')) return 'amplifies existing Burn'
  } else {
    if (record.targets.includes('marked_enemy')) return 'benefits from Marked enemies'
  }
  return `benefits from ${MECHANIC_LABEL[mechanic]}`
}

function dedupeById(items: BuildContextItem[]): BuildContextItem[] {
  const seen = new Map<string, BuildContextItem>()
  for (const item of items) if (!seen.has(item.id)) seen.set(item.id, item)
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id))
}

export function computeBuildContext(params: {
  /** Equipped Picto IDs, already spoiler-filtered (CharacterBuild.equippedPictoIds ∩ owned). */
  currentPictoIds: string[]
  /** Active Lumina IDs, already spoiler-filtered (CharacterBuild.activeLuminaIds ∩ unlocked). Never plannedLuminaIds. */
  currentLuminaIds: string[]
  /** The Picto optimizer's own suggestedEquippedIds — read only, never written back to. */
  recommendedPictoIds: string[]
  /** The Lumina optimizer's own suggestedLuminaIds — read only, never written back to. */
  recommendedLuminaIds: string[]
  pictoEffectsById: Map<string, PictoEffectRecord>
  /** id -> display name, for any id that may appear in the four lists above. */
  nameById: Map<string, string>
}): BuildContextResult {
  const { currentPictoIds, currentLuminaIds, recommendedPictoIds, recommendedLuminaIds, pictoEffectsById, nameById } = params

  const nameOf = (id: string) => nameById.get(id) ?? id
  const toItem = (id: string): BuildContextItem => ({ id, name: nameOf(id) })

  const currentIds = dedupeById([...currentPictoIds, ...currentLuminaIds].map(toItem))
  const recommendedIds = dedupeById([...recommendedPictoIds, ...recommendedLuminaIds].map(toItem))
  const combinedIds = dedupeById([...currentIds, ...recommendedIds])

  const observations: BuildContextObservation[] = []

  // --- Mark -> Burn bridge: handled once, separately from the per-mechanic
  // pairwise analysis below, so a bridge item never also gets a redundant
  // "Mark consumer lacking a producer" claim about itself (see module doc).
  const bridgeIds = new Set<string>()
  for (const item of combinedIds) {
    const record = pictoEffectsById.get(item.id)
    if (!isBridge(record)) continue
    bridgeIds.add(item.id)
    const isCurrent = currentIds.some((c) => c.id === item.id)
    observations.push({
      mechanic: 'mark',
      kind: isCurrent ? 'bridge_active' : 'bridge_recommended',
      subject: item,
      reason: isCurrent
        ? `${item.name} is active and applies Burn when hitting a Marked enemy.`
        : `${item.name} is recommended and applies Burn when hitting a Marked enemy.`,
    })
  }

  for (const mechanic of ['burn', 'mark'] as const) {
    const roleSet = (ids: BuildContextItem[], role: 'producer' | 'consumer') =>
      ids.filter((item) => {
        // A bridge item's Mark-consumption is explained by the bridge
        // observation above, never by the generic Mark-consumer analysis —
        // this is the "avoid duplicate reasons for the same structured fact"
        // requirement. It still fully counts as a Burn producer for every
        // OTHER item's Burn-consumer analysis (that is a separate, genuine
        // fact, not a duplicate).
        if (mechanic === 'mark' && role === 'consumer' && bridgeIds.has(item.id)) return false
        const record = pictoEffectsById.get(item.id)
        return role === 'producer' ? isProducer(record, mechanic) : isConsumer(record, mechanic)
      })

    const currentProducers = roleSet(currentIds, 'producer')
    const currentConsumers = roleSet(currentIds, 'consumer')
    const combinedProducers = roleSet(combinedIds, 'producer')
    const combinedConsumers = roleSet(combinedIds, 'consumer')

    // CURRENTLY SUPPORTED: a current consumer has a current producer counterpart.
    const supportedPair = currentConsumers
      .flatMap((c) => currentProducers.filter((p) => p.id !== c.id).map((p) => ({ p, c })))
      .sort((a, b) => a.p.id.localeCompare(b.p.id) || a.c.id.localeCompare(b.c.id))[0]
    if (supportedPair) {
      const { p, c } = supportedPair
      observations.push({
        mechanic,
        kind: 'currently_supported',
        subject: c,
        counterpart: p,
        reason: `Supported by ${p.name}, which applies ${MECHANIC_LABEL[mechanic]}.`,
      })
    }

    // RECOMMENDED TOGETHER: the resulting build (current ∪ recommended)
    // contains both a producer and a consumer, beyond the pure-current pair
    // already reported above. Purely structural — never implies causation.
    const alreadyReportedPair = supportedPair ? `${supportedPair.p.id}|${supportedPair.c.id}` : null
    const togetherPair = combinedProducers
      .flatMap((p) => combinedConsumers.filter((c) => c.id !== p.id).map((c) => ({ p, c })))
      .filter(({ p, c }) => `${p.id}|${c.id}` !== alreadyReportedPair)
      .sort((a, b) => a.p.id.localeCompare(b.p.id) || a.c.id.localeCompare(b.c.id))[0]
    if (togetherPair) {
      const { p, c } = togetherPair
      observations.push({
        mechanic,
        kind: 'recommended_together',
        subject: c,
        counterpart: p,
        reason: `Recommended together: ${p.name} applies ${MECHANIC_LABEL[mechanic]}, supporting ${c.name}.`,
      })
    }

    // CURRENTLY UNSUPPORTED: a current or recommended consumer depends on
    // this mechanic, but the CURRENT build has no detected producer for it.
    if (currentProducers.length === 0) {
      for (const c of combinedConsumers) {
        const record = pictoEffectsById.get(c.id)
        const fact = record ? consumerFact(record, mechanic) : `benefits from ${MECHANIC_LABEL[mechanic]}`
        const capitalized = fact.charAt(0).toUpperCase() + fact.slice(1)
        observations.push({
          mechanic,
          kind: 'currently_unsupported',
          subject: c,
          reason: `${capitalized}, but no active effect in the current build applies ${MECHANIC_LABEL[mechanic]}.`,
        })
      }
    }
  }

  // Deterministic, stable output order: mechanic, then kind, then subject id.
  const kindOrder: Record<BuildContextObservationKind, number> = {
    currently_supported: 0,
    currently_unsupported: 1,
    recommended_together: 2,
    bridge_active: 3,
    bridge_recommended: 4,
  }
  observations.sort(
    (a, b) =>
      a.mechanic.localeCompare(b.mechanic) || kindOrder[a.kind] - kindOrder[b.kind] || a.subject.id.localeCompare(b.subject.id),
  )

  return { observations }
}
