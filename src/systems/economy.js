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

export function eatFood(inv) {
  if (inv.food <= 0) return false;
  inv.food -= 1;
  return true;
}
