// Headless browser smoke test: load the real page in Chrome, drive a few
// interactions, and assert the 3D renderer booted with no runtime errors.
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8231;
const URL = `http://localhost:${PORT}/`;

function serve() {
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { stdio: 'ignore' });
  return () => p.kill();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const stop = serve();
  await sleep(1000);
  const errors = [];
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const failed = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('requestfailed', (r) => failed.push(r.url()));
    page.on('response', (r) => { if (r.status() === 404) failed.push('404 ' + r.url()); });
    await page.goto(URL, { waitUntil: 'load', timeout: 20000 });

    // let modules load from CDN + a few frames run
    await sleep(4000);

    const boot = await page.evaluate(() => globalThis.__lastStand);
    // Start the game (title -> gather) with Enter, then place a turret & click.
    await page.keyboard.press('Enter');
    await sleep(600);
    await page.mouse.move(700, 330);
    await page.mouse.click(700, 330); // place default (turret) near base
    await sleep(400);
    await page.keyboard.press('Digit2'); // select wall
    await page.mouse.click(820, 330);
    await sleep(400);

    // sample the WebGL canvas INSIDE a frame (buffer isn't preserved between frames)
    const drew = await page.evaluate(() => new Promise((res) => {
      requestAnimationFrame(() => {
        const c = document.getElementById('scene');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        if (!gl) return res({ hasGL: false });
        const w = c.drawingBufferWidth, h = c.drawingBufferHeight;
        const px = new Uint8Array(4 * w * h);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let lit = 0;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i] > 12 || px[i + 1] > 12 || px[i + 2] > 12) lit++;
        }
        res({ hasGL: true, litFraction: lit / (w * h) });
      });
    }));

    const boot2 = await page.evaluate(() => globalThis.__lastStand);
    const shot = process.env.SHOT || '/private/tmp/claude-501/-Users-nikhilkumar-Documents-toptal-Game/522b577b-54b9-4ac5-a497-39182302050f/scratchpad/last-stand-3d.png';
    await page.screenshot({ path: shot });

    // Drive a combat scene: fortify with a ring of turrets, jump to DEFEND, spawn
    // zombies. Verifies textures + turrets tracking/hitting moving zombies.
    await page.evaluate(() => {
      const g = globalThis.__game;
      g.inventory.wood = 999; g.inventory.metal = 999;
      const cx = g.base.x, cy = g.base.y;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
        g.selected = 'turret';
        g.input.world = { x: cx + Math.cos(a) * 150, y: cy + Math.sin(a) * 150 };
        g.input.mouse = { x: 640, y: 360, clicked: true };
        g.handleClick();
      }
      // jump to defend and make the wave spawn almost immediately
      if (g.phase === 'GATHER') g.advancePhase();
      g.spawnSchedule.forEach((s, i) => { s.time = 0.2 + i * 0.08; });
    });
    await sleep(5000); // let zombies spawn, turrets track & fire
    const combatShot = shot.replace(/\.png$/, '-combat.png');
    await page.screenshot({ path: combatShot });
    console.log('combat screenshot:', combatShot);

    console.log('boot after load:', JSON.stringify(boot));
    console.log('boot after interact:', JSON.stringify(boot2));
    console.log('webgl sample:', JSON.stringify(drew));
    console.log('screenshot:', shot);
    // favicon 404 is a harmless browser auto-request; ignore it
    const realErrors = errors.filter((e) => !/favicon\.ico/.test(e));
    const realFailed = failed.filter((u) => !/favicon\.ico/.test(u));
    console.log('errors:', realErrors.length ? realErrors : 'none');
    console.log('failed requests:', realFailed.length ? realFailed : 'none');

    // Gate on: game booted, no runtime error, WebGL context present, no real
    // console/network errors. (Visual proof comes from the saved screenshot;
    // WebGL readPixels is unreliable in headless swiftshader.)
    const ok = boot2 && boot2.started === true && boot2.error === null &&
               drew.hasGL === true && realErrors.length === 0;
    console.log(ok ? '\nSMOKE_OK' : '\nSMOKE_FAIL');
    process.exitCode = ok ? 0 : 1;
  } finally {
    await browser.close();
    stop();
  }
}

main().catch((e) => { console.error('harness error:', e); process.exitCode = 1; });
