/**
 * Type definitions for the application.
 *
 * The "upstream" section describes the shape of the untouched picto-builder
 * data files (src/assets/characters.json, src/assets/pictos_list.json).
 * The "domain" section describes our own game-companion data/state, added
 * on top without modifying those upstream files.
 */

// ---------------------------------------------------------------------------
// Upstream shapes (from picto-builder, MIT licensed — see SOURCE_ATTRIBUTION.md)
// ---------------------------------------------------------------------------

/** Raw picto entry exactly as stored in src/assets/pictos_list.json. */
export interface RawPictoItem {
  full_url: string;
  name: string;
  type: string;
  effect: string;
  /** Upstream cost is not reliably typed — can be a number or a numeric string. */
  cost: number | string;
  attributes: Array<{
    level: string;
    attributes: Record<string, string>;
  }>;
}

/** Raw skill entry exactly as stored in src/assets/characters.json. */
export interface RawSkillItem {
  full_url: string;
  name: string;
  effect: string;
  cost: number;
  id: number;
}

/** Raw character entry exactly as stored in src/assets/characters.json. */
export interface RawCharacter {
  name: string;
  id: number;
  icon?: string;
  skills: RawSkillItem[];
}

// ---------------------------------------------------------------------------
// Normalized/domain shapes (produced by src/gamedata/loadGameData.ts)
// ---------------------------------------------------------------------------

/** A picto's attribute bonuses at one of its levels, with numeric values. */
export interface NormalizedPictoLevel {
  level: string;
  attributes: Record<string, number>;
}

export interface NormalizedPicto {
  id: string;
  name: string;
  type: string;
  effect: string;
  fullUrl: string;
  /** Normalized to a finite non-negative integer; see costValid. */
  cost: number;
  /** False if the upstream cost value could not be parsed as a valid number. */
  costValid: boolean;
  levels: NormalizedPictoLevel[];
}

export interface NormalizedSkill {
  id: number;
  name: string;
  effect: string;
  cost: number;
  fullUrl: string;
}

export interface NormalizedCharacter {
  id: number;
  name: string;
  icon?: string;
  skills: NormalizedSkill[];
}

/** The five allocatable character attributes. */
export const ATTRIBUTES = ['Vitality', 'Might', 'Agility', 'Defense', 'Luck'] as const;
export type AttributeName = (typeof ATTRIBUTES)[number];

export type ScalingGrade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface WeaponPassive {
  level: number;
  name: string;
  effect: string;
  /** Provenance/confidence note for this specific passive entry. */
  confidence?: string;
}

export interface Weapon {
  id: string;
  character: string;
  name: string;
  element: string | null;
  /** S/A/B/C/D grade per attribute, or null if that attribute isn't scored for this weapon. */
  scaling: Record<AttributeName, ScalingGrade | null>;
  maxPower: number | null;
  maxPowerReferenceLevel: number | null;
  scalingChangesWithLevel: boolean;
  passives: WeaponPassive[];
  confidence: string;
  notes?: string | null;
}

export type PictoStatus = 'undiscovered' | 'owned' | 'unlocked_lumina';
export type WeaponStatus = 'undiscovered' | 'owned' | 'equipped';

export type StrategyProfileKey = 'balanced' | 'damage' | 'defensive' | 'break' | 'status_burn' | 'custom';

export interface StrategyProfile {
  key: StrategyProfileKey;
  label: string;
  description: string;
  attributeWeights: Record<AttributeName, number>;
  pictoStatWeights: Record<string, number>;
  luminaTypeWeights: Record<string, number>;
}

/** Per-character build configuration the user enters before analysis. */
export interface CharacterBuild {
  characterId: number;
  level: number | null;
  attributePointBudget: number;
  attributeAllocation: Record<AttributeName, number>;
  weaponId: string | null;
  weaponLevel: number;
  equippedPictoIds: string[];
  activeLuminaIds: string[];
  /** Desired additions that are not part of the current in-game build yet. */
  plannedLuminaIds: string[];
  luminaPointBudget: number;
  strategyProfile: StrategyProfileKey;
}

