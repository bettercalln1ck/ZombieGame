import { describe, it, expect } from 'vitest';
import { snapToGrid, cellKey, validatePlacement } from '../src/systems/grid.js';
import { BASE } from '../src/config.js';

describe('grid', () => {
  it('snaps a point to the nearest 32px cell center', () => {
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
