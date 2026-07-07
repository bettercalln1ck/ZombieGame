import { GRID, BASE, PLACE_RADIUS } from '../config.js';
import { dist } from '../utils.js';

export function snapToGrid(x, y) {
  return {
    x: Math.floor(x / GRID) * GRID + GRID / 2,
    y: Math.floor(y / GRID) * GRID + GRID / 2,
  };
}

export function cellKey(x, y) {
  return `${Math.floor(x / GRID)},${Math.floor(y / GRID)}`;
}

export function validatePlacement(x, y, existing, base = BASE) {
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
