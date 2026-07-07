// 3D renderer (Three.js). Reads Game state each frame and draws the world with
// dynamic lighting, shadows, and bloom. Pure view layer — never mutates game state.
// Coordinate mapping: game (x, y) -> 3D (x, z); +Y is up. Ground plane at y = 0.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
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
  _tex = { wood, metal, food, cobble };
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
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = col('#0b1220');
    this.scene.fog = new THREE.FogExp2(0x0b1220, 0.00055);

    this.camera = new THREE.PerspectiveCamera(45, 16 / 9, 1, 6000);
    this.camBase = new THREE.Vector3(WORLD.width / 2, 900, WORLD.height / 2 + 800);
    this.camLook = new THREE.Vector3(WORLD.width / 2, 0, WORLD.height / 2);

    this._lights();
    this._ground();

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

    this._composer();
    this.resize();
  }

  // ---- setup helpers ----
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

    // perimeter buildings for a "town" backdrop (outside the play area)
    const bmat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.8 });
    const rand = mulberry(99);
    for (let i = 0; i < 26; i++) {
      const edge = i % 4;
      const w = 90 + rand() * 130, h = 120 + rand() * 340, d = 90 + rand() * 130;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bmat);
      let x, z, off = 140 + rand() * 260;
      if (edge === 0) { x = rand() * WORLD.width; z = -off; }
      else if (edge === 1) { x = WORLD.width + off; z = rand() * WORLD.height; }
      else if (edge === 2) { x = rand() * WORLD.width; z = WORLD.height + off; }
      else { x = -off; z = rand() * WORLD.height; }
      m.position.set(x, h / 2, z);
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
    }
  }

  _composer() {
    const c = new EffectComposer(this.renderer);
    c.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 1.25, 0.6, 0.62);
    c.addPass(bloom);
    c.addPass(new OutputPass());
    this.composer = c;
    this.bloom = bloom;
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
    const c = p.kind === 'acid' ? 0xa6e22e : 0xffe066;
    return new THREE.Mesh(new THREE.SphereGeometry(p.kind === 'acid' ? 5 : 3.2, 10, 8),
      new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.2 }));
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
    // base
    const bodyMat = this._base.userData.body.material;
    bodyMat.emissive.setHex(game.base.flash > 0 ? 0xff3b3b : 0x000000);
    bodyMat.emissiveIntensity = game.base.flash > 0 ? 0.9 : 0;
    // player
    this._player.position.set(game.player.x, 0, game.player.y);

    this._syncList(game.zombies, this.zMeshes, (z) => this._zombieMesh(z), (m, z) => this._updateZombie(m, z, game));
    this._syncList(game.defenses, this.dMeshes, (d) => this._defenseMesh(d), (m, d) => this._updateDefense(m, d, game, dt));
    this._syncList(game.resources, this.rMeshes, (r) => this._resourceMesh(r), (m, r) => this._updateResource(m, r));
    this._syncList(game.projectiles, this.pMeshes, (p) => this._projectileMesh(p), (m, p) => m.position.set(p.x, 16, p.y));
    this._syncList(game.effects.shockwaves, this.shockMeshes, (s) => this._shockMesh(s), (m, s) => this._updateShock(m, s));

    this._updateParticles(game.effects.particles);
    this._updateEmbers(dt || 0.016);
    this._updatePreview(game);

    const active = game.phase === PHASE.GATHER || game.phase === PHASE.DEFEND;
    this._placeRing.visible = active;

    // camera + shake
    const sh = game.effects.shakeOffset();
    this.camera.position.set(this.camBase.x + sh.x * 2.5, this.camBase.y, this.camBase.z + sh.y * 2.5);
    this.camera.lookAt(this.camLook);
  }

  _syncList(list, map, create, update) {
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (const e of list) {
      let m = map.get(e);
      if (!m) { m = create(e); this.scene.add(m); map.set(e, m); }
      update(m, e);
      seen.add(e);
    }
    for (const [e, m] of map) {
      if (!seen.has(e)) { this.scene.remove(m); disposeObj(m); map.delete(e); }
    }
  }

  _updateZombie(m, z, game) {
    m.position.set(z.x, 0, z.y);
    const body = m.userData.body;
    body.material.emissive.setHex(z.flash > 0 ? 0xffffff : (z.type === 'spitter' ? 0x8e44ad : 0x000000));
    body.material.emissiveIntensity = z.flash > 0 ? 1.0 : (z.type === 'spitter' ? 0.7 : 0);
    // face the base
    m.rotation.y = Math.atan2(game.base.x - z.x, game.base.y - z.y);
    // hp bar
    const bar = m.userData.bar;
    const frac = Math.max(0, z.hp / z.maxHp);
    bar.group.visible = z.hp < z.maxHp && !z.wanderer;
    bar.fg.scale.x = frac;
    bar.fg.position.x = -bar.width * (1 - frac) / 2;
    bar.group.quaternion.copy(this.camera.quaternion);
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
