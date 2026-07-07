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
