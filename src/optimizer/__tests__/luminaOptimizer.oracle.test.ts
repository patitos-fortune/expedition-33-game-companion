/**
 * Oracle (parity) test for the Lumina knapsack in `luminaOptimizer.ts`.
 *
 * GUARANTEE UNDER TEST (OPTIMIZER_MODEL.md, "Lumina combination"): for
 * budget <= 2000 the suggested combination is the exact optimum of a 0/1
 * knapsack — maximum total value subject to SUM(cost) <= budget. Specifically:
 *   - budget is floored; non-finite or non-positive budgets mean 0;
 *   - Luminas whose Picto is equipped (`freePictoIds`) are always included at
 *     0 Lumina points;
 *   - other Luminas are purchasable only if 0 < cost <= budget (cost 0 is how
 *     an unparseable upstream cost is normalized, so it is never suggested);
 *   - ties between equally valuable sets are NOT specified, so only values are
 *     compared, never which set was chosen.
 *
 * ORACLE: try every subset of the purchasable items (2^n, n <= 14). It shares
 * no code with the implementation: not the DP, not `valueOf`, not
 * `luminaTypeWeightFor`. Values are computed here straight from a profile's
 * type weights as round(weight * 100). Single-category types only, so the
 * shared `splitPictoTypeCategories` / combined-type averaging is NOT covered by
 * this file (listed as an untested gap in the PS-PATLEARN-004 report).
 *
 * Failures print the seed. To reproduce: `inspect(seed)` below.
 */
import { describe, expect, it } from 'vitest'
import { suggestLuminaCombination, type LuminaCombinationSuggestion } from '../luminaOptimizer'
import type { NormalizedPicto, StrategyProfile } from '../../types'

type Params = Parameters<typeof suggestLuminaCombination>[0]
type Solver = (params: Params) => LuminaCombinationSuggestion

const SEEDS = 400
const WEIGHT_SETS: Array<Record<string, number>> = [
  { Offensive: 2, Defensive: 1.5, Support: 1 },
  { Offensive: 1, Defensive: 1, Support: 1 }, // every value tied: worst case for tie handling
  { Offensive: 0.5, Defensive: 2.5, Support: 1.5 },
]
const TYPES = ['Offensive', 'Defensive', 'Support']

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeProfile(weights: Record<string, number>): StrategyProfile {
  return {
    key: 'custom',
    label: 'Oracle test profile',
    description: '',
    attributeWeights: { Vitality: 1, Might: 1, Agility: 1, Defense: 1, Luck: 1 } as StrategyProfile['attributeWeights'],
    pictoStatWeights: {},
    luminaTypeWeights: weights,
  }
}

function makeLumina(id: string, cost: number, type: string): NormalizedPicto {
  return { id, name: id, type, effect: 'test effect', fullUrl: '', cost, costValid: cost > 0, levels: [{ level: '1', attributes: {} }] }
}

/** Independent value rule: round(typeWeight * 100). */
const oracleValue = (l: NormalizedPicto, weights: Record<string, number>) => Math.round(weights[l.type] * 100)
const oracleBudget = (b: number) => (Number.isFinite(b) && b > 0 ? Math.floor(b) : 0)

/** Exhaustive search: best total value of any subset of `items` costing <= budget. */
function bestPaidValueBruteForce(items: Array<{ cost: number; value: number }>, budget: number): number {
  let best = 0
  for (let mask = 0; mask < 1 << items.length; mask++) {
    let cost = 0
    let value = 0
    for (let i = 0; i < items.length; i++) {
      if (mask & (1 << i)) {
        cost += items[i].cost
        value += items[i].value
      }
    }
    if (cost <= budget && value > best) best = value
  }
  return best
}

interface Instance {
  params: Params
  weights: Record<string, number>
  luminas: NormalizedPicto[]
  freeIds: Set<string>
}

function instanceFor(seed: number): Instance {
  const rand = mulberry32(seed)
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
  const weights = WEIGHT_SETS[seed % WEIGHT_SETS.length]
  const n = int(0, 14)
  const luminas = Array.from({ length: n }, (_, i) => makeLumina(`l${i}`, int(1, 25), TYPES[int(0, 2)]))
  const freeIds = new Set(luminas.filter(() => rand() < 0.25).map((l) => l.id))
  const budget = int(0, 40) + (rand() < 0.2 ? 0.5 : 0)
  const params: Params = {
    unlockedLuminas: luminas,
    profile: makeProfile(weights),
    budget,
    currentLuminaIds: [],
    freePictoIds: [...freeIds],
  }
  return { params, weights, luminas, freeIds }
}

