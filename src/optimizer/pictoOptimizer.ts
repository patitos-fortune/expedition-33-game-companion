/**
 * HEURISTIC tier: which owned Pictos to equip (max 3 slots, per the in-game
 * limit already encoded by the upstream picto-builder UI).
 *
 * Scoring is a simple weighted sum of each Picto's attribute bonuses (Health,
 * Defense, Critical Rate, Speed) at a given level, under the selected
 * strategy profile. No cross-Picto synergy is modeled (none is reliably
 * documented), which means top-N selection by individual score is the exact
 * optimum for this additive model — not a claim about actual combat value.
 */
import type { NormalizedPicto, StrategyProfile } from '../types'
import { pictoStatReferenceScale } from './modelConfig'

export interface PictoScoreEntry {
  pictoId: string
  score: number
  levelUsed: string
  topStats: string[]
}

export interface PictoLoadoutSuggestion {
  suggestedEquippedIds: string[]
  currentEquippedIds: string[]
  additions: string[]
  removals: string[]
  scores: Record<string, PictoScoreEntry>
  reasons: Record<string, string>
  summary: string
}

function levelToUse(picto: NormalizedPicto, levelByPictoId?: Record<string, string>): NormalizedPicto['levels'][number] | undefined {
  if (picto.levels.length === 0) return undefined
  const requested = levelByPictoId?.[picto.id]
  const found = requested ? picto.levels.find((l) => l.level === requested) : undefined
  return found ?? picto.levels[picto.levels.length - 1]
}

function scorePicto(picto: NormalizedPicto, profile: StrategyProfile, levelByPictoId?: Record<string, string>): PictoScoreEntry {
  const levelData = levelToUse(picto, levelByPictoId)
  if (!levelData) {
    // Data-quality gap in the source file (a Picto with no recorded attribute
    // levels at all — this does happen upstream, see loadGameData warnings).
    // Score it lowest rather than crashing or fabricating a value.
    return { pictoId: picto.id, score: -Infinity, levelUsed: '(no data)', topStats: [] }
  }
  let score = 0
  const contributions: Array<{ stat: string; contribution: number }> = []
  for (const [stat, value] of Object.entries(levelData.attributes)) {
    const weight = profile.pictoStatWeights[stat] ?? 1
    // Normalize before weighting: raw units differ wildly by stat (Health in
    // the hundreds/thousands vs. Critical Rate in the tens), so an unnormalized
    // sum would always be dominated by Health regardless of strategy.
    const normalizedValue = value / pictoStatReferenceScale(stat)
    const contribution = weight * normalizedValue
    score += contribution
    contributions.push({ stat, contribution })
  }
  contributions.sort((a, b) => b.contribution - a.contribution)
  return {
    pictoId: picto.id,
    score,
    levelUsed: levelData.level,
    topStats: contributions.slice(0, 2).map((c) => c.stat),
  }
}

export function suggestPictoLoadout(params: {
  ownedPictos: NormalizedPicto[]
  profile: StrategyProfile
  currentEquippedIds: string[]
  levelByPictoId?: Record<string, string>
  slotCount?: number
}): PictoLoadoutSuggestion {
  const { ownedPictos, profile, currentEquippedIds, levelByPictoId, slotCount = 3 } = params

  const scored = ownedPictos.map((p) => scorePicto(p, profile, levelByPictoId))
  // Deterministic ordering: score desc, then pictoId asc as a stable tiebreaker.
  scored.sort((a, b) => b.score - a.score || a.pictoId.localeCompare(b.pictoId))

  const suggestedEquippedIds = scored.slice(0, slotCount).map((s) => s.pictoId)
  const suggestedSet = new Set(suggestedEquippedIds)
  const currentSet = new Set(currentEquippedIds)

  const additions = suggestedEquippedIds.filter((id) => !currentSet.has(id))
  const removals = currentEquippedIds.filter((id) => !suggestedSet.has(id))

  const pictoById = new Map(ownedPictos.map((p) => [p.id, p]))
  const scoresById: Record<string, PictoScoreEntry> = {}
  const reasons: Record<string, string> = {}
  for (const s of scored) {
    scoresById[s.pictoId] = s
    const picto = pictoById.get(s.pictoId)
    const name = picto?.name ?? s.pictoId
    if (suggestedSet.has(s.pictoId)) {
      reasons[s.pictoId] = `"${name}" scores highest under the ${profile.label} profile, driven mainly by ${s.topStats.join(' and ')} at level ${s.levelUsed}.`
    } else if (currentSet.has(s.pictoId)) {
      reasons[s.pictoId] = `"${name}" scores lower than ${slotCount} other owned Pictos under the ${profile.label} profile, so a swap is suggested.`
    }
  }

  const summary =
    additions.length === 0
      ? 'Your currently equipped Pictos already form the highest-scoring combination among your owned Pictos under this profile.'
      : `${additions.length} possible improvement${additions.length === 1 ? '' : 's'}: swap in ${additions
          .map((id) => pictoById.get(id)?.name ?? id)
          .join(', ')}.`

  return {
    suggestedEquippedIds,
    currentEquippedIds: [...currentEquippedIds],
    additions,
    removals,
    scores: scoresById,
    reasons,
    summary,
  }
}
