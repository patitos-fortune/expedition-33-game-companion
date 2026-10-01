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

**Break profile only:** see "Structured Picto/Lumina effect taxonomy" below — under the Break strategy profile, and
only that profile, each Picto's score also gets a small additive bonus from structured effect tags, with the specific
reasons exposed in `reasons`. Every other profile scores Pictos exactly as described above, unchanged.

## Structured Picto/Lumina effect taxonomy (Phase 2.2A)

In addition to the `type` category and attribute-bonus table above, every Picto's raw effect text
(`src/assets/pictos_list.json` → `effect`) is also parsed into a small structured taxonomy of **mechanics**,
**triggers**, **effects** (verbs, e.g. `apply_status:burn`, `grant_break_capability`), **targets/conditions**, and any
literal numeric **parameters** the text states. This is a second, complementary lens on the same source text — it
does not replace the `type` category or the attribute-bonus table used elsewhere in this document, and by itself it
changes no recommendation (see "How Break uses this" below).

**Pipeline (dev-time only, not part of the shipped app):**

```
src/assets/pictos_list.json → src/optimizer/effectClassifier.ts (deterministic rule-based classifier)
                             → scripts/generate-picto-effects.ts (run manually: tsx scripts/generate-picto-effects.ts)
                             → data/picto_effects.json (checked-in, human-reviewable)
```

The shipped app only ever reads the checked-in `data/picto_effects.json` (via `src/optimizer/effectModel.ts`) — it
never re-classifies anything at runtime, and `effectClassifier.ts` is not imported by any view, store, or route.
Classification is **rule-based only** (regex/keyword matching over the literal source text, plus a short table of
manual overrides for cases no general rule can safely resolve) — there is no LLM, NLP model, or network call
anywhere in this pipeline, and the same input text always produces the same output (verified by
`src/optimizer/__tests__/effectClassifier.test.ts`'s determinism tests).

**Classification confidence (A/B/C/D), current coverage over the full 233-Picto corpus:**

| Tier | Meaning | Count | % |
|---|---|---|---|
| A | Fully structured — at least one mechanic/trigger/target tag *and* at least one effect tag | 153 | 65.7% |
| B | Partially structured — only a tag *or* only an effect, not both | 73 | 31.3% |
| C | Genuinely ambiguous even with the complete taxonomy — a manual override with a documented reason | 6 | 2.6% |
| D | No taxonomy concept matches at all | 1 | 0.4% |

Taxonomy version: `1` (`TAXONOMY_VERSION` in `effectClassifier.ts`, stamped onto every record and onto the file
itself as `_taxonomyVersion`). C and D are treated as acceptable, honest outcomes, not failures — ambiguity is
preserved rather than forced into a confident tag. The six manual-override (C) cases and the one D case are
individually documented, with a `notes` field explaining the specific reason, in both `effectClassifier.ts`
(`MANUAL_OVERRIDES`) and `data/picto_effects.json`:

- **Feint** — references an undocumented mechanic ("barbapapa stacks") with no other appearance in the corpus; left
  entirely untagged rather than guessed at.
- **Trigger Happy** / **Clea's Life** — the numeric effect itself is clear and kept (`gain_ap` / `heal_pct`
  respectively), but each has a trigger condition (a cross-action shot count; a cross-turn "no damage taken" check)
  that the trigger vocabulary has no counting/cross-turn-state concept for, so no trigger tag is recorded for either.
- **Painted Power** — the source text is mostly walkthrough/lore prose with the actual mechanic (damage cap removal)
  embedded in it; a source data-quality issue, not something a taxonomy rule should try to parse around.
- **Roulette** — a genuine random-branching effect ("50% chance to deal either 50% or 200%"), tagged
  `random_branch` deliberately instead of averaged into one number, since averaging would fabricate a value the
  source text never states.
- **Great Energy Tint** / **Great Healing Tint** — "now affect the whole Expedition" is a scope change the TARGET
  vocabulary can't fully express without assuming what "whole Expedition" means; left as C rather than assumed.
- **Pro Retreat** (D) — "Allows Flee to be instantaneous" references no mechanic, trigger, target, or effect concept
  in the current taxonomy at all.

