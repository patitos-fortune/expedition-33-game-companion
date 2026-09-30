/**
 * Break-profile-only structured-effect relevance (Phase 2.2A).
 *
 * Turns a Picto's structured effect tags (data/picto_effects.json) into a
 * small, auditable HEURISTIC bonus plus human-readable reasons — used ONLY
 * when the active strategy profile is 'break' (see pictoOptimizer.ts /
 * luminaOptimizer.ts). Every reason string is derived directly from a tag
 * that is itself derived directly from the source effect text; nothing here
 * estimates damage, DPS, or "how good" the Picto actually is in combat.
 */
import { BREAK_EFFECT_LUMINA_BONUS_PER_SIGNAL, BREAK_EFFECT_PICTO_BONUS_PER_SIGNAL } from './modelConfig'
import type { PictoEffectRecord } from '../types'

export interface BreakRelevance {
  /** Count of distinct matched Break-relevant signals (0 if none). */
  signalCount: number
  /** Human-readable, tag-grounded reasons, in a stable order. */
  reasons: string[]
}

/** Pure: same record always yields the same relevance. Returns zero signals for a Picto with no structured record. */
export function breakRelevance(record: PictoEffectRecord | undefined): BreakRelevance {
  if (!record) return { signalCount: 0, reasons: [] }

  const reasons: string[] = []

  if (record.effects.includes('grant_break_capability')) {
    reasons.push(record.triggers.includes('on_base_attack') ? 'enables Break on Base Attack' : 'enables Break')
  }
  if (record.effects.some((e) => e.startsWith('increase_stat_pct:') && e.includes('break'))) {
    reasons.push('increases Break damage')
  }
  if (record.triggers.includes('on_break')) {
    reasons.push('triggers after Breaking an enemy')
  }
  if (record.targets.includes('stunned_enemy') || record.mechanics.includes('stun')) {
    reasons.push('benefits from a Stunned target (Stun commonly follows a Break)')
  }
  if (record.mechanics.includes('break') && reasons.length === 0) {
    // References Break in some other, not-yet-more-specifically-tagged way
    // (e.g. classification B, like "Break Specialist" or "Longer Break").
    reasons.push('references the Break mechanic')
  }

  return { signalCount: reasons.length, reasons }
}

export function breakPictoBonus(record: PictoEffectRecord | undefined): number {
  return breakRelevance(record).signalCount * BREAK_EFFECT_PICTO_BONUS_PER_SIGNAL
}

export function breakLuminaBonus(record: PictoEffectRecord | undefined): number {
  return breakRelevance(record).signalCount * BREAK_EFFECT_LUMINA_BONUS_PER_SIGNAL
}
