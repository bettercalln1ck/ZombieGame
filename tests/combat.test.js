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