Two smaller, non-override classifier limitations are also worth knowing about (both covered by golden tests):
stat-phrase effects can fail to tag when a qualifying clause interrupts the phrase (e.g. "Deal 50% more damage **if
Health is below 10%**" on *At Death's Door* correctly tags the `health` mechanic and `below_health_pct` target, but
records no `increase_stat_pct` effect, since the interrupting clause breaks the stat-name capture); and a tradeoff
that repeats the same stat word on both sides of "but" (e.g. *Glass Cannon*: "Deal 25% more damage, but take 25% more
damage.") can only tag the stat itself, not which side (dealt vs. taken) each clause refers to.

**Relationship extraction:** `src/optimizer/effectRelationships.ts` finds, per mechanic, which Pictos *produce* it
(e.g. grant Break capability) and which *consume it / react to it* (e.g. trigger on Break, or deal more damage to an
already-Broken target), via a small config table (`MECHANIC_RELATIONSHIP_CONFIG`) rather than hardcoded per-mechanic
logic — extending it to a new mechanic is a config-table addition, not new code. It reports only producer/consumer
name lists, never a numeric synergy strength. Currently configured for 8 mechanics with enough corpus representation
to be meaningful: `ap` (36 producers / 4 consumers), `burn` (6/7), `mark` (3/7), `break` (2/8), `critical` (0/2),
`shield` (5/0), `gradient` (10/0), `stun` (0/6). (`burn` producers rose from 5 to 6 as of Phase 2.2B's "chance to
`<Status>`" classifier correction, which gave Burning Shots its previously-missing `apply_status:burn` tag — see
below.)

**How Break uses this (the only profile wired up so far):** the **Break** strategy profile — and *only* that
profile — reads `data/picto_effects.json` (via `gameData.pictoEffectsById`) to add a small additive HEURISTIC bonus
per Picto/Lumina, plus auditable reasons, in `src/optimizer/breakEffectModel.ts`. The bonus is `signalCount ×
BREAK_EFFECT_PICTO_BONUS_PER_SIGNAL` (Pictos, default 8) or `× BREAK_EFFECT_LUMINA_BONUS_PER_SIGNAL` (Luminas,
default 40) — both editable in `data/optimizer_reference.json` → `breakEffectModel`. `signalCount` is the number of
distinct, independently-checked Break-relevant signals a Picto's structured tags match, each with its own
human-readable reason string:

- `grant_break_capability` present → **"enables Break on Base Attack"** (if the record also has the
  `on_base_attack` trigger) or **"enables Break"** otherwise
- an `increase_stat_pct:*` effect whose stat name contains "break" → **"increases Break damage"**
- the `on_break` trigger present → **"triggers after Breaking an enemy"**
- otherwise, if the `break` mechanic is present at all → **"references the Break mechanic"** (a fallback used only
  when none of the more specific signals above matched)

A record's `stun` mechanic tag or `stunned_enemy` target tag is **not** a Break-scoring signal — an earlier version of
this bonus treated "mentions Stun" as implying Break relevance ("Stun commonly follows a Break"), which was too
speculative for this phase's source-grounding bar and let purely defensive effects (e.g. "Anti-Stun" — "Immune to
Stun.") pick up a Break bonus with no textual connection to Break at all. Stun tagging itself is unaffected — it's
still fully present in the generic taxonomy and in `effectRelationships.ts`'s generic relationship extraction; it is
only excluded from this one Break-specific signal list.

These reasons are surfaced directly in the Picto loadout's and Lumina combination's `reasons` output, appended after
the existing profile-fit sentence (e.g. `... Also: enables Break on Base Attack.`), so a Break recommendation is
always traceable to the exact source-text-derived tag that produced it — explanation is preferred over an opaque
composite score. **No damage, DPS, or "how good in combat" claim is made anywhere in this bonus** — it is a
relevance signal (how many independent ways a Picto's own text references Break), not a measured strength. Every
other strategy profile (Damage, Defensive, Burn / Mark, Balanced, Custom) computes its score exactly as it did before
Phase 2.2A — this bonus is gated on `profile.key === 'break'` in both `pictoOptimizer.ts` and `luminaOptimizer.ts`,
and is never applied outside that one profile (verified by regression tests asserting identical scores/output with
and without the structured-effect data present, for every non-Break profile).

**How Burn / Mark uses this (Phase 2.2B):** the **Burn / Mark** strategy profile (internal key `status_burn`,
unchanged from earlier phases — only its user-facing label and description changed) — and *only* that profile —
also reads `data/picto_effects.json` for a small additive HEURISTIC bonus plus auditable reasons, in
`src/optimizer/statusBurnEffectModel.ts`. The bonus is `signalCount × BURN_MARK_EFFECT_PICTO_BONUS_PER_SIGNAL`
(Pictos, default 8) or `× BURN_MARK_EFFECT_LUMINA_BONUS_PER_SIGNAL` (Luminas, default 40) — both editable in
`data/optimizer_reference.json` → `statusBurnEffectModel`, and entirely independent of the Break constants above
(changing one never affects the other).

This model is **deliberately scoped to Burn and Mark only**. The precise, reproducible "Burn/Mark relevant" population
is **24** records — **14 Burn-only, 9 Mark-only, 1 Burn↔Mark bridge** (by `mechanics.includes('burn'|'mark')`) — and
only those 24 are textually about Burn or Mark specifically. A broader "status-mechanic-tagged" population also
exists — any record whose `mechanics` includes a named status (Stun, Shell, Powerful, Regen, Slow, Defenceless,
Powerless, Charm, Blight, Freeze, Inverted) or the generic `status_effect` tag — but that population's size is a
mechanics-tag-only count, not a claim about "touching a status concept" in any broader sense (see the PS-EXP33-003
corpus reconciliation note below); it is **not** quoted here as a specific number because the broader intuitive
population it was meant to stand in for ("status-touching") has no single agreed, reproducible predicate across
`mechanics`/`effects`/`targets`. None of the records outside the 24 Burn/Mark-relevant ones receive any bonus here,
on the same reasoning as the Stun/Break correction above: "mentions a status" is not the same claim as "helps the
Burn/Mark strategy." Recognized signals, each with its own reason string:

- `apply_status:burn` present → **"applies Burn"** (Burn producer)
- the `burning_enemy` target present → **"benefits from Burning enemies"** (Burn consumer/payoff)
- `extend_status_duration:burn` present → **"extends Burn duration"** (Burn consumer/payoff)
- `multiply_stat:its_burn_amount` present → **"amplifies existing Burn"** (Burn consumer/payoff)
- `apply_status:mark` present → **"applies Mark"** (Mark producer)
- the `marked_enemy` target present → **"benefits from Marked enemies"** (Mark consumer/payoff)
- a record that is **both** a Burn producer and a Mark consumer (i.e. it converts a Marked enemy into a Burning one)
  gets **one** factual bridge reason, **"applies Burn when hitting a Marked enemy"**, which supersedes the two
  separate generic reasons above for that record rather than stating all three redundantly. The single Picto in the
  corpus matching this today is "Burning Mark" ("Apply Burn on hitting a Marked enemy.").

**Item-local only, in this phase.** Relevance is computed purely from one record's own tags — it does **not**
consider whether a matching producer or consumer is present anywhere else in the current build (e.g. a Burn-consumer
Picto gets the same "benefits from Burning enemies" reason and bonus whether or not anything else in the build
actually applies Burn). A build-aware version that recognizes producer/consumer *realization* across the current
build was assessed and deliberately deferred to a possible future phase — see "Future improvements" below.

**Classifier correction that preceded this integration:** `src/optimizer/effectClassifier.ts`'s rule for "N% chance
to `<Status>`" phrasing (e.g. "20% chance to Burn on Free Aim shot.") previously only captured the `chance_trigger`
effect tag, silently dropping the status actually being granted. This was fixed with a rule generic across every
known status word (not hardcoded to any one Picto), covering both the bare-verb form ("chance to Burn") and the
"gain" form ("chance to gain Powerful"), while leaving unrelated "chance to gain N AP" phrasing untouched. This
corrected four records (Burning Shots → `apply_status:burn`, Accelerating Shots → `apply_status:rush`, Powerful
Shots → `apply_status:powerful`, Protecting Shots → `apply_status:shell`); all four were already classification A
and remain A — the fix adds a tag, it never changes a classification tier. `data/picto_effects.json` was
regenerated after this fix; the corpus-wide classification tally at that point was A:153/B:73/C:6/D:1.

**Rush/Freeze mechanic-coverage correction (PS-EXP33-003):** a later read-only corpus reconciliation (triggered by a
stale `burn` producer-count test after the fix above) surfaced two further, unrelated taxonomy gaps: `rush` was a
valid `STATUS_WORDS` entry (driving `apply_status:rush` and the "chance to `<Status>`" rule) but had no corresponding
`mechanics`-detection rule or `KNOWN_MECHANICS` entry at all, so a Picto that only mentioned Rush was invisible to
every mechanics-tag query; and the `freeze` mechanic rule only matched "Froze"/"Frozen," not "Freeze," so "Immune to
Freeze" correctly emitted `grant_immunity:freeze` but never got a `freeze` mechanic tag. Both were fixed by adding
`rush` to `KNOWN_MECHANICS`/the mechanic-detection rules and widening the freeze regex to also match "Freeze" —
source-grounded, additive fixes with no change to any effect/trigger/target tag. This gave 13 records their correct
`rush` and/or `freeze` mechanic tag; 4 of those (Anti-Freeze, Greater Rush, Longer Rush, Time Tint) had an effect tag
but no mechanic/trigger/target tag before, so they move from classification B to A once correctly tagged (A
classification requires both). `data/picto_effects.json` was regenerated again; the corpus-wide classification tally
is now **A:157/B:69/C:6/D:1**. Neither fix touches Burn, Mark, Break, or any `status_burn`/`break`-profile scoring —
`rush` and `freeze` are not consumed by `statusBurnEffectModel.ts` or `breakEffectModel.ts`, and the Burn/Mark-relevant
inventory (24: 14/9/1) and every `effectRelationships.ts` producer/consumer count outside `burn` are unaffected.

That same reconciliation also confirmed generic status-cleanse/removal/prevention/dispel wording (e.g. "Dispel the
first negative Status Effect received," "Consume 1 AP to prevent Status Effects application") has no dedicated
structured effect tag at all — only the generic `status_effect` mechanic tag. This is a known, explicitly
out-of-scope taxonomy limitation, not addressed by this correction; see "Known, explicitly out-of-scope classifier
gaps" below.

**Known, explicitly out-of-scope classifier gaps (not fixed in this phase):** "Double Burn" ("On applying a Burn
stack, apply a second one.") and "Double Mark" ("Mark requires 1 more hit to be removed.") are genuinely Burn/Mark-
relevant by mechanic tag but classify B with no effect tag — the classifier has no rule for "apply a second one" or
"requires N more hits," and inventing one narrowly for these two records risked overfitting rather than a clean
generic rule. "Powerful Mark" ("Gain Powerful on hitting a Marked enemy.") similarly classifies B with no effect tag.
All three are therefore invisible to the signals above and receive zero Burn/Mark bonus — a conservative, honest gap
rather than a silent miss, and consistent with this phase's brief not to force-fix every B-classified record.

Separately, generic status-cleanse/removal/prevention/dispel wording (e.g. Beneficial Contamination, Cleansing Tint,
Draining Cleanse, Energising Cleanse) has no dedicated structured effect tag — only the generic `status_effect`
mechanic tag, with no corresponding `effects` entry at all. Whether and how to model "removes/prevents a status" is a
separate modeling-design question (it isn't a Burn/Mark producer or consumer signal, and over-fitting a one-off tag
for 4 records risks the same overfitting this phase otherwise avoids) — documented here as a known taxonomy
limitation, intentionally not implemented.

## Lumina combination

This is modeled as a genuine constrained optimization — a 0/1 knapsack (maximize total heuristic value subject to
`SUM(cost) ≤ your Lumina point budget`), solved exactly via dynamic programming for realistic budgets (falls back to
a disclosed greedy approximation only if the budget is unusually large, see `isExactSolution` in the result).

Value is scored from each Picto's `type` category (Offensive/Defensive/Support, or a combination like "Defensive /
Support" averaged across categories) weighted by the strategy profile. **This deliberately does not use the
attribute-bonus table** (Health/Defense/Critical Rate/Speed) for Luminas: whether unlocking a Picto as a Lumina also
grants that attribute table, or only its unique effect, is not verified by any source checked (see Unknowns). Scoring
only by the documented `type` field avoids silently mixing up two mechanics that may not both apply.

**Break profile only:** see "Structured Picto/Lumina effect taxonomy" above — under the Break strategy profile, and
only that profile, each Lumina's value also gets the same structured-effect bonus described there. Every other
profile scores Luminas exactly as described above, unchanged.

**Burn / Mark profile only:** see "How Burn / Mark uses this (Phase 2.2B)" above — under the Burn / Mark strategy
profile (internal key `status_burn`), and only that profile, each Lumina's value also gets the same Burn/Mark
structured-effect bonus described there, including the Mark→Burn bridge wording. Every other profile, Break included,
scores Luminas exactly as described above, unchanged.

## Skills

Intentionally outside the optimizer for v0.1. `characters.json` only stores skill effects as flavor text
("Deals medium single target damage... Uses weapon's element..."), not structured numeric modifiers. Turning that
into real mechanical data would require NLP interpretation of prose, which risks fabricating precision. The app
always reports skills as `insufficient_model` rather than guessing.

## Strategy profiles

Six profiles (Balanced, Damage, Defensive, Break, Burn / Mark, Custom), each just a named set of attribute/stat/
Lumina-type weights in `data/optimizer_reference.json` — edit that file directly to retune any profile, or to define
your own under `custom`, without touching code. All of these are our own heuristic design choices for a general
sense of role priority; the "Break" and "Burn / Mark" profiles in particular are flagged as more speculative than the
others, since Phase 1B research did not find a dedicated, sourced breakdown of either mechanic's attribute scaling.
As of Phase 2.2A, the Break profile also layers a small structured-effect bonus on top of these weights (see
"Structured Picto/Lumina effect taxonomy" above); as of Phase 2.2B, the Burn / Mark profile (internal key
`status_burn`) layers an equivalent Burn/Mark-only structured-effect bonus (see "How Burn / Mark uses this
(Phase 2.2B)" above) — the other four profiles are unaffected and still use only the weights below.

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
- Structured Picto/Lumina effect tags (`data/picto_effects.json`, see "Structured Picto/Lumina effect taxonomy"
  above) describe which mechanics/triggers/effects a Picto's text references — never combat strength, damage, or
  DPS. The Break-profile bonus and the Burn/Mark-profile bonus that each consume them are HEURISTIC relevance
  signals, not a measured contribution.

## Known weaknesses / caveats

- `data/weapons.json`'s scaling-grade table came from a single primary source (Game8's "List of All Weapons") and
  was spot-checked against a second independent fetch only for the Gustave/Verso rows. Two weapon names are flagged
  as uncertain in that file's `notes` field pending a manual check. Every weapon entry in the table shows only S/A
  grades (no B/C/D observed) — this may be accurate or may reflect a gap in what that source page displayed; it was
  not independently confirmed either way.
- The "Break" and "Burn / Mark" strategy profiles are more speculative than "Damage"/"Defensive"/"Balanced" — treat
  their suggestions as a rougher starting point.
- The floor-guardrail ratio (5%), scaling-grade weights (S=5…D=1), and Picto-stat reference scale are all our own
  chosen constants, not verified game values. They're centralized in `data/optimizer_reference.json` specifically so
  they're easy to find, question, and retune.
- `data/picto_effects.json` was generated once (see its `_provenance` field for the exact generator/source/date) by
  running `tsx scripts/generate-picto-effects.ts` against the corpus described above. If `pictos_list.json` is ever
  edited upstream, the generator must be re-run manually — `src/optimizer/effectModel.ts`'s `validatePictoEffects()`
  detects this drift (record-count mismatch, stale source text, missing record) and surfaces it as a load warning,
  but does not re-generate the file automatically. The classifier has two known, documented limitations beyond the
  six manual-override cases: a qualifying clause between a percentage and its stat name (e.g. "if Health is below
  X%") can prevent that clause from producing an `increase_stat_pct`/`decrease_stat_pct` tag even though its
  mechanic/target tags still land correctly; and a tradeoff that repeats the same stat word on both sides of a "but"
  clause (dealt vs. taken) can only tag the stat itself, not which side each half of the sentence refers to.

## Future improvements (not done in v0.1, on purpose)

- Populate weapon passives/unlock levels as you discover them in-game (the schema already supports it —
  `Weapon.passives` — it's just empty for now).
- Cross-check the weapons scaling table against a second independent source (Fextralife/Fandom were unreachable
  during Phase 1B research; worth retrying).
- If a verified damage/crit formula is ever found or reverse-engineered with confidence, it could upgrade parts of
  the HEURISTIC tier to CALCULATED — but only then, and only for the specific mechanic that's been verified.
- Optional per-Picto level selection in the Build screen (currently the optimizer uses each Picto's highest known
  level automatically).
- Build-aware (producer/consumer) scoring for the Burn / Mark profile: whether the *currently equipped/planned* set
  already contains a Mark producer, a Burn producer, etc., and adjusting recommendations accordingly, rather than
  scoring each Picto/Lumina in isolation as Phase 2.2B does. Deliberately deferred to a possible Phase 2.2C so it can
  be designed and reviewed on its own, without changing Party Matrix, active/planned semantics, persistence, weapon
  modeling, or attribute allocation as a side effect.
