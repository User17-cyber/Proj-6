'use strict';
/* Chunk storage, block edits, ray casting and box physics. */

function chunkKey(cx, cz) { return (cx + 100000) * 400000 + (cz + 100000); }

class World {
  constructor(seed) {
    this.seed = seed | 0;
    this.gen = new WorldGen(seed);
    this.chunks = new Map();
    this.edits = new Map();      // chunkKey -> Map(index -> block id)
    this.chests = new Map();     // "x,y,z" -> array of 27 stacks
    this.chestLoot = new Map();  // "x,y,z" -> loot table for unopened structure chests
    this.urgent = new Set();     // chunks that must be re-meshed this frame
  }

  getChunk(cx, cz) { return this.chunks.get(chunkKey(cx, cz)); }

  ensureChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (c) return c;
    const g = this.gen.generate(cx, cz, this);
    c = { cx, cz, key, data: g.data, tint: g.tint, biomes: g.biomes, hm: new Uint8Array(CHUNK * CHUNK), lights: [], crops: new Set(), dirty: true, mesh: null, meshT: null, maxY: 0 };
    const ed = this.edits.get(key);
    if (ed) for (const [i, id] of ed) c.data[i] = id;
    this.scanChunk(c);
    this.chunks.set(key, c);
    return c;
  }

  /* Rebuild the height map, light list and growing-crop list of a chunk. */
  scanChunk(c) {
    const data = c.data, hm = c.hm;
    hm.fill(0);
    c.lights.length = 0;
    c.crops.clear();
    let maxY = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      const id = data[i];
      if (id === 0) continue;
      const y = (i / 256) | 0, col = i & 255;
      if (y > maxY) maxY = y;
      if (IS_OPAQUE[id] && hm[col] === 0) hm[col] = y + 1;
      if (BLOCK_LIGHT[id] > 0) c.lights.push([c.cx * CHUNK + (col & 15), y, c.cz * CHUNK + (col >> 4), BLOCK_LIGHT[id]]);
      else if (id >= B.WHEAT_0 && id <= B.PUMPKIN_3 && BLOCKS[id].stage < 3) c.crops.add(i);
    }
    c.maxY = maxY;
  }

  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= WORLD_H) return B.AIR;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c) return B.STONE;
    return c.data[(y * CHUNK + (z & 15)) * CHUNK + (x & 15)];
  }

  setBlock(x, y, z, id) {
    if (y < 1 || y >= WORLD_H) return false;
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return false;
    const lx = x & 15, lz = z & 15, i = (y * CHUNK + lz) * CHUNK + lx;
    const old = c.data[i];
    if (old === id) return false;
    c.data[i] = id;
    let ed = this.edits.get(c.key);
    if (!ed) { ed = new Map(); this.edits.set(c.key, ed); }
    ed.set(i, id);
    const lit = BLOCK_LIGHT[old] > 0 || BLOCK_LIGHT[id] > 0;
    this.scanChunk(c);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!lit && ((dx === -1 && lx > 0) || (dx === 1 && lx < 15) || (dz === -1 && lz > 0) || (dz === 1 && lz < 15))) continue;
      const n = this.chunks.get(chunkKey(cx + dx, cz + dz));
      if (n) { n.dirty = true; this.urgent.add(n); }
    }
    return true;
  }

  /* Feet height of the highest standable spot in a column, or -1 if the chunk is not loaded. */
  surfaceY(x, z) {
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c) return -1;
    const col = (z & 15) * CHUNK + (x & 15);
    for (let y = Math.min(c.maxY, WORLD_H - 1); y > 0; y--) {
      if (IS_SOLID[c.data[y * 256 + col]]) return y + 1;
    }
    return 1;
  }

  /* Rough light level 0..1 at a point (used to shade the held item and creatures). */
  skyExposure(x, y, z) {
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c) return 1;
    const h = c.hm[(z & 15) * CHUNK + (x & 15)];
    return y >= h ? 1 : Math.max(0.2, 0.66 - (h - y) * 0.04);
  }

  /* Voxel ray cast. Returns the first block hit that is not air or water. */
  raycast(ox, oy, oz, dx, dy, dz, maxD) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tx = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tdx : Infinity;
    let ty = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tdy : Infinity;
    let tz = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 256; i++) {
      const id = this.getBlock(x, y, z);
      if (id !== B.AIR && id !== B.WATER) return { x, y, z, nx, ny, nz, id, dist: t };
      if (tx < ty && tx < tz) { t = tx; tx += tdx; x += sx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { t = ty; ty += tdy; y += sy; nx = 0; ny = -sy; nz = 0; }
      else { t = tz; tz += tdz; z += sz; nx = 0; ny = 0; nz = -sz; }
      if (t > maxD) return null;
    }
    return null;
  }

  /* Highest top of any solid block overlapping the box, or -1 if the box is free. */
  boxHit(x0, y0, z0, x1, y1, z1) {
    const ax = Math.floor(x0), bx = Math.floor(x1), ay = Math.floor(y0), by = Math.floor(y1), az = Math.floor(z0), bz = Math.floor(z1);
    let top = -1;
    for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
      const id = this.getBlock(x, y, z);
      if (!IS_SOLID[id]) continue;
      const t = y + BLOCKS[id].height;
      if (t > y0 && t > top) top = t;
    }
    return top;
  }

  /* Advance growing crops near a point. Called about once a second. */
  growCrops(px, pz, rng) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    const grown = [];
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      const c = this.getChunk(pcx + dx, pcz + dz);
      if (!c || c.crops.size === 0) continue;
      for (const i of c.crops) if (rng() < 0.045) grown.push([c, i]);
    }
    for (const [c, i] of grown) {
      const id = c.data[i];
      if (!isCropBlock(id) || BLOCKS[id].stage >= 3) continue;
      const y = (i / 256) | 0, col = i & 255;
      this.setBlock(c.cx * CHUNK + (col & 15), y, c.cz * CHUNK + (col >> 4), id + 1);
    }
  }

  serializeEdits() {
    const out = {};
    for (const [key, ed] of this.edits) {
      const arr = [];
      for (const [i, id] of ed) arr.push(i, id);
      out[key] = arr;
    }
    return out;
  }
  loadEdits(obj) {
    this.edits.clear();
    for (const key in obj) {
      const arr = obj[key], m = new Map();
      for (let k = 0; k < arr.length; k += 2) m.set(arr[k], arr[k + 1]);
      this.edits.set(Number(key), m);
    }
  }
}