/** Returns one message per broken part of the guarantee, each tagged with its seed. */
function violationsFor(solve: Solver, seed: number): string[] {
  const { params, weights, luminas, freeIds } = instanceFor(seed)
  const out: string[] = []
  const fail = (msg: string) => out.push(`seed ${seed}: ${msg}`)
  const budget = oracleBudget(params.budget)
  const result = solve(params)
  const byId = new Map(luminas.map((l) => [l.id, l]))

  // Validity (constraints), asserted separately from optimality.
  const ids = result.suggestedLuminaIds
  if (new Set(ids).size !== ids.length) fail(`duplicate ids in ${JSON.stringify(ids)}`)
  if (ids.some((id) => !byId.has(id))) fail(`suggested an id outside the unlocked list: ${JSON.stringify(ids)}`)
  for (const id of freeIds) if (!ids.includes(id)) fail(`free Lumina ${id} was not included`)
  const paidChosen = ids.filter((id) => byId.has(id) && !freeIds.has(id)).map((id) => byId.get(id)!)
  const paidCost = paidChosen.reduce((s, l) => s + l.cost, 0)
  if (paidCost > budget) fail(`paid cost ${paidCost} exceeds budget ${budget}`)
  if (result.totalCost !== paidCost) fail(`reported totalCost ${result.totalCost} != independent ${paidCost}`)
  if (result.isExactSolution !== true) fail('isExactSolution should be true at this budget')

  // Value: internal consistency, then optimality against the oracle.
  const chosenValue = ids.filter((id) => byId.has(id)).reduce((s, id) => s + oracleValue(byId.get(id)!, weights), 0)
  if (result.totalValue !== chosenValue) fail(`reported totalValue ${result.totalValue} != value of chosen set ${chosenValue}`)
  const freeValue = luminas.filter((l) => freeIds.has(l.id)).reduce((s, l) => s + oracleValue(l, weights), 0)
  const purchasable = luminas
    .filter((l) => !freeIds.has(l.id) && l.cost > 0 && l.cost <= budget)
    .map((l) => ({ cost: l.cost, value: oracleValue(l, weights) }))
  const optimum = freeValue + bestPaidValueBruteForce(purchasable, budget)
  if (result.totalValue !== optimum) fail(`totalValue ${result.totalValue} != oracle optimum ${optimum} (budget ${budget})`)
  return out
}

function allViolations(solve: Solver): string[] {
  return Array.from({ length: SEEDS }, (_, seed) => violationsFor(solve, seed)).flat()
}

/** Re-run one failing seed and show its instance: `console.log(inspect(17))`. */
export function inspect(seed: number) {
  const { params } = instanceFor(seed)
  return { budget: params.budget, free: params.freePictoIds, items: params.unlockedLuminas.map((l) => `${l.id}:${l.type}:${l.cost}`) }
}

// --- Deliberately wrong solvers, to prove the harness can fail (method step 10). ---

function mutantSolver(kind: 'reuse-items' | 'ratio-greedy'): Solver {
  return (params) => {
    const real = suggestLuminaCombination(params)
    const weights = params.profile.luminaTypeWeights
    const free = new Set(params.freePictoIds ?? [])
    const budget = oracleBudget(params.budget)
    const paid = params.unlockedLuminas
      .filter((l) => !free.has(l.id) && l.cost > 0 && l.cost <= budget)
      .map((l) => ({ id: l.id, cost: l.cost, value: oracleValue(l, weights) }))
    const freeItems = params.unlockedLuminas.filter((l) => free.has(l.id))
    const freeValue = freeItems.reduce((s, l) => s + oracleValue(l, weights), 0)
    let chosen: string[] = []
    if (kind === 'ratio-greedy') {
      let left = budget
      for (const it of [...paid].sort((a, b) => b.value / b.cost - a.value / a.cost)) {
        if (it.cost <= left) {
          chosen.push(it.id)
          left -= it.cost
        }
      }
    } else {
      // The capacity loop runs upward, so an item can be taken repeatedly.
      const dp = new Array<number>(budget + 1).fill(0)
      const pick = new Array<number>(budget + 1).fill(-1)
      for (let i = 0; i < paid.length; i++) {
        for (let c = paid[i].cost; c <= budget; c++) {
          if (dp[c - paid[i].cost] + paid[i].value > dp[c]) {
            dp[c] = dp[c - paid[i].cost] + paid[i].value
            pick[c] = i
          }
        }
      }
      for (let c = budget; c > 0 && pick[c] >= 0; c -= paid[pick[c]].cost) chosen.push(paid[pick[c]].id)
    }
    const chosenValue = chosen.reduce((s, id) => s + (paid.find((p) => p.id === id)?.value ?? 0), 0)
    return {
      ...real,
      suggestedLuminaIds: [...freeItems.map((l) => l.id), ...chosen],
      totalValue: freeValue + chosenValue,
      totalCost: chosen.reduce((s, id) => s + (paid.find((p) => p.id === id)?.cost ?? 0), 0),
    }
  }
}

