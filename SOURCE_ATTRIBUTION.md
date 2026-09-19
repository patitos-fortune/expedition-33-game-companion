# Source Attribution

## Code and structure derived from picto-builder

This project's Vue/TypeScript/Vite scaffolding, `src/assets/characters.json`, and `src/assets/pictos_list.json` are
adapted from **[picto-builder](https://github.com/fmarlats/picto-builder)** by fmarlats, MIT licensed.

- Upstream repository: https://github.com/fmarlats/picto-builder
- License: MIT (see `LICENSE` in this project — the original copyright notice is preserved as required)
- What was reused as-is (unmodified): `src/assets/characters.json`, `src/assets/pictos_list.json`, character portrait
  images in `src/assets/`, `src/assets/lumina.png`
- What was reused and adapted: the Vue 3 + TypeScript + Vite project scaffolding and build tooling; `EmptyState.vue`
  and `WarningIcon.vue` components; base CSS custom properties and panel styling from the original `src/style.css`
- What was deliberately dropped from the upstream project: the URL-encoding build-sharing feature, SEO/prerendering
  (vite-ssg), PWA/sitemap/analytics scaffolding, and the "Popular Builds" example data — none of this serves a
  single-user local companion app, and dropping it kept this project within its one-day v0.1 scope
- The upstream picto/skill data itself appears to have been originally compiled by the picto-builder author from
  gamerguides.com (each entry's `full_url` field links back there) — noted here for full transparency of the data's
  lineage, several steps removed from this project.

## New data researched for this project (Phase 1B / Phase 2)

`data/attribute_progression.json`, `data/weapons.json`, and `data/optimizer_reference.json` are new datasets
researched specifically for this project's attribute/weapon optimizer, since picto-builder itself contains no
weapon or character-attribute data at all. Each file carries its own `_provenance` block with sources, access dates,
and confidence notes; this is a summary.

### Attribute system (`data/attribute_progression.json`)

Cross-checked across: Game8, Maxroll, HowToPlayHub, GamerGuides, mein-mmo, ethugamer, and gamepressure.com (see the
file's `_provenance.sources` for exact URLs). All accessed 2026-09-16. Facts used are only those corroborated by 3+
independent sources; contradictory or single-sourced figures are explicitly flagged with lower confidence or omitted
entirely (see `OPTIMIZER_MODEL.md` → Known unknowns).

### Weapon data (`data/weapons.json`)

The full weapon-by-weapon table (149 entries across all 6 characters: character, weapon name, element, S/A/B/C/D
scaling grade per attribute, max power at level 33) was extracted from a single primary source:

- **Game8 — "List of All Weapons"**: https://game8.co/games/Clair-Obscur-Expedition-33/archives/515747
  (accessed 2026-09-16)

The underlying mechanic (letter-grade scaling, scaling changing with weapon level, passives unlocking at level
thresholds) was independently corroborated across 4 sources during Phase 1B research (Game8, Maxroll, KeenGamer,
GamerGuides), but the specific per-weapon grades/values in this table come from Game8 alone, spot-checked against a
second independent fetch only for the Gustave/Verso rows (which matched exactly). See the file's `_provenance` block
for the full confidence statement and known data-quality flags (two uncertain weapon-name spellings, no B/C/D grades
observed in the fetched table).

### Optimizer weights (`data/optimizer_reference.json`)

This file's contents (scaling-grade weights, strategy-profile weights, the Picto-stat reference scale, the
attribute-allocation floor ratio) are **not derived from any external source** — they are original design choices
made for this project's heuristic scoring model, documented inline in the file and in `OPTIMIZER_MODEL.md`. Nothing
in this file should be read as a verified game fact.

## Facts vs. expression

Only discrete facts (weapon names, numeric values, letter grades, attribute names) were extracted from the
third-party guide sites listed above — no descriptive/explanatory prose from those sites was copied into this
project. Facts are not copyrightable in the way a particular written expression of them is; this project's own
wording, code, and heuristic design are original.
