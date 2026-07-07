import { ZOMBIES, BASE } from '../config.js';
import { dist } from '../utils.js';
import { Projectile } from './projectile.js';

export class Zombie {
  constructor(type, x, y) {
    const def = ZOMBIES[type];
    this.type = type; this.def = def;
    this.x = x; this.y = y;
    this.hp = def.hp; this.maxHp = def.hp;
    this.radius = def.radius;
    this.speed = def.speed;
    this.attackTimer = 0;
    this.dead = false;
    this.flash = 0;
    this.wanderer = false;
  }

  update(dt, ctx) {
    if (this.flash > 0) this.flash -= dt;
    if (this.hp <= 0) return; // dead this frame; Game runs death effects + removal

    const { base } = ctx;
    const dToBase = dist(this.x, this.y, base.x, base.y);

    if (this.def.ranged && dToBase <= this.def.attackRange) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0 && ctx.active) {
        this.attackTimer = this.def.attackInterval;
        ctx.projectiles.push(new Projectile(this.x, this.y, base.x, base.y, 260, this.def.damage, 'acid'));
      }
      return;
    }

    let blocker = null;
    for (const d of ctx.defenses) {
      if (!d.blocks || d.dead) continue;
      const half = d.size / 2 + this.radius;
      if (Math.abs(this.x - d.x) <= half && Math.abs(this.y - d.y) <= half) { blocker = d; break; }
    }

    if (blocker) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackTimer = this.def.attackInterval;
        blocker.damage(this.def.damage);
        ctx.effects.burst(this.x, this.y, '#ffcc00', 4, 70);
      }
      return;
    }

    if (dToBase <= base.size / 2 + this.radius) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0 && ctx.active) {
        this.attackTimer = this.def.attackInterval;
        base.damage(this.def.damage);
        ctx.audio.baseHit();
        ctx.effects.addShake(6);
      }
      return;
    }

    const dx = base.x - this.x, dy = base.y - this.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    this.x += (dx / len) * this.speed * dt;
    this.y += (dy / len) * this.speed * dt;
  }

  draw(ctx) {
    ctx.fillStyle = this.flash > 0 ? '#fff' : this.def.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0b1a08'; ctx.lineWidth = 2; ctx.stroke();
    if (this.hp < this.maxHp) {
      const w = this.radius * 2;
      ctx.fillStyle = '#000'; ctx.fillRect(this.x - this.radius, this.y - this.radius - 7, w, 3);
      ctx.fillStyle = '#ff5252'; ctx.fillRect(this.x - this.radius, this.y - this.radius - 7, w * (this.hp / this.maxHp), 3);
    }
  }
}
