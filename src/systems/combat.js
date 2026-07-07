import { dist } from '../utils.js';

export function applyDamage(entity, amount) {
  entity.hp -= amount;
  if (entity.hp <= 0) {
    entity.hp = 0;
    return true;
  }
  return false;
}

export function splashTargets(entities, x, y, radius) {
  return entities.filter((e) => dist(e.x, e.y, x, y) <= radius);
}
