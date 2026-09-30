/**
 * Deterministic Picto/Lumina effect classifier — Phase 2.2A.
 *
 * DEV-TIME ONLY. Nothing in this file is imported by the shipped app (no
 * view, store, or route imports it). It is invoked exclusively by
 * scripts/generate-picto-effects.ts, which reads src/assets/pictos_list.json
 * and writes the checked-in data/picto_effects.json that the app actually
 * consumes at runtime (via src/optimizer/effectModel.ts). This file is also
 * imported directly by tests, so the exact same logic that produced the
 * checked-in file is what "repeated classifier runs are deterministic" and
 * the golden-example tests verify.
 *
 * Rules only: regex/keyword matching over the literal effect text, plus a
 * short, documented table of manual overrides for effects that no reasonable
 * keyword rule can resolve (see MANUAL_OVERRIDES below). No LLM, no network
 * call, no randomness — the same input string always produces the same
 * PictoEffectRecord fields.
 *
 * Every tag emitted is drawn from the KNOWN_* vocabularies below, so a
 * generated file can always be checked for "does every tag belong to a
 * documented vocabulary" (see effectModel.test.ts).
 */
import type { PictoEffectClassification, PictoEffectParameters } from '../types'

export const TAXONOMY_VERSION = 1

export const KNOWN_MECHANICS = [
  'ap', 'health', 'gradient', 'break', 'critical', 'shield', 'shell',
  'burn', 'mark', 'stun', 'slow', 'freeze', 'charm', 'blight', 'regen',
  'powerful', 'powerless', 'defenceless', 'inverted', 'weakness', 'status_effect',
  'base_attack', 'free_aim', 'counterattack', 'parry', 'dodge', 'death', 'revive',
  'item', 'tint',
] as const

export const KNOWN_TRIGGERS = [
  'on_battle_start', 'on_turn_start', 'on_base_attack', 'on_free_aim_shot',
  'on_critical_hit', 'on_break', 'on_kill', 'on_death', 'on_revive',
  'on_dodge', 'on_parry', 'on_heal_action', 'on_weak_point_hit', 'on_item_use',
  'on_jump_counterattack',
] as const

export const KNOWN_TARGETS = [
  'self', 'ally', 'all_allies', 'enemy', 'all_enemies',
  'marked_enemy', 'burning_enemy', 'stunned_enemy', 'weak_point', 'while_solo',
  'below_health_pct', 'at_full_health', 'while_status_active',
] as const

/**
 * Effect verbs. Several carry a colon-encoded parameter (e.g.
 * "apply_status:burn", "increase_stat_pct:break_damage") to keep the schema
 * flat instead of nesting an object per tag — the part after the colon is
 * always copied from a word already in the source text (a status name or a
 * normalized stat phrase), never invented.
 */
export const KNOWN_EFFECT_PREFIXES = [
  'grant_immunity', 'gain_ap', 'spend_ap', 'ap_discount', 'apply_status',
  'heal_pct', 'gain_shield_flat', 'gain_gradient_charge_pct', 'convert_damage_type', 'add_extra_hit',
  'extend_status_duration', 'grant_break_capability', 'modify_turn_order',
  'increase_stat_pct', 'decrease_stat_pct', 'multiply_stat', 'chance_trigger',
  'random_branch', 'other',
] as const

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/**
 * Manual overrides for effect texts that no general keyword rule can safely
 * resolve without guessing — identified during Phase 2.2 discovery. Each one
 * is deliberately classified C (or D) with a note explaining why, rather
 * than forced into a confident tag. Keyed by exact Picto name (stable, since
 * pictos_list.json names are unique).
 */
