/**
 * Burn/Mark-profile-only structured-effect relevance (Phase 2.2B).
 *
 * Turns a Picto's structured effect tags (data/picto_effects.json) into a
 * small, auditable HEURISTIC bonus plus human-readable reasons — used ONLY
 * when the active strategy profile is 'status_burn' (labeled "Burn / Mark"
 * in the UI, see pictoOptimizer.ts / luminaOptimizer.ts). Every reason
 * string is derived directly from a tag that is itself derived directly from
 * the source effect text; nothing here estimates damage, status-application
 * probability, or "how good" the Picto actually is in combat.
 *
 * Scope, deliberately narrow (see OPTIMIZER_MODEL.md for the full
 * reasoning): only Burn and Mark are recognized. A record's `status_effect`
 * mechanic tag, or any OTHER named status (Stun, Shell, Powerful, Regen,
 * Slow, Defenceless, Powerless, Charm, Blight, Freeze, Inverted, ...), is
 * NEVER treated as Burn/Mark-relevant on its own — "mentions a status" is
 * not the same claim as "helps the Burn/Mark strategy this profile models."
 * This mirrors the post-2.2A correction that removed Stun as a Break signal
 * for the identical reason.
 *
 * Item-local only (Phase 2.2B scope): relevance is computed purely from one
 * record's own tags. Whether a Burn/Mark producer or consumer is actually
 * present elsewhere in the current build is NOT considered here — that is
 * explicitly deferred to a possible future phase (see OPTIMIZER_MODEL.md).
 */
import { BURN_MARK_EFFECT_LUMINA_BONUS_PER_SIGNAL, BURN_MARK_EFFECT_PICTO_BONUS_PER_SIGNAL } from './modelConfig'
import type { PictoEffectRecord } from '../types'

export interface StatusBurnRelevance {
  /** Count of distinct matched Burn/Mark-relevant signals (0 if none). */
  signalCount: number
  /** Human-readable, tag-grounded reasons, in a stable order. */
  reasons: string[]
}

/** Pure: same record always yields the same relevance. Returns zero signals for a Picto with no structured record. */
export function statusBurnRelevance(record: PictoEffectRecord | undefined): StatusBurnRelevance {
  if (!record) return { signalCount: 0, reasons: [] }

  const reasons: string[] = []

  const isBurnProducer = record.effects.includes('apply_status:burn')
  const isMarkConsumer = record.targets.includes('marked_enemy')
  // Mark -> Burn bridge (signal E): a record that both consumes Mark (via the
  // marked_enemy target) and produces Burn (via apply_status:burn) gets one
  // factual bridge reason instead of the two separate, redundant-sounding
  // generic reasons it would otherwise earn independently.
  const isBridge = isBurnProducer && isMarkConsumer

  if (isBridge) {
    reasons.push('applies Burn when hitting a Marked enemy')
  } else {
    // A. Burn producer
    if (isBurnProducer) {
      reasons.push('applies Burn')
    }
    // D. Mark consumer/payoff
    if (isMarkConsumer) {
      reasons.push('benefits from Marked enemies')
    }
  }

  // B. Burn consumer/payoff (independent of the bridge check above — a
  // record can be a Mark->Burn bridge AND separately benefit from Burning
  // enemies; those are two distinct facts, not a restatement of each other).
  if (record.targets.includes('burning_enemy')) {
    reasons.push('benefits from Burning enemies')
  }
  if (record.effects.includes('extend_status_duration:burn')) {
    reasons.push('extends Burn duration')
  }
  if (record.effects.includes('multiply_stat:its_burn_amount')) {
    reasons.push('amplifies existing Burn')
  }

  // C. Mark producer (skipped when already covered by the bridge reason above).
  if (!isBridge && record.effects.includes('apply_status:mark')) {
    reasons.push('applies Mark')
  }

  return { signalCount: reasons.length, reasons }
}

export function statusBurnPictoBonus(record: PictoEffectRecord | undefined): number {
  return statusBurnRelevance(record).signalCount * BURN_MARK_EFFECT_PICTO_BONUS_PER_SIGNAL
}

export function statusBurnLuminaBonus(record: PictoEffectRecord | undefined): number {
  return statusBurnRelevance(record).signalCount * BURN_MARK_EFFECT_LUMINA_BONUS_PER_SIGNAL
}
