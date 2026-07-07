# Zombie Defense Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based, real-time top-down zombie-defense strategy game (10 rounds of gather → defend) that opens directly from a hosted URL with no install or build step.

**Architecture:** Plain JavaScript ES modules + HTML5 Canvas for rendering + Web Audio API for synthesized sound. All game balance lives in one `config.js`. Pure-logic modules (economy, grid, waves, phase state machine, combat math) are unit-tested with Vitest in Node; entities and rendering are thin glue driven by a central `Game` loop. Zero external assets. Deployed as static files to GitHub Pages.

**Tech Stack:** Vanilla JS (ES modules), HTML5 Canvas 2D, Web Audio API, Vitest (dev-only, for tests), GitHub Pages (hosting).

---

## File Structure

```
/
├── index.html                  # Canvas element + <script type="module" src="src/main.js">
├── styles.css                  # Full-viewport dark page, centered canvas
├── package.json                # dev-only: vitest; scripts: test
├── vitest.config.js            # Node environment for pure-logic tests
├── src/
│   ├── main.js                 # Bootstrap: get canvas, new Game(), start loop
│   ├── config.js               # ALL balance constants (single source of truth)
│   ├── utils.js                # dist, clamp, lerp, aabb, rng helpers
│   ├── audio.js                # Web Audio synthesized SFX (lazy init on first input)
│   ├── input.js                # Keyboard + mouse state
│   ├── game.js                 # Game class: state, arrays, main update/draw loop
│   ├── entities/
│   │   ├── base.js             # Home base (only thing with HP)
│   │   ├── player.js           # WASD-controlled character
│   │   ├── resource.js         # Wood/metal/food pickup
│   │   ├── defense.js          # Barricade/Wall/Spike/Turret/Bomb
│   │   ├── zombie.js           # Runner/Brute/Spitter
│   │   └── projectile.js       # Turret bullets + spitter acid
│   ├── systems/
│   │   ├── grid.js             # snapToGrid + placement validation (pure)
│   │   ├── economy.js          # inventory add/spend/canAfford (pure)
│   │   ├── waves.js            # wave composition + spawn schedule (pure w/ injected rng)
│   │   └── phase.js            # phase state machine (pure)
│   ├── effects.js              # particles, floating text, muzzle flash, screen shake
│   └── ui.js                   # HUD + title/transition/victory/gameover screens
├── tests/
│   ├── economy.test.js
│   ├── grid.test.js
│   ├── waves.test.js
│   ├── phase.test.js
│   └── combat.test.js
└── .github/workflows/deploy.yml  # Deploy static site to GitHub Pages
```

Responsibilities are split so pure logic (systems/) never imports canvas/DOM and is fully unit-testable. Entities hold state + an `update(dt, game)` method plus a `draw(ctx)` method. The `Game` owns all arrays and orchestrates.

---

## Task 1: Project scaffold + test harness

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `index.html`
- Create: `styles.css`
- Create: `src/main.js`
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
.DS_Store
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "zombie-defense",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Last Stand — Zombie Defense</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div id="wrap">
    <canvas id="game" width="1280" height="720"></canvas>
  </div>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

- [ ] **Step 5: Create `styles.css`**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  width: 100%; height: 100%;
  background: #0b0d10;
  overflow: hidden;
  font-family: system-ui, sans-serif;
}
#wrap {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
}
#game {
  background: #14181d;
  max-width: 100%; max-height: 100%;
  image-rendering: pixelated;
  box-shadow: 0 0 40px rgba(0,0,0,0.6);
  cursor: crosshair;
}
```

- [ ] **Step 6: Create placeholder `src/main.js`**

```js
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#7fd1ae';
ctx.font = '32px system-ui';
ctx.fillText('Loading...', 40, 60);
```

- [ ] **Step 7: Install deps and verify test harness runs**

Run: `npm install`
Then run: `npm test`
Expected: Vitest runs and reports "No test files found" (exit 0) — harness works.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold project, canvas page, and vitest harness"
```

---

## Task 2: Config constants (single source of truth)

**Files:**
- Create: `src/config.js`

- [ ] **Step 1: Create `src/config.js` with all balance values from the spec**

```js
// All game balance lives here. Values reconciled from the design spec §12.

export const WORLD = { width: 1280, height: 720 };
export const GRID = 32; // px cells; also the placement click-target size

export const BASE = {
  x: WORLD.width / 2,
  y: WORLD.height / 2,
  size: 72,        // drawn as a square, side length
  maxHp: 100,
};

export const PLAYER = {
  speed: 280,      // px/s
  radius: 14,
};

// Per-pickup resource values (design §5)
export const PICKUP_VALUE = { wood: 5, metal: 5, food: 1 };
export const FOOD_HEAL = 10;
export const FOOD_MAX = 5;

// Pickup counts per round tier: [woodPickups, metalPickups, foodPickups]
export function resourceSpawnCounts(round) {
  if (round <= 3) return { wood: 5, metal: 4, food: 2 };
  if (round <= 7) return { wood: 4, metal: 3, food: 1 };
  return { wood: 3, metal: 2, food: 1 };
}

// Defense definitions (design §6.1 / §12)
export const DEFENSES = {
  barricade: { key: '1', label: 'Barricade', cost: { wood: 2 }, hp: 20, blocks: true, size: GRID, color: '#a9743b' },
  wall:      { key: '2', label: 'Wall',      cost: { wood: 5 }, hp: 50, blocks: true, size: GRID, color: '#8b8f96' },
  spike:     { key: '3', label: 'Spikes',    cost: { metal: 3 }, hp: Infinity, blocks: false, size: GRID, color: '#c0392b',
               tickDamage: 5, tickInterval: 0.5 },
  turret:    { key: '4', label: 'Turret',    cost: { metal: 8, wood: 2 }, hp: 30, blocks: false, size: GRID, color: '#3a7bd5',
               range: 200, damage: 10, fireInterval: 1.0 },
  bomb:      { key: '5', label: 'Bomb',      cost: { metal: 5, wood: 3 }, hp: Infinity, blocks: false, size: GRID, color: '#e67e22',
               damage: 30, radius: 100, manual: true },
};
export const DEFENSE_ORDER = ['barricade', 'wall', 'spike', 'turret', 'bomb'];
// Max distance from base center a defense may be placed (design §6.2)
export const PLACE_RADIUS = 320;

// Zombie definitions (design §7.1 / §12)
export const ZOMBIES = {
  runner:  { hp: 20, speed: 120, damage: 5,  attackInterval: 1.0, radius: 12, color: '#6fae5a', ranged: false },
  brute:   { hp: 50, speed: 60,  damage: 15, attackInterval: 1.0, radius: 20, color: '#4d7a3a', ranged: false },
  spitter: { hp: 35, speed: 90,  damage: 10, attackInterval: 2.0, radius: 14, color: '#8e44ad', ranged: true,
             attackRange: 220, deathExplosion: { damage: 30, radius: 100 } },
};

// Wave composition per round (design §7.2)
export const WAVES = {
  1:  { runner: 8,  brute: 0,  spitter: 0 },
  2:  { runner: 10, brute: 0,  spitter: 0 },
  3:  { runner: 8,  brute: 3,  spitter: 0 },
  4:  { runner: 8,  brute: 4,  spitter: 0 },
  5:  { runner: 8,  brute: 5,  spitter: 2 },
  6:  { runner: 6,  brute: 6,  spitter: 3 },
  7:  { runner: 5,  brute: 8,  spitter: 4 },
  8:  { runner: 4,  brute: 10, spitter: 5 },
  9:  { runner: 3,  brute: 12, spitter: 6 },
  10: { runner: 2,  brute: 15, spitter: 8 },
};
export const TOTAL_ROUNDS = 10;

// Phase timing in seconds (design §2.1, §9.2)
export const TIMING = {
  gatherRound1: 45,
  gather: 90,
  defend: 120,
  firstSpawnDelay: 5,     // delay after defend starts before first zombie
  spawnWindow: 40,        // zombies spawn spread across this many seconds
  wandererCount: 2,       // harmless gather-phase atmosphere zombies (round 1)
};

// +5 max HP after these rounds (design §9.1)
export const HP_BONUS_ROUNDS = [3, 6, 9];
export const HP_BONUS_AMOUNT = 5;
```

