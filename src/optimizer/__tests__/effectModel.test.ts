import { describe, expect, it } from 'vitest'
import { loadPictoEffects, pictoEffectsById, PICTO_EFFECTS_TAXONOMY_VERSION, validatePictoEffects } from '../effectModel'
import { loadGameData, _resetGameDataCacheForTests } from '../../gamedata/loadGameData'
import { KNOWN_EFFECT_PREFIXES, KNOWN_MECHANICS, KNOWN_TARGETS, KNOWN_TRIGGERS, TAXONOMY_VERSION } from '../effectClassifier'
import rawPictos from '../../assets/pictos_list.json'
import type { NormalizedPicto } from '../../types'

describe('picto_effects.json: corpus/data validation (Phase 2.2A task #4)', () => {
  it('has a record for every Picto in the source corpus', () => {
    const records = loadPictoEffects()
    expect(records.length).toBe((rawPictos as unknown[]).length)
  })

  it('has exactly 233 records (documented corpus size)', () => {
    expect(loadPictoEffects().length).toBe(233)
  })

  it('IDs map correctly to the live NormalizedPicto ids (picto-<index> scheme)', () => {
    const { pictos } = loadGameData()
    const byId = pictoEffectsById()
    for (const picto of pictos) {
      const record = byId.get(picto.id)
      expect(record).toBeDefined()
      expect(record?.pictoId).toBe(picto.id)
      expect(record?.name).toBe(picto.name)
    }
  })

  it('has no duplicate structured pictoIds', () => {
    const records = loadPictoEffects()
    const seen = new Set<string>()
    for (const r of records) {
      expect(seen.has(r.pictoId)).toBe(false)
      seen.add(r.pictoId)
    }
    expect(seen.size).toBe(records.length)
  })

  it('preserves the exact source effect text for every record', () => {
    const { pictos } = loadGameData()
    const byId = pictoEffectsById()
    for (const picto of pictos) {
      expect(byId.get(picto.id)?.sourceEffectText).toBe(picto.effect)
    }
  })

  it('stamps every record with the current taxonomy version', () => {
    for (const r of loadPictoEffects()) {
      expect(r.taxonomyVersion).toBe(TAXONOMY_VERSION)
    }
    expect(PICTO_EFFECTS_TAXONOMY_VERSION).toBe(TAXONOMY_VERSION)
  })

  it('never fabricates numeric parameters: every percentage/flatValue in a record traces to a literal number in its own source text', () => {
    for (const r of loadPictoEffects()) {
      for (const pct of r.parameters.percentages ?? []) {
        expect(r.sourceEffectText).toContain(`${pct}%`)
      }
      for (const flat of r.parameters.flatValues ?? []) {
        if (flat.unit === 'x') continue // derived from a "Double(s)" keyword match, not a literal digit
        expect(r.sourceEffectText).toMatch(new RegExp(`\\+${flat.value}\\s*(AP|Shields?|Shield Points?)`, 'i'))
      }
    }
  })

  it('unsupported/ambiguous (C/D) records never carry fabricated mechanic/effect tags beyond what their override or ruleset produced', () => {
    for (const r of loadPictoEffects()) {
      if (r.classification === 'D') {
        expect(r.mechanics).toEqual([])
        expect(r.effects).toEqual([])
      }
    }
  })

  it('every emitted tag across the whole corpus belongs to a documented KNOWN_* vocabulary', () => {
    for (const r of loadPictoEffects()) {
      for (const m of r.mechanics) expect(KNOWN_MECHANICS).toContain(m)
      for (const t of r.triggers) expect(KNOWN_TRIGGERS).toContain(t)
      for (const t of r.targets) expect(KNOWN_TARGETS).toContain(t)
      for (const e of r.effects) expect(KNOWN_EFFECT_PREFIXES).toContain(e.split(':')[0])
    }
  })

  it('classification coverage matches the documented A/B/C/D counts (regenerate data/picto_effects.json if this drifts)', () => {
    const counts = { A: 0, B: 0, C: 0, D: 0 }
    for (const r of loadPictoEffects()) counts[r.classification]++
    // 153/73/6/1 moved to 157/69/6/1 as of the Rush/Freeze mechanic-coverage
    // correction (PS-EXP33-003): 4 records (Anti-Freeze, Greater Rush, Longer
    // Rush, Time Tint) already had a structured effect tag but no mechanic/
    // trigger/target tag, so they were stuck at classification B; giving them
    // their legitimate `rush`/`freeze` mechanic tag promotes them to A. No
    // effect/trigger/target tag changed for any record — see
    // effectClassifier.test.ts's "Rush/Freeze mechanic coverage" block.
    expect(counts).toEqual({ A: 157, B: 69, C: 6, D: 1 })
  })

  it('detects corpus drift: a Picto with no structured record produces a validation warning instead of silently passing', () => {
    const fakeCorpus: NormalizedPicto[] = [
      { id: 'picto-not-real', name: 'Not Real', type: 'Offensive', effect: 'made up', fullUrl: '', cost: 1, costValid: true, levels: [] },
    ]
    const problems = validatePictoEffects(fakeCorpus)
    expect(problems.some((p) => p.includes('No structured effect record'))).toBe(true)
  })

  it('detects corpus drift: a stale source-text mismatch produces a validation warning', () => {
    const { pictos } = loadGameData()
    const stale: NormalizedPicto = { ...pictos[0], effect: `${pictos[0].effect} (edited upstream)` }
    const problems = validatePictoEffects([stale])
    expect(problems.some((p) => p.includes('stale source text'))).toBe(true)
  })

  it('detects corpus drift: a record-count mismatch produces a validation warning', () => {
    const { pictos } = loadGameData()
    const problems = validatePictoEffects(pictos.slice(0, -1))
    expect(problems.some((p) => p.includes('has 233 records but the live Picto corpus has'))).toBe(true)
  })

  it('loadGameData() surfaces zero picto-effect validation warnings for the current, in-sync corpus', () => {
    _resetGameDataCacheForTests()
    const { loadWarnings } = loadGameData()
    const effectWarnings = loadWarnings.filter(
      (w) => w.includes('structured effect record') || w.includes('picto_effects.json'),
    )
    expect(effectWarnings).toEqual([])
  })
})
