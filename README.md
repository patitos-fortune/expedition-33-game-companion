# Clair Obscur: Expedition 33 Game Companion

A spoiler-conscious build and inventory companion for **Clair Obscur: Expedition 33**.

**[🎮 Try it online](https://tinyurl.com/exp33companion)**

## What this is

This is a personal build-analysis companion designed to work with your character's *actual* current state: level,
attribute points, equipped weapon, and the Pictos and Luminas you own. Rather than presenting a generic build list,
it analyzes what you have and suggests ways to improve your current setup.

The companion can be used directly in the browser, with player data stored locally. It can also be run locally on
your own machine. No account or cloud service is required, and the project includes no telemetry.

## What it does

Unlike a typical Picto/build browser, this app's main purpose is to look at your character's *actual* current state
(level, attribute points, equipped weapon, owned Pictos/Luminas) and suggest how to improve it:

- **Attribute allocation** — given your point budget and equipped weapon, suggests how to redistribute your 5
  attribute points (Vitality/Might/Agility/Defense/Luck), and explains why (e.g. "prioritize Agility because this
  weapon scales S with Agility").
- **Picto loadout** — from the Pictos you've marked as owned, suggests which 3 to equip.
- **Lumina combination** — from the Luminas you've unlocked, finds a combination that fits your Lumina-point budget
  and favors your selected strategy.
- **Analyze My Build** — the central screen: one button that runs all of the above against your current build and
  shows **CALCULATED** facts, **HEURISTIC** recommendations, and explicitly labeled **UNKNOWN**/unmodeled mechanics,
  side by side with your current setup.

It deliberately does **not** claim to compute exact damage numbers or a single "optimal" build — see
`OPTIMIZER_MODEL.md` for exactly what is and isn't modeled, and why.

## How to launch it locally

1. Make sure [Node.js](https://nodejs.org) (LTS) is installed on this Windows machine. If you're not sure, just try
   step 2 — the launcher checks for you and tells you plainly if it's missing.
2. Double-click **`Start Game Companion.bat`** in this folder.
   - The first time, it will run `npm install` automatically (this needs internet access and takes a minute or two).
   - After that, it starts the app and opens your browser to it. Every later launch is fast and works offline.
3. The app runs at `http://localhost:5174` in your default browser. Close the black console window to stop it.

If you'd rather run it from a terminal yourself: `npm install` once, then `npm run dev`.

## Backing up your data

Your character builds and inventory (owned Pictos/Luminas/weapons) are saved automatically in your browser's local
storage as you use the app — closing and reopening it keeps your data.

To move your data, back it up, or recover from a browser data wipe, use **Settings → Export Save / Backup to JSON**
and **Settings → Import Save / Restore from JSON**. The exported file is a plain JSON file you can keep anywhere.

## Architecture overview

```
player state & inventory (src/state)
        |
game data (src/gamedata — loads/normalizes src/assets/*.json + data/*.json)
        |
optimizer (src/optimizer — plain TypeScript, no Vue dependency, unit tested)
        |
recommendations + explanations
        |
UI (src/views, src/components — Vue 3 + vue-router)
```

The optimizer is intentionally isolated from the UI layer so it can be tested independently and improved later
without touching any Vue code. Its heuristic weights live in `data/optimizer_reference.json`, not scattered through
the code — edit that file to retune recommendations.

Key folders:
- `src/assets/characters.json`, `src/assets/pictos_list.json` — the original, **unmodified** upstream
  [picto-builder](https://github.com/fmarlats/picto-builder) data files (MIT licensed). Never edited in place;
  normalization happens in `src/gamedata/loadGameData.ts`.
- `data/weapons.json`, `data/attribute_progression.json`, `data/optimizer_reference.json` — new datasets researched
  for this project, each carrying its own provenance/confidence metadata. See `SOURCE_ATTRIBUTION.md`.
- `src/optimizer/` — the CALCULATED / HEURISTIC / UNKNOWN-tiered recommendation engine, with unit tests in
  `src/optimizer/__tests__/`.
- `src/state/` — player state, inventory, local persistence, import/export. Unit tests in `src/state/__tests__/`.

## Running tests / build checks yourself

```
npm run test    # runs the vitest suite (optimizer, persistence, data-loading/normalization)
npm run build   # type-checks (vue-tsc) and produces a production build in dist/
```

## Known limitations

See `OPTIMIZER_MODEL.md` for the full, honest list of what this app does and doesn't know (exact damage formulas,
attribute breakpoints, weapon passive data, skill mechanics, and so on). In short: this models weapon *scaling
priority* and Lumina/Picto *fit* for a chosen strategy, not a combat simulator.

## License / attribution

This project builds on data and structure from
[fmarlats/picto-builder](https://github.com/fmarlats/picto-builder), which is MIT licensed. The upstream
`characters.json` and `pictos_list.json` data files are retained unmodified, while additional datasets,
normalization, analysis, and recommendation logic were developed for this companion.

See `LICENSE` and `SOURCE_ATTRIBUTION.md` for full details on what was reused, its licensing, and what was newly
researched or developed for this project.

## Unofficial fan project

This is an unofficial fan-made companion for **Clair Obscur: Expedition 33**. It is not affiliated with, endorsed by,
or sponsored by Sandfall Interactive or the game's publishers. Game names and related trademarks belong to their
respective owners.
