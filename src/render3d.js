// 3D renderer (Three.js). Reads Game state each frame and draws the world with
// dynamic lighting, shadows, and bloom. Pure view layer — never mutates game state.
// Coordinate mapping: game (x, y) -> 3D (x, z); +Y is up. Ground plane at y = 0.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { WORLD, BASE, DEFENSES, PLACE_RADIUS, ZOMBIES } from './config.js';
import { snapToGrid, validatePlacement } from './systems/grid.js';
import { PHASE } from './systems/phase.js';

const HUD_W = 1280, HUD_H = 720; // overlay logical size (matches ui.js layout)

function col(hex) { return new THREE.Color(hex); }

// --- Procedural Minecraft-style pixel textures (no image assets) ---
function pixelCanvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function px(g, x, y, w, h, color) { g.fillStyle = color; g.fillRect(x, y, w, h); }
function jitter(base, amt) {
  const c = new THREE.Color(base);
  const j = (Math.random() - 0.5) * amt;
  c.offsetHSL(0, 0, j);
  return '#' + c.getHexString();
}

let _tex = null;
function textures() {
  if (_tex) return _tex;
  const N = 16;
  // WOOD: vertical planks with grain streaks
  const wood = pixelCanvas(N, (g) => {
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
      const plank = Math.floor(x / 8);
      let base = plank === 0 ? '#8a5a2b' : '#7a4d24';
      if (x % 8 === 0) base = '#5e3a1a';          // plank seam
      px(g, x, y, 1, 1, jitter(base, 0.10));
    }
    for (let x = 0; x < N; x++) if (Math.random() < 0.25) px(g, x, (Math.random() * N) | 0, 1, 1, '#6b4420');
  });
  // METAL: iron block with rivets + highlight
  const metal = pixelCanvas(N, (g) => {
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) px(g, x, y, 1, 1, jitter('#9aa3ad', 0.10));
    px(g, 0, 0, N, 1, '#c6ced8'); px(g, 0, 0, 1, N, '#c6ced8');   // top/left highlight
    px(g, 0, N - 1, N, 1, '#5c636c'); px(g, N - 1, 0, 1, N, '#5c636c'); // shadow
    for (const [rx, ry] of [[2, 2], [N - 3, 2], [2, N - 3], [N - 3, N - 3]]) { px(g, rx, ry, 2, 2, '#454b54'); px(g, rx, ry, 1, 1, '#d4dbe4'); }
  });
  // FOOD: emerald-ish gem block, bright
  const food = pixelCanvas(N, (g) => {
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) px(g, x, y, 1, 1, jitter('#3fd06a', 0.12));
    px(g, 3, 3, 4, 4, '#7dffa6'); px(g, 9, 8, 3, 3, '#1f9a4a');
  });
  // COBBLESTONE ground: tileable stone with grout + specks
  const G = 32;
  const cobble = pixelCanvas(G, (g) => {
    px(g, 0, 0, G, G, '#2b323c');
    for (let i = 0; i < 26; i++) {
      const w = 4 + ((Math.random() * 7) | 0), h = 4 + ((Math.random() * 7) | 0);
      const x = (Math.random() * (G - w)) | 0, y = (Math.random() * (G - h)) | 0;
      px(g, x, y, w, h, jitter('#3a434f', 0.12));
      px(g, x, y, w, 1, jitter('#485360', 0.08));
    }
  });
  cobble.wrapS = cobble.wrapT = THREE.RepeatWrapping;
  cobble.repeat.set(WORLD.width / 96, WORLD.height / 96);
  // GRASS patch for ground variety
  const grass = pixelCanvas(G, (g) => {
    px(g, 0, 0, G, G, '#2f4a24');
    for (let i = 0; i < 90; i++) px(g, (Math.random() * G) | 0, (Math.random() * G) | 0, 1, 2, jitter('#3c6130', 0.16));
  });
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
  _tex = { wood, metal, food, cobble, grass };
  return _tex;
}

