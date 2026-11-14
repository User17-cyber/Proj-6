'use strict';
/* Animals, monsters, townsfolk and projectiles. Every creature is assembled from boxes. */

const GEO_CACHE = {};
function boxGeo(w, h, d) {
  const k = w + '|' + h + '|' + d;
  return GEO_CACHE[k] || (GEO_CACHE[k] = new THREE.BoxGeometry(w, h, d));
}
function part(mats, w, h, d, color, x, y, z, opts) {
  const o = opts || {};
  const mat = o.glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color, transparent: !!o.opacity, opacity: o.opacity || 1 });
  if (!o.glow) mats.push(mat);
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x || 0, y || 0, z || 0);
  return m;
}

/* Four-legged (or two-legged, for birds) body. Forward is +z. */
function buildQuad(s, mats) {
  const g = new THREE.Group(), legs = [];
  const bodyY = s.legH + s.bh / 2;
  const body = part(mats, s.bw, s.bh, s.bl, s.color, 0, bodyY, 0);
  g.add(body);
  const lx = s.bw / 2 - s.legW / 2 - 0.01, lz = s.bl / 2 - s.legW / 2 - 0.02;
  const spots = s.two ? [[-lx * 0.6, 0], [lx * 0.6, 0]] : [[-lx, lz], [lx, lz], [-lx, -lz], [lx, -lz]];
  for (const [x, z] of spots) {
    const pivot = new THREE.Group();
    pivot.position.set(x, s.legH, z);
    pivot.add(part(mats, s.legW, s.legH, s.legW, s.legColor || s.color, 0, -s.legH / 2, 0));
    g.add(pivot); legs.push(pivot);
  }
  const head = new THREE.Group();
  head.position.set(0, bodyY + (s.headY || 0), s.bl / 2 + (s.headZ || 0));
  head.add(part(mats, s.head[0], s.head[1], s.head[2], s.headColor || s.color, 0, 0, s.head[2] / 2 - 0.06));
  const ez = s.head[2] - 0.05, ex = s.head[0] / 2 - 0.07;
  head.add(part(mats, 0.06, 0.07, 0.03, 0x15161a, -ex, s.head[1] * 0.15, ez, { glow: true }));
  head.add(part(mats, 0.06, 0.07, 0.03, 0x15161a, ex, s.head[1] * 0.15, ez, { glow: true }));
  g.add(head);
  if (s.extra) s.extra(g, head, mats, bodyY);
  return { group: g, legs, arms: [], head };
}

/* Two-legged body with arms. Forward is +z. */
function buildBiped(s, mats) {
  const g = new THREE.Group(), legs = [], arms = [];
  for (const x of [-0.13, 0.13]) {
    const p = new THREE.Group(); p.position.set(x, 0.75, 0);
    p.add(part(mats, 0.24, 0.75, 0.24, s.pants, 0, -0.375, 0));
    g.add(p); legs.push(p);
  }
  g.add(part(mats, 0.52, 0.7, 0.28, s.shirt, 0, 1.1, 0));
  const al = s.armLen || 0.7;
  for (const x of [-0.37, 0.37]) {
    const p = new THREE.Group(); p.position.set(x, 1.42, 0);
    p.add(part(mats, 0.2, al, 0.2, s.arm || s.shirt, 0, -al / 2 + 0.05, 0));
    g.add(p); arms.push(p);
  }
  const head = new THREE.Group(); head.position.set(0, 1.69, 0);
  head.add(part(mats, 0.46, 0.46, 0.46, s.skin, 0, 0, 0));
  head.add(part(mats, 0.09, 0.07, 0.03, s.eye, -0.11, 0.03, 0.235, { glow: true }));
  head.add(part(mats, 0.09, 0.07, 0.03, s.eye, 0.11, 0.03, 0.235, { glow: true }));
  g.add(head);
  if (s.extra) s.extra(g, head, mats, arms);
  if (s.held) {
    const it = spriteMesh(ITEMS[s.held].sprite);
    it.scale.setScalar(s.heldScale || 0.85);
    it.rotation.set(Math.PI / 2 - 0.5, Math.PI / 2, 0);
    it.position.set(0, -al + 0.05, 0.3 * (s.heldScale || 0.85));
    arms[1].add(it);
  }
  if (s.scale) g.scale.setScalar(s.scale);
  return { group: g, legs, arms, head };
}

const SHIRTS = [0x4a7fd6, 0xb5483c, 0x58a65a, 0xd9a83a, 0x8a5fb0, 0xd6d0c2];

