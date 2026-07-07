import { describe, it, expect } from 'vitest';
import { dist, clamp, aabbOverlap, mulberry32 } from '../src/utils.js';
import { applyDamage, splashTargets } from '../src/systems/combat.js';

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
