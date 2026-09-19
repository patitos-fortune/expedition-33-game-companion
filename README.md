# Game Companion (v0.1)

A personal, local build-analysis companion for **Clair Obscur: Expedition 33**. Everything runs on your own machine —
no account, no cloud service, no internet access required after the one-time setup, no telemetry.

Referred to throughout this project simply as **"Game"** / "Game Companion".

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
  shows CALCULATED facts, HEURISTIC recommendations, and explicitly labeled UNKNOWN/unmodeled mechanics, side by side
  with your current setup.

It deliberately does **not** claim to compute exact damage numbers or a single "optimal" build — see
`OPTIMIZER_MODEL.md` for exactly what is and isn't modeled, and why.

## How to launch it

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
- `src/assets/characters.json`, `src/assets/pictos_list.json` — the original, **unmodified** upstream picto-builder
  data files (MIT licensed). Never edited in place; normalization happens in `src/gamedata/loadGameData.ts`.
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

This project adapts data and structure from [picto-builder](https://github.com/fmarlats/picto-builder) (MIT
licensed) — see `LICENSE` and `SOURCE_ATTRIBUTION.md` for full details on what was reused and what was newly
researched for this project.
