import { dist } from '../utils.js';

export class Projectile {
  // target (optional) makes the projectile home onto a moving entity so it
  // doesn't miss fast movers. Non-homing projectiles fly straight to (tx, ty).
  constructor(x, y, tx, ty, speed, damage, kind, target = null) {
    this.x = x; this.y = y; this.damage = damage; this.kind = kind;
    this.speed = speed;
    this.target = target;
    this.homing = !!target;
    this.dead = false;
    const d = Math.max(1, dist(x, y, tx, ty));
    this.vx = ((tx - x) / d) * speed;
    this.vy = ((ty - y) / d) * speed;
    this.life = 2.5;
  }

  update(dt) {
    // Re-aim at the live target each frame so a moving zombie can't be missed.
    if (this.homing && this.target && !this.target.dead && this.target.hp > 0) {
      const d = Math.max(1, dist(this.x, this.y, this.target.x, this.target.y));
      this.vx = ((this.target.x - this.x) / d) * this.speed;
      this.vy = ((this.target.y - this.y) / d) * this.speed;
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    ctx.fillStyle = this.kind === 'acid' ? '#a6e22e' : '#ffe066';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.kind === 'acid' ? 5 : 3, 0, Math.PI * 2); ctx.fill();
  }
}
