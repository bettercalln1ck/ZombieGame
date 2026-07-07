import { dist } from '../utils.js';

export class Projectile {
  constructor(x, y, tx, ty, speed, damage, kind) {
    this.x = x; this.y = y; this.damage = damage; this.kind = kind;
    this.dead = false;
    const d = Math.max(1, dist(x, y, tx, ty));
    this.vx = ((tx - x) / d) * speed;
    this.vy = ((ty - y) / d) * speed;
    this.life = 2.5;
  }

  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    ctx.fillStyle = this.kind === 'acid' ? '#a6e22e' : '#ffe066';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.kind === 'acid' ? 5 : 3, 0, Math.PI * 2); ctx.fill();
  }
}
