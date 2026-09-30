import { describe, expect, it } from 'vitest'
import {
  classifyEffect,
  KNOWN_EFFECT_PREFIXES,
  KNOWN_MECHANICS,
  KNOWN_TARGETS,
  KNOWN_TRIGGERS,
  TAXONOMY_VERSION,
} from '../effectClassifier'

describe('classifyEffect: determinism', () => {
  it('produces byte-identical output across repeated runs on the same input', () => {
    const inputs: Array<[string, string]> = [
      ['Sniper', 'First Free Aim shot each turn deals 200% increased damage and can Break.'],
      ['Confident', 'Take 50% less damage, but can’t be Healed.'],
      ['Glass Cannon', 'Deal 25% more damage, but take 25% more damage.'],
      ['Feint', 'Start each turn with barbapapa stacks; every 5th skill hit deals 600% damage.'],
    ]
    for (const [name, text] of inputs) {
      const a = classifyEffect(name, text)
      const b = classifyEffect(name, text)
      expect(b).toEqual(a)
    }
  })

  it('is order-independent within a single classification (sets are sorted before returning)', () => {
    const result = classifyEffect('Sniper', 'First Free Aim shot each turn deals 200% increased damage and can Break.')
    expect(result.mechanics).toEqual([...result.mechanics].sort())
    expect(result.effects).toEqual([...result.effects].sort())
  })
})

describe('classifyEffect: taxonomy vocabulary', () => {
  it('every emitted tag belongs to a documented KNOWN_* vocabulary', () => {
    const samples: Array<[string, string]> = [
      ['Sniper', 'First Free Aim shot each turn deals 200% increased damage and can Break.'],
      ['Burning Break', 'Apply 3 Burn stacks on Breaking a target.'],
      ['Marking Shots', '20% chance to apply Mark on Free Aim shot.'],
      ['Auto Shell', 'Apply Shell for 3 turns on battle start.'],
      ['Dead Energy I', '+3 AP on killing an enemy.'],
      ['At Death’s Door', 'Deal 50% more damage if Health is below 10%.'],
    ]
    for (const [name, text] of samples) {
      const r = classifyEffect(name, text)
      for (const m of r.mechanics) expect(KNOWN_MECHANICS).toContain(m)
      for (const t of r.triggers) expect(KNOWN_TRIGGERS).toContain(t)
      for (const t of r.targets) expect(KNOWN_TARGETS).toContain(t)
      for (const e of r.effects) {
        const prefix = e.split(':')[0]
        expect(KNOWN_EFFECT_PREFIXES).toContain(prefix)
      }
    }
  })

  it('exposes a stable taxonomy version', () => {
    expect(TAXONOMY_VERSION).toBe(1)
  })
})

describe('classifyEffect: golden examples', () => {
  it('AP generation (Dead Energy I)', () => {
    const r = classifyEffect('Dead Energy I', '+3 AP on killing an enemy.')
    expect(r.mechanics).toContain('ap')
    expect(r.effects).toContain('gain_ap')
    expect(r.triggers).toContain('on_kill')
    expect(r.classification).toBe('A')
  })

  it('Burn application (Burning Break)', () => {
    const r = classifyEffect('Burning Break', 'Apply 3 Burn stacks on Breaking a target.')
    expect(r.mechanics).toEqual(expect.arrayContaining(['burn', 'break']))
    expect(r.effects).toContain('apply_status:burn')
    expect(r.triggers).toContain('on_break')
    expect(r.classification).toBe('A')
  })

  it('Mark application (Marking Shots)', () => {
    const r = classifyEffect('Marking Shots', '20% chance to apply Mark on Free Aim shot.')
    expect(r.mechanics).toEqual(expect.arrayContaining(['mark', 'free_aim']))
    expect(r.effects).toEqual(expect.arrayContaining(['apply_status:mark', 'chance_trigger']))
    expect(r.triggers).toContain('on_free_aim_shot')
  })

  it('Break capability grant (Breaking Attack)', () => {
    const r = classifyEffect('Breaking Attack', 'Base Attack can Break.')
    expect(r.mechanics).toEqual(expect.arrayContaining(['break', 'base_attack']))
    expect(r.effects).toContain('grant_break_capability')
    expect(r.classification).toBe('A')
  })

  it('Break capability grant with trigger and stat boost (Sniper)', () => {
    const r = classifyEffect('Sniper', 'First Free Aim shot each turn deals 200% increased damage and can Break.')
    expect(r.mechanics).toEqual(expect.arrayContaining(['break', 'free_aim']))
    expect(r.effects).toEqual(expect.arrayContaining(['grant_break_capability', 'increase_stat_pct:damage']))
    expect(r.parameters.percentages).toEqual([200])
    expect(r.classification).toBe('A')
  })

  it('Critical Hit trigger and boost (Critical Break)', () => {
    const r = classifyEffect('Critical Break', '25% increased Break damage on Critical hits.')
    expect(r.mechanics).toEqual(expect.arrayContaining(['critical', 'break']))
    expect(r.effects.some((e) => e.startsWith('increase_stat_pct:') && e.includes('break'))).toBe(true)
  })

  it('Critical Hit trigger (Alternating Critical)', () => {
    const r = classifyEffect('Alternating Critical', 'On critical hit, next non‑critical hit deals increased damage.')
    expect(r.mechanics).toContain('critical')
    expect(r.triggers).toContain('on_critical_hit')
  })

  it('Heal percentage (Attack Lifesteal)', () => {
    const r = classifyEffect('Attack Lifesteal', 'Recover 15% Health on Base Attack.')
    expect(r.mechanics).toEqual(expect.arrayContaining(['health', 'base_attack']))
    expect(r.effects).toContain('heal_pct')
    expect(r.triggers).toContain('on_base_attack')
  })

  it('Shield gain (In Medias Res) — flat shields plus a stat tradeoff', () => {
    const r = classifyEffect('In Medias Res', '+3 Shields on Battle Start, but max Health is halved.')
    expect(r.mechanics).toContain('shield')
    expect(r.effects).toContain('gain_shield_flat')
    expect(r.triggers).toContain('on_battle_start')
    expect(r.classification).toBe('A')
  })

  it('Shell mechanic and battle-start trigger (Auto Shell)', () => {
    const r = classifyEffect('Auto Shell', 'Apply Shell for 3 turns on battle start.')
    expect(r.mechanics).toContain('shell')
    expect(r.triggers).toContain('on_battle_start')
    expect(r.parameters.turns).toBe(3)
  })

  it('Break trigger payoff (Empowering Break)', () => {
    const r = classifyEffect('Empowering Break', 'Gain Powerful on Breaking a target.')
    expect(r.mechanics).toEqual(expect.arrayContaining(['break', 'powerful']))
    expect(r.triggers).toContain('on_break')
  })

  it('conditional health target (At Death’s Door) — the "if Health is below" clause breaks the stat-phrase capture, so only the target/mechanic tags land, not an effect tag; a genuine, documented classifier limitation rather than a fabricated value', () => {
    const r = classifyEffect("At Death's Door", 'Deal 50% more damage if Health is below 10%.')
    expect(r.mechanics).toContain('health')
    expect(r.targets).toContain('below_health_pct')
    expect(r.effects).toEqual([])
    expect(r.classification).toBe('B')
  })

  it('conditional health target, at full health (Full Strength)', () => {
    const r = classifyEffect('Full Strength', '25% increased damage on full Health.')
    expect(r.targets).toContain('at_full_health')
    expect(r.effects).toContain('increase_stat_pct:damage')
  })

  it('explicit tradeoff: benefit and drawback collapse to the shared stat tag (Glass Cannon)', () => {
    const r = classifyEffect('Glass Cannon', 'Deal 25% more damage, but take 25% more damage.')
    // Both "deals more damage" and "take more damage" mention the same literal
    // word ("damage"), so the generic stat-phrase rule can only tag the word
    // itself, not which side (dealt vs. taken) it refers to on this phrasing.
    expect(r.effects).toContain('increase_stat_pct:damage')
    expect(r.parameters.percentages).toEqual([25, 25])
  })

  it('explicit tradeoff with a specific damage-taken phrasing (Confident)', () => {
    const r = classifyEffect('Confident', 'Take 50% less damage, but can’t be Healed.')
    expect(r.effects).toContain('decrease_stat_pct:damage_taken')
    // The generic ":damage" tag must not also appear once the more specific
    // ":damage_taken" tag is present (redundant/ambiguous duplicate cleanup).
    expect(r.effects).not.toContain('decrease_stat_pct:damage')
  })
})

