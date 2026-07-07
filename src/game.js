import { WORLD, BASE, DEFENSES, DEFENSE_ORDER, TIMING, PLACE_RADIUS,
         resourceSpawnCounts, FOOD_HEAL } from './config.js';
import { mulberry32, dist } from './utils.js';
import { newInventory, addResource, spend, eatFood } from './systems/economy.js';
import { snapToGrid, validatePlacement } from './systems/grid.js';
import { buildSpawnSchedule } from './systems/waves.js';
import { PHASE, gatherDuration, nextPhase, hpBonusForRound } from './systems/phase.js';
import { splashTargets } from './systems/combat.js';
import { Base } from './entities/base.js';
import { Player } from './entities/player.js';
import { Resource } from './entities/resource.js';
import { Defense } from './entities/defense.js';
import { Zombie } from './entities/zombie.js';
import { Effects } from './effects.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { drawHUD, drawTip, drawTitle, drawRoundEnd, drawVictory, drawGameOver } from './ui.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input(canvas);
    this.audio = new Audio();
    this.reset();
  }

  reset() {
    this.base = new Base();
    this.player = new Player(BASE.x, BASE.y + 120);
    this.inventory = newInventory();
    this.effects = new Effects();
    this.resources = [];
    this.defenses = [];
    this.zombies = [];
    this.projectiles = [];
    this.round = 1;
    this.phase = PHASE.TITLE;
    this.phaseTime = 0;
    this.selected = 'turret';
    this.spawnSchedule = [];
    this.spawnIndex = 0;
    this.seed = 12345;
    this.tip = '';
  }

  startGather() {
    this.phaseTime = gatherDuration(this.round);
    this.resources = [];
    this.spawnResources();
    if (this.round === 1) {
      for (let i = 0; i < TIMING.wandererCount; i++) {
        const z = new Zombie('runner', Math.random() * WORLD.width, 0);
        z.wanderer = true; z.speed = 30;
        this.zombies.push(z);
      }
    }
    this.tip = this.round === 1
      ? 'Collect resources! Press 4 for Turret, then click near your base to place it.'
      : '';
  }

  startDefend() {
    this.phaseTime = TIMING.defend;
    const rng = mulberry32(this.seed + this.round);
    this.spawnSchedule = buildSpawnSchedule(this.round, rng);
    this.spawnIndex = 0;
    this.zombies = this.zombies.filter((z) => !z.wanderer);
    this.tip = this.round === 1 ? 'Defend! Turrets fire automatically. Survive the wave.' : '';
  }

  startRoundEnd() {
    this.audio.roundEnd();
    const bonus = hpBonusForRound(this.round);
    if (bonus) { this.base.maxHp += bonus; this.base.heal(bonus); }
    this.zombies = []; this.projectiles = [];
  }

  advancePhase() {
    const res = nextPhase(this.phase, { round: this.round });
    this.phase = res.phase; this.round = res.round;
    if (this.phase === PHASE.GATHER) this.startGather();
    else if (this.phase === PHASE.DEFEND) this.startDefend();
    else if (this.phase === PHASE.ROUND_END) this.startRoundEnd();
    else if (this.phase === PHASE.VICTORY) this.audio.victory();
  }

  spawnResources() {
    const counts = resourceSpawnCounts(this.round);
    const margin = 70;
    for (const type of ['wood', 'metal', 'food']) {
      for (let i = 0; i < counts[type]; i++) {
        let x, y;
        do {
          x = margin + Math.random() * (WORLD.width - margin * 2);
          y = margin + Math.random() * (WORLD.height - margin * 2);
        } while (dist(x, y, BASE.x, BASE.y) < 90);
        this.resources.push(new Resource(type, x, y));
      }
    }
  }

  handleInput() {
    const inp = this.input;
    if (inp.mouse.clicked || inp.pressed.size) this.audio.unlock();

    if (this.phase === PHASE.TITLE) {
      if (inp.keyPressed('Enter') || inp.mouse.clicked) this.advancePhase();
      return;
    }
    if (this.phase === PHASE.ROUND_END) {
      if (inp.keyPressed('Enter')) this.advancePhase();
      return;
    }
    if (this.phase === PHASE.VICTORY || this.phase === PHASE.GAMEOVER) {
      if (inp.keyPressed('Enter')) { this.reset(); }
      return;
    }

    DEFENSE_ORDER.forEach((type, i) => {
      if (inp.keyPressed(`Digit${i + 1}`)) this.selected = type;
    });

    if (inp.keyPressed('KeyF')) {
      if (eatFood(this.inventory)) {
        this.base.heal(FOOD_HEAL); this.audio.heal();
        this.effects.floatText(this.base.x, this.base.y - 40, '+10 HP', '#5cd65c');
      }
    }

    if (inp.mouse.clicked) this.handleClick();
  }

  handleClick() {
    // HUD band check stays in screen space (the HUD overlay is 1280x720).
    if (this.input.mouse.y < 54 || this.input.mouse.y > this.canvas.height - 56) return;
    // Placement uses world coordinates. In 3D these come from a ground raycast
    // (input.world, set by the render loop); in 2D they equal the screen mouse.
    const src = this.input.world || { x: this.input.mouse.x, y: this.input.mouse.y };
    if (!src) return;
    const mx = src.x, my = src.y;

    if (this.phase === PHASE.DEFEND) {
      for (const d of this.defenses) {
        if (d.type === 'bomb' && d.armed && dist(mx, my, d.x, d.y) < d.size) {
          this.detonate(d); return;
        }
      }
    }

    const type = this.selected;
    const def = DEFENSES[type];
    const snap = snapToGrid(mx, my);
    const v = validatePlacement(snap.x, snap.y, this.defenses, this.base);
    if (!v.ok) { this.effects.floatText(snap.x, snap.y, v.reason, '#ff5252'); return; }
    if (!spend(this.inventory, def.cost)) {
      this.effects.floatText(snap.x, snap.y, 'Not enough resources', '#ff5252'); return;
    }
    this.defenses.push(new Defense(type, snap.x, snap.y));
    this.audio.place();
    this.effects.burst(snap.x, snap.y, def.color, 6, 80);
  }

  detonate(bomb) {
    bomb.armed = false; bomb.dead = true;
    this.audio.explosion();
    this.effects.burst(bomb.x, bomb.y, '#e67e22', 24, 220);
    this.effects.shock(bomb.x, bomb.y, '#ffae42', DEFENSES.bomb.radius);
    this.effects.addShake(12);
    for (const z of splashTargets(this.zombies, bomb.x, bomb.y, DEFENSES.bomb.radius)) {
      z.hp -= DEFENSES.bomb.damage; z.flash = 0.15;
    }
  }

  update(dt) {
    this.handleInput();

    if (this.phase === PHASE.TITLE || this.phase === PHASE.VICTORY ||
        this.phase === PHASE.GAMEOVER || this.phase === PHASE.ROUND_END) {
      this.effects.update(dt);
      return;
    }

    this.phaseTime -= dt;
    this.player.update(dt, this.input);
    this.base.update(dt);

    for (const r of this.resources) {
      r.update(dt);
      if (r.tryCollect(this.player.x, this.player.y, this.player.radius)) {
        addResource(this.inventory, r.type);
        this.audio.pickup();
        this.effects.floatText(r.x, r.y, `+${r.type === 'food' ? 1 : 5} ${r.type}`, '#ffe066');
        this.effects.burst(r.x, r.y, '#ffe066', 6, 90);
      }
    }
    this.resources = this.resources.filter((r) => !r.collected);

    const active = this.phase === PHASE.DEFEND;

    if (active) {
      const elapsed = TIMING.defend - this.phaseTime;
      while (this.spawnIndex < this.spawnSchedule.length &&
             this.spawnSchedule[this.spawnIndex].time <= elapsed) {
        const s = this.spawnSchedule[this.spawnIndex++];
        this.zombies.push(new Zombie(s.type, s.x, s.y));
      }
    }

    if (!active) {
      for (const z of this.zombies) {
        if (z.wanderer) { z.y += z.speed * dt; if (z.y > WORLD.height) z.y = 0; }
      }
    }

    for (const d of this.defenses) {
      const proj = d.update(dt, active ? this.zombies : [], this.effects, this.audio);
      if (proj) this.projectiles.push(proj);
    }
    this.defenses = this.defenses.filter((d) => !d.dead);

    const zctx = { base: this.base, defenses: this.defenses, effects: this.effects,
                   audio: this.audio, projectiles: this.projectiles, active };
    for (const z of this.zombies) {
      if (!z.wanderer) z.update(dt, zctx);
    }

    for (const p of this.projectiles) {
      p.update(dt);
      if (p.kind === 'bullet') {
        for (const z of this.zombies) {
          if (dist(p.x, p.y, z.x, z.y) <= z.radius) { z.hp -= p.damage; z.flash = 0.12; p.dead = true; break; }
        }
      } else if (p.kind === 'acid') {
        if (dist(p.x, p.y, this.base.x, this.base.y) <= this.base.size / 2) {
          this.base.damage(p.damage); this.audio.baseHit(); this.effects.addShake(4); p.dead = true;
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);

    // Process zombie deaths AFTER all damage sources this frame (spikes, bullets,
    // splash). Runs here (not in the move loop) so death effects + the spitter's
    // death explosion actually fire the same frame the killing blow lands.
    for (const z of this.zombies) {
      if (z.dead || z.hp > 0) continue;
      z.dead = true;
      this.effects.burst(z.x, z.y, z.def.color, 10, 140);
      this.audio.zombieHit();
      if (z.def.deathExplosion) {
        this.effects.burst(z.x, z.y, '#a6e22e', 16, 180);
        this.effects.shock(z.x, z.y, '#a6e22e', z.def.deathExplosion.radius);
        this.effects.addShake(8);
        for (const other of splashTargets(this.zombies, z.x, z.y, z.def.deathExplosion.radius)) {
          if (other !== z) other.hp -= z.def.deathExplosion.damage;
        }
        for (const d of this.defenses) {
          if (dist(d.x, d.y, z.x, z.y) <= z.def.deathExplosion.radius) d.damage(z.def.deathExplosion.damage);
        }
        if (dist(this.base.x, this.base.y, z.x, z.y) <= z.def.deathExplosion.radius) this.base.damage(z.def.deathExplosion.damage);
      }
    }
    this.zombies = this.zombies.filter((z) => !z.dead);

    this.effects.update(dt);

    if (this.base.hp <= 0) { this.phase = PHASE.GAMEOVER; this.audio.gameover(); return; }

    if (this.phase === PHASE.GATHER && this.phaseTime <= 0) this.advancePhase();
    if (this.phase === PHASE.DEFEND) {
      const allSpawned = this.spawnIndex >= this.spawnSchedule.length;
      if (this.phaseTime <= 0 || (allSpawned && this.zombies.length === 0)) this.advancePhase();
    }
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const shake = this.effects.shakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    this.drawGround(ctx);

    if (this.phase === PHASE.GATHER || this.phase === PHASE.DEFEND) {
      ctx.strokeStyle = 'rgba(127,209,174,0.15)';
      ctx.beginPath(); ctx.arc(this.base.x, this.base.y, PLACE_RADIUS, 0, Math.PI * 2); ctx.stroke();
      this.drawPlacementPreview(ctx);
    }

    for (const r of this.resources) r.draw(ctx);
    for (const d of this.defenses) d.draw(ctx);
    this.base.draw(ctx);
    for (const z of this.zombies) z.draw(ctx);
    for (const p of this.projectiles) p.draw(ctx);
    this.player.draw(ctx);
    this.effects.draw(ctx);

    ctx.restore();

    if (this.phase === PHASE.TITLE) { drawTitle(ctx); return; }
    drawHUD(ctx, this);
    if (this.tip) drawTip(ctx, this.tip);
    if (this.phase === PHASE.ROUND_END) drawRoundEnd(ctx, this);
    if (this.phase === PHASE.VICTORY) drawVictory(ctx);
    if (this.phase === PHASE.GAMEOVER) drawGameOver(ctx, this);
  }

  // HUD/screens only — used by the 3D render path, where render3d.js draws the
  // world and this draws the interface on the transparent overlay canvas.
  drawHUDOnly(ctx) {
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.phase === PHASE.TITLE) { drawTitle(ctx); return; }
    drawHUD(ctx, this);
    if (this.tip) drawTip(ctx, this.tip);
    if (this.phase === PHASE.ROUND_END) drawRoundEnd(ctx, this);
    if (this.phase === PHASE.VICTORY) drawVictory(ctx);
    if (this.phase === PHASE.GAMEOVER) drawGameOver(ctx, this);
  }

  drawGround(ctx) {
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < WORLD.width; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height); ctx.stroke();
    }
    for (let y = 0; y < WORLD.height; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke();
    }
  }

  drawPlacementPreview(ctx) {
    const mx = this.input.mouse.x, my = this.input.mouse.y;
    if (my < 54 || my > this.canvas.height - 56) return;
    const snap = snapToGrid(mx, my);
    const def = DEFENSES[this.selected];
    const v = validatePlacement(snap.x, snap.y, this.defenses, this.base);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = v.ok ? def.color : '#ff5252';
    ctx.fillRect(snap.x - def.size / 2, snap.y - def.size / 2, def.size, def.size);
    ctx.globalAlpha = 1;
    if (this.selected === 'turret' && v.ok) {
      ctx.strokeStyle = 'rgba(58,123,213,0.4)';
      ctx.beginPath(); ctx.arc(snap.x, snap.y, def.range, 0, Math.PI * 2); ctx.stroke();
    }
  }
}
