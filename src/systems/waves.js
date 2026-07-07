import { WAVES, TIMING, WORLD } from '../config.js';

export function waveComposition(round) {
  return WAVES[round] || WAVES[1];
}

export function edgeSpawnPoint(rng) {
  const side = Math.floor(rng() * 4);
  switch (side) {
    case 0: return { x: rng() * WORLD.width, y: 0 };
    case 1: return { x: WORLD.width, y: rng() * WORLD.height };
    case 2: return { x: rng() * WORLD.width, y: WORLD.height };
    default: return { x: 0, y: rng() * WORLD.height };
  }
}

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