export interface InventoryState {
  pictoStatus: Record<string, PictoStatus>;
  weaponStatus: Record<string, WeaponStatus>;
  spoilerProtection: boolean;
  /** Shared, unspent Colour of Lumina currency available to raise character capacities. */
  colourOfLuminaAvailable: number;
}

/** Everything persisted locally / exported to a backup file. */
export interface PersistedAppState {
  schemaVersion: number;
  savedAt: string;
  inventory: InventoryState;
  builds: Record<number, CharacterBuild>;
  activeCharacterId: number | null;
}

// ---------------------------------------------------------------------------
// Structured Picto/Lumina effect taxonomy (Phase 2.2A, data/picto_effects.json)
//
// Generated OFFLINE by src/optimizer/effectClassifier.ts (via
// scripts/generate-picto-effects.ts) from src/assets/pictos_list.json's raw
// `effect` text. Never produced or interpreted at runtime, never guessed by
// an LLM — see OPTIMIZER_MODEL.md for the full taxonomy documentation and
// data/picto_effects.json's own `_provenance`/`_knownUnknowns`.
// ---------------------------------------------------------------------------

/**
 * How confidently a Picto's effect text was reduced to structured tags.
 * A/B are usable by the optimizer; C/D are recorded but never treated as if
 * they were confidently structured (UNKNOWN stays UNKNOWN — see Task 3 of
 * the Phase 2.2 discovery report).
 *  A — fully structured with high confidence (mechanic + trigger/target + effect all matched).
 *  B — partially structured (at least one dimension matched, effect verb not confidently resolved).
 *  C — genuinely ambiguous even with a complete taxonomy (e.g. references an undocumented
 *      game-specific mechanic, or mixes flavor/walkthrough text into the effect field).
 *  D — no taxonomy concept currently matches this effect at all.
 */
export type PictoEffectClassification = 'A' | 'B' | 'C' | 'D';

/** Literal numeric values copied verbatim from the source effect text — never derived or estimated. */
export interface PictoEffectParameters {
  /** Every "%" figure found in the text, in reading order, e.g. [25] for "25% increased ...". */
  percentages?: number[];
  /** Flat quantities with their stated unit, e.g. [{ value: 1, unit: 'AP' }] for "+1 AP ...". */
  flatValues?: Array<{ value: number; unit: string }>;
  /** A stated turn-duration count, e.g. 3 for "for 3 turns". */
  turns?: number;
  /** A stated stacking cap, e.g. 10 for "Can stack up to 10 times". */
  stackCap?: number;
  /** An explicit "Once per turn"/"Once per battle" rate limiter, if stated. */
  onceLimiter?: 'turn' | 'battle';
}

/**
 * One Picto/Lumina's structured effect classification. `pictoId` matches
 * `NormalizedPicto.id` (`picto-<index>`, src/gamedata/loadGameData.ts) so it
 * can be looked up directly against the normalized game data.
 *
 * Tag strings are free-form but drawn only from the documented vocabularies
 * in src/optimizer/effectClassifier.ts (KNOWN_MECHANICS / KNOWN_TRIGGERS /
 * KNOWN_EFFECTS / KNOWN_TARGETS) — some effect/mechanic tags carry a
 * colon-encoded parameter, e.g. "apply_status:burn", "increase_stat_pct:break_damage",
 * to keep the schema flat instead of nesting an object per tag.
 */
export interface PictoEffectRecord {
  pictoId: string;
  name: string;
  /** Copied verbatim from src/assets/pictos_list.json — never edited, so a human can audit tags against it directly. */
  sourceEffectText: string;
  mechanics: string[];
  triggers: string[];
  effects: string[];
  targets: string[];
  parameters: PictoEffectParameters;
  classification: PictoEffectClassification;
  /** Free-text note explaining a manual override or a C/D classification's reasoning, when applicable. */
  notes?: string;
  taxonomyVersion: number;
}

export interface PictoEffectsFile {
  _schemaVersion: number;
  _taxonomyVersion: number;
  _provenance: {
    generatedBy: string;
    sourceFile: string;
    generatedAt: string;
  };
  _knownUnknowns: string[];
  pictos: PictoEffectRecord[];
}
