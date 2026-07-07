// Lightweight visual juice. Owned by Game; updated + drawn each frame.
export class Effects {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.shockwaves = []; // expanding rings, rendered as 3D shockwaves
    this.decals = [];     // persistent ground stains (blood/goo/scorch)
    this.flashes = [];    // brief bright light bursts for explosions
    this.shake = 0;
  }

  // Expanding blast ring for explosions (bomb, spitter death). maxR in world units.
  shock(x, y, color, maxR) {
    this.shockwaves.push({ x, y, color, maxR, life: 0.5, max: 0.5 });
  }

  // Tight, fast spark burst for impacts (bullets hitting zombies, etc.).
  spark(x, y, color, count = 6) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 140 + Math.random() * 160;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.28, max: 0.28, color, r: 1.5 + Math.random() * 2 });
    }
  }

  // Persistent ground stain that slowly fades. Capped so it can't grow forever.
  decal(x, y, color, radius, life = 9) {
    this.decals.push({ x, y, color, radius, rot: Math.random() * Math.PI, life, max: life });
    if (this.decals.length > 60) this.decals.shift();
  }

  // Short bright flash (with a burst of debris) for big explosions.
  flash(x, y, color, radius) {
    this.flashes.push({ x, y, color, radius, life: 0.22, max: 0.22 });
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
    for (const s of this.shockwaves) s.life -= dt;
    this.shockwaves = this.shockwaves.filter((s) => s.life > 0);
    for (const f of this.flashes) f.life -= dt;
    this.flashes = this.flashes.filter((f) => f.life > 0);
    for (const d of this.decals) d.life -= dt;
    this.decals = this.decals.filter((d) => d.life > 0);
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
