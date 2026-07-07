// Headless integration test: drives the real Game loop with mocked DOM/canvas/audio.
// Verifies the game runs end-to-end without crashing and that key integrated
// mechanics behave (spitter death explosion, phase progression, a full clear).
import { describe, it, expect, beforeEach } from 'vitest';

// --- Minimal DOM / Web Audio mocks so game.js modules construct in Node ---
function installGlobals() {
  globalThis.addEventListener = () => {};
  const osc = () => ({
    connect: () => {}, start: () => {}, stop: () => {}, type: 'square',
    frequency: { setValueAtTime: () => {} },
  });
  const gain = () => ({
    connect: () => {},
    gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
  });
  globalThis.window = {
    AudioContext: function () {
      return {
        state: 'running', currentTime: 0, destination: {},
        resume: () => {}, createOscillator: osc, createGain: gain,
      };
    },
  };
}

function makeCanvas() {
  const canvas = {
    width: 1280, height: 720,
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  };
  const noop = () => {};
  const ctx = new Proxy({}, {
    get(_t, p) {
      if (p === 'canvas') return canvas;
      if (p === 'measureText') return () => ({ width: 10 });
      return noop;
    },
    set() { return true; },
  });
  canvas.getContext = () => ctx;
  return canvas;
}

// Dynamic import AFTER globals are installed.
async function loadGame() {
  installGlobals();
  const { Game } = await import('../src/game.js');
  const { PHASE } = await import('../src/systems/phase.js');
  const { Zombie } = await import('../src/entities/zombie.js');
  return { Game, PHASE, Zombie };
}

describe('integration: game loop', () => {
  beforeEach(() => installGlobals());

  it('constructs at TITLE and draws without throwing', async () => {
    const { Game, PHASE } = await loadGame();
    const g = new Game(makeCanvas());
    expect(g.phase).toBe(PHASE.TITLE);
    expect(() => g.draw()).not.toThrow();
  });

  it('spitter death explosion damages a nearby zombie (the bug we fixed)', async () => {
    const { Game, PHASE, Zombie } = await loadGame();
    const g = new Game(makeCanvas());
    g.advancePhase();            // TITLE -> GATHER
    g.advancePhase();            // GATHER -> DEFEND (active)
    expect(g.phase).toBe(PHASE.DEFEND);
    g.zombies = [];              // clear scheduled spawns for a clean setup
    g.spawnSchedule = [];        // so the wave is considered fully spawned
    g.spawnIndex = 0;

    const spitter = new Zombie('spitter', g.base.x - 400, g.base.y); // far from base, won't spit
    const victim = new Zombie('brute', g.base.x - 380, g.base.y);    // within 100px of spitter
    const victimStartHp = victim.hp;
    spitter.hp = 1;              // will die from the tick below
    g.zombies.push(spitter, victim);

    spitter.hp = 0;              // killing blow applied this frame
    g.update(0.016);            // death pass should fire the explosion

    expect(spitter.dead).toBe(true);
    expect(g.zombies.includes(spitter)).toBe(false); // removed
    expect(victim.hp).toBe(victimStartHp - 30);      // took 30 splash damage
  });

  it('progresses TITLE -> GATHER -> DEFEND and spawns zombies during defend', async () => {
    const { Game, PHASE } = await loadGame();
    const g = new Game(makeCanvas());
    g.advancePhase();            // GATHER
    expect(g.phase).toBe(PHASE.GATHER);
    g.advancePhase();            // DEFEND
    expect(g.phase).toBe(PHASE.DEFEND);
    // advance ~15s of defend; firstSpawnDelay is 5s so zombies must appear
    for (let i = 0; i < 15 / 0.05; i++) g.update(0.05);
    expect(g.zombies.length).toBeGreaterThan(0);
  });

  it('a well-fortified base clears all 10 rounds -> VICTORY without crashing', async () => {
    const { Game, PHASE } = await loadGame();
    const { Defense } = await import('../src/entities/defense.js');
    const g = new Game(makeCanvas());

    // Fortify at the start of every GATHER: ring the base with turrets so waves
    // are shredded before reaching it. Idempotent per round.
    function fortify() {
      const cx = g.base.x, cy = g.base.y;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        for (const r of [110, 150, 190]) {
          const x = Math.round(cx + Math.cos(a) * r);
          const y = Math.round(cy + Math.sin(a) * r);
          g.defenses.push(new Defense('turret', x, y));
        }
      }
    }

    let steps = 0;
    const dt = 0.05;
    let lastPhase = g.phase;
    // Kick off the game.
    g.advancePhase(); // GATHER round 1
    fortify();

    while (g.phase !== PHASE.VICTORY && g.phase !== PHASE.GAMEOVER && steps < 200000) {
      // When we (re)enter GATHER for a new round, refortify and skip its timer.
      if (g.phase === PHASE.GATHER && lastPhase !== PHASE.GATHER) fortify();
      lastPhase = g.phase;

      // Skip the long GATHER timers instantly to keep the test fast.
      if (g.phase === PHASE.GATHER) { g.phaseTime = 0.01; }
      // Auto-advance the ROUND_END screen (normally waits for Enter).
      if (g.phase === PHASE.ROUND_END) { g.advancePhase(); continue; }

      expect(() => g.update(dt)).not.toThrow();
      steps++;
    }

    expect(g.phase).toBe(PHASE.VICTORY);
    expect(g.base.hp).toBeGreaterThan(0);
    // +5 HP after rounds 3/6/9 => maxHp grew from 100 to 115.
    expect(g.base.maxHp).toBe(115);
  });
});
