# Optimizer Model

This document explains exactly what the "Analyze My Build" optimizer computes, what is a verified game fact versus a
heuristic design choice, and what it deliberately does not attempt to model. If a number or recommendation in the app
surprises you, this is the place to check why it was produced.

The code enforces this same three-way split — see `src/optimizer/`:

- **CALCULATED** — a fact derived directly and deterministically from your input and known constraints (e.g. points
  spent vs. budget, whether your current allocation is roughly even, Lumina cost totals against your budget).
- **HEURISTIC** — a recommendation based on known weapon scaling, Picto/Lumina categories, and configurable strategy
  weights. Useful, but a design choice, not a verified formula.
- **UNKNOWN** — a mechanic for which no sufficiently reliable information was found. Never guessed at, never shown as
  if it were a fact.

The app must never claim to compute a true optimal DPS or an exact damage percentage. Where no verified formula
exists, it says so instead of inventing one.

## Attribute allocation

**What's calculated:** points spent vs. your entered budget, points remaining, and whether your current allocation
is "roughly even" across all five attributes (max-min range within 15% of the average — a purely statistical
property of the numbers you entered, independent of any game knowledge).

**What's heuristic:** the *suggested* allocation. For each attribute:

```
combinedWeight = strategyProfile.attributeWeight
                 × (1 + scalingGradeWeight(weapon's grade for that attribute) / 5)
```

`scalingGradeWeight` is our own scoring convention (S=5, A=4, B=3, C=2, D=1, unscored=0) — the game does not publish a
numeric value per S/A/B/C/D letter grade, so this is a design choice to make grades comparable, not a verified value.
The suggested point budget is then distributed proportionally to `combinedWeight` across the five attributes, after
first reserving a small floor (5% of the budget, split evenly) so the optimizer never suggests reducing any attribute
all the way to zero — a deliberate guardrail, not a game rule. This whole process is deterministic (same inputs
always produce the same suggested allocation — verified in `src/optimizer/__tests__/attributeOptimizer.test.ts`).

**Why this design:** it directly answers "my points are spread evenly, where would they be more useful?" — an even
allocation against a weapon that scales S/A on two attributes and D/unscored on the rest is visibly, explainably
suboptimal under this model, without needing to know the exact underlying damage formula (which isn't publicly
documented — see Unknowns below).

## Picto loadout (which 3 to equip)

Each owned Picto is scored as a weighted sum of its attribute bonuses (Health, Defense, Critical Rate, Speed) at its
current level, using the selected strategy profile's per-stat weights. Because Health is stored in the hundreds/
thousands while Critical Rate and Speed are stored in the tens, each stat is first divided by a reference scale
(`data/optimizer_reference.json` → `pictoStatReferenceScale`) before weighting — otherwise Health would dominate
every recommendation regardless of strategy, which would be a modeling bug, not a real prioritization.

No synergy between Pictos is modeled (none is reliably documented for this game). This means top-3-by-individual-
score is the exact mathematical optimum for this additive model — a real, provable claim about the model, but not a
claim about actual in-combat value.

## Lumina combination

This is modeled as a genuine constrained optimization — a 0/1 knapsack (maximize total heuristic value subject to
`SUM(cost) ≤ your Lumina point budget`), solved exactly via dynamic programming for realistic budgets (falls back to
a disclosed greedy approximation only if the budget is unusually large, see `isExactSolution` in the result).

Value is scored from each Picto's `type` category (Offensive/Defensive/Support, or a combination like "Defensive /
Support" averaged across categories) weighted by the strategy profile. **This deliberately does not use the
attribute-bonus table** (Health/Defense/Critical Rate/Speed) for Luminas: whether unlocking a Picto as a Lumina also
grants that attribute table, or only its unique effect, is not verified by any source checked (see Unknowns). Scoring
only by the documented `type` field avoids silently mixing up two mechanics that may not both apply.

## Skills

Intentionally outside the optimizer for v0.1. `characters.json` only stores skill effects as flavor text
("Deals medium single target damage... Uses weapon's element..."), not structured numeric modifiers. Turning that
into real mechanical data would require NLP interpretation of prose, which risks fabricating precision. The app
always reports skills as `insufficient_model` rather than guessing.

## Strategy profiles

Six profiles (Balanced, Damage, Defensive, Break, Status/Burn, Custom), each just a named set of attribute/stat/
Lumina-type weights in `data/optimizer_reference.json` — edit that file directly to retune any profile, or to define
your own under `custom`, without touching code. All of these are our own heuristic design choices for a general
sense of role priority; the "Break" profile in particular is flagged as more speculative than the others, since
Phase 1B research did not find a dedicated, sourced breakdown of the Break mechanic's attribute scaling.

## Known unknowns (never modeled, never fabricated)

- Any exact formula converting attribute points, weapon scaling grade, and level into a damage or DPS number. Not
  documented by any source checked — the app will never display one.
- Exact numeric soft-cap/breakpoint values for any attribute. Two community guides gave contradictory numbers for the
  same attributes during research, so neither is treated as fact.
- Exact per-weapon level thresholds at which scaling grades or passives change (only a generic, labeled
  community-cited approximation — levels 4/10/20/33 — is recorded, not a verified per-weapon table).
- Weapon passive names/effects/unlock levels — left empty for almost all of the 149 weapons in `data/weapons.json`.
  Gathering this reliably for every weapon was judged disproportionate for a one-day v0.1 project; it doesn't block
  the attribute/weapon optimizer, which only needs scaling grades.
- Whether individual characters have unique base-stat growth curves, or all six share one formula.
- Whether an unlocked Lumina also grants its Picto's attribute-bonus table (see Lumina section above).
- Skill mechanical effects (see Skills section above).

## Known weaknesses / caveats

- `data/weapons.json`'s scaling-grade table came from a single primary source (Game8's "List of All Weapons") and
  was spot-checked against a second independent fetch only for the Gustave/Verso rows. Two weapon names are flagged
  as uncertain in that file's `notes` field pending a manual check. Every weapon entry in the table shows only S/A
  grades (no B/C/D observed) — this may be accurate or may reflect a gap in what that source page displayed; it was
  not independently confirmed either way.
- The "Break" and "Status/Burn" strategy profiles are more speculative than "Damage"/"Defensive"/"Balanced" — treat
  their suggestions as a rougher starting point.
- The floor-guardrail ratio (5%), scaling-grade weights (S=5…D=1), and Picto-stat reference scale are all our own
  chosen constants, not verified game values. They're centralized in `data/optimizer_reference.json` specifically so
  they're easy to find, question, and retune.

## Future improvements (not done in v0.1, on purpose)

- Populate weapon passives/unlock levels as you discover them in-game (the schema already supports it —
  `Weapon.passives` — it's just empty for now).
- Cross-check the weapons scaling table against a second independent source (Fextralife/Fandom were unreachable
  during Phase 1B research; worth retrying).
- If a verified damage/crit formula is ever found or reverse-engineered with confidence, it could upgrade parts of
  the HEURISTIC tier to CALCULATED — but only then, and only for the specific mechanic that's been verified.
- Optional per-Picto level selection in the Build screen (currently the optimizer uses each Picto's highest known
  level automatically).
