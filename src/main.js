import { Game } from './game.js';
import { drawFloatTexts } from './ui.js';

const stage = document.getElementById('stage');
const glCanvas = document.getElementById('scene');
const hudCanvas = document.getElementById('game');
const hudCtx = hudCanvas.getContext('2d');

// Lightweight boot status for automated smoke tests / debugging.
globalThis.__lastStand = { started: false, error: null };

function fatal(msg) {
  globalThis.__lastStand.error = msg;
  hudCtx.fillStyle = 'rgba(0,0,0,0.85)';
  hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.fillStyle = '#ff6b6b';
  hudCtx.font = 'bold 30px system-ui';
  hudCtx.textAlign = 'center';
  hudCtx.fillText('Could not start the 3D renderer', hudCanvas.width / 2, hudCanvas.height / 2 - 20);
  hudCtx.fillStyle = '#ddd';
  hudCtx.font = '18px system-ui';
  hudCtx.fillText(msg, hudCanvas.width / 2, hudCanvas.height / 2 + 20);
  hudCtx.fillText('This game needs a WebGL-capable browser with network access.', hudCanvas.width / 2, hudCanvas.height / 2 + 48);
  hudCtx.textAlign = 'left';
}

async function boot() {
  let Renderer3D;
  try {
    ({ Renderer3D } = await import('./render3d.js')); // pulls in three via importmap
  } catch (e) {
    fatal('Failed to load the 3D engine (Three.js).');
    console.error(e);
    return;
  }

  // Input attaches to the HUD canvas (top layer), so it receives clicks.
  const game = new Game(hudCanvas);
  let renderer;
  try {
    renderer = new Renderer3D(glCanvas, stage);
  } catch (e) {
    fatal('WebGL is unavailable in this browser.');
    console.error(e);
    return;
  }

  addEventListener('resize', () => renderer.resize());
  renderer.resize();

  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;

    // Ground point under the cursor -> world coords for placement/preview.
    game.input.world = renderer.screenToWorld(game.input.mouse.x, game.input.mouse.y);

    game.update(dt);
    renderer.sync(game, dt);
    renderer.render();

    game.drawHUDOnly(hudCtx);
    drawFloatTexts(hudCtx, game.effects, (x, y) => renderer.worldToScreen(x, y));

    game.input.endFrame();
    globalThis.__lastStand.started = true;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
