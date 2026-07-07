import { DEFENSES } from '../config.js';
import { dist } from '../utils.js';
import { Projectile } from './projectile.js';

export class Defense {
  constructor(type, x, y) {
    const def = DEFENSES[type];
    this.type = type; this.def = def;
    this.x = x; this.y = y;
    this.size = def.size;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.blocks = def.blocks;
    this.cooldown = 0;
    this.tickTimer = 0;
    this.armed = type === 'bomb';
    this.dead = false;
    this.flash = 0;
  }

  isDestructible() { return this.hp !== Infinity; }

  damage(amount) {
    if (!this.isDestructible()) return;
    this.hp -= amount; this.flash = 0.15;
    if (this.hp <= 0) this.dead = true;
  }

  update(dt, zombies, effects, audio) {
    if (this.flash > 0) this.flash -= dt;

    if (this.type === 'turret') {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        let target = null, best = this.def.range;
        for (const z of zombies) {
          const d = dist(this.x, this.y, z.x, z.y);
          if (d <= best) { best = d; target = z; }
        }
        if (target) {
          this.cooldown = this.def.fireInterval;
          audio.shoot();
          return new Projectile(this.x, this.y, target.x, target.y, 520, this.def.damage, 'bullet');
        }
      }
    }

    if (this.type === 'spike') {
      this.tickTimer -= dt;
      if (this.tickTimer <= 0) {
        this.tickTimer = this.def.tickInterval;
        const half = this.size / 2;
        for (const z of zombies) {
          if (Math.abs(z.x - this.x) <= half + z.radius && Math.abs(z.y - this.y) <= half + z.radius) {
            z.hp -= this.def.tickDamage;
            effects.burst(z.x, z.y, '#c0392b', 3, 60);
          }
        }
      }
    }
    return null;
  }

  draw(ctx) {
    const s = this.size, x = this.x - s / 2, y = this.y - s / 2;
    ctx.fillStyle = this.flash > 0 ? '#fff' : this.def.color;
    if (this.type === 'spike') {
      ctx.fillStyle = '#7a1e15';
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = this.def.color;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 4 + i * 10, y + s - 3);
        ctx.lineTo(x + 9 + i * 10, y + 5);
        ctx.lineTo(x + 14 + i * 10, y + s - 3);
        ctx.closePath(); ctx.fill();
      }
    } else {
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(x, y, s, s);
      if (this.type === 'turret') {
        ctx.fillStyle = '#1b3a5c';
        ctx.fillRect(this.x - 3, this.y - s / 2 - 6, 6, 12);
      }
      if (this.type === 'bomb') {
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(this.x, this.y, 6, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (this.isDestructible() && this.hp < this.maxHp) {
      ctx.fillStyle = '#000'; ctx.fillRect(x, y - 6, s, 3);
      ctx.fillStyle = '#5cd65c'; ctx.fillRect(x, y - 6, s * (this.hp / this.maxHp), 3);
    }
  }
}
