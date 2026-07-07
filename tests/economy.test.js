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