export class Renderer3D {
  constructor(canvas, stage) {
    this.canvas = canvas;
    this.stage = stage || canvas.parentElement;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;

    this.scene = new THREE.Scene();
    this.scene.background = col('#0b1220');
    this.scene.fog = new THREE.FogExp2(0x0b1220, 0.00055);

    this.camera = new THREE.PerspectiveCamera(45, 16 / 9, 1, 6000);
    this.camBase = new THREE.Vector3(WORLD.width / 2, 900, WORLD.height / 2 + 800);
    this.camLook = new THREE.Vector3(WORLD.width / 2, 0, WORLD.height / 2);

    this._t = 0;
    this._lastPhase = null;
    this._zoom = 0;        // wave-start zoom-punch impulse
    this._corpses = [];    // dying zombie meshes animating out
    this._sky();
    this._lights();
    this._ground();
    this._props();

    // meshes keyed by their game entity object
    this.zMeshes = new Map();
    this.dMeshes = new Map();
    this.rMeshes = new Map();
    this.pMeshes = new Map();
    this.shockMeshes = new Map();

    this._base = this._buildBase();
    this.scene.add(this._base);
    this._player = this._buildPlayer();
    this.scene.add(this._player);
    this._ghost = this._buildGhost();
    this.scene.add(this._ghost);
    this._placeRing = this._buildRing(PLACE_RADIUS, '#7fd1ae', 0.18);
    this.scene.add(this._placeRing);
    this._rangeRing = this._buildRing(DEFENSES.turret.range, '#4fa8ff', 0.4);
    this.scene.add(this._rangeRing);
    this._particles = this._buildParticles();
    this.scene.add(this._particles);
    this._embers = this._buildEmbers();
    this.scene.add(this._embers);

    this._raycaster = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._tmp = new THREE.Vector3();
    this._ndc = new THREE.Vector2();
    this._q = new THREE.Quaternion();

    this._composer();
    this.resize();
  }