const MANUAL_OVERRIDES: Record<string, { mechanics?: string[]; triggers?: string[]; effects?: string[]; targets?: string[]; classification: PictoEffectClassification; notes: string }> = {
  'Feint': {
    mechanics: [],
    classification: 'C',
    notes: 'References an undocumented game-specific mechanic ("barbapapa stacks") with no definition elsewhere in the corpus; the "every 5th skill hit deals 600% damage" clause is left untagged rather than guessed at.',
  },
  'Trigger Happy': {
    mechanics: ['ap'],
    effects: ['gain_ap'],
    classification: 'C',
    notes: 'The "+2 AP" itself is clear (kept as gain_ap), but the trigger condition is a cross-action shot-count threshold ("After shooting 10 times in one turn"), a pattern the trigger vocabulary has no counting-condition concept for; tagging it on_free_aim_shot would misrepresent a per-shot trigger as a threshold trigger, so no trigger is recorded.',
  },
  "Clea's Life": {
    mechanics: ['health'],
    effects: ['heal_pct'],
    classification: 'C',
    notes: 'The "recover 100% Health" effect itself is clear (kept as heal_pct), but its condition ("if no damage taken since last turn") requires cross-turn state tracking the taxonomy has no trigger/target concept for, so no trigger is recorded.',
  },
  'Painted Power': {
    mechanics: [],
    classification: 'C',
    notes: 'Source effect text is mostly walkthrough/lore prose ("...defeat the boss at the end of Act 2...") with the actual mechanic (damage cap removal) embedded in it; this is a source data-quality issue, not something a taxonomy rule should parse around.',
  },
  'Roulette': {
    mechanics: [],
    effects: ['random_branch'],
    classification: 'B',
    notes: 'Genuine random-branching effect ("50% chance to deal either 50% or 200% of its damage"); tagged random_branch deliberately instead of averaged into a single number, since averaging would fabricate a value the source text does not state.',
  },
  'Great Energy Tint': {
    mechanics: ['tint'],
    targets: ['all_allies'],
    classification: 'C',
    notes: '"now affect the whole Expedition" describes a scope change (single-target to party-wide) the TARGET vocabulary cannot fully express without assuming "whole Expedition" means every roster character, not just the active party — left as C rather than assumed.',
  },
  'Great Healing Tint': {
    mechanics: ['tint', 'health'],
    targets: ['all_allies'],
    classification: 'C',
    notes: 'Same "whole Expedition" scope ambiguity as Great Energy Tint.',
  },
}

interface RuleOutput {
  mechanics: Set<string>
  triggers: Set<string>
  targets: Set<string>
  effects: Set<string>
  parameters: PictoEffectParameters
}

const STATUS_WORDS = ['Burn', 'Mark', 'Shield', 'Rush', 'Powerful', 'Powerless', 'Shell', 'Defenceless', 'Stun', 'Slow', 'Regen', 'Inverted']

function extractParameters(e: string): PictoEffectParameters {
  const params: PictoEffectParameters = {}

  const pct = [...e.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]))
  if (pct.length > 0) params.percentages = pct

  const flat = [...e.matchAll(/\+(\d+)\s*(AP|Shields?|Shield Points?)/g)].map((m) => ({
    value: Number(m[1]),
    unit: /shield/i.test(m[2]) ? 'Shield' : 'AP',
  }))
  if (flat.length > 0) params.flatValues = flat

  const doubled = /\bDouble(s)?\b/i.test(e)
  if (doubled) {
    params.flatValues = [...(params.flatValues ?? []), { value: 2, unit: 'x' }]
  }

  const turns = e.match(/for (\d+) turns?/i)
  if (turns) params.turns = Number(turns[1])

  const stackCap = e.match(/stack up to (\d+) times/i)
  if (stackCap) params.stackCap = Number(stackCap[1])

  if (/Once per battle/i.test(e)) params.onceLimiter = 'battle'
  else if (/Once per turn/i.test(e)) params.onceLimiter = 'turn'

  return params
}

