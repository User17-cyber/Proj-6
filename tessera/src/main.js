'use strict';
/* Game loop, input, chunk streaming, saving. */

const SAVE_KEY = 'tessera.save.v1';
const LAST_BIOME_KEY = 'tessera.lastBiome';
const DAY_LENGTH = 720; // seconds for a full day and night

class Game {
  constructor() {
    this.params = new URLSearchParams(location.search);
    this.nolock = this.params.has('nolock');
    this.canvas = document.getElementById('view');
    this.render = new Renderer(this.canvas);
    this.audio = new Sfx();
    this.ui = new UI(this);
    this.entities = new EntityManager(this);
    this.player = new Player(this);
    this.world = null;
    this.state = 'title';
    this.time = 0.04; this.clock = 0; this.slain = new Set();
    this.inp = { fwd: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false, lmb: false, rmb: false, lmbEdge: false, rmbEdge: false, lookL: false, lookR: false, lookU: false, lookD: false };
    this.timers = { crop: 0, save: 0, place: 0, unload: 0 };
    this.placeName = ''; this.fps = 60; this.debug = false; this.everLocked = false; this.lockFails = 0;
    this.setViewDist(7);
    this.bind();
    this.ui.el.btnContinue.disabled = !this.hasSave();
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  /* ---------- state ---------- */
  setState(s) {
    this.state = s;
    const ui = this.ui;
    ui.show('title', s === 'title'); ui.show('loading', s === 'loading');
    ui.show('hud', s === 'playing' || s === 'ui' || s === 'dead' || s === 'paused');
    ui.show('pause', s === 'paused'); ui.show('death', s === 'dead');
    if (s !== 'playing') {
      for (const k in this.inp) this.inp[k] = false;
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }
  resume() {
    this.setState('playing');
    this.audio.ensure();
    if (this.nolock) return;
    if (!this.canvas.requestPointerLock) { this.lockFailed(); return; }
    try {
      const pr = this.canvas.requestPointerLock();
      if (pr && pr.catch) pr.catch(() => this.lockFailed());
    } catch (e) { this.lockFailed(); }
  }
  /* Some embedded viewers refuse to capture the mouse. After two refusals, carry on without it. */
  lockFailed() {
    if (this.nolock || document.pointerLockElement) return;
    if (!this.everLocked && ++this.lockFails >= 2) {
      this.nolock = true;
      if (this.state !== 'playing') this.setState('playing');
      this.ui.say('Mouse capture unavailable', 'This viewer will not hand over the mouse. Turn the view with the arrow keys instead; everything else works as normal.');
      return;
    }
    if (this.state === 'playing') this.pause('Paused', 'Click Resume to take the mouse back.');
  }
  pause(title, text) {
    if (this.ui.kind) this.ui.closeScreen();
    this.ui.el.pauseTitle.textContent = title || 'Paused';
    this.ui.el.pauseText.textContent = text || '';
    this.setState('paused');
    this.save();
  }
  onDeath() {
    if (this.ui.kind) this.ui.closeScreen();
    this.setState('dead');
  }

  /* ---------- saving ---------- */
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  save() {
    if (!this.world || this.state === 'title' || this.state === 'loading') return;
    const p = this.player, chests = {};
    for (const [k, v] of this.world.chests) chests[k] = v;
    const data = {
      v: 1, seed: this.world.seed, time: this.time, slain: Array.from(this.slain),
      player: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, hp: p.hp, sel: p.sel, spawn: p.spawn, inv: p.inv, armor: p.armor },
      edits: this.world.serializeEdits(), chests,
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { this.ui.toast('Could not save: browser storage is full or blocked'); }
  }

  /* ---------- starting a world ---------- */
  newGame() {
    const raw = document.getElementById('seedIn').value.trim();
    let seed;
    if (!raw) seed = (Math.floor(Math.random() * 0x7fffffff) ^ (Date.now() & 0x7fffffff)) | 0;
    else if (/^-?\d+$/.test(raw)) seed = Number(raw) | 0;
    else { seed = 7; for (let i = 0; i < raw.length; i++) seed = (Math.imul(seed, 31) + raw.charCodeAt(i)) | 0; }
    /* never the same kind of place twice in a row */
    let last = -1;
    try { last = Number(localStorage.getItem(LAST_BIOME_KEY)); } catch (e) { /* storage blocked */ }
    const forced = this.params.get('biome');
    const options = SPAWN_BIOMES.filter((b) => b !== last);
    const biome = forced !== null ? Number(forced) : options[Math.floor(Math.random() * options.length)];
    this.startWorld(seed, null, biome);
  }
  loadGame() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { data = null; }
    if (!data || data.v !== 1) { this.ui.el.btnContinue.disabled = true; return; }
    this.startWorld(data.seed, data, 0);
  }

  async startWorld(seed, save, biome) {
    const ui = this.ui, p = this.player;
    this.audio.ensure();
    this.setState('loading');
    ui.loading('Shaping the world', 'Surveying the land', 0.02);
    await new Promise((r) => setTimeout(r, 30));
    if (this.world) for (const c of this.world.chunks.values()) this.render.dropChunkMesh(c);
    this.entities.clear();
    this.world = new World(seed);
    const w = this.world;
    this.player = new Player(this);
    const pl = this.player;
    this.slain = new Set(); this.clock = 0; this.placeName = '';
    let spawnBiome = biome;
    if (save) {
      w.loadEdits(save.edits || {});
      w.chests = new Map(Object.entries(save.chests || {}));
      Object.assign(pl, { x: save.player.x, y: save.player.y, z: save.player.z, yaw: save.player.yaw, pitch: save.player.pitch, hp: save.player.hp, sel: save.player.sel || 0, spawn: save.player.spawn });
      pl.inv = save.player.inv; pl.armor = save.player.armor;
      this.time = save.time || 0.04;
      this.slain = new Set(save.slain || []);
    } else {
      const s = w.gen.findSpawn(biome);
      spawnBiome = s.biome;
      pl.x = s.x + 0.5; pl.z = s.z + 0.5; pl.yaw = Math.random() * 6.28;
      this.time = 0.04;
      pl.give(B.MAKER_TABLE, 1);
      pl.give(I.SEEDS_WHEAT, 6); pl.give(I.SEEDS_CARROT, 4); pl.give(I.SEEDS_BEET, 4); pl.give(I.SEEDS_PUMPKIN, 2);
      try { localStorage.setItem(LAST_BIOME_KEY, String(spawnBiome)); } catch (e) { /* storage blocked */ }
    }
    const title = save ? 'Returning' : 'Shaping the ' + BIOME_INFO[spawnBiome].name;
    const pcx = Math.floor(pl.x) >> 4, pcz = Math.floor(pl.z) >> 4;
    const R = 3, cells = [];
    for (let dx = -R - 1; dx <= R + 1; dx++) for (let dz = -R - 1; dz <= R + 1; dz++) cells.push([dx, dz]);
    cells.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]));
    let t0 = performance.now();
    for (let i = 0; i < cells.length; i++) {
      w.ensureChunk(pcx + cells[i][0], pcz + cells[i][1]);
      if (performance.now() - t0 > 40) { ui.loading(title, 'Raising terrain', 0.05 + 0.65 * i / cells.length); await new Promise((r) => setTimeout(r, 0)); t0 = performance.now(); }
    }
    let done = 0;
    for (const [dx, dz] of cells) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) > R) continue;
      this.meshNow(w.getChunk(pcx + dx, pcz + dz));
      done++;
      if (performance.now() - t0 > 40) { ui.loading(title, 'Laying blocks', 0.7 + 0.3 * done / 49); await new Promise((r) => setTimeout(r, 0)); t0 = performance.now(); }
    }
    if (!save) {
      pl.y = w.surfaceY(Math.floor(pl.x), Math.floor(pl.z)) + 0.01;
      pl.spawn = { x: pl.x, y: pl.y, z: pl.z };
    }
    ui.hudDirty = true; ui.markT = 0;
    this.last = performance.now();
    this.spawnBiome = spawnBiome;
    if (this.nolock) this.resume();
    else this.pause(save ? 'Welcome back' : BIOME_INFO[spawnBiome].name, save ? 'Your world is as you left it.' : 'You wake somewhere new. ' + BIOME_INFO[spawnBiome].blurb);
    document.getElementById('btnResume').textContent = 'Enter world';
    if (!save) ui.banner(BIOME_INFO[spawnBiome].name, BIOME_INFO[spawnBiome].blurb);
  }

  /* ---------- chunk streaming ---------- */
  setViewDist(r) {
    this.viewDist = r;
    const R = r + 1;
    this.offsets = [];
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const d2 = dx * dx + dz * dz;
      if (d2 <= (R + 0.5) * (R + 0.5)) this.offsets.push([dx, dz, d2]);
    }
    this.offsets.sort((a, b) => a[2] - b[2]);
    this.meshR2 = (r + 0.5) * (r + 0.5);
  }
  meshNow(c) {
    const res = meshChunk(this.world, c);
    if (!res) return false;
    this.render.setChunkMesh(c, res);
    c.dirty = false;
    return true;
  }
  updateChunks(budget) {
    const w = this.world, p = this.player;
    const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
    if (w.urgent.size) { for (const c of w.urgent) if (c.dirty) this.meshNow(c); w.urgent.clear(); }
    const t0 = performance.now();
    for (const [dx, dz] of this.offsets) {
      if (w.getChunk(pcx + dx, pcz + dz)) continue;
      w.ensureChunk(pcx + dx, pcz + dz);
      if (performance.now() - t0 > budget) break;
    }
    const t1 = performance.now();
    for (const [dx, dz, d2] of this.offsets) {
      if (d2 > this.meshR2) break;
      const c = w.getChunk(pcx + dx, pcz + dz);
      if (!c || !c.dirty) continue;
      if (this.meshNow(c) && performance.now() - t1 > budget) break;
    }
    if (--this.timers.unload <= 0) {
      this.timers.unload = 90;
      const lim = this.viewDist + 3;
      for (const [key, c] of w.chunks) {
        if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > lim) { this.render.dropChunkMesh(c); w.chunks.delete(key); }
      }
    }
  }

  /* ---------- main loop ---------- */
  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    const rawDt = (t - this.last) / 1000;
    this.last = t;
    const dt = Math.min(0.05, Math.max(0, rawDt));
    if (rawDt > 0) this.fps = lerp(this.fps, 1 / rawDt, 0.05);
    const s = this.state;
    if (!this.world || s === 'title' || s === 'loading') return;
    const p = this.player, w = this.world, R = this.render;
    if (s === 'playing' || s === 'ui' || s === 'dead') {
      this.clock += dt;
      this.time = (this.time + dt / DAY_LENGTH) % 1;
      if (s === 'playing') {
        const k = this.inp;
        p.yaw += ((k.lookL ? 1 : 0) - (k.lookR ? 1 : 0)) * 2.3 * dt;
        p.pitch = clamp(p.pitch + ((k.lookU ? 1 : 0) - (k.lookD ? 1 : 0)) * 1.7 * dt, -1.55, 1.55);
      }
      p.update(dt, s === 'playing' ? this.inp : null);
      this.entities.update(dt);
      R.updateParticles(dt);
      const T = this.timers;
      if ((T.crop -= dt) <= 0) { T.crop = 1; w.growCrops(p.x, p.z, Math.random); }
      if ((T.save -= dt) <= 0) { T.save = 25; this.save(); }
      if ((T.place -= dt) <= 0) { T.place = 0.4; this.updatePlace(); }
    }
    this.inp.lmbEdge = false; this.inp.rmbEdge = false;
    this.updateChunks(7);

    const cam = R.camera;
    const bobY = p.onGround ? Math.abs(Math.sin(p.bob)) * 0.045 : 0;
    cam.position.set(p.x, p.y + p.eye + bobY, p.z);
    cam.rotation.set(p.pitch, p.yaw, 0);
    R.uniforms.uTime.value = this.clock;
    R.updateSky(this.time, cam.position, this.viewDist * CHUNK, p.headWater);
    R.updateClouds(cam.position, this.clock);
    const held = p.held();
    const light = Math.max(0.2, w.skyExposure(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z)) * (0.25 + 0.75 * R.dayFactor));
    R.updateHand(held ? held.id : 0, p.swing, p.bob, light, dt);
    R.setSelection(s === 'playing' ? p.target : null, p.mineP);
    this.ui.frame(dt);
    if (this.debug) {
      this.ui.el.debug.textContent = 'fps ' + this.fps.toFixed(0) + '\nxyz ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ' ' + p.z.toFixed(1) +
        '\nchunks ' + w.chunks.size + '  creatures ' + this.entities.list.length + '\nseed ' + w.seed + '\ntime ' + this.time.toFixed(3) + '  ' + this.placeName;
    }
    R.render();
  }

  updatePlace() {
    const p = this.player, w = this.world;
    const c = w.getChunk(Math.floor(p.x) >> 4, Math.floor(p.z) >> 4);
    if (!c) return;
    const biome = c.biomes[(Math.floor(p.z) & 15) * CHUNK + (Math.floor(p.x) & 15)];
    let name = BIOME_INFO[biome].name, sub = BIOME_INFO[biome].blurb, isPlace = false;
    for (const m of this.ui.marks) {
      if (Math.max(Math.abs(m.x - p.x), Math.abs(m.z - p.z)) < m.radius) {
        name = m.name; isPlace = true;
        sub = m.type === 'town' ? 'Friendly ground. The chests are yours to use.' : m.type === 'fortress' ? 'Iron Husks hold these walls.' : 'The Warden waits in the great hall.';
      }
    }
    if (name !== this.placeName) {
      const first = this.placeName === '';
      this.placeName = name;
      this.ui.el.place.textContent = name;
      if (!first && (isPlace || this.clock > 3)) this.ui.banner(name, sub);
    }
  }

  /* ---------- input ---------- */
  bind() {
    const KEY = { KeyW: 'fwd', KeyS: 'back', KeyA: 'left', KeyD: 'right', Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint', ControlLeft: 'sneak', KeyC: 'sneak', ArrowLeft: 'lookL', ArrowRight: 'lookR', ArrowUp: 'lookU', ArrowDown: 'lookD' };
    document.addEventListener('keydown', (ev) => {
      if (ev.target && ev.target.tagName === 'INPUT') return;
      const s = this.state;
      if (ev.code === 'F3') { ev.preventDefault(); this.debug = !this.debug; this.ui.show('debug', this.debug); return; }
      if (s === 'ui') {
        if (ev.code === 'KeyE' || ev.code === 'Escape') { ev.preventDefault(); this.ui.closeScreen(); this.resume(); }
        return;
      }
      if (s === 'paused' && ev.code === 'Escape' && this.nolock) { this.resume(); return; }
      if (s !== 'playing') return;
      if (KEY[ev.code]) { this.inp[KEY[ev.code]] = true; ev.preventDefault(); return; }
      if (ev.code.startsWith('Digit')) { const n = Number(ev.code.slice(5)); if (n >= 1 && n <= 9) { this.player.sel = n - 1; this.ui.hudDirty = true; } return; }
      if (ev.code === 'KeyE') { this.ui.openScreen('inv'); return; }
      if (ev.code === 'Escape') this.pause('Paused', '');
    });
    document.addEventListener('keyup', (ev) => { if (KEY[ev.code]) this.inp[KEY[ev.code]] = false; });
    window.addEventListener('blur', () => { for (const k in this.inp) this.inp[k] = false; });
    this.canvas.addEventListener('mousedown', (ev) => {
      if (this.state !== 'playing') return;
      if (!this.nolock && document.pointerLockElement !== this.canvas) { this.resume(); return; }
      if (ev.button === 0) { this.inp.lmb = true; this.inp.lmbEdge = true; }
      else if (ev.button === 2) { this.inp.rmb = true; this.inp.rmbEdge = true; }
    });
    document.addEventListener('mouseup', (ev) => { if (ev.button === 0) this.inp.lmb = false; else if (ev.button === 2) this.inp.rmb = false; });
    document.addEventListener('contextmenu', (ev) => { if (ev.target.tagName !== 'INPUT') ev.preventDefault(); });
    document.addEventListener('mousemove', (ev) => {
      if (this.state !== 'playing') return;
      if (!this.nolock && document.pointerLockElement !== this.canvas) return;
      if (this.nolock && !(ev.buttons & 4)) return;
      const p = this.player;
      p.yaw -= ev.movementX * 0.0024;
      p.pitch = clamp(p.pitch - ev.movementY * 0.0024, -1.55, 1.55);
    });
    document.addEventListener('wheel', (ev) => {
      if (this.state !== 'playing') return;
      this.player.sel = (this.player.sel + (ev.deltaY > 0 ? 1 : 8)) % 9;
      this.ui.hudDirty = true;
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement) this.everLocked = true;
      else if (this.state === 'playing' && !this.nolock) this.pause('Paused', '');
    });
    document.addEventListener('pointerlockerror', () => this.lockFailed());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    window.addEventListener('beforeunload', () => this.save());

    const $ = (id) => document.getElementById(id);
    $('btnNew').addEventListener('click', () => this.newGame());
    $('btnContinue').addEventListener('click', () => this.loadGame());
    $('btnResume').addEventListener('click', () => { $('btnResume').textContent = 'Resume'; this.resume(); });
    $('btnRespawn').addEventListener('click', () => { this.player.respawn(); this.resume(); });
    $('btnSaveQuit').addEventListener('click', () => {
      this.save();
      for (const c of this.world.chunks.values()) this.render.dropChunkMesh(c);
      this.entities.clear();
      this.world = null;
      this.ui.el.btnContinue.disabled = !this.hasSave();
      this.setState('title');
    });
    $('viewDist').addEventListener('input', (ev) => { this.setViewDist(Number(ev.target.value)); $('viewDistV').textContent = ev.target.value; });
    $('volume').addEventListener('input', (ev) => { this.audio.vol = Number(ev.target.value) / 10; $('volumeV').textContent = ev.target.value; });
  }
}

window.addEventListener('DOMContentLoaded', () => { window.game = new Game(); });
