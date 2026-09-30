/**
 * Runtime loader/validator for the generated structured effect data
 * (data/picto_effects.json). This is the ONLY module the shipped app uses to
 * read that file — it never re-classifies anything; classification happens
 * offline (src/optimizer/effectClassifier.ts, run via
 * scripts/generate-picto-effects.ts) and is checked in as plain JSON.
 */
import pictoEffectsData from '../../data/picto_effects.json'
import type { NormalizedPicto, PictoEffectRecord, PictoEffectsFile } from '../types'

const data = pictoEffectsData as PictoEffectsFile

export function loadPictoEffects(): PictoEffectRecord[] {
  return data.pictos
}

export function pictoEffectsById(): Map<string, PictoEffectRecord> {
  return new Map(data.pictos.map((p) => [p.pictoId, p]))
}

export const PICTO_EFFECTS_TAXONOMY_VERSION = data._taxonomyVersion

/**
 * Cross-checks the checked-in structured data against the live normalized
 * Picto corpus. Never throws — returns problem strings for loadGameData.ts
 * to surface as loadWarnings, the same pattern used for weapon validation.
 * This is what "corpus drift is detectable" means in practice: if
 * pictos_list.json changes without re-running the generator, this notices.
 */
export function validatePictoEffects(pictos: NormalizedPicto[]): string[] {
  const problems: string[] = []
  const byId = pictoEffectsById()

  if (data.pictos.length !== pictos.length) {
    problems.push(
      `picto_effects.json has ${data.pictos.length} records but the live Picto corpus has ${pictos.length} — re-run scripts/generate-picto-effects.ts.`,
    )
  }

  const seenIds = new Set<string>()
  for (const record of data.pictos) {
    if (seenIds.has(record.pictoId)) {
      problems.push(`Duplicate structured pictoId "${record.pictoId}" in picto_effects.json.`)
    }
    seenIds.add(record.pictoId)
  }

  for (const picto of pictos) {
    const record = byId.get(picto.id)
    if (!record) {
      problems.push(`No structured effect record for Picto "${picto.name}" (${picto.id}); it will only get stat-based recommendations.`)
      continue
    }
    if (record.sourceEffectText !== picto.effect) {
      problems.push(
        `Structured effect record for "${picto.name}" (${picto.id}) has stale source text — re-run scripts/generate-picto-effects.ts.`,
      )
    }
  }

  return problems
}
