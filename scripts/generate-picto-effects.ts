/**
 * Dev-time generator: src/assets/pictos_list.json -> data/picto_effects.json.
 *
 * Run with `npx tsx scripts/generate-picto-effects.ts` (or `tsx` if globally
 * installed) whenever pictos_list.json changes or the taxonomy is revised.
 * Not part of the app build or runtime — the shipped app reads the JSON this
 * writes (see src/optimizer/effectModel.ts), never re-runs classification.
 *
 * pictoId assignment mirrors src/gamedata/loadGameData.ts's normalizePicto:
 * `picto-<index>` using the raw array's own order, so records line up with
 * NormalizedPicto.id without any lookup ambiguity.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { classifyEffect, TAXONOMY_VERSION } from '../src/optimizer/effectClassifier'
import type { PictoEffectRecord, PictoEffectsFile } from '../src/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const sourcePath = resolve(root, 'src/assets/pictos_list.json')
const outPath = resolve(root, 'data/picto_effects.json')

interface RawPicto {
  name: string
  effect: string
}

const raw: RawPicto[] = JSON.parse(readFileSync(sourcePath, 'utf-8'))

const pictos: PictoEffectRecord[] = raw.map((p, index) => {
  const result = classifyEffect(p.name, p.effect)
  const record: PictoEffectRecord = {
    pictoId: `picto-${index}`,
    name: p.name,
    sourceEffectText: p.effect,
    mechanics: result.mechanics,
    triggers: result.triggers,
    targets: result.targets,
    effects: result.effects,
    parameters: result.parameters,
    classification: result.classification,
    taxonomyVersion: TAXONOMY_VERSION,
  }
  if (result.notes) record.notes = result.notes
  return record
})

const counts = { A: 0, B: 0, C: 0, D: 0 }
for (const p of pictos) counts[p.classification]++

const file: PictoEffectsFile = {
  _schemaVersion: 1,
  _taxonomyVersion: TAXONOMY_VERSION,
  _provenance: {
    generatedBy: 'scripts/generate-picto-effects.ts (deterministic rule-based classifier, src/optimizer/effectClassifier.ts) — no LLM/API/NLP call',
    sourceFile: 'src/assets/pictos_list.json',
    generatedAt: new Date().toISOString().slice(0, 10),
  },
  _knownUnknowns: [
    'Classification is a structural read of the effect text (which mechanics/triggers/effects/targets it references), not a measure of combat strength — see OPTIMIZER_MODEL.md.',
    'C-classified records (Feint, Trigger Happy, Clea\'s Life, Painted Power, Great Energy/Healing Tint) are deliberately left partially or fully untagged rather than guessed at; see each record\'s `notes` field.',
    'Numeric `parameters` are copied verbatim from the source text only — never derived, averaged, or estimated (e.g. Roulette\'s 50/50 chance is tagged random_branch, not averaged into one number).',
    'Skill effects (characters.json) are out of scope for this taxonomy, unchanged from Phase 1/2.1 (still insufficient_model).',
  ],
  pictos,
}

writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n')

console.log(`Wrote ${pictos.length} records to ${outPath}`)
console.log('Classification counts:', counts)
for (const k of ['A', 'B', 'C', 'D'] as const) {
  console.log(`  ${k}: ${counts[k]} (${((counts[k] / pictos.length) * 100).toFixed(1)}%)`)
}
