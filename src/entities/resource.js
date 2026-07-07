import { dist } from '../utils.js';

const COLORS = { wood: '#a9743b', metal: '#b8c0cc', food: '#5cd65c' };

export class Resource {
  constructor(type, x, y) {
    this.type = type; this.x = x; this.y = y;
    this.r = 11; this.collected = false; this.bob = Math.random() * Math.PI * 2;
  }

  update(dt) { this.bob += dt * 3; }

  tryCollect(px, py, pr) {
    if (this.collected) return false;
    if (dist(px, py, this.x, this.y) <= pr + this.r) { this.collected = true; return true; }
    return false;
  }

  draw(ctx) {
    const yy = this.y + Math.sin(this.bob) * 3;
    ctx.save();
    ctx.shadowColor = COLORS[this.type]; ctx.shadowBlur = 12;
    ctx.fillStyle = COLORS[this.type];
    if (this.type === 'metal') {
      ctx.fillRect(this.x - this.r, yy - this.r, this.r * 2, this.r * 2);
    } else {
      ctx.beginPath(); ctx.arc(this.x, yy, this.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    if (this.type === 'metal') ctx.strokeRect(this.x - this.r, yy - this.r, this.r * 2, this.r * 2);
  }
}