  // ---- setup helpers ----
  _sky() {
    // Gradient dusk dome (dark navy at horizon -> near-black overhead) + moon.
    const c = document.createElement('canvas'); c.width = 16; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#05070f');
    grad.addColorStop(0.55, '#0b1428');
    grad.addColorStop(0.8, '#1b2b45');
    grad.addColorStop(1, '#2a3a54');
    g.fillStyle = grad; g.fillRect(0, 0, 16, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(3400, 32, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
    );
    dome.position.set(WORLD.width / 2, 0, WORLD.height / 2);
    this.scene.add(dome);

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(120, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff2d0, fog: false })
    );
    moon.position.set(WORLD.width / 2 - 1400, 1500, WORLD.height / 2 - 2200);
    this.scene.add(moon);
  }

  _props() {
    // Grass patches for ground variety
    const grassMat = new THREE.MeshStandardMaterial({ map: textures().grass, color: 0x9fb090, roughness: 1 });
    const rand = mulberry(7);
    for (let i = 0; i < 5; i++) {
      const w = 160 + rand() * 220, h = 120 + rand() * 200;
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(w, h), grassMat);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(120 + rand() * (WORLD.width - 240), 1.2, 120 + rand() * (WORLD.height - 240));
      patch.receiveShadow = true;
      this.scene.add(patch);
    }

    // Sandbag ring around the base (tan capsules)
    const sandMat = new THREE.MeshStandardMaterial({ color: 0x9c8a5a, roughness: 1 });
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
      const r = BASE.size * 0.95;
      const bag = new THREE.Mesh(new THREE.CapsuleGeometry(9, 20, 4, 8), sandMat);
      bag.position.set(BASE.x + Math.cos(a) * r, 9, BASE.y + Math.sin(a) * r);
      bag.rotation.z = Math.PI / 2; bag.rotation.y = a;
      bag.castShadow = true; bag.receiveShadow = true;
      this.scene.add(bag);
    }

    // Streetlights that cast real light (limited count for perf)
    const lampPos = [[180, 180], [WORLD.width - 180, 180], [180, WORLD.height - 180], [WORLD.width - 180, WORLD.height - 180]];
    for (const [x, z] of lampPos) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 150, 8),
        new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.6, metalness: 0.6 }));
      pole.position.set(x, 75, z); pole.castShadow = true; this.scene.add(pole);
      const headM = new THREE.Mesh(new THREE.BoxGeometry(26, 8, 14),
        new THREE.MeshStandardMaterial({ color: 0x1a1e24, emissive: 0xffd070, emissiveIntensity: 1.0 }));
      headM.position.set(x, 150, z); this.scene.add(headM);
      const lamp = new THREE.PointLight(0xffcf80, 1.3, 560, 2);
      lamp.position.set(x, 148, z); this.scene.add(lamp);
    }

    // A few abandoned cars + barrels for street clutter
    const carBody = new THREE.MeshStandardMaterial({ color: 0x5a2b2b, roughness: 0.5, metalness: 0.4 });
    const carGlass = new THREE.MeshStandardMaterial({ color: 0x223, roughness: 0.2, metalness: 0.6, emissive: 0x111a2a, emissiveIntensity: 0.5 });
    const carSpots = [[300, 520], [980, 200], [760, 560]];
    for (const [x, z] of carSpots) {
      const car = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(46, 22, 90), carBody); b.position.y = 16; b.castShadow = true; car.add(b);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(42, 20, 44), carGlass); cab.position.set(0, 34, -4); car.add(cab);
      for (const hx of [-16, 16]) { const hl = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xfff0a0, emissiveIntensity: 2 })); hl.position.set(hx, 16, 46); car.add(hl); }
      car.position.set(x, 0, z); car.rotation.y = (x + z) % 3; this.scene.add(car);
    }
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x3b6b3b, roughness: 0.6, metalness: 0.4 });
    const rb = mulberry(21);
    for (let i = 0; i < 7; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 30, 12), barrelMat);
      bar.position.set(150 + rb() * (WORLD.width - 300), 15, 150 + rb() * (WORLD.height - 300));
      bar.castShadow = true; this.scene.add(bar);
    }

    // pool of point lights reused for explosions
    this._flashLights = [];
    for (let i = 0; i < 4; i++) {
      const L = new THREE.PointLight(0xffaa44, 0, 400, 2);
      this.scene.add(L); this._flashLights.push(L);
    }
    this._decalMeshes = new Map();
    this._flashMeshes = new Map();
  }

  _lights() {
    // Night-apocalypse mood: cool sky fill + warm "moon/searchlight" key,
    // plus a colored rim light so silhouettes pop against the dark ground.
    this.scene.add(new THREE.HemisphereLight(0x6f86b8, 0x120f0a, 0.7));
    this.scene.add(new THREE.AmbientLight(0x22304a, 0.5));

    const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
    sun.position.set(WORLD.width / 2 - 500, 1300, WORLD.height / 2 - 250);
    sun.target.position.set(WORLD.width / 2, 0, WORLD.height / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 1100;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 200; sun.shadow.camera.far = 3000;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun); this.scene.add(sun.target);
    this._sun = sun;

    // teal rim from the opposite side for depth/contrast
    const rim = new THREE.DirectionalLight(0x3fd0ff, 0.9);
    rim.position.set(WORLD.width / 2 + 700, 500, WORLD.height / 2 + 700);
    this.scene.add(rim);

    // warm glow anchored at the base (like the home lights spilling out)
    const baseGlow = new THREE.PointLight(0xffb347, 1.6, 700, 2);
    baseGlow.position.set(BASE.x, 90, BASE.y);
    this.scene.add(baseGlow);
  }

  _ground() {
    const geo = new THREE.PlaneGeometry(3200, 2400);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1c2128, roughness: 0.95, metalness: 0.0 });
    const g = new THREE.Mesh(geo, mat);
    g.rotation.x = -Math.PI / 2;
    g.position.set(WORLD.width / 2, 0, WORLD.height / 2);
    g.receiveShadow = true;
    this.scene.add(g);

    // playfield: cobblestone texture
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.width, WORLD.height),
      new THREE.MeshStandardMaterial({ map: textures().cobble, color: 0x9aa2ac, roughness: 0.95 })
    );
    field.rotation.x = -Math.PI / 2;
    field.position.set(WORLD.width / 2, 0.5, WORLD.height / 2);
    field.receiveShadow = true;
    this.scene.add(field);

    const grid = new THREE.GridHelper(Math.max(WORLD.width, WORLD.height), 40, 0x3a4450, 0x2b333c);
    grid.position.set(WORLD.width / 2, 0.8, WORLD.height / 2);
    grid.material.transparent = true; grid.material.opacity = 0.35;
    this.scene.add(grid);

    // perimeter buildings for a "town" backdrop (outside the play area), with
    // scattered lit windows for a distant-city feel.
    const bmat = new THREE.MeshStandardMaterial({ color: 0x21262e, roughness: 0.85 });
    const winMat = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffcf6b, emissiveIntensity: 1.1 });
    const rand = mulberry(99);
    for (let i = 0; i < 30; i++) {
      const edge = i % 4;
      const w = 100 + rand() * 150, h = 160 + rand() * 420, d = 100 + rand() * 150;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bmat);
      let x, z, off = 160 + rand() * 320;
      if (edge === 0) { x = rand() * WORLD.width; z = -off; }
      else if (edge === 1) { x = WORLD.width + off; z = rand() * WORLD.height; }
      else if (edge === 2) { x = rand() * WORLD.width; z = WORLD.height + off; }
      else { x = -off; z = rand() * WORLD.height; }
      m.position.set(x, h / 2, z);
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
      // lit windows on the two faces that point toward the arena
      const cols = Math.max(2, Math.floor(w / 34)), rows = Math.max(3, Math.floor(h / 60));
      const faceZ = z < WORLD.height / 2 ? d / 2 + 1 : -d / 2 - 1;
      for (let cx = 0; cx < cols; cx++) for (let ry = 0; ry < rows; ry++) {
        if (rand() < 0.5) continue;
        const win = new THREE.Mesh(new THREE.BoxGeometry(12, 16, 1), winMat);
        win.position.set((cx - (cols - 1) / 2) * (w / cols), (ry - (rows - 1) / 2) * (h / rows), faceZ);
        m.add(win);
      }
    }
  }

  _composer() {
    const c = new EffectComposer(this.renderer);
    c.addPass(new RenderPass(this.scene, this.camera));

    // Mild depth-of-field (guarded — skip if the addon misbehaves).
    try {
      const bokeh = new BokehPass(this.scene, this.camera, { focus: 1250, aperture: 0.00002, maxblur: 0.0012 });
      c.addPass(bokeh);
      this.bokeh = bokeh;
    } catch (e) { /* DOF optional */ }

    const bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 1.0, 0.55, 0.72);
    c.addPass(bloom);
    this.bloom = bloom;

    // Grade pass: vignette + film grain + subtle chromatic aberration + teal/orange.
    this.grade = new ShaderPass(GRADE_SHADER);
    c.addPass(this.grade);

    c.addPass(new OutputPass());
    this.composer = c;
  }

  // ---- entity mesh builders ----
  _buildBase() {
    const g = new THREE.Group();
    const s = BASE.size;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(s, s * 0.95, s),
      new THREE.MeshStandardMaterial({ color: 0xd9b24a, roughness: 0.5, metalness: 0.2 })
    );
    body.position.y = s * 0.475; body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(s * 0.82, s * 0.5, 4),
      new THREE.MeshStandardMaterial({ color: 0xb5451b, roughness: 0.6 })
    );
    roof.position.y = s * 0.95 + s * 0.25; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    g.add(roof);
    // glowing windows (bloom)
    const wmat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffcf6b, emissiveIntensity: 1.4 });
    for (const sx of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(s * 0.22, s * 0.22, 2), wmat);
      win.position.set(sx * s * 0.22, s * 0.5, s / 2 + 1);
      g.add(win);
    }
    g.userData.body = body;
    g.position.set(BASE.x, 0, BASE.y);
    return g;
  }

  _buildPlayer() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(9, 16, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x35c9ff, roughness: 0.35, metalness: 0.3, emissive: 0x0a3a4a, emissiveIntensity: 0.6 })
    );
    body.position.y = 18; body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(7, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xe8f6ff, roughness: 0.4 })
    );
    head.position.y = 34; head.castShadow = true;
    g.add(head);
    return g;
  }

  _zombieMesh(z) {
    const g = new THREE.Group();
    const def = ZOMBIES[z.type];
    const r = def.radius;
    let bodyGeo, emissive = 0x000000, ei = 0;
    if (z.type === 'brute') bodyGeo = new THREE.BoxGeometry(r * 1.7, r * 2.4, r * 1.4);
    else bodyGeo = new THREE.CapsuleGeometry(r * 0.7, r * 1.6, 6, 12);
    if (z.type === 'spitter') { emissive = 0x8e44ad; ei = 0.7; }
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({
      color: col(def.color), roughness: 0.7, metalness: 0.1, emissive: col(emissive || '#000'), emissiveIntensity: ei,
    }));
    body.position.y = r * 1.3; body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 12, 10),
      new THREE.MeshStandardMaterial({ color: col(def.color).offsetHSL(0, 0, 0.08), roughness: 0.6 }));
    head.position.y = r * 2.5; head.castShadow = true;
    g.add(head);
    // glowing eyes (bloom) — red for melee, cyan for spitter
    const eyeColor = z.type === 'spitter' ? 0x8affff : 0xff3b2f;
    const eyeMat = new THREE.MeshStandardMaterial({ color: eyeColor, emissive: eyeColor, emissiveIntensity: 3 });
    for (const ex of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 8, 6), eyeMat);
      eye.position.set(ex * r * 0.22, r * 2.55, r * 0.5);
      g.add(eye);
    }
    g.userData.body = body;
    g.userData.baseColor = col(def.color);
    g.userData.phase = Math.random() * Math.PI * 2;
    g.userData.rad = r;
    g.userData.bar = this._hpBar(r * 3.3, r * 2);
    g.add(g.userData.bar.group);
    return g;
  }

  _defenseMesh(d) {
    const g = new THREE.Group();
    const def = DEFENSES[d.type];
    const c = col(def.color);
    if (d.type === 'spike') {
      const mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.6 });
      const pad = new THREE.Mesh(new THREE.BoxGeometry(d.size, 4, d.size),
        new THREE.MeshStandardMaterial({ color: 0x5a1712, roughness: 0.8 }));
      pad.position.y = 2; pad.receiveShadow = true; g.add(pad);
      for (const [ox, oz] of [[-9, -9], [9, -9], [-9, 9], [9, 9], [0, 0]]) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(4, 18, 6), mat);
        sp.position.set(ox, 11, oz); sp.castShadow = true; g.add(sp);
      }
    } else if (d.type === 'turret') {
      const baseM = new THREE.Mesh(new THREE.CylinderGeometry(13, 15, 12, 16),
        new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.5, metalness: 0.7 }));
      baseM.position.y = 6; baseM.castShadow = true; g.add(baseM);
      const head = new THREE.Group(); head.position.y = 16;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(11, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.6, emissive: 0x123a66, emissiveIntensity: 0.5 }));
      dome.castShadow = true; head.add(dome);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 26, 10),
        new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.4, metalness: 0.8 }));
      barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 4, 13); head.add(barrel);
      g.add(head);
      g.userData.head = head; g.userData.barrel = barrel;
    } else if (d.type === 'bomb') {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(11, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.7, emissive: 0xff2200, emissiveIntensity: 1.0 }));
      ball.position.y = 11; ball.castShadow = true; g.add(ball);
      g.userData.ball = ball;
    } else {
      // barricade = wood block, wall = metal block (Minecraft-style textures)
      const h = d.type === 'wall' ? 34 : 20;
      const tx = textures();
      const mat = d.type === 'wall'
        ? new THREE.MeshStandardMaterial({ map: tx.metal, roughness: 0.4, metalness: 0.85 })
        : new THREE.MeshStandardMaterial({ map: tx.wood, roughness: 0.85, metalness: 0.05 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(d.size, h, d.size), mat);
      box.position.y = h / 2; box.castShadow = true; box.receiveShadow = true; g.add(box);
      g.userData.body = box;
      g.userData.bar = this._hpBar(h + 10, d.size);
      g.add(g.userData.bar.group);
    }
    g.userData.baseColor = c;
    return g;
  }

  _resourceMesh(r) {
    const tx = textures();
    let mat;
    if (r.type === 'wood') {
      mat = new THREE.MeshStandardMaterial({ map: tx.wood, roughness: 0.85, metalness: 0.05, emissiveMap: tx.wood, emissive: 0xffffff, emissiveIntensity: 0.25 });
    } else if (r.type === 'metal') {
      mat = new THREE.MeshStandardMaterial({ map: tx.metal, roughness: 0.35, metalness: 0.9, emissiveMap: tx.metal, emissive: 0xffffff, emissiveIntensity: 0.2 });
    } else {
      mat = new THREE.MeshStandardMaterial({ map: tx.food, roughness: 0.4, metalness: 0.1, emissiveMap: tx.food, emissive: 0xffffff, emissiveIntensity: 0.7 });
    }
    // Minecraft-style blocks for all pickups (cube reads as "wood/metal/food")
    const size = r.type === 'metal' ? 18 : 18;
    const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat);
    m.castShadow = true;
    m.userData.mat = mat;
    return m;
  }

  _projectileMesh(p) {
    if (p.kind === 'acid') {
      return new THREE.Mesh(new THREE.SphereGeometry(5, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xa6e22e, emissive: 0xa6e22e, emissiveIntensity: 2.4 }));
    }
    // bullet = glowing core + additive trailing tracer
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xfff2a0, emissive: 0xffe066, emissiveIntensity: 3 }));
    g.add(core);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 3, 34, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd45a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    tail.rotation.x = Math.PI / 2;  // align cylinder along local +Z
    tail.position.z = -17;          // trail behind travel direction
    g.add(tail);
    return g;
  }

  _shockMesh(sw) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1, 40),
      new THREE.MeshBasicMaterial({ color: col(sw.color), transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  _hpBar(yOffset, width) {
    const group = new THREE.Group(); group.position.y = yOffset;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(width, 4),
      new THREE.MeshBasicMaterial({ color: 0x220000 }));
    const fg = new THREE.Mesh(new THREE.PlaneGeometry(width, 4),
      new THREE.MeshBasicMaterial({ color: 0xff4444 }));
    fg.position.z = 0.1;
    group.add(bg); group.add(fg);
    group.visible = false;
    return { group, fg, width };
  }

  _buildGhost() {
    const m = new THREE.Mesh(new THREE.BoxGeometry(32, 20, 32),
      new THREE.MeshBasicMaterial({ color: 0x7fd1ae, transparent: true, opacity: 0.45 }));
    m.visible = false;
    return m;
  }

  _buildRing(radius, color, opacity) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(radius - 3, radius, 96),
      new THREE.MeshBasicMaterial({ color: col(color), transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2; m.position.y = 2; m.visible = false;
    return m;
  }

  _buildParticles() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3), 3));
    const mat = new THREE.PointsMaterial({ size: 9, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }

  _buildEmbers() {
    const N = 160;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    this._emberVel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = Math.random() * WORLD.width;
      pos[i * 3 + 1] = Math.random() * 500;
      pos[i * 3 + 2] = Math.random() * WORLD.height;
      this._emberVel[i] = 12 + Math.random() * 26;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xff9a3c, size: 4, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }

  _updateEmbers(dt) {
    const pos = this._embers.geometry.getAttribute('position');
    for (let i = 0; i < this._emberVel.length; i++) {
      let y = pos.array[i * 3 + 1] + this._emberVel[i] * dt;
      if (y > 520) { y = 0; pos.array[i * 3] = Math.random() * WORLD.width; pos.array[i * 3 + 2] = Math.random() * WORLD.height; }
      pos.array[i * 3 + 1] = y;
    }
    pos.needsUpdate = true;
  }

  // ---- per-frame sync ----
  sync(game, dt) {
    dt = dt || 0.016;
    this._t += dt;
    if (this.grade) this.grade.uniforms.uTime.value = this._t;

    // wave-start zoom punch on GATHER -> DEFEND
    if (this._lastPhase === PHASE.GATHER && game.phase === PHASE.DEFEND) this._zoom = 1;
    this._lastPhase = game.phase;
    this._zoom *= 0.92; if (this._zoom < 0.01) this._zoom = 0;

    // base
    const bodyMat = this._base.userData.body.material;
    bodyMat.emissive.setHex(game.base.flash > 0 ? 0xff3b3b : 0x000000);
    bodyMat.emissiveIntensity = game.base.flash > 0 ? 0.9 : 0;
    // player
    this._player.position.set(game.player.x, 0, game.player.y);

    this._syncList(game.zombies, this.zMeshes, (z) => this._zombieMesh(z), (m, z) => this._updateZombie(m, z, game), (m) => this._retireZombie(m));
    this._syncList(game.defenses, this.dMeshes, (d) => this._defenseMesh(d), (m, d) => this._updateDefense(m, d, game, dt));
    this._syncList(game.resources, this.rMeshes, (r) => this._resourceMesh(r), (m, r) => this._updateResource(m, r));
    this._syncList(game.projectiles, this.pMeshes, (p) => this._projectileMesh(p), (m, p) => this._updateProjectile(m, p));
    this._syncList(game.effects.shockwaves, this.shockMeshes, (s) => this._shockMesh(s), (m, s) => this._updateShock(m, s));
    this._syncList(game.effects.decals, this._decalMeshes, (s) => this._decalMesh(s), (m, s) => this._updateDecal(m, s));
    this._syncFlashes(game.effects.flashes);
    this._updateCorpses(dt);

    this._updateParticles(game.effects.particles);
    this._updateEmbers(dt);
    this._updatePreview(game);

    const active = game.phase === PHASE.GATHER || game.phase === PHASE.DEFEND;
    this._placeRing.visible = active;

    // camera: gentle drift + shake + wave-start dolly-in
    const sh = game.effects.shakeOffset();
    const driftX = Math.sin(this._t * 0.13) * 26;
    const driftZ = Math.cos(this._t * 0.11) * 18;
    const zoom = this._zoom * 220;
    this.camera.position.set(
      this.camBase.x + driftX + sh.x * 2.5,
      this.camBase.y - zoom * 0.5,
      this.camBase.z + driftZ - zoom + sh.y * 2.5
    );
    this.camera.lookAt(this.camLook);
  }

  // dying zombies detach into corpses that tip over, sink, and fade out
  _retireZombie(mesh) {
    mesh.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; } });
    this._corpses.push({ mesh, t: 0, dir: Math.random() * Math.PI * 2 });
  }

  _updateCorpses(dt) {
    for (const c of this._corpses) {
      c.t += dt;
      const k = Math.min(1, c.t / 0.7);
      c.mesh.rotation.z = Math.cos(c.dir) * k * 1.3;
      c.mesh.rotation.x = Math.sin(c.dir) * k * 1.3;
      c.mesh.position.y = -k * 8;
      c.mesh.traverse((o) => { if (o.material && o.material.opacity !== undefined) o.material.opacity = 1 - k; });
    }
    const done = this._corpses.filter((c) => c.t >= 0.7);
    for (const c of done) { this.scene.remove(c.mesh); disposeObj(c.mesh); }
    this._corpses = this._corpses.filter((c) => c.t < 0.7);
  }

  _syncFlashes(flashes) {
    // meshes
    const seen = new Set();
    for (const f of flashes) {
      let m = this._flashMeshes.get(f);
      if (!m) {
        m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
          new THREE.MeshBasicMaterial({ color: col(f.color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.scene.add(m); this._flashMeshes.set(f, m);
      }
      const k = 1 - f.life / f.max;
      const s = Math.max(1, f.radius * (0.4 + k * 0.8));
      m.position.set(f.x, 24, f.y); m.scale.setScalar(s);
      m.material.opacity = (1 - k) * 0.9;
      seen.add(f);
    }
    for (const [f, m] of this._flashMeshes) if (!seen.has(f)) { this.scene.remove(m); disposeObj(m); this._flashMeshes.delete(f); }
    // pooled dynamic lights follow the freshest flashes
    for (let i = 0; i < this._flashLights.length; i++) {
      const f = flashes[i];
      const L = this._flashLights[i];
      if (f) { L.position.set(f.x, 60, f.y); L.color.set(f.color); L.intensity = (f.life / f.max) * 6; L.distance = f.radius * 3; }
      else L.intensity = 0;
    }
  }

  _decalMesh() {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 18),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  _updateDecal(m, s) {
    m.position.set(s.x, 1.6, s.y);
    m.rotation.z = s.rot;
    m.scale.setScalar(s.radius);
    m.material.color.set(s.color);
    m.material.opacity = Math.min(0.6, (s.life / s.max) * 0.7);
  }

  _updateProjectile(m, p) {
    m.position.set(p.x, 16, p.y);
    m.rotation.y = Math.atan2(p.vx, p.vy); // orient tracer along travel
  }

  _syncList(list, map, create, update, onRemove) {
    const seen = new Set();
    for (const e of list) {
      let m = map.get(e);
      if (!m) { m = create(e); this.scene.add(m); map.set(e, m); }
      update(m, e);
      seen.add(e);
    }
    for (const [e, m] of map) {
      if (!seen.has(e)) {
        map.delete(e);
        if (onRemove) onRemove(m); // e.g. detach as an animating corpse
        else { this.scene.remove(m); disposeObj(m); }
      }
    }
  }

  _updateZombie(m, z, game) {
    // walk cycle: bob up/down + forward lurch, faster for quicker zombies
    const spd = z.speed / 60;
    const t = this._t * (2 + spd) + m.userData.phase;
    const bob = Math.abs(Math.sin(t)) * (z.wanderer ? 1.5 : 3.5);
    m.position.set(z.x, bob, z.y);
    const body = m.userData.body;
    body.material.emissive.setHex(z.flash > 0 ? 0xffffff : (z.type === 'spitter' ? 0x8e44ad : 0x000000));
    body.material.emissiveIntensity = z.flash > 0 ? 1.0 : (z.type === 'spitter' ? 0.7 : 0);
    // face the base, with a forward lurch lean
    m.rotation.y = Math.atan2(game.base.x - z.x, game.base.y - z.y);
    m.rotation.x = 0.12 + Math.sin(t) * 0.08;
    // hp bar
    const bar = m.userData.bar;
    const frac = Math.max(0, z.hp / z.maxHp);
    bar.group.visible = z.hp < z.maxHp && !z.wanderer;
    bar.fg.scale.x = frac;
    bar.fg.position.x = -bar.width * (1 - frac) / 2;
    // counter the parent's rotation so the bar still faces the camera
    m.getWorldQuaternion(this._q);
    bar.group.quaternion.copy(this._q).invert().multiply(this.camera.quaternion);
  }

  _updateDefense(m, d, game, dt) {
    m.position.set(d.x, 0, d.y);
    if (d.type === 'turret' && m.userData.head) {
      // aim at nearest zombie in range
      let tx = null, tz = null, best = DEFENSES.turret.range;
      for (const z of game.zombies) {
        const dd = Math.hypot(z.x - d.x, z.y - d.y);
        if (dd <= best) { best = dd; tx = z.x; tz = z.y; }
      }
      if (tx !== null) m.userData.head.rotation.y = Math.atan2(tx - d.x, tz - d.y);
      // recoil kick right after firing (cooldown ~ fireInterval)
      const kick = Math.max(0, (d.cooldown / DEFENSES.turret.fireInterval) - 0.7) * 8;
      m.userData.barrel.position.z = 13 - kick;
      // muzzle flash glow while justFired is active
      const flash = d.justFired > 0;
      m.userData.barrel.material.emissive.setHex(flash ? 0xffdd66 : 0x000000);
      m.userData.barrel.material.emissiveIntensity = flash ? 4 : 0;
    }
    if (d.type === 'bomb' && m.userData.ball) {
      const t = (game.phaseTime * 4) % 1;
      m.userData.ball.material.emissiveIntensity = d.armed ? (0.6 + Math.abs(Math.sin(t * Math.PI)) * 1.4) : 0.2;
    }
    if (m.userData.body) {
      m.userData.body.material.emissive.setHex(d.flash > 0 ? 0xffffff : 0x000000);
      m.userData.body.material.emissiveIntensity = d.flash > 0 ? 0.8 : 0;
    }
    if (m.userData.bar) {
      const frac = Math.max(0, d.hp / d.maxHp);
      const show = isFinite(d.maxHp) && d.hp < d.maxHp;
      m.userData.bar.group.visible = show;
      m.userData.bar.fg.scale.x = frac;
      m.userData.bar.fg.position.x = -m.userData.bar.width * (1 - frac) / 2;
      m.userData.bar.group.quaternion.copy(this.camera.quaternion);
    }
  }

  _updateResource(m, r) {
    m.position.set(r.x, 24 + Math.sin(r.bob) * 5, r.y);
    m.rotation.y += 0.02;
    // gentle glow pulse so pickups read as "collectible"
    if (m.userData.mat) {
      const base = r.type === 'food' ? 0.7 : r.type === 'metal' ? 0.2 : 0.25;
      m.userData.mat.emissiveIntensity = base + Math.abs(Math.sin(r.bob)) * 0.5;
    }
  }

  _updateShock(m, sw) {
    const t = 1 - sw.life / sw.max;
    const s = Math.max(0.001, t * sw.maxR);
    m.position.set(sw.x, 6, sw.y);
    m.scale.set(s, s, s);
    m.material.opacity = (1 - t) * 0.8;
  }

  _updateParticles(particles) {
    const n = particles.length;
    const geo = this._particles.geometry;
    let pos = geo.getAttribute('position');
    if (pos.count < n) {
      pos = new THREE.BufferAttribute(new Float32Array(Math.max(n, 1) * 3), 3);
      geo.setAttribute('position', pos);
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Math.max(n, 1) * 3), 3));
    }
    const ca = geo.getAttribute('color');
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const p = particles[i];
      pos.array[i * 3] = p.x; pos.array[i * 3 + 1] = 16; pos.array[i * 3 + 2] = p.y;
      c.set(p.color);
      ca.array[i * 3] = c.r; ca.array[i * 3 + 1] = c.g; ca.array[i * 3 + 2] = c.b;
    }
    geo.setDrawRange(0, n);
    pos.needsUpdate = true; ca.needsUpdate = true;
  }

  _updatePreview(game) {
    const show = (game.phase === PHASE.GATHER || game.phase === PHASE.DEFEND) &&
      game.input.world &&
      game.input.mouse.y >= 54 && game.input.mouse.y <= HUD_H - 56;
    if (!show) { this._ghost.visible = false; this._rangeRing.visible = false; return; }
    const snap = snapToGrid(game.input.world.x, game.input.world.y);
    const def = DEFENSES[game.selected];
    const v = validatePlacement(snap.x, snap.y, game.defenses, game.base);
    this._ghost.visible = true;
    this._ghost.position.set(snap.x, 12, snap.y);
    this._ghost.material.color.setHex(v.ok ? 0x7fd1ae : 0xff5252);
    if (game.selected === 'turret' && v.ok) {
      this._rangeRing.visible = true;
      this._rangeRing.position.set(snap.x, 2.5, snap.y);
    } else {
      this._rangeRing.visible = false;
    }
  }

  render() { this.composer.render(); }

  // ---- coordinate conversion ----
  screenToWorld(mx, my) {
    this._ndc.set((mx / HUD_W) * 2 - 1, -((my / HUD_H) * 2 - 1));
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const hit = this._raycaster.ray.intersectPlane(this._groundPlane, this._tmp);
    if (!hit) return null;
    return { x: hit.x, y: hit.z };
  }

  worldToScreen(gx, gy) {
    this._tmp.set(gx, 14, gy).project(this.camera);
    return { x: (this._tmp.x * 0.5 + 0.5) * HUD_W, y: (-this._tmp.y * 0.5 + 0.5) * HUD_H };
  }

  resize() {
    const w = this.stage.clientWidth || HUD_W;
    const h = this.stage.clientHeight || HUD_H;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

// Combined grade pass: vignette + film grain + chromatic aberration + teal/orange.
const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      float r2 = dot(d, d);
      // chromatic aberration: push R out, B in, scaled by distance from center
      float ca = 0.0016 * r2 * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + d * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - d * ca).b;
      // teal/orange grade: warm highlights, cool shadows
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col * vec3(0.88, 0.97, 1.12), col * vec3(1.12, 1.02, 0.86), smoothstep(0.25, 0.85, luma));
      // vignette (gentle)
      float vig = smoothstep(1.15, 0.15, r2 * 1.35);
      col *= mix(0.78, 1.0, vig);
      // film grain (subtle)
      float g = hash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 100.0);
      col += (g - 0.5) * 0.015;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// dispose a group/mesh subtree
function disposeObj(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
}

// tiny seeded rng for stable perimeter layout (avoids Math.random churn)
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
