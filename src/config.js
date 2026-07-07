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