const MOBS = {
  sheep: { name: 'Woolback', kind: 'animal', hp: 8, speed: 1.5, hw: 0.4, h: 1.1,
    drops: [['#WOOL', 1, 2], ['MEAT', 1, 1]],
    build: (m) => buildQuad({ bw: 0.7, bh: 0.62, bl: 1.0, legH: 0.42, legW: 0.16, color: 0xf1efe9, legColor: 0x5a5048, head: [0.36, 0.36, 0.42], headColor: 0x5a5048, headY: 0.1, headZ: -0.04,
      extra: (g, head, mats) => head.add(part(mats, 0.4, 0.14, 0.3, 0xf1efe9, 0, 0.22, 0.12)) }, m) },
  boar: { name: 'Bristle Boar', kind: 'animal', hp: 10, speed: 1.6, hw: 0.4, h: 0.9,
    drops: [['MEAT', 1, 3], ['HIDE', 0, 1]],
    build: (m) => buildQuad({ bw: 0.62, bh: 0.5, bl: 0.95, legH: 0.3, legW: 0.16, color: 0x8a5a3c, legColor: 0x5e3b26, head: [0.42, 0.4, 0.4], headY: 0, headZ: -0.04,
      extra: (g, head, mats) => { head.add(part(mats, 0.22, 0.16, 0.12, 0xc98a72, 0, -0.08, 0.38)); head.add(part(mats, 0.05, 0.1, 0.05, 0xf4f0e6, -0.15, -0.12, 0.34)); head.add(part(mats, 0.05, 0.1, 0.05, 0xf4f0e6, 0.15, -0.12, 0.34)); g.add(part(mats, 0.12, 0.1, 0.8, 0x5e3b26, 0, 0.84, -0.02)); } }, m) },
  hen: { name: 'Ruffhen', kind: 'animal', hp: 4, speed: 1.3, hw: 0.24, h: 0.7,
    drops: [['FEATHER', 1, 3], ['MEAT', 1, 1]],
    build: (m) => buildQuad({ two: true, bw: 0.34, bh: 0.32, bl: 0.44, legH: 0.2, legW: 0.06, color: 0xf6f3ea, legColor: 0xe8a530, head: [0.2, 0.24, 0.2], headY: 0.22, headZ: -0.1,
      extra: (g, head, mats) => { head.add(part(mats, 0.1, 0.06, 0.1, 0xe8862a, 0, -0.03, 0.2)); head.add(part(mats, 0.06, 0.08, 0.14, 0xd64545, 0, 0.16, 0.04)); g.add(part(mats, 0.2, 0.2, 0.1, 0xe3ddcf, 0, 0.46, -0.26)); } }, m) },
  deer: { name: 'Glade Deer', kind: 'animal', hp: 10, speed: 2.0, hw: 0.38, h: 1.5,
    drops: [['HIDE', 1, 2], ['MEAT', 1, 2]],
    build: (m) => buildQuad({ bw: 0.5, bh: 0.55, bl: 1.1, legH: 0.72, legW: 0.12, color: 0xb88a5a, legColor: 0x8a6440, head: [0.28, 0.3, 0.42], headY: 0.52, headZ: 0.02,
      extra: (g, head, mats, bodyY) => { g.add(part(mats, 0.2, 0.5, 0.2, 0xb88a5a, 0, bodyY + 0.3, 0.5)); g.add(part(mats, 0.14, 0.14, 0.1, 0xf4f0e6, 0, bodyY + 0.1, -0.58));
        for (const sx of [-1, 1]) { head.add(part(mats, 0.05, 0.3, 0.05, 0xe5d6b0, sx * 0.1, 0.3, 0.08)); head.add(part(mats, 0.16, 0.05, 0.05, 0xe5d6b0, sx * 0.17, 0.36, 0.08)); head.add(part(mats, 0.05, 0.14, 0.05, 0xe5d6b0, sx * 0.24, 0.44, 0.08)); } } }, m) },
  camel: { name: 'Dune Strider', kind: 'animal', hp: 14, speed: 1.7, hw: 0.45, h: 1.9,
    drops: [['HIDE', 1, 3], ['MEAT', 1, 2]],
    build: (m) => buildQuad({ bw: 0.7, bh: 0.66, bl: 1.3, legH: 0.9, legW: 0.16, color: 0xd2b07a, legColor: 0xb8935f, head: [0.3, 0.3, 0.5], headY: 0.8, headZ: 0.06,
      extra: (g, head, mats, bodyY) => { g.add(part(mats, 0.24, 0.8, 0.24, 0xd2b07a, 0, bodyY + 0.5, 0.62)); g.add(part(mats, 0.44, 0.3, 0.5, 0xc29f68, 0, bodyY + 0.46, -0.1)); } }, m) },
  hare: { name: 'Snow Hare', kind: 'animal', hp: 4, speed: 2.6, hw: 0.22, h: 0.6,
    drops: [['HIDE', 0, 1], ['MEAT', 1, 1]],
    build: (m) => buildQuad({ bw: 0.3, bh: 0.28, bl: 0.44, legH: 0.14, legW: 0.09, color: 0xf4f6fa, head: [0.24, 0.24, 0.24], headY: 0.14, headZ: -0.06,
      extra: (g, head, mats) => { head.add(part(mats, 0.07, 0.26, 0.05, 0xf4f6fa, -0.07, 0.24, 0.06)); head.add(part(mats, 0.07, 0.26, 0.05, 0xf4f6fa, 0.07, 0.24, 0.06)); g.add(part(mats, 0.12, 0.12, 0.08, 0xffffff, 0, 0.3, -0.26)); } }, m) },

  villager: { name: 'Townsfolk', kind: 'villager', hp: 20, speed: 1.3, hw: 0.3, h: 1.9, drops: [],
    build: (m, e) => buildBiped({ skin: 0xe0ac7e, shirt: SHIRTS[Math.floor(e.rand() * SHIRTS.length)], pants: 0x5e4630, arm: 0xe0ac7e, eye: 0x2a2520,
      extra: (g, head, mats) => { head.add(part(mats, 0.62, 0.07, 0.62, 0xdbb84a, 0, 0.26, 0)); head.add(part(mats, 0.36, 0.16, 0.36, 0xdbb84a, 0, 0.36, 0)); } }, m) },

  gloomer: { name: 'Gloomer', kind: 'monster', hp: 16, dmg: 3, speed: 3.2, hw: 0.3, h: 1.98, aggro: 18, reach: 1.7, night: true,
    drops: [['COAL', 0, 2], ['FIBER', 0, 2]],
    build: (m) => buildBiped({ scale: 1.04, skin: 0x2a2440, shirt: 0x38325e, pants: 0x1e1a33, arm: 0x2a2440, eye: 0x7ffcff, armLen: 0.95,
      extra: (g, head, mats) => { head.add(part(mats, 0.1, 0.2, 0.1, 0x38325e, -0.14, 0.3, 0)); head.add(part(mats, 0.1, 0.2, 0.1, 0x38325e, 0.14, 0.3, 0)); } }, m) },
  husk: { name: 'Iron Husk', kind: 'monster', hp: 26, dmg: 5, speed: 2.9, hw: 0.3, h: 1.95, aggro: 15, reach: 1.9,
    drops: [['IRON_INGOT', 0, 2], ['COAL', 0, 2], ['BREAD', 0, 1]],
    build: (m) => buildBiped({ skin: 0x9aa3b3, shirt: 0x8a93a3, pants: 0x5c6472, arm: 0x7a8394, eye: 0xff5a4a, held: I.SWORD_I,
      extra: (g, head, mats) => { head.add(part(mats, 0.5, 0.1, 0.5, 0x6b7382, 0, 0.2, 0)); head.add(part(mats, 0.08, 0.2, 0.3, 0xb5483c, 0, 0.34, -0.02)); g.add(part(mats, 0.6, 0.14, 0.34, 0x6b7382, 0, 1.4, 0)); } }, m) },
  archer: { name: 'Husk Archer', kind: 'monster', hp: 16, dmg: 3, speed: 2.4, hw: 0.3, h: 1.95, aggro: 22, ranged: 'arrow', cooldown: 2.4,
    drops: [['ARROW', 2, 6], ['FEATHER', 0, 2], ['FIBER', 0, 2]],
    build: (m) => buildBiped({ skin: 0x8f98a8, shirt: 0x6b5a45, pants: 0x4a4034, arm: 0x6b5a45, eye: 0xff9a3a, held: I.BOW,
      extra: (g, head, mats) => { head.add(part(mats, 0.52, 0.3, 0.52, 0x4a5a3c, 0, 0.12, -0.03)); } }, m) },
  warden: { name: 'Castle Warden', kind: 'monster', hp: 140, dmg: 9, speed: 2.7, hw: 0.5, h: 3.5, aggro: 20, reach: 2.9, boss: true,
    drops: [['PRISM', 5, 8], ['#GOLD_BLOCK', 2, 3], ['ROAST', 2, 4]],
    build: (m) => buildBiped({ scale: 1.85, skin: 0x4a5062, shirt: 0x3d4250, pants: 0x2c303b, arm: 0x4a5062, eye: 0x5fe3d0, held: I.SWORD_P, heldScale: 1.15,
      extra: (g, head, mats) => {
        head.add(part(mats, 0.5, 0.1, 0.5, 0xf2c94c, 0, 0.27, 0));
        for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2], [0, 0.2]]) head.add(part(mats, 0.08, 0.14, 0.08, 0xf2c94c, x, 0.38, z));
        g.add(part(mats, 0.34, 0.2, 0.36, 0xf2c94c, -0.4, 1.46, 0)); g.add(part(mats, 0.34, 0.2, 0.36, 0xf2c94c, 0.4, 1.46, 0));
        g.add(part(mats, 0.16, 0.16, 0.04, 0x5fe3d0, 0, 1.15, 0.15, { glow: true }));
      } }, m) },
  blob: { name: 'Mire Blob', kind: 'monster', hp: 10, dmg: 2, speed: 3.4, hw: 0.4, h: 0.8, aggro: 14, reach: 1.3, hop: true, night: true,
    drops: [['FIBER', 0, 2], ['APPLE', 0, 1], ['#CLAY', 0, 2]],
    build: (m) => {
      const g = new THREE.Group();
      g.add(part(m, 0.42, 0.42, 0.42, 0x2f8a3a, 0, 0.36, 0));
      g.add(part(m, 0.1, 0.12, 0.04, 0x10221a, -0.16, 0.5, 0.4, { glow: true })); g.add(part(m, 0.1, 0.12, 0.04, 0x10221a, 0.16, 0.5, 0.4, { glow: true }));
      g.add(part(m, 0.8, 0.8, 0.8, 0x74d66e, 0, 0.4, 0, { opacity: 0.55 }));
      return { group: g, legs: [], arms: [], head: null };
    } },
  ember: { name: 'Emberling', kind: 'monster', hp: 9, dmg: 3, speed: 3.0, hw: 0.3, h: 0.6, aggro: 20, ranged: 'ember', cooldown: 2.8, fly: true, night: true,
    drops: [['COAL', 1, 3]],
    build: (m) => {
      const g = new THREE.Group(), orbit = new THREE.Group();
      g.add(part(m, 0.5, 0.5, 0.5, 0xff8a3c, 0, 0.3, 0, { glow: true })); g.add(part(m, 0.3, 0.3, 0.3, 0xfff1a8, 0, 0.3, 0.12, { glow: true }));
      for (let i = 0; i < 4; i++) orbit.add(part(m, 0.16, 0.16, 0.16, 0x3a2a2a, Math.cos(i * 1.57) * 0.5, 0, Math.sin(i * 1.57) * 0.5));
      orbit.position.y = 0.3; g.add(orbit);
      return { group: g, legs: [], arms: [], head: null, orbit };
    } },
};