- [ ] **Step 2: Commit**

```bash
git add src/config.js
git commit -m "feat: add game balance config"
```

---

## Task 3: Utility helpers (pure, tested)

**Files:**
- Create: `src/utils.js`
- Test: `tests/combat.test.js` (starts here; grows later)

- [ ] **Step 1: Write failing tests for utils**

Create `tests/combat.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { dist, clamp, aabbOverlap, mulberry32 } from '../src/utils.js';

describe('utils', () => {
  it('dist computes euclidean distance', () => {
    expect(dist(0, 0, 3, 4)).toBe(5);
  });
  it('clamp bounds a value', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
  it('aabbOverlap detects overlapping squares', () => {
    expect(aabbOverlap(0, 0, 10, 10, 5, 5, 10, 10)).toBe(true);
    expect(aabbOverlap(0, 0, 10, 10, 20, 20, 10, 10)).toBe(false);
  });
  it('mulberry32 is deterministic for a seed', () => {
    const a = mulberry32(42); const b = mulberry32(42);
    expect(a()).toBe(b());
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — cannot import from `../src/utils.js` (module not found).

- [ ] **Step 3: Create `src/utils.js`**

```js
export function dist(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Axis-aligned bounding box overlap. Boxes given as (x, y, w, h) with x,y = top-left.
export function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Seeded PRNG (mulberry32) so wave spawn positions can be tested deterministically.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils.js tests/combat.test.js
git commit -m "feat: add tested math/rng utilities"
```

---

## Task 4: Economy system (pure, tested)

**Files:**
- Create: `src/systems/economy.js`
- Test: `tests/economy.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/economy.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { newInventory, canAfford, spend, addResource, eatFood } from '../src/systems/economy.js';

describe('economy', () => {
  it('starts empty', () => {
    expect(newInventory()).toEqual({ wood: 0, metal: 0, food: 0 });
  });
  it('adds a resource pickup by its per-pickup value', () => {
    const inv = newInventory();
    addResource(inv, 'wood');
    expect(inv.wood).toBe(5);
  });
  it('caps food at FOOD_MAX', () => {
    const inv = newInventory();
    for (let i = 0; i < 10; i++) addResource(inv, 'food');
    expect(inv.food).toBe(5);
  });
  it('canAfford checks all cost components', () => {
    const inv = { wood: 2, metal: 8, food: 0 };
    expect(canAfford(inv, { metal: 8, wood: 2 })).toBe(true);
    expect(canAfford(inv, { metal: 9 })).toBe(false);
  });
  it('spend deducts and returns true only when affordable', () => {
    const inv = { wood: 5, metal: 8, food: 0 };
    expect(spend(inv, { wood: 5 })).toBe(true);
    expect(inv.wood).toBe(0);
    expect(spend(inv, { wood: 1 })).toBe(false);
    expect(inv.wood).toBe(0);
  });
  it('eatFood heals and consumes one when available', () => {
    const inv = { wood: 0, metal: 0, food: 2 };
    expect(eatFood(inv)).toBe(true);
    expect(inv.food).toBe(1);
    inv.food = 0;
    expect(eatFood(inv)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/systems/economy.js`**

```js
import { PICKUP_VALUE, FOOD_MAX } from '../config.js';

export function newInventory() {
  return { wood: 0, metal: 0, food: 0 };
}

export function addResource(inv, type) {
  inv[type] += PICKUP_VALUE[type];
  if (type === 'food' && inv.food > FOOD_MAX) inv.food = FOOD_MAX;
}

export function canAfford(inv, cost) {
  for (const k in cost) {
    if ((inv[k] || 0) < cost[k]) return false;
  }
  return true;
}

export function spend(inv, cost) {
  if (!canAfford(inv, cost)) return false;
  for (const k in cost) inv[k] -= cost[k];
  return true;
}

// Returns true if a food was consumed (caller applies FOOD_HEAL to base).
export function eatFood(inv) {
  if (inv.food <= 0) return false;
  inv.food -= 1;
  return true;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS (economy suite green).

- [ ] **Step 5: Commit**

```bash
git add src/systems/economy.js tests/economy.test.js
git commit -m "feat: add tested resource economy"
```

---

## Task 5: Placement grid + validation (pure, tested)

**Files:**
- Create: `src/systems/grid.js`
- Test: `tests/grid.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/grid.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { snapToGrid, cellKey, validatePlacement } from '../src/systems/grid.js';
import { BASE } from '../src/config.js';

describe('grid', () => {
  it('snaps a point to the nearest 32px cell center', () => {
    // cell origin is top-left multiple of 32; center is +16
    expect(snapToGrid(40, 40)).toEqual({ x: 48, y: 48 });
    expect(snapToGrid(0, 0)).toEqual({ x: 16, y: 16 });
  });
  it('cellKey is stable for points in the same cell', () => {
    expect(cellKey(48, 48)).toBe(cellKey(50, 55));
  });
  it('rejects placement on top of the base', () => {
    const r = validatePlacement(BASE.x, BASE.y, [], BASE);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/base/i);
  });
  it('rejects placement too far from base', () => {
    const r = validatePlacement(50, 50, [], BASE);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/too far/i);
  });
  it('rejects an occupied cell', () => {
    const occupied = [{ x: BASE.x + 96, y: BASE.y }];
    const p = snapToGrid(BASE.x + 96, BASE.y);
    const r = validatePlacement(p.x, p.y, occupied, BASE);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/occupied/i);
  });
  it('accepts a valid nearby empty cell', () => {
    const p = snapToGrid(BASE.x + 96, BASE.y);
    const r = validatePlacement(p.x, p.y, [], BASE);
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/systems/grid.js`**

```js
import { GRID, BASE, PLACE_RADIUS } from '../config.js';
import { dist } from '../utils.js';

// Snap a world point to the center of its 32px grid cell.
export function snapToGrid(x, y) {
  return {
    x: Math.floor(x / GRID) * GRID + GRID / 2,
    y: Math.floor(y / GRID) * GRID + GRID / 2,
  };
}

export function cellKey(x, y) {
  return `${Math.floor(x / GRID)},${Math.floor(y / GRID)}`;
}

// existing = array of already-placed items with {x, y} (cell centers).
export function validatePlacement(x, y, existing, base = BASE) {
  // Inside base footprint?
  const half = base.size / 2 + GRID / 2;
  if (Math.abs(x - base.x) < half && Math.abs(y - base.y) < half) {
    return { ok: false, reason: 'On the base' };
  }
  if (dist(x, y, base.x, base.y) > PLACE_RADIUS) {
    return { ok: false, reason: 'Too far from base' };
  }
  const key = cellKey(x, y);
  if (existing.some((e) => cellKey(e.x, e.y) === key)) {
    return { ok: false, reason: 'Cell occupied' };
  }
  return { ok: true, reason: '' };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/grid.js tests/grid.test.js
git commit -m "feat: add tested placement grid + validation"
```

---

## Task 6: Wave composition + spawn schedule (pure, tested)

**Files:**
- Create: `src/systems/waves.js`
- Test: `tests/waves.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/waves.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { waveComposition, buildSpawnSchedule, edgeSpawnPoint } from '../src/systems/waves.js';
import { mulberry32 } from '../src/utils.js';
import { WAVES, TIMING, WORLD } from '../src/config.js';

describe('waves', () => {
  it('returns the configured composition for a round', () => {
    expect(waveComposition(3)).toEqual({ runner: 8, brute: 3, spitter: 0 });
  });
  it('builds one spawn entry per zombie in the round', () => {
    const total = WAVES[5].runner + WAVES[5].brute + WAVES[5].spitter;
    const sched = buildSpawnSchedule(5, mulberry32(1));
    expect(sched.length).toBe(total);
  });
  it('schedules all spawns within the spawn window after firstSpawnDelay', () => {
    const sched = buildSpawnSchedule(4, mulberry32(2));
    for (const s of sched) {
      expect(s.time).toBeGreaterThanOrEqual(TIMING.firstSpawnDelay);
      expect(s.time).toBeLessThanOrEqual(TIMING.firstSpawnDelay + TIMING.spawnWindow);
    }
  });
  it('spawn schedule is sorted by time', () => {
    const sched = buildSpawnSchedule(10, mulberry32(3));
    for (let i = 1; i < sched.length; i++) {
      expect(sched[i].time).toBeGreaterThanOrEqual(sched[i - 1].time);
    }
  });
  it('edgeSpawnPoint lands on a world edge', () => {
    const p = edgeSpawnPoint(mulberry32(9));
    const onEdge =
      p.x <= 0 || p.x >= WORLD.width || p.y <= 0 || p.y >= WORLD.height;
    expect(onEdge).toBe(true);
  });
  it('is deterministic for the same seed', () => {
    const a = buildSpawnSchedule(6, mulberry32(7));
    const b = buildSpawnSchedule(6, mulberry32(7));
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/systems/waves.js`**

```js
import { WAVES, TIMING, WORLD } from '../config.js';

export function waveComposition(round) {
  return WAVES[round] || WAVES[1];
}

// Pick a random point on one of the four world edges.
export function edgeSpawnPoint(rng) {
  const side = Math.floor(rng() * 4); // 0 top, 1 right, 2 bottom, 3 left
  switch (side) {
    case 0: return { x: rng() * WORLD.width, y: 0 };
    case 1: return { x: WORLD.width, y: rng() * WORLD.height };
    case 2: return { x: rng() * WORLD.width, y: WORLD.height };
    default: return { x: 0, y: rng() * WORLD.height };
  }
}

// Produce a sorted list of { time, type, x, y } spawn events.
export function buildSpawnSchedule(round, rng) {
  const comp = waveComposition(round);
  const types = [];
  for (const type of ['runner', 'brute', 'spitter']) {
    for (let i = 0; i < (comp[type] || 0); i++) types.push(type);
  }
  const schedule = types.map((type) => {
    const p = edgeSpawnPoint(rng);
    return {
      time: TIMING.firstSpawnDelay + rng() * TIMING.spawnWindow,
      type,
      x: p.x,
      y: p.y,
    };
  });
  schedule.sort((a, b) => a.time - b.time);
  return schedule;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/waves.js tests/waves.test.js
git commit -m "feat: add tested wave composition and spawn scheduling"
```

---

## Task 7: Phase state machine (pure, tested)

**Files:**
- Create: `src/systems/phase.js`
- Test: `tests/phase.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/phase.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { PHASE, gatherDuration, nextPhase, hpBonusForRound } from '../src/systems/phase.js';
import { TIMING } from '../src/config.js';

describe('phase machine', () => {
  it('round 1 gather is short, later rounds are longer', () => {
    expect(gatherDuration(1)).toBe(TIMING.gatherRound1);
    expect(gatherDuration(2)).toBe(TIMING.gather);
  });
  it('TITLE -> GATHER on start', () => {
    expect(nextPhase(PHASE.TITLE, { round: 1 })).toEqual({ phase: PHASE.GATHER, round: 1 });
  });
  it('GATHER -> DEFEND same round', () => {
    expect(nextPhase(PHASE.GATHER, { round: 1 })).toEqual({ phase: PHASE.DEFEND, round: 1 });
  });
  it('DEFEND -> ROUND_END same round', () => {
    expect(nextPhase(PHASE.DEFEND, { round: 3 })).toEqual({ phase: PHASE.ROUND_END, round: 3 });
  });
  it('ROUND_END advances the round into next GATHER', () => {
    expect(nextPhase(PHASE.ROUND_END, { round: 3 })).toEqual({ phase: PHASE.GATHER, round: 4 });
  });
  it('ROUND_END after round 10 -> VICTORY', () => {
    expect(nextPhase(PHASE.ROUND_END, { round: 10 })).toEqual({ phase: PHASE.VICTORY, round: 10 });
  });
  it('hpBonusForRound gives +5 on rounds 3,6,9 only', () => {
    expect(hpBonusForRound(3)).toBe(5);
    expect(hpBonusForRound(6)).toBe(5);
    expect(hpBonusForRound(4)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/systems/phase.js`**

```js
import { TIMING, TOTAL_ROUNDS, HP_BONUS_ROUNDS, HP_BONUS_AMOUNT } from '../config.js';

export const PHASE = {
  TITLE: 'TITLE',
  GATHER: 'GATHER',
  DEFEND: 'DEFEND',
  ROUND_END: 'ROUND_END',
  VICTORY: 'VICTORY',
  GAMEOVER: 'GAMEOVER',
};

export function gatherDuration(round) {
  return round === 1 ? TIMING.gatherRound1 : TIMING.gather;
}

export function hpBonusForRound(round) {
  return HP_BONUS_ROUNDS.includes(round) ? HP_BONUS_AMOUNT : 0;
}

// Pure transition. Caller handles GAMEOVER separately (base hp <= 0 at any time).
export function nextPhase(phase, { round }) {
  switch (phase) {
    case PHASE.TITLE:
      return { phase: PHASE.GATHER, round };
    case PHASE.GATHER:
      return { phase: PHASE.DEFEND, round };
    case PHASE.DEFEND:
      return { phase: PHASE.ROUND_END, round };
    case PHASE.ROUND_END:
      if (round >= TOTAL_ROUNDS) return { phase: PHASE.VICTORY, round };
      return { phase: PHASE.GATHER, round: round + 1 };
    default:
      return { phase, round };
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/phase.js tests/phase.test.js
git commit -m "feat: add tested phase state machine"
```

---

## Task 8: Combat damage helpers (pure, tested)

**Files:**
- Create: `src/systems/combat.js`
- Test: extend `tests/combat.test.js`

- [ ] **Step 1: Add failing tests to `tests/combat.test.js`**

Append to `tests/combat.test.js`:

```js
import { applyDamage, splashTargets } from '../src/systems/combat.js';

describe('combat', () => {
  it('applyDamage reduces hp and reports death', () => {
    const e = { hp: 10 };
    expect(applyDamage(e, 4)).toBe(false);
    expect(e.hp).toBe(6);
    expect(applyDamage(e, 6)).toBe(true);
    expect(e.hp).toBe(0);
  });
  it('splashTargets returns entities within radius', () => {
    const list = [
      { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 300, y: 0 },
    ];
    const hit = splashTargets(list, 0, 0, 100);
    expect(hit.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — cannot import `../src/systems/combat.js`.

- [ ] **Step 3: Create `src/systems/combat.js`**

```js
import { dist } from '../utils.js';

// Mutates entity hp. Returns true if the entity died (hp <= 0).
export function applyDamage(entity, amount) {
  entity.hp -= amount;
  if (entity.hp <= 0) {
    entity.hp = 0;
    return true;
  }
  return false;
}

// Return all entities within `radius` of (x, y).
export function splashTargets(entities, x, y, radius) {
  return entities.filter((e) => dist(e.x, e.y, x, y) <= radius);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS (all suites green).

- [ ] **Step 5: Commit**

```bash
git add src/systems/combat.js tests/combat.test.js
git commit -m "feat: add tested combat damage helpers"
```

---

## Task 9: Input + Audio glue

**Files:**
- Create: `src/input.js`
- Create: `src/audio.js`

- [ ] **Step 1: Create `src/input.js`**

```js
// Tracks keyboard + mouse. No DOM tests; verified in-browser later.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    this.pressed = new Set(); // edge-triggered this frame

    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));

    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * canvas.width;
      this.mouse.y = ((e.clientY - r.top) / r.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', () => { this.mouse.down = true; this.mouse.clicked = true; });
    addEventListener('mouseup', () => { this.mouse.down = false; });
  }

  keyPressed(code) { return this.pressed.has(code); }
  isDown(code) { return this.keys.has(code); }

  // Call at end of each frame to clear edge-triggered state.
  endFrame() {
    this.pressed.clear();
    this.mouse.clicked = false;
  }
}
```

- [ ] **Step 2: Create `src/audio.js`**

```js
// Synthesized SFX via Web Audio. No asset files. Must be created after a user
// gesture (browsers block audio otherwise) — call unlock() on first input.
export class Audio {
  constructor() { this.ctx = null; this.enabled = true; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _tone(freq, dur, type = 'square', gain = 0.15) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + dur);
  }

  place()    { this._tone(180, 0.12, 'square', 0.2); }
  shoot()    { this._tone(320, 0.06, 'square', 0.12); }
  zombieHit(){ this._tone(120, 0.08, 'sawtooth', 0.1); }
  pickup()   { this._tone(660, 0.08, 'triangle', 0.18); this._tone(880, 0.08, 'triangle', 0.12); }
  baseHit()  { this._tone(70, 0.18, 'sawtooth', 0.25); }
  explosion(){ this._tone(90, 0.3, 'sawtooth', 0.3); }
  heal()     { this._tone(520, 0.1, 'sine', 0.2); this._tone(780, 0.12, 'sine', 0.15); }
  roundEnd() { this._tone(440, 0.15, 'triangle', 0.2); this._tone(660, 0.2, 'triangle', 0.2); }
  victory()  { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.25, 'triangle', 0.2), i * 160)); }
  gameover() { [400, 300, 200, 120].forEach((f, i) => setTimeout(() => this._tone(f, 0.3, 'sawtooth', 0.25), i * 180)); }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/input.js src/audio.js
git commit -m "feat: add input tracking and synthesized audio"
```

---

## Task 10: Effects (particles, floating text, screen shake)

**Files:**
- Create: `src/effects.js`

- [ ] **Step 1: Create `src/effects.js`**

```js
// Lightweight visual juice. Owned by Game; updated + drawn each frame.
export class Effects {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.shake = 0;
  }

  burst(x, y, color, count = 8, speed = 120) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, max: 0.5, color, r: 2 + Math.random() * 2 });
    }
  }

  floatText(x, y, text, color = '#fff') {
    this.texts.push({ x, y, text, color, life: 0.7, max: 0.7 });
  }

  addShake(amount) { this.shake = Math.min(this.shake + amount, 16); }

  update(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92; p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) { t.y -= 24 * dt; t.life -= dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
    this.shake *= 0.85;
    if (this.shake < 0.3) this.shake = 0;
  }

  draw(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px system-ui';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.max(0, t.life / t.max);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  shakeOffset() {
    if (this.shake === 0) return { x: 0, y: 0 };
    return { x: (Math.random() - 0.5) * this.shake, y: (Math.random() - 0.5) * this.shake };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/effects.js
git commit -m "feat: add particle/text/shake effects system"
```

---

## Task 11: Core entities — Base, Player, Resource

**Files:**
- Create: `src/entities/base.js`
- Create: `src/entities/player.js`
- Create: `src/entities/resource.js`

- [ ] **Step 1: Create `src/entities/base.js`**

```js
import { BASE } from '../config.js';

export class Base {
  constructor() {
    this.x = BASE.x; this.y = BASE.y;
    this.size = BASE.size;
    this.maxHp = BASE.maxHp;
    this.hp = BASE.maxHp;
    this.flash = 0; // red flash timer on hit
  }

  damage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.flash = 0.2;
  }

  heal(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); }

  update(dt) { if (this.flash > 0) this.flash -= dt; }

  draw(ctx) {
    const s = this.size, x = this.x - s / 2, y = this.y - s / 2;
    ctx.fillStyle = this.flash > 0 ? '#ff6b6b' : '#e8c15a';
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeRect(x, y, s, s);
    // roof triangle for a "home" look
    ctx.fillStyle = '#b5451b';
    ctx.beginPath();
    ctx.moveTo(x - 6, y); ctx.lineTo(this.x, y - 22); ctx.lineTo(x + s + 6, y);
    ctx.closePath(); ctx.fill();
  }
}
```

- [ ] **Step 2: Create `src/entities/player.js`**

```js
import { PLAYER, WORLD } from '../config.js';
import { clamp } from '../utils.js';

export class Player {
  constructor(x, y) { this.x = x; this.y = y; this.radius = PLAYER.radius; }

  update(dt, input) {
    let dx = 0, dy = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) dy -= 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) dy += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) dx -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) dx += 1;
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      this.x += (dx / len) * PLAYER.speed * dt;
      this.y += (dy / len) * PLAYER.speed * dt;
    }
    this.x = clamp(this.x, this.radius, WORLD.width - this.radius);
    this.y = clamp(this.y, this.radius, WORLD.height - this.radius);
  }

  draw(ctx) {
    ctx.fillStyle = '#4fd1ff';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0a2b33'; ctx.lineWidth = 2; ctx.stroke();
    // little direction dot
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(this.x, this.y - 4, 3, 0, Math.PI * 2); ctx.fill();
  }
}
```

- [ ] **Step 3: Create `src/entities/resource.js`**

```js
import { dist } from '../utils.js';

const COLORS = { wood: '#a9743b', metal: '#b8c0cc', food: '#5cd65c' };

export class Resource {
  constructor(type, x, y) {
    this.type = type; this.x = x; this.y = y;
    this.r = 11; this.collected = false; this.bob = Math.random() * Math.PI * 2;
  }

  update(dt) { this.bob += dt * 3; }

  tryCollect(px, py, pr) {
    if (this.collected) return false;
    if (dist(px, py, this.x, this.y) <= pr + this.r) { this.collected = true; return true; }
    return false;
  }

  draw(ctx) {
    const yy = this.y + Math.sin(this.bob) * 3;
    ctx.save();
    ctx.shadowColor = COLORS[this.type]; ctx.shadowBlur = 12;
    ctx.fillStyle = COLORS[this.type];
    if (this.type === 'metal') {
      ctx.fillRect(this.x - this.r, yy - this.r, this.r * 2, this.r * 2);
    } else {
      ctx.beginPath(); ctx.arc(this.x, yy, this.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    if (this.type === 'metal') ctx.strokeRect(this.x - this.r, yy - this.r, this.r * 2, this.r * 2);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/entities/base.js src/entities/player.js src/entities/resource.js
git commit -m "feat: add base, player, and resource entities"
```

---

## Task 12: Projectile + Defense + Zombie entities

**Files:**
- Create: `src/entities/projectile.js`
- Create: `src/entities/defense.js`
- Create: `src/entities/zombie.js`

- [ ] **Step 1: Create `src/entities/projectile.js`**

```js
import { dist } from '../utils.js';

// A moving projectile. kind 'bullet' (turret) or 'acid' (spitter).
export class Projectile {
  constructor(x, y, tx, ty, speed, damage, kind) {
    this.x = x; this.y = y; this.damage = damage; this.kind = kind;
    this.dead = false;
    const d = Math.max(1, dist(x, y, tx, ty));
    this.vx = ((tx - x) / d) * speed;
    this.vy = ((ty - y) / d) * speed;
    this.life = 2.5;
  }

  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    ctx.fillStyle = this.kind === 'acid' ? '#a6e22e' : '#ffe066';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.kind === 'acid' ? 5 : 3, 0, Math.PI * 2); ctx.fill();
  }
}
```

- [ ] **Step 2: Create `src/entities/defense.js`**

```js
import { DEFENSES } from '../config.js';
import { dist } from '../utils.js';
import { Projectile } from './projectile.js';

export class Defense {
  constructor(type, x, y) {
    const def = DEFENSES[type];
    this.type = type; this.def = def;
    this.x = x; this.y = y;
    this.size = def.size;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.blocks = def.blocks;
    this.cooldown = 0;        // turret fire timer
    this.tickTimer = 0;       // spike damage timer
    this.armed = type === 'bomb';
    this.dead = false;
    this.flash = 0;
  }

  isDestructible() { return this.hp !== Infinity; }

  damage(amount) {
    if (!this.isDestructible()) return;
    this.hp -= amount; this.flash = 0.15;
    if (this.hp <= 0) this.dead = true;
  }

  // Turret firing + spike ticking. Returns a Projectile to spawn, or null.
  update(dt, zombies, effects, audio) {
    if (this.flash > 0) this.flash -= dt;

    if (this.type === 'turret') {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        let target = null, best = this.def.range;
        for (const z of zombies) {
          const d = dist(this.x, this.y, z.x, z.y);
          if (d <= best) { best = d; target = z; }
        }
        if (target) {
          this.cooldown = this.def.fireInterval;
          audio.shoot();
          return new Projectile(this.x, this.y, target.x, target.y, 520, this.def.damage, 'bullet');
        }
      }
    }

    if (this.type === 'spike') {
      this.tickTimer -= dt;
      if (this.tickTimer <= 0) {
        this.tickTimer = this.def.tickInterval;
        const half = this.size / 2;
        for (const z of zombies) {
          if (Math.abs(z.x - this.x) <= half + z.radius && Math.abs(z.y - this.y) <= half + z.radius) {
            z.hp -= this.def.tickDamage;
            effects.burst(z.x, z.y, '#c0392b', 3, 60);
          }
        }
      }
    }
    return null;
  }

  draw(ctx) {
    const s = this.size, x = this.x - s / 2, y = this.y - s / 2;
    ctx.fillStyle = this.flash > 0 ? '#fff' : this.def.color;
    if (this.type === 'spike') {
      ctx.fillStyle = '#7a1e15';
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = this.def.color;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 4 + i * 10, y + s - 3);
        ctx.lineTo(x + 9 + i * 10, y + 5);
        ctx.lineTo(x + 14 + i * 10, y + s - 3);
        ctx.closePath(); ctx.fill();
      }
    } else {
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(x, y, s, s);
      if (this.type === 'turret') {
        ctx.fillStyle = '#1b3a5c';
        ctx.fillRect(this.x - 3, this.y - s / 2 - 6, 6, 12);
      }
      if (this.type === 'bomb') {
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(this.x, this.y, 6, 0, Math.PI * 2); ctx.fill();
      }
    }
    // hp bar for destructible defenses
    if (this.isDestructible() && this.hp < this.maxHp) {
      ctx.fillStyle = '#000'; ctx.fillRect(x, y - 6, s, 3);
      ctx.fillStyle = '#5cd65c'; ctx.fillRect(x, y - 6, s * (this.hp / this.maxHp), 3);
    }
  }
}
```

- [ ] **Step 3: Create `src/entities/zombie.js`**

```js
import { ZOMBIES, BASE } from '../config.js';
import { dist } from '../utils.js';
import { Projectile } from './projectile.js';

export class Zombie {
  constructor(type, x, y) {
    const def = ZOMBIES[type];
    this.type = type; this.def = def;
    this.x = x; this.y = y;
    this.hp = def.hp; this.maxHp = def.hp;
    this.radius = def.radius;
    this.speed = def.speed;
    this.attackTimer = 0;
    this.dead = false;
    this.flash = 0;
    this.wanderer = false; // harmless gather-phase drifter
  }

  // Move toward base; stop to attack a blocking defense in the way.
  // Returns { spawnProjectile } or performs base/structure damage via callbacks.
  update(dt, ctx) {
    // ctx = { base, defenses, effects, audio, projectiles, active }
    if (this.flash > 0) this.flash -= dt;
    if (this.hp <= 0) { this.dead = true; return; }

    const { base } = ctx;
    const dToBase = dist(this.x, this.y, base.x, base.y);

    // Ranged spitter: stop at range and spit.
    if (this.def.ranged && dToBase <= this.def.attackRange) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0 && ctx.active) {
        this.attackTimer = this.def.attackInterval;
        ctx.projectiles.push(new Projectile(this.x, this.y, base.x, base.y, 260, this.def.damage, 'acid'));
      }
      return;
    }

    // Find a blocking defense directly ahead (simple: nearest blocking within contact).
    let blocker = null;
    for (const d of ctx.defenses) {
      if (!d.blocks || d.dead) continue;
      const half = d.size / 2 + this.radius;
      if (Math.abs(this.x - d.x) <= half && Math.abs(this.y - d.y) <= half) { blocker = d; break; }
    }

    if (blocker) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackTimer = this.def.attackInterval;
        blocker.damage(this.def.damage);
        ctx.effects.burst(this.x, this.y, '#ffcc00', 4, 70);
      }
      return;
    }

    // Reached base?
    if (dToBase <= base.size / 2 + this.radius) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0 && ctx.active) {
        this.attackTimer = this.def.attackInterval;
        base.damage(this.def.damage);
        ctx.audio.baseHit();
        ctx.effects.addShake(6);
      }
      return;
    }

    // Move toward base.
    const dx = base.x - this.x, dy = base.y - this.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    this.x += (dx / len) * this.speed * dt;
    this.y += (dy / len) * this.speed * dt;
  }

  draw(ctx) {
    ctx.fillStyle = this.flash > 0 ? '#fff' : this.def.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0b1a08'; ctx.lineWidth = 2; ctx.stroke();
    // hp bar
    if (this.hp < this.maxHp) {
      const w = this.radius * 2;
      ctx.fillStyle = '#000'; ctx.fillRect(this.x - this.radius, this.y - this.radius - 7, w, 3);
      ctx.fillStyle = '#ff5252'; ctx.fillRect(this.x - this.radius, this.y - this.radius - 7, w * (this.hp / this.maxHp), 3);
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/entities/projectile.js src/entities/defense.js src/entities/zombie.js
git commit -m "feat: add projectile, defense, and zombie entities"
```

---

## Task 13: UI / HUD + screens

**Files:**
- Create: `src/ui.js`

- [ ] **Step 1: Create `src/ui.js`**

```js
import { DEFENSE_ORDER, DEFENSES, TOTAL_ROUNDS } from './config.js';
import { PHASE } from './systems/phase.js';

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}

export function drawHUD(ctx, game) {
  const { inventory, base, round, phase, phaseTime, selected } = game;

  // top bar
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, ctx.canvas.width, 54);

  ctx.font = 'bold 18px system-ui'; ctx.textAlign = 'left';
  ctx.fillStyle = '#a9743b'; ctx.fillText(`Wood ${inventory.wood}`, 16, 34);
  ctx.fillStyle = '#b8c0cc'; ctx.fillText(`Metal ${inventory.metal}`, 150, 34);
  ctx.fillStyle = '#5cd65c'; ctx.fillText(`Food ${inventory.food}`, 290, 34);

  // round + timer center
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  const phaseLabel = phase === PHASE.GATHER ? 'GATHER' : phase === PHASE.DEFEND ? 'DEFEND' : '';
  ctx.fillText(`Round ${round}/${TOTAL_ROUNDS}  —  ${phaseLabel}  ${fmtTime(phaseTime)}`, ctx.canvas.width / 2, 34);

  // base health bar (top-right)
  const bw = 220, bx = ctx.canvas.width - bw - 16, by = 18;
  ctx.fillStyle = '#000'; ctx.fillRect(bx, by, bw, 18);
  const frac = base.hp / base.maxHp;
  ctx.fillStyle = frac > 0.5 ? '#5cd65c' : frac > 0.25 ? '#e8c15a' : '#ff5252';
  ctx.fillRect(bx, by, bw * frac, 18);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 18);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(`BASE ${Math.ceil(base.hp)}/${base.maxHp}`, bx + bw / 2, by + 14);

  // toolbar (bottom)
  const tbY = ctx.canvas.height - 56;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, tbY, ctx.canvas.width, 56);
  ctx.textAlign = 'center';
  DEFENSE_ORDER.forEach((type, i) => {
    const def = DEFENSES[type];
    const x = 20 + i * 250;
    const isSel = selected === type;
    ctx.fillStyle = isSel ? def.color : 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, tbY + 8, 236, 40);
    ctx.strokeStyle = isSel ? '#fff' : '#555'; ctx.lineWidth = 2; ctx.strokeRect(x, tbY + 8, 236, 40);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui';
    const cost = Object.entries(def.cost).map(([k, v]) => `${v}${k[0].toUpperCase()}`).join(' ');
    ctx.fillText(`[${def.key}] ${def.label}  (${cost})`, x + 118, tbY + 33);
  });

  // hint line for food
  ctx.fillStyle = '#5cd65c'; ctx.font = '13px system-ui'; ctx.textAlign = 'right';
  ctx.fillText('Press F to eat food (+10 HP)', ctx.canvas.width - 16, tbY - 8);
  ctx.textAlign = 'left';
}

export function drawTip(ctx, text) {
  if (!text) return;
  ctx.textAlign = 'center';
  ctx.font = 'bold 20px system-ui';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(ctx.canvas.width / 2 - 300, 64, 600, 40);
  ctx.fillStyle = '#ffe066';
  ctx.fillText(text, ctx.canvas.width / 2, 90);
  ctx.textAlign = 'left';
}

function overlay(ctx, title, subtitle, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = color; ctx.font = 'bold 64px system-ui';
  ctx.fillText(title, ctx.canvas.width / 2, ctx.canvas.height / 2 - 20);
  ctx.fillStyle = '#fff'; ctx.font = '24px system-ui';
  ctx.fillText(subtitle, ctx.canvas.width / 2, ctx.canvas.height / 2 + 40);
  ctx.textAlign = 'left';
}

export function drawTitle(ctx) {
  overlay(ctx, 'LAST STAND', 'Click or press Enter to start', '#7fd1ae');
  ctx.textAlign = 'center'; ctx.fillStyle = '#aaa'; ctx.font = '16px system-ui';
  ctx.fillText('WASD to move · 1-5 select defense · click to place · F to eat food', ctx.canvas.width / 2, ctx.canvas.height / 2 + 90);
  ctx.textAlign = 'left';
}

export function drawRoundEnd(ctx, game) {
  overlay(ctx, `Round ${game.round} Complete`, `Base ${Math.ceil(game.base.hp)}/${game.base.maxHp} HP · Press Enter for next round`, '#e8c15a');
}

export function drawVictory(ctx) {
  overlay(ctx, 'YOU SURVIVED', 'All 10 rounds cleared! Press Enter to play again', '#7fd1ae');
}

export function drawGameOver(ctx, game) {
  overlay(ctx, 'GAME OVER', `The base fell on round ${game.round}. Press Enter to retry`, '#ff5252');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui.js
git commit -m "feat: add HUD and screen overlays"
```

---

## Task 14: Game class — state, loop, and orchestration

**Files:**
- Create: `src/game.js`
- Modify: `src/main.js`

- [ ] **Step 1: Create `src/game.js`**

```js
import { WORLD, BASE, DEFENSES, DEFENSE_ORDER, TIMING, PLACE_RADIUS,
         resourceSpawnCounts, FOOD_HEAL } from './config.js';
import { mulberry32, dist } from './utils.js';
import { newInventory, addResource, spend, eatFood } from './systems/economy.js';
import { snapToGrid, validatePlacement } from './systems/grid.js';
import { buildSpawnSchedule } from './systems/waves.js';
import { PHASE, gatherDuration, nextPhase, hpBonusForRound } from './systems/phase.js';
import { splashTargets } from './systems/combat.js';
import { Base } from './entities/base.js';
import { Player } from './entities/player.js';
import { Resource } from './entities/resource.js';
import { Defense } from './entities/defense.js';
import { Zombie } from './entities/zombie.js';
import { Effects } from './effects.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { drawHUD, drawTip, drawTitle, drawRoundEnd, drawVictory, drawGameOver } from './ui.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input(canvas);
    this.audio = new Audio();
    this.reset();
  }

  reset() {
    this.base = new Base();
    this.player = new Player(BASE.x, BASE.y + 120);
    this.inventory = newInventory();
    this.effects = new Effects();
    this.resources = [];
    this.defenses = [];
    this.zombies = [];
    this.projectiles = [];
    this.round = 1;
    this.phase = PHASE.TITLE;
    this.phaseTime = 0;
    this.selected = 'turret';
    this.spawnSchedule = [];
    this.spawnIndex = 0;
    this.seed = 12345;
    this.tip = '';
  }

  // ---- phase entry ----
  startGather() {
    this.phaseTime = gatherDuration(this.round);
    this.resources = [];
    this.spawnResources();
    // Round 1: a couple of harmless wanderers for early motion.
    if (this.round === 1) {
      for (let i = 0; i < TIMING.wandererCount; i++) {
        const z = new Zombie('runner', Math.random() * WORLD.width, 0);
        z.wanderer = true; z.speed = 30;
        this.zombies.push(z);
      }
    }
    this.tip = this.round === 1
      ? 'Collect resources! Press 4 for Turret, then click near your base to place it.'
      : '';
  }

  startDefend() {
    this.phaseTime = TIMING.defend;
    const rng = mulberry32(this.seed + this.round);
    this.spawnSchedule = buildSpawnSchedule(this.round, rng);
    this.spawnIndex = 0;
    // clear leftover wanderers
    this.zombies = this.zombies.filter((z) => !z.wanderer);
    this.tip = this.round === 1 ? 'Defend! Turrets fire automatically. Survive the wave.' : '';
  }

  startRoundEnd() {
    this.audio.roundEnd();
    const bonus = hpBonusForRound(this.round);
    if (bonus) { this.base.maxHp += bonus; this.base.heal(bonus); }
    this.zombies = []; this.projectiles = [];
  }

  advancePhase() {
    const res = nextPhase(this.phase, { round: this.round });
    this.phase = res.phase; this.round = res.round;
    if (this.phase === PHASE.GATHER) this.startGather();
    else if (this.phase === PHASE.DEFEND) this.startDefend();
    else if (this.phase === PHASE.ROUND_END) this.startRoundEnd();
    else if (this.phase === PHASE.VICTORY) this.audio.victory();
  }

  spawnResources() {
    const counts = resourceSpawnCounts(this.round);
    const margin = 70;
    for (const type of ['wood', 'metal', 'food']) {
      for (let i = 0; i < counts[type]; i++) {
        let x, y;
        do {
          x = margin + Math.random() * (WORLD.width - margin * 2);
          y = margin + Math.random() * (WORLD.height - margin * 2);
        } while (dist(x, y, BASE.x, BASE.y) < 90); // not on the base
        this.resources.push(new Resource(type, x, y));
      }
    }
  }

  // ---- input handling ----
  handleInput() {
    const inp = this.input;
    // Any key/click unlocks audio.
    if (inp.mouse.clicked || inp.pressed.size) this.audio.unlock();

    if (this.phase === PHASE.TITLE) {
      if (inp.keyPressed('Enter') || inp.mouse.clicked) this.advancePhase();
      return;
    }
    if (this.phase === PHASE.ROUND_END) {
      if (inp.keyPressed('Enter')) this.advancePhase();
      return;
    }
    if (this.phase === PHASE.VICTORY || this.phase === PHASE.GAMEOVER) {
      if (inp.keyPressed('Enter')) { this.reset(); }
      return;
    }

    // select defense 1-5
    DEFENSE_ORDER.forEach((type, i) => {
      if (inp.keyPressed(`Digit${i + 1}`)) this.selected = type;
    });

    // eat food
    if (inp.keyPressed('KeyF')) {
      if (eatFood(this.inventory)) {
        this.base.heal(FOOD_HEAL); this.audio.heal();
        this.effects.floatText(this.base.x, this.base.y - 40, '+10 HP', '#5cd65c');
      }
    }

    // place / detonate on click
    if (inp.mouse.clicked) this.handleClick();
  }

  handleClick() {
    const mx = this.input.mouse.x, my = this.input.mouse.y;
    // Ignore clicks in HUD bars.
    if (my < 54 || my > this.canvas.height - 56) return;

    // If clicking an existing armed bomb during defend -> detonate.
    if (this.phase === PHASE.DEFEND) {
      for (const d of this.defenses) {
        if (d.type === 'bomb' && d.armed && dist(mx, my, d.x, d.y) < d.size) {
          this.detonate(d); return;
        }
      }
    }

    const type = this.selected;
    const def = DEFENSES[type];
    const snap = snapToGrid(mx, my);
    const v = validatePlacement(snap.x, snap.y, this.defenses, this.base);
    if (!v.ok) { this.effects.floatText(snap.x, snap.y, v.reason, '#ff5252'); return; }
    if (!spend(this.inventory, def.cost)) {
      this.effects.floatText(snap.x, snap.y, 'Not enough resources', '#ff5252'); return;
    }
    this.defenses.push(new Defense(type, snap.x, snap.y));
    this.audio.place();
    this.effects.burst(snap.x, snap.y, def.color, 6, 80);
  }

  detonate(bomb) {
    bomb.armed = false; bomb.dead = true;
    this.audio.explosion();
    this.effects.burst(bomb.x, bomb.y, '#e67e22', 24, 220);
    this.effects.addShake(12);
    for (const z of splashTargets(this.zombies, bomb.x, bomb.y, DEFENSES.bomb.radius)) {
      z.hp -= DEFENSES.bomb.damage; z.flash = 0.15;
    }
  }

  // ---- update ----
  update(dt) {
    this.handleInput();

    if (this.phase === PHASE.TITLE || this.phase === PHASE.VICTORY ||
        this.phase === PHASE.GAMEOVER || this.phase === PHASE.ROUND_END) {
      this.effects.update(dt);
      return;
    }

    this.phaseTime -= dt;
    this.player.update(dt, this.input);
    this.base.update(dt);

    // resource pickups
    for (const r of this.resources) {
      r.update(dt);
      if (r.tryCollect(this.player.x, this.player.y, this.player.radius)) {
        addResource(this.inventory, r.type);
        this.audio.pickup();
        this.effects.floatText(r.x, r.y, `+${r.type === 'food' ? 1 : 5} ${r.type}`, '#ffe066');
        this.effects.burst(r.x, r.y, '#ffe066', 6, 90);
      }
    }
    this.resources = this.resources.filter((r) => !r.collected);

    const active = this.phase === PHASE.DEFEND;

    // spawn zombies per schedule during defend
    if (active) {
      const elapsed = TIMING.defend - this.phaseTime;
      while (this.spawnIndex < this.spawnSchedule.length &&
             this.spawnSchedule[this.spawnIndex].time <= elapsed) {
        const s = this.spawnSchedule[this.spawnIndex++];
        this.zombies.push(new Zombie(s.type, s.x, s.y));
      }
    }

    // wanderers drift during gather (round 1)
    if (!active) {
      for (const z of this.zombies) {
        if (z.wanderer) { z.y += z.speed * dt; if (z.y > WORLD.height) z.y = 0; }
      }
    }

    // defenses (turret fire, spike tick)
    for (const d of this.defenses) {
      const proj = d.update(dt, active ? this.zombies : [], this.effects, this.audio);
      if (proj) this.projectiles.push(proj);
    }
    this.defenses = this.defenses.filter((d) => !d.dead);

    // zombies
    const zctx = { base: this.base, defenses: this.defenses, effects: this.effects,
                   audio: this.audio, projectiles: this.projectiles, active };
    for (const z of this.zombies) {
      if (!z.wanderer) z.update(dt, zctx);
      if (z.hp <= 0 && !z.dead) {
        z.dead = true;
        this.effects.burst(z.x, z.y, z.def.color, 10, 140);
        this.audio.zombieHit();
        if (z.def.deathExplosion) {
          this.effects.burst(z.x, z.y, '#a6e22e', 16, 180);
          this.effects.addShake(8);
          for (const other of splashTargets(this.zombies, z.x, z.y, z.def.deathExplosion.radius)) {
            if (other !== z) other.hp -= z.def.deathExplosion.damage;
          }
          for (const d of this.defenses) {
            if (dist(d.x, d.y, z.x, z.y) <= z.def.deathExplosion.radius) d.damage(z.def.deathExplosion.damage);
          }
          if (dist(this.base.x, this.base.y, z.x, z.y) <= z.def.deathExplosion.radius) this.base.damage(z.def.deathExplosion.damage);
        }
      }
    }
    this.zombies = this.zombies.filter((z) => !z.dead);

    // projectiles
    for (const p of this.projectiles) {
      p.update(dt);
      if (p.kind === 'bullet') {
        for (const z of this.zombies) {
          if (dist(p.x, p.y, z.x, z.y) <= z.radius) { z.hp -= p.damage; z.flash = 0.12; p.dead = true; break; }
        }
      } else if (p.kind === 'acid') {
        if (dist(p.x, p.y, this.base.x, this.base.y) <= this.base.size / 2) {
          this.base.damage(p.damage); this.audio.baseHit(); this.effects.addShake(4); p.dead = true;
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);

    this.effects.update(dt);

    // lose check
    if (this.base.hp <= 0) { this.phase = PHASE.GAMEOVER; this.audio.gameover(); return; }

    // phase timeout / clear condition
    if (this.phase === PHASE.GATHER && this.phaseTime <= 0) this.advancePhase();
    if (this.phase === PHASE.DEFEND) {
      const allSpawned = this.spawnIndex >= this.spawnSchedule.length;
      if (this.phaseTime <= 0 || (allSpawned && this.zombies.length === 0)) this.advancePhase();
    }
  }

  // ---- draw ----
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const shake = this.effects.shakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    this.drawGround(ctx);

    // placement radius hint + preview during gather/defend
    if (this.phase === PHASE.GATHER || this.phase === PHASE.DEFEND) {
      ctx.strokeStyle = 'rgba(127,209,174,0.15)';
      ctx.beginPath(); ctx.arc(this.base.x, this.base.y, PLACE_RADIUS, 0, Math.PI * 2); ctx.stroke();
      this.drawPlacementPreview(ctx);
    }

    for (const r of this.resources) r.draw(ctx);
    for (const d of this.defenses) d.draw(ctx);
    this.base.draw(ctx);
    for (const z of this.zombies) z.draw(ctx);
    for (const p of this.projectiles) p.draw(ctx);
    this.player.draw(ctx);
    this.effects.draw(ctx);

    ctx.restore();

    // UI (unaffected by shake)
    if (this.phase === PHASE.TITLE) { drawTitle(ctx); return; }
    drawHUD(ctx, this);
    if (this.tip) drawTip(ctx, this.tip);
    if (this.phase === PHASE.ROUND_END) drawRoundEnd(ctx, this);
    if (this.phase === PHASE.VICTORY) drawVictory(ctx);
    if (this.phase === PHASE.GAMEOVER) drawGameOver(ctx, this);
  }

  drawGround(ctx) {
    // subtle grid for the "town" feel
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < WORLD.width; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height); ctx.stroke();
    }
    for (let y = 0; y < WORLD.height; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke();
    }
  }

  drawPlacementPreview(ctx) {
    const mx = this.input.mouse.x, my = this.input.mouse.y;
    if (my < 54 || my > this.canvas.height - 56) return;
    const snap = snapToGrid(mx, my);
    const def = DEFENSES[this.selected];
    const v = validatePlacement(snap.x, snap.y, this.defenses, this.base);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = v.ok ? def.color : '#ff5252';
    ctx.fillRect(snap.x - def.size / 2, snap.y - def.size / 2, def.size, def.size);
    ctx.globalAlpha = 1;
    if (this.selected === 'turret' && v.ok) {
      ctx.strokeStyle = 'rgba(58,123,213,0.4)';
      ctx.beginPath(); ctx.arc(snap.x, snap.y, def.range, 0, Math.PI * 2); ctx.stroke();
    }
  }
}
```

- [ ] **Step 2: Replace `src/main.js` with the real bootstrap + loop**

```js
import { Game } from './game.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);

let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05; // clamp big gaps (tab switch)
  game.update(dt);
  game.draw();
  game.input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- [ ] **Step 3: Manual browser verification**

Run a local static server from the repo root and open it:
Run: `python3 -m http.server 8000`
Open: `http://localhost:8000`
Expected:
- Title screen "LAST STAND" appears; click/Enter starts.
- Round 1 gather: player moves with WASD; walking over pickups collects them (chime + float text); a couple of slow wanderer zombies drift down the screen.
- Select turret (press 4), click near base → turret places (sound + particles); invalid spots show a red preview + reason.
- After 45s (or watch the timer), defend phase begins; runners spawn from edges and turrets shoot them; base takes damage when reached.
- Wave clears → "Round 1 Complete" → Enter → Round 2.

- [ ] **Step 4: Run the test suite to confirm nothing broke**

Run: `npm test`
Expected: PASS (all pure-logic suites still green).

- [ ] **Step 5: Commit**

```bash
git add src/game.js src/main.js
git commit -m "feat: wire up Game loop, phases, placement, combat, and rendering"
```

---

## Task 15: Balance pass + full 10-round playthrough verification

**Files:**
- Modify: `src/config.js` (only if playtest requires tuning)

- [ ] **Step 1: Play a full run and observe**

Serve and play to round 10 (you can temporarily lower `TIMING.gather`/`defend` in config to speed iteration, then revert).
Checklist:
- [ ] First 90 seconds show motion + combat (wanderers in gather, first wave shortly after).
- [ ] A player doing nothing clever can still survive early rounds (loop is forgiving at 2s reaction time).
- [ ] Brutes appear round 3, spitters round 5; spitters stop at range and spit, explode on death.
- [ ] Spikes damage but do NOT block; walls/barricades block and get attacked.
- [ ] Bombs detonate on click and clear clusters.
- [ ] +5 max HP applied after rounds 3, 6, 9 (watch the base bar max grow).
- [ ] Victory screen after round 10; Game Over if base hits 0; Enter restarts cleanly.

- [ ] **Step 2: Tune only if needed**

If a stage is unwinnable or trivial, adjust the relevant numbers in `src/config.js` (e.g., `WAVES`, `DEFENSES.turret.damage`, `resourceSpawnCounts`). Keep changes small and re-verify. If no change is needed, skip.

- [ ] **Step 3: Restore any temporarily shortened timings**

Confirm `TIMING` matches the spec (gatherRound1 45, gather 90, defend 120).

- [ ] **Step 4: Commit (if any tuning happened)**

```bash
git add src/config.js
git commit -m "balance: tune wave/economy values after full playthrough"
```

---

## Task 16: Deploy to GitHub Pages

**Files:**
- Create: `.github/workflows/deploy.yml`
- Create: `README.md`

- [ ] **Step 1: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - id: deployment
        uses: actions/deploy-pages@v4
```

Note: The site is served from the repo root (static files, no build). `node_modules/` is gitignored so it won't be uploaded.

- [ ] **Step 2: Create `README.md`**

```markdown
# Last Stand — Zombie Defense

A browser-based, real-time top-down zombie-defense strategy game. Gather resources, build turrets/walls/spikes/bombs, and survive 10 escalating waves.

## Play

Open the hosted URL — it loads directly into the game. No install, no login.

- **WASD / Arrows** — move
- **1–5** — select a defense
- **Click** — place selected defense (or click a bomb during a wave to detonate)
- **F** — eat food (+10 HP)

## Develop

No build step for the game itself (plain ES modules + Canvas). To run tests:

\`\`\`bash
npm install
npm test
\`\`\`

To run locally:

\`\`\`bash
python3 -m http.server 8000
# open http://localhost:8000
\`\`\`
```

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/deploy.yml README.md
git commit -m "chore: add GitHub Pages deploy workflow and README"
git push
```

- [ ] **Step 4: Enable Pages (one-time, manual)**

In the GitHub repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Re-run the workflow if needed (Actions tab → Deploy → Run workflow). The hosted URL appears in the workflow's deploy step output and under Settings → Pages.

- [ ] **Step 5: Verify the hosted URL**

Open the published URL in a fresh browser tab. Confirm it loads straight into the title screen and is fully playable (repeat the Task 14 Step 3 checks against the live URL).

---

## Self-Review Notes (spec coverage)

- **§2 phases / win-loss** → Tasks 7, 14 (phase machine + Game orchestration, base-hp loss check).
- **§3 map / base center / edge spawns** → Tasks 6 (edge spawn), 11 (base), 14 (ground).
- **§4 player movement / invulnerable / gather+defend movement** → Task 11 (player), Task 14 (always updates player).
- **§5 resources / +5 values / food F-key / persistence** → Tasks 4, 11, 14 (inventory persists on the Game instance across rounds).
- **§6 five defenses / costs / spikes don't block / bomb click-detonate / grid + validation** → Tasks 5, 12, 14.
- **§7 three zombie types / behaviors / scaling / straight-line + attack-blockers / spitter range + death explosion** → Tasks 6, 12, 14.
- **§8 feedback: audio, particles, float text, screen shake, HUD** → Tasks 9, 10, 13, 14.
- **§9 difficulty ramp / first-90s wanderers + short round-1 gather / +5 HP rounds 3,6,9** → Tasks 2, 7, 14.
- **§10 visual style (shapes, colors)** → Tasks 11, 12, 13.
- **§11 tech (ES modules, Canvas, Web Audio, Pages)** → Tasks 1, 9, 16.
- **§12 balance values** → Task 2 (config), Task 15 (tuning).
- **§13 out-of-scope** respected (no save/menu/multiplayer/drag).
- **§14 success criteria** verified in Tasks 14, 15, 16.
```
