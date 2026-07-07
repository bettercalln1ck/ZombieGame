import { BASE } from '../config.js';

export class Base {
  constructor() {
    this.x = BASE.x; this.y = BASE.y;
    this.size = BASE.size;
    this.maxHp = BASE.maxHp;
    this.hp = BASE.maxHp;
    this.flash = 0; // red flash timer on hit
  }

  damage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.flash = 0.2;
  }

  heal(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); }

  update(dt) { if (this.flash > 0) this.flash -= dt; }

  draw(ctx) {
    const s = this.size, x = this.x - s / 2, y = this.y - s / 2;
    ctx.fillStyle = this.flash > 0 ? '#ff6b6b' : '#e8c15a';
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeRect(x, y, s, s);
    ctx.fillStyle = '#b5451b';
    ctx.beginPath();
    ctx.moveTo(x - 6, y); ctx.lineTo(this.x, y - 22); ctx.lineTo(x + s + 6, y);
    ctx.closePath(); ctx.fill();
  }
}