/* Move a body (feet-centred box) through the world with sliding collisions.
   b: { x, y, z, vx, vy, vz, hw, h } ; sets onGround / hitWall / hitCeil. */
function moveBody(world, b, dt) {
  const EPS = 0.001;
  const top = Math.max(Math.abs(b.vx), Math.abs(b.vy), Math.abs(b.vz)) * dt;
  const steps = Math.max(1, Math.ceil(top / 0.4));
  const sdt = dt / steps;
  b.hitWall = false; b.onGround = false; b.hitCeil = false;
  for (let s = 0; s < steps; s++) {
    if (b.vx !== 0) {
      b.x += b.vx * sdt;
      if (world.boxHit(b.x - b.hw, b.y + EPS, b.z - b.hw, b.x + b.hw, b.y + b.h, b.z + b.hw) >= 0) {
        b.x = b.vx > 0 ? Math.floor(b.x + b.hw) - b.hw - EPS : Math.floor(b.x - b.hw) + 1 + b.hw + EPS;
        b.vx = 0; b.hitWall = true;
      }
    }
    if (b.vz !== 0) {
      b.z += b.vz * sdt;
      if (world.boxHit(b.x - b.hw, b.y + EPS, b.z - b.hw, b.x + b.hw, b.y + b.h, b.z + b.hw) >= 0) {
        b.z = b.vz > 0 ? Math.floor(b.z + b.hw) - b.hw - EPS : Math.floor(b.z - b.hw) + 1 + b.hw + EPS;
        b.vz = 0; b.hitWall = true;
      }
    }
    if (b.vy !== 0) {
      b.y += b.vy * sdt;
      const hit = world.boxHit(b.x - b.hw, b.y, b.z - b.hw, b.x + b.hw, b.y + b.h, b.z + b.hw);
      if (hit >= 0) {
        if (b.vy < 0) { b.y = hit; b.onGround = true; }
        else { b.y = Math.floor(b.y + b.h) - b.h - EPS; b.hitCeil = true; }
        b.vy = 0;
      }
    }
  }
}