function applyMechanicRules(e: string, out: RuleOutput) {
  if (/\bAP\b/.test(e)) out.mechanics.add('ap')
  if (/\bHealth\b|\bHeal\b|\bHealing\b|\bHeals\b/i.test(e)) out.mechanics.add('health')
  if (/\bGradient\b/i.test(e)) out.mechanics.add('gradient')
  if (/\bBreak(ing|s)?\b/i.test(e)) out.mechanics.add('break')
  if (/\bCritical\b/i.test(e)) out.mechanics.add('critical')
  if (/\bShield(s)?\b/i.test(e)) out.mechanics.add('shield')
  if (/\bShell\b/i.test(e)) out.mechanics.add('shell')
  if (/\bBurn(ing)?\b/i.test(e)) out.mechanics.add('burn')
  if (/\bMark(ed)?\b/i.test(e)) out.mechanics.add('mark')
  if (/\bStun(ned)?\b/i.test(e)) out.mechanics.add('stun')
  if (/\bSlow(ed)?\b/i.test(e)) out.mechanics.add('slow')
  if (/\bFroze(n)?\b/i.test(e)) out.mechanics.add('freeze')
  if (/\bCharm\b/i.test(e)) out.mechanics.add('charm')
  if (/\bBlight\b/i.test(e)) out.mechanics.add('blight')
  if (/\bRegen\b/i.test(e)) out.mechanics.add('regen')
  if (/\bPowerful\b/i.test(e)) out.mechanics.add('powerful')
  if (/\bPowerless\b/i.test(e)) out.mechanics.add('powerless')
  if (/\bDefenceless\b/i.test(e)) out.mechanics.add('defenceless')
  if (/\bInverted\b/i.test(e)) out.mechanics.add('inverted')
  if (/\bWeakness\b/i.test(e)) out.mechanics.add('weakness')
  if (/\bStatus Effect(s)?\b/i.test(e)) out.mechanics.add('status_effect')
  if (/\bBase Attack\b/i.test(e)) out.mechanics.add('base_attack')
  if (/\bFree Aim\b/i.test(e)) out.mechanics.add('free_aim')
  if (/\bCounter(attack)?s?\b/i.test(e)) out.mechanics.add('counterattack')
  if (/\bParry\b/i.test(e)) out.mechanics.add('parry')
  if (/\bDodge\b/i.test(e)) out.mechanics.add('dodge')
  if (/\b[Dd]eath\b|\bdying\b/.test(e)) out.mechanics.add('death')
  if (/\b[Rr]evive[d]?\b/.test(e)) out.mechanics.add('revive')
  if (/using an item/i.test(e)) out.mechanics.add('item')
  if (/\bTint\b/i.test(e)) out.mechanics.add('tint')
}

function applyTriggerRules(e: string, out: RuleOutput) {
  if (/battle start/i.test(e)) out.triggers.add('on_battle_start')
  if (/turn start/i.test(e)) out.triggers.add('on_turn_start')
  if (/on Base Attack\b|Base Attack (has|applies|consumes|can Break)/i.test(e)) out.triggers.add('on_base_attack')
  if (/on Free Aim shot|Free Aim shots? (can|apply)/i.test(e)) out.triggers.add('on_free_aim_shot')
  if (/on (a )?critical hit\b/i.test(e)) out.triggers.add('on_critical_hit')
  if (/Breaking a target|on Break\b/i.test(e)) out.triggers.add('on_break')
  if (/killing an enemy|on kill(ing)?\b/i.test(e)) out.triggers.add('on_kill')
  if (/\bon death\b|Upon death/i.test(e)) out.triggers.add('on_death')
  if (/when revived|on being revived/i.test(e)) out.triggers.add('on_revive')
  if (/on (a )?(successful |Perfect )?Dodge\b/i.test(e)) out.triggers.add('on_dodge')
  if (/on (a )?(successful )?Parry\b/i.test(e)) out.triggers.add('on_parry')
  if (/Healing an ally|Healing Tint|on Healing/i.test(e)) out.triggers.add('on_heal_action')
  if (/Weak Point hit/i.test(e)) out.triggers.add('on_weak_point_hit')
  if (/using an item/i.test(e)) out.triggers.add('on_item_use')
  if (/Jump Counter/i.test(e)) out.triggers.add('on_jump_counterattack')
}

