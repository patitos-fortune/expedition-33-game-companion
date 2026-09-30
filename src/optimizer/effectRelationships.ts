/**
 * Generic producer -> consumer / trigger -> payoff relationship extraction
 * over the structured effect data (Phase 2.2A, Task 6). Pure, deterministic,
 * source-grounded: a Picto counts as a "producer" or "consumer" of a
 * mechanic only because its own tags say so — no relationship strength,
 * synergy score, or combat value is assigned here (see OPTIMIZER_MODEL.md).
 *
 * The MECHANIC_RELATIONSHIP_CONFIG table below is the single place that
 * defines, per mechanic, which tags count as "produces this" vs "benefits
 * from / reacts to this" — auditable and extendable without touching the
 * extraction logic itself.
 */
import type { PictoEffectRecord } from '../types'

interface MechanicRelationshipConfig {
  /** Exact effect tags that mean "this Picto produces/grants the mechanic." */
  producerEffects: string[]
  /** Exact target tags that mean "this Picto benefits from an enemy already having the mechanic." */
  consumerTargets?: string[]
  /** Exact trigger tags that mean "this Picto reacts to the mechanic occurring." */
  consumerTriggers?: string[]
  /** Exact effect tags that mean "this Picto benefits from / spends the mechanic." */
  consumerEffects?: string[]
}

/**
 * Configured only for mechanics with enough corpus representation to say
 * anything meaningful (see the Phase 2.2 discovery report §6) — adding a new
 * mechanic here is how future phases extend relationship support without
 * touching the extraction function.
 */
export const MECHANIC_RELATIONSHIP_CONFIG: Record<string, MechanicRelationshipConfig> = {
  burn: {
    producerEffects: ['apply_status:burn'],
    consumerTargets: ['burning_enemy'],
    consumerTriggers: [],
    consumerEffects: ['extend_status_duration:burn', 'multiply_stat:its_burn_amount'],
  },
  mark: {
    producerEffects: ['apply_status:mark'],
    consumerTargets: ['marked_enemy'],
  },
  break: {
    producerEffects: ['grant_break_capability'],
    consumerTriggers: ['on_break'],
    consumerEffects: [], // boosters like increase_stat_pct:break are read via mechanics tag, not a dedicated consumer effect
  },
  critical: {
    producerEffects: [], // no Picto in the corpus grants Critical Hits themselves; only boosts/reacts to them
    consumerTriggers: ['on_critical_hit'],
  },
  shield: {
    producerEffects: ['gain_shield_flat'],
    consumerTargets: [],
  },
  ap: {
    producerEffects: ['gain_ap'],
    consumerEffects: ['spend_ap', 'ap_discount'],
  },
  gradient: {
    producerEffects: ['gain_gradient_charge_pct'],
    consumerEffects: [], // "Gradient Overcharge" (consumes Gradient Charges) is a C/D-classified spend clause today, not yet a tagged consumer effect
  },
  stun: {
    producerEffects: ['apply_status:stun'],
    consumerTargets: ['stunned_enemy'],
  },
}

export interface MechanicRelationships {
  mechanic: string
  producers: string[]
  consumers: string[]
}

/**
 * For one mechanic, returns the Picto names that produce it and the ones
 * that consume/benefit from/react to it, per MECHANIC_RELATIONSHIP_CONFIG.
 * Returns an empty result (not an error) for an unconfigured mechanic.
 */
export function computeMechanicRelationships(records: PictoEffectRecord[], mechanic: string): MechanicRelationships {
  const config = MECHANIC_RELATIONSHIP_CONFIG[mechanic]
  if (!config) return { mechanic, producers: [], consumers: [] }

  const producers = records.filter((r) => r.effects.some((e) => config.producerEffects.includes(e))).map((r) => r.name)

  const consumerSet = new Set<string>()
  for (const r of records) {
    const isConsumer =
      (config.consumerTargets ?? []).some((t) => r.targets.includes(t)) ||
      (config.consumerTriggers ?? []).some((t) => r.triggers.includes(t)) ||
      (config.consumerEffects ?? []).some((e) => r.effects.includes(e))
    if (isConsumer) consumerSet.add(r.name)
  }

  return { mechanic, producers, consumers: [...consumerSet] }
}

/** Every mechanic this module currently has a configured relationship for. */
export function supportedRelationshipMechanics(): string[] {
  return Object.keys(MECHANIC_RELATIONSHIP_CONFIG)
}
