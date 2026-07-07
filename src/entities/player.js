import { PLAYER, WORLD } from '../config.js';
import { clamp } from '../utils.js';

export class Player {
  constructor(x, y) { this.x = x; this.y = y; this.radius = PLAYER.radius; }

  update(dt, input) {
    let dx = 0, dy = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) dy -= 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) dy += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) dx -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) dx += 1;
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      this.x += (dx / len) * PLAYER.speed * dt;
      this.y += (dy / len) * PLAYER.speed * dt;
    }
    this.x = clamp(this.x, this.radius, WORLD.width - this.radius);
    this.y = clamp(this.y, this.radius, WORLD.height - this.radius);
  }

  draw(ctx) {
    ctx.fillStyle = '#4fd1ff';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0a2b33'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(this.x, this.y - 4, 3, 0, Math.PI * 2); ctx.fill();
  }
}
