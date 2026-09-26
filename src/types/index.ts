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
export type WeaponStatus = 'undiscovered' | 'owned';

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
