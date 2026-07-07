# Last Stand — Zombie Defense

A browser-based, real-time top-down zombie-defense strategy game. Gather resources, build turrets/walls/spikes/bombs, and survive 10 escalating waves. Opens directly in the browser — no install, no login, no build step.

## Play

Open the hosted URL — it loads straight into the game.

- **WASD / Arrows** — move your character
- **1–5** — select a defense (Barricade, Wall, Spikes, Turret, Bomb)
- **Click** — place the selected defense (or click a placed Bomb during a wave to detonate it)
- **F** — eat food (+10 HP to your base)

Each round has a short **Gather** phase (collect wood/metal/food scattered around town) followed by a **Defend** phase (a zombie wave attacks your base). Turrets and spikes fire automatically. Walls and barricades block zombies. Survive all 10 rounds to win; if your base HP hits 0, it's game over.

## Develop

The shipped game is plain ES modules + Canvas + Web Audio — **no build step**. Tests run in Node via Vitest.

```bash
npm install      # dev-only: vitest
npm test         # run the unit + integration suite
```

Run locally with any static server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Structure

- `src/config.js` — all balance values (single source of truth)
- `src/systems/` — pure, unit-tested logic (economy, grid, waves, phase machine, combat)
- `src/entities/` — Base, Player, Resource, Defense, Zombie, Projectile
- `src/game.js` — the `Game` class: state, update/draw loop, orchestration
- `src/{input,audio,effects,ui}.js` — input, synthesized sound, particles, HUD/screens
- `tests/` — Vitest suites, including a headless full-playthrough integration test

## Deployment

Pushes to `main` deploy automatically to GitHub Pages via `.github/workflows/deploy.yml` (static files served from the repo root). Enable it once under **Settings → Pages → Source: GitHub Actions**.