const BIOME_ANIMALS = {
  [BIOME.MEADOW]: ['sheep', 'sheep', 'hen', 'boar'], [BIOME.FOREST]: ['deer', 'boar', 'boar', 'hen'], [BIOME.BLOSSOM]: ['sheep', 'hen', 'deer'],
  [BIOME.DESERT]: ['camel'], [BIOME.STEPPE]: ['camel', 'hen', 'boar'], [BIOME.FROST]: ['hare', 'hare', 'deer'], [BIOME.MIRE]: ['boar', 'hen'],
  [BIOME.HIGHLANDS]: ['sheep', 'hare'], [BIOME.REDROCK]: ['camel'], [BIOME.BEACH]: ['hen'],
};
const BIOME_MONSTERS = {
  [BIOME.MIRE]: ['blob', 'blob', 'gloomer'], [BIOME.FOREST]: ['gloomer', 'gloomer', 'blob'], [BIOME.DESERT]: ['ember', 'gloomer'],
  [BIOME.REDROCK]: ['ember', 'ember', 'gloomer'], [BIOME.HIGHLANDS]: ['gloomer', 'ember'],
};
const SPAWN_KIND = { knight: 'husk', archer: 'archer', warden: 'warden', villager: 'villager' };

class Entity {
  constructor(type, x, y, z, seed) {
    const d = MOBS[type];
    this.type = type; this.def = d;
    this.x = x; this.y = y; this.z = z; this.vx = 0; this.vy = 0; this.vz = 0;
    this.hw = d.hw; this.h = d.h;
    this.hp = d.hp; this.yaw = 0; this.faceYaw = 0;
    this.px = 0; this.pz = 0;           // knockback push
    this.wanderT = 0; this.mx = 0; this.mz = 0; this.flee = 0; this.cool = 1 + Math.random(); this.hopT = Math.random();
    this.flash = 0; this.walk = 0; this.swing = 0; this.dayT = 0; this.age = 0;
    this.home = null; this.slot = null; this.dead = false;
    this.rand = mulberry32(seed || Math.floor(Math.random() * 1e9));
    this.mats = [];
    const b = d.build(this.mats, this);
    this.group = b.group; this.legs = b.legs; this.arms = b.arms; this.head = b.head; this.orbit = b.orbit;
    this.bar = null;
  }
}

class EntityManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.shots = [];
    this.spawnT = 0; this.animalT = 1; this.structT = 0;
    this.slots = new Map();   // structure id -> [{ entity, deadUntil }]
    this.shotGeo = { arrow: new THREE.BoxGeometry(0.07, 0.07, 0.7), ember: new THREE.BoxGeometry(0.28, 0.28, 0.28) };
  }
  clear() {
    for (const e of this.list) this.game.render.scene.remove(e.group);
    for (const s of this.shots) this.game.render.scene.remove(s.mesh);
    this.list.length = 0; this.shots.length = 0; this.slots.clear();
  }
  spawn(type, x, y, z) {
    const e = new Entity(type, x, y, z);
    e.yaw = e.faceYaw = Math.random() * 6.28;
    e.group.position.set(x, y, z);
    this.game.render.scene.add(e.group);
    this.list.push(e);
    return e;
  }
  remove(e) {
    e.dead = true;
    this.game.render.scene.remove(e.group);
    for (const m of e.mats) m.dispose();
    if (e.slot) e.slot.entity = null;
  }
  count(pred) { let n = 0; for (const e of this.list) if (pred(e)) n++; return n; }

  /* ---------- spawning ---------- */
  trySpawnNatural(dt) {
    const g = this.game, p = g.player, w = g.world;
    const pick = (minD, maxD) => {
      const a = Math.random() * 6.283, d = minD + Math.random() * (maxD - minD);
      const x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d);
      const y = w.surfaceY(x, z);
      if (y < 2) return null;
      const c = w.getChunk(x >> 4, z >> 4);
      const below = w.getBlock(x, y - 1, z);
      if (w.getBlock(x, y, z) !== B.AIR && !BLOCKS[w.getBlock(x, y, z)].replace) return null;
      if (w.getBlock(x, y, z) === B.WATER) return null;
      return { x, y, z, biome: c.biomes[(z & 15) * CHUNK + (x & 15)], below };
    };
    this.animalT -= dt;
    if (this.animalT <= 0) {
      this.animalT = 2.2;
      if (this.count((e) => e.def.kind === 'animal') < 10) {
        const s = pick(26, 58);
        const kinds = s && BIOME_ANIMALS[s.biome];
        if (kinds && (s.below === B.GRASS || s.below === B.SNOW || s.below === B.SAND || s.below === B.REDROCK) && !g.world.gen.column(s.x, s.z, {}).site) {
          const type = kinds[Math.floor(Math.random() * kinds.length)];
          const n = 1 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) {
            const x = s.x + Math.floor(Math.random() * 5) - 2, z = s.z + Math.floor(Math.random() * 5) - 2, y = w.surfaceY(x, z);
            if (y > 1 && Math.abs(y - s.y) < 3 && w.getBlock(x, y, z) !== B.WATER) this.spawn(type, x + 0.5, y, z + 0.5);
          }
        }
      }
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 1.8;
      const night = g.render.sunHeight < -0.06;
      if (night && this.count((e) => e.def.night && !e.home) < 7) {
        const s = pick(20, 44);
        if (s && s.biome !== BIOME.OCEAN && IS_SOLID[s.below] && !g.world.gen.column(s.x, s.z, {}).site) {
          const kinds = BIOME_MONSTERS[s.biome] || ['gloomer'];
          const type = kinds[Math.floor(Math.random() * kinds.length)];
          this.spawn(type, s.x + 0.5, s.y + (MOBS[type].fly ? 3 : 0), s.z + 0.5);
        }
      }
    }
    /* guards and townsfolk belong to places and return when you come back */
    this.structT -= dt;
    if (this.structT <= 0) {
      this.structT = 1;
      for (let ti = 0; ti < STRUCT_TYPES.length; ti++) {
        const near = g.world.gen.nearestStructure(ti, p.x, p.z, 1);
        if (!near || near.dist > 96 || !near.s.spawns) continue;
        const s = near.s;
        let slots = this.slots.get(s.id);
        if (!slots) { slots = s.spawns.map(() => ({ entity: null, deadUntil: 0 })); this.slots.set(s.id, slots); }
        s.spawns.forEach((sp, i) => {
          const slot = slots[i];
          if (slot.entity || g.clock < slot.deadUntil || g.slain.has(s.id + ':' + i)) return;
          const fx = Math.floor(sp.x), fz = Math.floor(sp.z);
          if (!w.getChunk(fx >> 4, fz >> 4)) return;
          if (Math.hypot(sp.x - p.x, sp.z - p.z) < 9 && Math.abs(sp.y - p.y) < 4) return;
          let y = sp.y;
          while (y < WORLD_H - 3 && IS_SOLID[w.getBlock(fx, y, fz)]) y++;
          const e = this.spawn(SPAWN_KIND[sp.kind], sp.x, y, sp.z);
          e.home = { x: sp.x, y, z: sp.z, key: s.id + ':' + i }; e.slot = slot; slot.entity = e;
        });
      }
    }
  }

  /* ---------- combat ---------- */
  hurt(e, dmg, fromX, fromZ, byPlayer) {
    if (e.dead) return;
    const g = this.game;
    e.hp -= dmg; e.flash = 0.18;
    const dx = e.x - fromX, dz = e.z - fromZ, d = Math.hypot(dx, dz) || 1;
    const kb = e.def.boss ? 2.5 : 7;
    e.px = dx / d * kb; e.pz = dz / d * kb;
    if (!e.def.fly && !e.def.boss) e.vy = 5;
    if (e.def.kind !== 'monster') e.flee = 6;
    e.alert = 8;
    g.audio.play('hit');
    g.render.burst(e.x, e.y + e.h * 0.6, e.z, e.def.kind === 'monster' ? [0.5, 0.45, 0.7] : [0.9, 0.3, 0.3], 6, 4, 0.1);
    if (e.hp <= 0) {
      g.render.burst(e.x, e.y + e.h * 0.5, e.z, [0.95, 0.95, 0.95], 16, 5, 0.16);
      g.audio.play('die');
      if (byPlayer) {
        const got = [];
        for (const [name, lo, hi] of e.def.drops) {
          const n = lo + Math.floor(Math.random() * (hi - lo + 1));
          if (n > 0) { g.player.give(lootId(name), n); got.push(n + ' ' + itemName(lootId(name))); }
        }
        if (got.length) g.ui.toast('+ ' + got.join(', '));
        if (e.def.boss) g.ui.banner('The Castle Warden falls', 'The vault above is yours.');
      }
      if (e.slot) { e.slot.deadUntil = g.clock + (e.def.kind === 'villager' ? 240 : 420); if (e.def.boss) g.slain.add(e.home.key); }
      this.remove(e);
    }
  }
  shoot(kind, x, y, z, dx, dy, dz, speed, dmg, owner) {
    const mat = new THREE.MeshBasicMaterial({ color: kind === 'ember' ? 0xffa23c : 0xe8dcc0 });
    const mesh = new THREE.Mesh(this.shotGeo[kind], mat);
    mesh.position.set(x, y, z);
    this.game.render.scene.add(mesh);
    this.shots.push({ kind, x, y, z, vx: dx * speed, vy: dy * speed, vz: dz * speed, dmg, owner, life: 5, mesh });
  }
  updateShots(dt) {
    const g = this.game, w = g.world, p = g.player;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      let done = false;
      const steps = 3, sdt = dt / steps;
      for (let k = 0; k < steps && !done; k++) {
        if (s.kind === 'arrow') s.vy -= 14 * sdt;
        s.x += s.vx * sdt; s.y += s.vy * sdt; s.z += s.vz * sdt;
        if (IS_SOLID[w.getBlock(Math.floor(s.x), Math.floor(s.y), Math.floor(s.z))]) { done = true; g.render.burst(s.x, s.y, s.z, s.kind === 'ember' ? [1, 0.6, 0.2] : [0.8, 0.75, 0.6], 4, 2.5, 0.07); break; }
        if (s.owner === 'mob') {
          if (!p.dead && Math.abs(s.x - p.x) < p.hw + 0.15 && Math.abs(s.z - p.z) < p.hw + 0.15 && s.y > p.y - 0.1 && s.y < p.y + p.h + 0.1) { p.hurt(s.dmg, s.x - s.vx, s.z - s.vz); done = true; }
        } else {
          for (const e of this.list) {
            if (Math.abs(s.x - e.x) < e.hw + 0.2 && Math.abs(s.z - e.z) < e.hw + 0.2 && s.y > e.y - 0.1 && s.y < e.y + e.h + 0.1) { this.hurt(e, s.dmg, s.x - s.vx, s.z - s.vz, true); done = true; break; }
          }
        }
      }
      s.life -= dt;
      if (done || s.life <= 0) { g.render.scene.remove(s.mesh); s.mesh.material.dispose(); this.shots.splice(i, 1); continue; }
      s.mesh.position.set(s.x, s.y, s.z);
      s.mesh.lookAt(s.x + s.vx, s.y + s.vy, s.z + s.vz);
      if (s.kind === 'ember') s.mesh.rotation.set(s.life * 6, s.life * 4, 0);
    }
  }

  /* Nearest creature hit by a ray, within maxD. */
  raycast(ox, oy, oz, dx, dy, dz, maxD) {
    let best = null, bestT = maxD;
    for (const e of this.list) {
      const x0 = e.x - e.hw - 0.1, x1 = e.x + e.hw + 0.1, y0 = e.y, y1 = e.y + e.h, z0 = e.z - e.hw - 0.1, z1 = e.z + e.hw + 0.1;
      let t0 = 0, t1 = bestT, ok = true;
      for (const [o, d, a, b] of [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]]) {
        if (Math.abs(d) < 1e-8) { if (o < a || o > b) { ok = false; break; } continue; }
        let ta = (a - o) / d, tb = (b - o) / d;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 < bestT) { bestT = t0; best = e; }
    }
    return best ? { e: best, dist: bestT } : null;
  }

  /* ---------- per-frame update ---------- */
  update(dt) {
    const g = this.game, w = g.world, p = g.player;
    this.trySpawnNatural(dt);
    const day = g.render.dayFactor > 0.75;
    const camYaw = p.yaw;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.dead) { this.list.splice(i, 1); continue; }
      const d = e.def;
      e.age += dt;
      const dx = p.x - e.x, dz = p.z - e.z, dy = p.y - e.y;
      const dist = Math.hypot(dx, dz);
      if (dist > (e.home ? 120 : 96)) { this.remove(e); this.list.splice(i, 1); continue; }
      if (!w.getChunk(Math.floor(e.x) >> 4, Math.floor(e.z) >> 4)) continue;
      const inWater = w.getBlock(Math.floor(e.x), Math.floor(e.y + 0.35), Math.floor(e.z)) === B.WATER;

      /* monsters of the night fade when the sun is up */
      if (d.night && !e.home && day) {
        e.dayT += dt;
        if (e.dayT > 4 + (e.rand() * 6)) { g.render.burst(e.x, e.y + e.h / 2, e.z, [0.3, 0.28, 0.4], 12, 3, 0.14); this.remove(e); this.list.splice(i, 1); continue; }
      }

      let speed = 0, face = null;
      e.cool -= dt;
      if (e.alert > 0) e.alert -= dt;
      const aggro = d.kind === 'monster' && !p.dead && (dist < d.aggro || e.alert > 0) && Math.abs(dy) < 14 && dist < 40;
      if (aggro) {
        face = Math.atan2(dx, dz);
        if (d.ranged) {
          const want = d.fly ? 7 : 11;
          if (dist > want + 3) { e.mx = dx / dist; e.mz = dz / dist; speed = d.speed; }
          else if (dist < want - 3) { e.mx = -dx / dist; e.mz = -dz / dist; speed = d.speed * 0.8; }
          else { const sgn = (Math.floor(e.age / 3) % 2) ? 1 : -1; e.mx = -dz / dist * sgn; e.mz = dx / dist * sgn; speed = d.speed * 0.5; }
          if (e.home && !d.fly) { const hd = Math.hypot(e.home.x - e.x, e.home.z - e.z); if (hd > 6) { e.mx = (e.home.x - e.x) / hd; e.mz = (e.home.z - e.z) / hd; speed = d.speed * 0.6; } }
          if (e.cool <= 0 && dist < 24) {
            e.cool = d.cooldown * (0.8 + Math.random() * 0.4); e.swing = 1;
            const sy = e.y + e.h * 0.8, ty = p.y + 1.2;
            const sp = d.ranged === 'arrow' ? 22 : 11;
            const t = dist / sp;
            let ax = dx, ay = ty - sy + (d.ranged === 'arrow' ? 7 * t * t : 0), az = dz;
            const L = Math.hypot(ax, ay, az) || 1;
            this.shoot(d.ranged, e.x, sy, e.z, ax / L + (Math.random() - 0.5) * 0.06, ay / L + (Math.random() - 0.5) * 0.04, az / L + (Math.random() - 0.5) * 0.06, sp, d.dmg, 'mob');
            g.audio.play('bow');
          }
        } else {
          if (dist > d.reach * 0.6) { e.mx = dx / dist; e.mz = dz / dist; speed = d.speed; }
          if (dist < d.reach && dy > -e.h - 0.5 && dy < e.h + 0.6 && e.cool <= 0) {
            e.cool = d.boss ? 1.4 : 1.0; e.swing = 1;
            p.hurt(d.dmg, e.x, e.z);
          }
        }
      } else if (e.flee > 0) {
        e.flee -= dt;
        if (dist > 0.01) { e.mx = -dx / dist; e.mz = -dz / dist; }
        speed = d.speed * 2.3;
      } else {
        e.wanderT -= dt;
        if (e.wanderT <= 0) {
          if (e.home && Math.hypot(e.home.x - e.x, e.home.z - e.z) > (d.kind === 'villager' ? 12 : 5)) {
            const hd = Math.hypot(e.home.x - e.x, e.home.z - e.z);
            e.mx = (e.home.x - e.x) / hd; e.mz = (e.home.z - e.z) / hd; e.wanderT = 2; e.moving = true;
          } else if (Math.random() < 0.55) { e.moving = false; e.wanderT = 1 + Math.random() * 3.5; }
          else { const a = Math.random() * 6.283; e.mx = Math.sin(a); e.mz = Math.cos(a); e.moving = true; e.wanderT = 1 + Math.random() * 2.5; }
        }
        if (e.moving) speed = d.speed * (d.kind === 'monster' ? 0.4 : 1);
      }

      /* movement */
      const decay = Math.exp(-dt * 5);
      e.px *= decay; e.pz *= decay;
      if (d.fly) {
        const ty = aggro ? p.y + 2.6 : (w.surfaceY(Math.floor(e.x), Math.floor(e.z)) + 3);
        e.vx = lerp(e.vx, e.mx * speed, dt * 3) + e.px * dt * 8; e.vz = lerp(e.vz, e.mz * speed, dt * 3) + e.pz * dt * 8;
        e.vy = lerp(e.vy, clamp(ty - e.y, -2.5, 2.5), dt * 3);
      } else if (d.hop) {
        e.vy -= 26 * dt;
        e.hopT -= dt;
        if (e.grounded) {
          e.vx = e.px; e.vz = e.pz;
          if (speed > 0 && e.hopT <= 0) { e.hopT = aggro ? 0.55 : 1.4; e.vy = 7.6; e.vx = e.mx * speed; e.vz = e.mz * speed; g.audio.playAt('hop', dist); }
        }
        if (inWater) e.vy = Math.max(e.vy, 3);
      } else {
        e.vx = e.mx * speed + e.px; e.vz = e.mz * speed + e.pz;
        e.vy -= 26 * dt;
        if (inWater) { e.vy = Math.min(e.vy + 60 * dt, 2.6); e.vx *= 0.6; e.vz *= 0.6; }
        else if (e.grounded && e.blocked && speed > 0) e.vy = 8.2;
      }
      if (e.vy < -40) e.vy = -40;
      moveBody(w, e, dt);
      e.grounded = e.onGround; e.blocked = e.hitWall;
      if (e.y < -10) { this.remove(e); this.list.splice(i, 1); continue; }

      /* visuals */
      const moving = Math.hypot(e.vx, e.vz);
      if (face === null && moving > 0.2) face = Math.atan2(e.vx, e.vz);
      if (face !== null) {
        let diff = face - e.faceYaw;
        while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
        e.faceYaw += diff * Math.min(1, dt * 9);
      }
      e.group.position.set(e.x, e.y, e.z);
      e.group.rotation.y = e.faceYaw;
      e.walk += moving * dt * (d.hw < 0.3 ? 5 : 2.6);
      const sw = Math.sin(e.walk) * Math.min(1, moving) * 0.7;
      if (e.legs.length === 4) { e.legs[0].rotation.x = sw; e.legs[3].rotation.x = sw; e.legs[1].rotation.x = -sw; e.legs[2].rotation.x = -sw; }
      else if (e.legs.length === 2) { e.legs[0].rotation.x = sw; e.legs[1].rotation.x = -sw; }
      if (e.swing > 0) e.swing = Math.max(0, e.swing - dt * 3.2);
      if (e.arms.length) {
        const raise = aggro && !d.ranged ? -1.25 : 0;
        e.arms[0].rotation.x = -sw + raise * (d.held ? 0 : 1);
        e.arms[1].rotation.x = sw * (d.held ? 0.3 : 1) + (d.held ? -0.5 - (aggro ? 0.5 : 0) : raise) - Math.sin(e.swing * Math.PI) * 1.4;
      }
      if (d.hop) { const sq = clamp(1 + e.vy * 0.03, 0.7, 1.3); e.group.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)); }
      if (e.orbit) { e.orbit.rotation.y += dt * 3; e.group.position.y += Math.sin(e.age * 2.4) * 0.12; }
      if (e.flash > 0) {
        e.flash -= dt;
        const on = e.flash > 0;
        for (const m of e.mats) m.emissive.setRGB(on ? 0.75 : 0, on ? 0.1 : 0, on ? 0.1 : 0);
      }
      /* health bar once damaged */
      if (e.hp < d.hp) {
        if (!e.bar) {
          e.bar = new THREE.Group();
          const sc = 1 / (e.group.scale.y || 1);
          const bg = new THREE.Mesh(boxGeo(0.84, 0.1, 0.02), new THREE.MeshBasicMaterial({ color: 0x1a1c22, fog: false }));
          const fg = new THREE.Mesh(boxGeo(0.8, 0.06, 0.03), new THREE.MeshBasicMaterial({ color: d.kind === 'monster' ? 0xe5484d : 0x6fcf6a, fog: false }));
          e.bar.add(bg, fg); e.barFg = fg;
          e.bar.position.y = (d.h + 0.35) * (d.hop ? 1 : sc); e.bar.scale.setScalar(d.hop ? 1 : sc);
          e.group.add(e.bar);
        }
        const k = clamp(e.hp / d.hp, 0, 1);
        e.barFg.scale.x = Math.max(0.001, k); e.barFg.position.x = -(1 - k) * 0.4;
        e.bar.rotation.y = camYaw - e.faceYaw;
      }
    }
    this.updateShots(dt);
  }
}