function applyTargetRules(e: string, out: RuleOutput) {
  if (/\bself\b/i.test(e)) out.targets.add('self')
  if (/\ballies\b/i.test(e)) out.targets.add('all_allies')
  else if (/\ban ally\b/i.test(e)) out.targets.add('ally')
  if (/all enemies/i.test(e)) out.targets.add('all_enemies')
  else if (/\ban enemy\b/i.test(e)) out.targets.add('enemy')
  if (/Marked (enemy|enemies|target)/i.test(e)) out.targets.add('marked_enemy')
  if (/Burning (enemy|enemies|target)/i.test(e)) out.targets.add('burning_enemy')
  if (/Stunned (enemy|enemies|target)/i.test(e)) out.targets.add('stunned_enemy')
  if (/Weak Point/i.test(e)) out.targets.add('weak_point')
  if (/fighting alone/i.test(e)) out.targets.add('while_solo')
  if (/below \d+%/i.test(e)) out.targets.add('below_health_pct')
  if (/full Health/i.test(e)) out.targets.add('at_full_health')
  if (/while (Cursed|Exhausted|Inverted|having Shields)/i.test(e)) out.targets.add('while_status_active')
}

function applyEffectRules(e: string, out: RuleOutput) {
  const immune = e.match(/Immune to (\w+)/)
  if (immune) out.effects.add(`grant_immunity:${slug(immune[1])}`)

  if (/\+\d+ AP\b|gain \d* ?AP\b|[Gg]ives? \d+ ?AP\b|Gain 1 AP/.test(e)) out.effects.add('gain_ap')
  if (/consume \d* ?AP|try to consume 1 AP/i.test(e)) out.effects.add('spend_ap')
  if (/costs? 1 less AP/i.test(e)) out.effects.add('ap_discount')

  for (const status of STATUS_WORDS) {
    const re = new RegExp(`[Aa]pply(ing)?(\\s+\\d+)?\\s+${status}\\b`)
    if (re.test(e)) out.effects.add(`apply_status:${slug(status)}`)
  }

  // "N% chance to <Status>" / "N% chance to gain <Status>" phrasing (distinct
  // from the "apply(ing) <Status>" wording above — a probabilistic grant
  // phrased as a bare verb or as "gain", e.g. "20% chance to Burn on Free Aim
  // shot." or "20% chance to gain Powerful on Free Aim shot."). Generic across
  // every known status word, not hardcoded to any one Picto; chance_trigger
  // (added below) is preserved alongside this tag, never replaced by it.
  for (const status of STATUS_WORDS) {
    const re = new RegExp(`chance to (?:gain\\s+)?${status}\\b`)
    if (re.test(e)) out.effects.add(`apply_status:${slug(status)}`)
  }

  if (/[Rr]ecover(s)? \d+% Health|Heal \d+%|Double(s)? all Heals|Heals? (provided )?(are|is) doubled/.test(e)) out.effects.add('heal_pct')
  if (/\+\d+ Shields?\b/.test(e)) out.effects.add('gain_shield_flat')
  if (/of a Gradient Charge/i.test(e)) out.effects.add('gain_gradient_charge_pct')
  if (/[Cc]onvert (all )?\w+ damage to \w+ damage/.test(e)) out.effects.add('convert_damage_type')
  if (/extra hit\b/i.test(e)) out.effects.add('add_extra_hit')
  if (/duration is increased by \d+/i.test(e)) {
    const statusHit = STATUS_WORDS.find((s) => out.mechanics.has(slug(s)) || new RegExp(`\\b${s}\\b`).test(e))
    out.effects.add(`extend_status_duration:${statusHit ? slug(statusHit) : 'unspecified'}`)
  }
  if (/can Break\b/.test(e)) out.effects.add('grant_break_capability')
  if (/[Pp]lay (first|again|twice)/.test(e)) out.effects.add('modify_turn_order')

  // Stat-phrase capture stops at the first delimiter word/punctuation so a
  // trailing clause ("...and can Break.") never gets folded into the stat name.
  const STOP = 'on|against|while|with|per|damage|and|but'
  const inc = e.match(new RegExp(`(\\d+(?:\\.\\d+)?)%\\s+increased\\s+([a-zA-Z][a-zA-Z\\s]*?)(?:\\s+(?:${STOP})\\b|[.,]|$)`))
  if (inc) out.effects.add(`increase_stat_pct:${slug(inc[2])}`)
  const dec1 = e.match(new RegExp(`(\\d+(?:\\.\\d+)?)%\\s+(?:less|reduced)\\s+([a-zA-Z][a-zA-Z\\s]*?)(?:\\s+(?:${STOP})\\b|[.,]|$)`))
  if (dec1) out.effects.add(`decrease_stat_pct:${slug(dec1[2])}`)

  // "deals/take/gives N% more <stat>" phrasing (distinct wording from "N% increased <stat>").
  for (const m of e.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)%\\s+more\\s+([a-zA-Z][a-zA-Z\\s]*?)(?:\\s+(?:${STOP})\\b|[.,]|$)`, 'gi'))) {
    out.effects.add(`increase_stat_pct:${slug(m[2])}`)
  }
  // "take N% less damage" phrasing (as opposed to "deal N% less damage", already covered by dec1 on the dealt side).
  if (/[Tt]ake (\d+(?:\.\d+)?)% less damage/.test(e)) out.effects.add('decrease_stat_pct:damage_taken')
  // "+N% to <Stat> <increase|reduction|damage amplification|...>" phrasing.
  const plusPct = e.match(/\+(\d+(?:\.\d+)?)%\s+to\s+([a-zA-Z][a-zA-Z\s]*?)(?:[.,]|$)/)
  if (plusPct) {
    const isReduction = /reduction/i.test(plusPct[2])
    out.effects.add(`${isReduction ? 'decrease_stat_pct' : 'increase_stat_pct'}:${slug(plusPct[2])}`)
  }

  if (/\bDouble(s)?\b/i.test(e) && !out.effects.has('heal_pct')) out.effects.add(`multiply_stat:${slug(e.split(/Double(s)?\s+/i)[2] ?? 'unspecified')}`)

  if (/\d+% chance to/.test(e)) out.effects.add('chance_trigger')
  if (/chance to deal either|randomly multiplied/i.test(e)) out.effects.add('random_branch')

  // Prefer the more specific damage_taken tag over the generic "damage" one
  // when both fired off the same "Take N% less/more damage" clause.
  if (out.effects.has('decrease_stat_pct:damage_taken')) out.effects.delete('decrease_stat_pct:damage')
  if (out.effects.has('increase_stat_pct:damage_taken')) out.effects.delete('increase_stat_pct:damage')
}

export interface ClassifyResult {
  mechanics: string[]
  triggers: string[]
  targets: string[]
  effects: string[]
  parameters: PictoEffectParameters
  classification: PictoEffectClassification
  notes?: string
}

/** Pure function: same effect text (and Picto name, for override lookup) always yields the same result. */
export function classifyEffect(name: string, effectText: string): ClassifyResult {
  const override = MANUAL_OVERRIDES[name]
  const out: RuleOutput = { mechanics: new Set(), triggers: new Set(), targets: new Set(), effects: new Set(), parameters: {} }

  applyMechanicRules(effectText, out)
  applyTriggerRules(effectText, out)
  applyTargetRules(effectText, out)
  applyEffectRules(effectText, out)
  out.parameters = extractParameters(effectText)

  if (override) {
    // An override fully REPLACES each dimension it's judging (not merges with
    // the auto-detected tags) — that's the point of an override: the general
    // rules got this one wrong or can't be trusted for it (e.g. "Painted
    // Power" ​textually contains "break the damage cap", which would
    // otherwise false-positive-match the Break mechanic keyword).
    return {
      mechanics: [...(override.mechanics ?? [])].sort(),
      triggers: [...(override.triggers ?? [])].sort(),
      targets: [...(override.targets ?? [])].sort(),
      effects: [...(override.effects ?? [])].sort(),
      parameters: out.parameters,
      classification: override.classification,
      notes: override.notes,
    }
  }

  const hasAnyTag = out.mechanics.size > 0 || out.triggers.size > 0 || out.targets.size > 0
  const hasEffect = out.effects.size > 0
  const classification: PictoEffectClassification = hasEffect && hasAnyTag ? 'A' : hasEffect || hasAnyTag ? 'B' : 'D'

  return {
    mechanics: [...out.mechanics].sort(),
    triggers: [...out.triggers].sort(),
    targets: [...out.targets].sort(),
    effects: [...out.effects].sort(),
    parameters: out.parameters,
    classification,
  }
}