describe('luminaOptimizer knapsack vs exhaustive-search oracle', () => {
  it(`matches the oracle on ${SEEDS} seeded random instances (validity and optimal value)`, () => {
    // Any failure message starts with the reproducing seed.
    expect(allViolations(suggestLuminaCombination)).toEqual([])
  })

  it('harness self-check: catches a solver whose capacity loop reuses items', () => {
    expect(allViolations(mutantSolver('reuse-items')).length).toBeGreaterThan(0)
  })

  it('harness self-check: catches a value-per-cost greedy solver', () => {
    const found = allViolations(mutantSolver('ratio-greedy'))
    expect(found.some((m) => m.includes('oracle optimum'))).toBe(true)
  })

  describe('hand-picked edge cases', () => {
    const profile = makeProfile({ Offensive: 1, Defensive: 1, Support: 1 })
    const solve = (luminas: NormalizedPicto[], budget: number, freePictoIds: string[] = []) =>
      suggestLuminaCombination({ unlockedLuminas: luminas, profile, budget, currentLuminaIds: [], freePictoIds })

    it('does not reuse an item: (cost 3) and (cost 4) at budget 6 take one item, not two copies', () => {
      const r = solve([makeLumina('a', 3, 'Offensive'), makeLumina('b', 4, 'Offensive')], 6)
      expect(r.totalValue).toBe(100)
      expect(new Set(r.suggestedLuminaIds).size).toBe(r.suggestedLuminaIds.length)
    })

    it('with all values tied, still fills the budget optimally by count (two cheap items beat one dear one)', () => {
      const r = solve([makeLumina('big', 10, 'Support'), makeLumina('s1', 5, 'Support'), makeLumina('s2', 5, 'Support')], 10)
      expect(r.totalValue).toBe(200)
      expect(r.totalCost).toBeLessThanOrEqual(10)
    })

    it('never suggests a zero-cost, non-free Lumina (an unparseable cost normalizes to 0)', () => {
      const r = solve([makeLumina('free-looking', 0, 'Offensive'), makeLumina('paid', 5, 'Offensive')], 5)
      expect(r.suggestedLuminaIds).toEqual(['paid'])
    })

    it('floors a fractional budget and treats NaN / negative budgets as 0', () => {
      const items = [makeLumina('a', 5, 'Offensive')]
      expect(solve(items, 4.9).suggestedLuminaIds).toEqual([])
      expect(solve(items, 5.9).suggestedLuminaIds).toEqual(['a'])
      expect(solve(items, Number.NaN).suggestedLuminaIds).toEqual([])
      expect(solve(items, -3).suggestedLuminaIds).toEqual([])
    })

    it('is exact at the 2000-point cap and discloses the approximation just above it', () => {
      const items = [makeLumina('a', 1500, 'Offensive'), makeLumina('b', 500, 'Offensive'), makeLumina('c', 600, 'Offensive')]
      const atCap = solve(items, 2000)
      expect(atCap.isExactSolution).toBe(true)
      expect(atCap.totalValue).toBe(200) // a+b = 2000; a+c = 2100 does not fit
      const above = solve(items, 2001)
      expect(above.isExactSolution).toBe(false)
      expect(above.summary).toContain('approximate')
      expect(above.totalCost).toBeLessThanOrEqual(2001)
    })
  })
})
