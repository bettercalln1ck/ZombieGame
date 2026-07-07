// Lightweight visual juice. Owned by Game; updated + drawn each frame.
export class Effects {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.shake = 0;
  }

  burst(x, y, color, count = 8, speed = 120) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, max: 0.5, color, r: 2 + Math.random() * 2 });
    }
  }

  floatText(x, y, text, color = '#fff') {
    this.texts.push({ x, y, text, color, life: 0.7, max: 0.7 });
  }

  addShake(amount) { this.shake = Math.min(this.shake + amount, 16); }

  update(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92; p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) { t.y -= 24 * dt; t.life -= dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
    this.shake *= 0.85;
    if (this.shake < 0.3) this.shake = 0;
  }

  draw(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px system-ui';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.max(0, t.life / t.max);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  shakeOffset() {
    if (this.shake === 0) return { x: 0, y: 0 };
    return { x: (Math.random() - 0.5) * this.shake, y: (Math.random() - 0.5) * this.shake };
  }
}