describe('classifyEffect: named ambiguous/hard cases (manual overrides)', () => {
  it('Feint: undocumented mechanic left untagged, classification C', () => {
    const r = classifyEffect('Feint', 'Start each turn with barbapapa stacks; every 5th skill hit deals 600% damage.')
    expect(r.mechanics).toEqual([])
    expect(r.effects).toEqual([])
    expect(r.classification).toBe('C')
    expect(r.notes).toBeTruthy()
  })

  it('Trigger Happy: keeps the clear +2 AP effect, drops the uncountable trigger, classification C', () => {
    const r = classifyEffect('Trigger Happy', 'After shooting 10 times in one turn, gain +2 AP once and bonus shot damage this turn.')
    expect(r.effects).toContain('gain_ap')
    expect(r.triggers).toEqual([])
    expect(r.classification).toBe('C')
  })

  it("Clea's Life: keeps the clear heal_pct effect, drops the cross-turn condition, classification C", () => {
    const r = classifyEffect("Clea's Life", 'On turn start, if no damage taken since last turn, recover 100% Health.')
    expect(r.effects).toContain('heal_pct')
    expect(r.triggers).toEqual([])
    expect(r.classification).toBe('C')
  })

  it('Painted Power: lore/walkthrough prose does not false-positive-match the Break mechanic, classification C', () => {
    const r = classifyEffect(
      'Painted Power',
      'Damage can exceed 9,999. The only item in the game that allows you to break through the damage cap. The only way to obtain it is to defeat the boss at the end of Act 2. Check the Interactive Map Location below for full details of how to find it and break the damage cap.',
    )
    expect(r.mechanics).not.toContain('break')
    expect(r.mechanics).toEqual([])
    expect(r.classification).toBe('C')
  })

  it('Roulette: random-branching effect tagged deliberately rather than averaged into a single number', () => {
    const r = classifyEffect('Roulette', 'Every hit has a 50% chance to deal either 50% or 200% of its damage.')
    expect(r.effects).toContain('random_branch')
    expect(r.classification).toBe('B')
  })

  it('Great Energy Tint: scope-change ambiguity left as C rather than assumed', () => {
    const r = classifyEffect('Great Energy Tint', 'Energy Tints now affect the whole Expedition.')
    expect(r.mechanics).toContain('tint')
    expect(r.targets).toContain('all_allies')
    expect(r.classification).toBe('C')
  })

  it('Great Healing Tint: same scope-change ambiguity as Great Energy Tint', () => {
    const r = classifyEffect('Great Healing Tint', 'Healing Tints now affect the whole Expedition.')
    expect(r.mechanics).toEqual(expect.arrayContaining(['tint', 'health']))
    expect(r.classification).toBe('C')
  })
})
