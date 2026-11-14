'use strict';
/* Endless terrain: climate -> biome -> height, caves, ores, trees, plants and structure sites.
   Everything is a pure function of the world seed and the coordinates, so any chunk can be
   generated at any time, in any order. */

const BIOME = { OCEAN: 0, BEACH: 1, MEADOW: 2, FOREST: 3, BLOSSOM: 4, DESERT: 5, STEPPE: 6, FROST: 7, MIRE: 8, HIGHLANDS: 9, REDROCK: 10 };
const BIOME_INFO = [
  { name: 'Open Sea', blurb: 'Deep water in every direction.' },
  { name: 'Shore', blurb: 'Sand between land and sea.' },
  { name: 'Meadow', blurb: 'Open grass, flowers and grazing herds.' },
  { name: 'Deepwood', blurb: 'Dense oak forest. Plenty of timber.' },
  { name: 'Blossom Grove', blurb: 'Pale trees under pink canopies.' },
  { name: 'Dune Sea', blurb: 'Hot sand, cactus and sandstone.' },
  { name: 'Amber Steppe', blurb: 'Dry golden grass and flat-topped trees.' },
  { name: 'Frost Fields', blurb: 'Snow, pines and frozen lakes.' },
  { name: 'Mire', blurb: 'Low wetland of mud, clay and hanging leaves.' },
  { name: 'Highlands', blurb: 'Bare stone peaks capped with snow.' },
  { name: 'Redrock Canyons', blurb: 'Terraced mesas of banded rock.' },
];
const SPAWN_BIOMES = [BIOME.MEADOW, BIOME.FOREST, BIOME.BLOSSOM, BIOME.DESERT, BIOME.STEPPE, BIOME.FROST, BIOME.MIRE, BIOME.HIGHLANDS, BIOME.REDROCK];

/* Places. The more a place helps the player, the larger the area (in chunks) that holds just one of it.
   Sites are claimed in this order, so the rarer places fit themselves around the commoner ones. */
const STRUCT_TYPES = [
  { type: 'town', name: 'Town', region: 12, margin: 3, radius: 36, blend: 14, slope: 14, salt: 2311, benefit: 'Helpful: shelter, farms, supplies' },
  { type: 'fortress', name: 'Fortress', region: 18, margin: 3, radius: 24, blend: 12, slope: 14, salt: 5701, benefit: 'Strong loot: iron arms and armour' },
  { type: 'castle', name: 'Castle', region: 28, margin: 4, radius: 34, blend: 14, slope: 16, salt: 9103, benefit: 'Greatest treasure: prism gear in the vault' },
];
const SITE_PTS = [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];

class WorldGen {
  constructor(seed) {
    this.seed = seed | 0;
    const s = this.seed;
    this.nCont = new Simplex(s + 11);
    this.nRug = new Simplex(s + 23);
    this.nHill = new Simplex(s + 37);
    this.nTemp = new Simplex(s + 41);
    this.nMoist = new Simplex(s + 53);
    this.nWeird = new Simplex(s + 67);
    this.nRidge = new Simplex(s + 71);
    this.nJit = new Simplex(s + 83);
    this.nCave1 = new Simplex(s + 97);
    this.nCave2 = new Simplex(s + 101);
    this.nCave3 = new Simplex(s + 113);
    this.structCache = new Map();
    this.tmp = {};
    this.tmp2 = {};
  }

  /* Natural terrain and climate at a column (ignores structures). */
  sample(x, z, o) {
    const cont = this.nCont.fbm2(x / 430, z / 430, 3) + 0.14;
    const rug = this.nRug.fbm2(x / 310, z / 310, 2) * 0.5 + 0.5;
    const hills = this.nHill.fbm2(x / 96, z / 96, 3);
    const jit = this.nJit.noise2(x / 14, z / 14) * 0.03;
    const temp = this.nTemp.fbm2(x / 330, z / 330, 2) + jit;
    const moist = this.nMoist.fbm2(x / 290 + 31.7, z / 290 - 12.3, 2) - jit;
    const weird = this.nWeird.noise2(x / 230, z / 230) + jit;

    const land = smoothstep(-0.22, 0.02, cont);
    let base;
    if (cont < -0.22) base = SEA - 5 - smoothstep(0, 0.45, -0.22 - cont) * 18;
    else base = SEA - 5 + land * 8 + Math.max(0, cont - 0.02) * 15;

    const hot = smoothstep(0.2, 0.3, temp);
    const cold = 1 - smoothstep(-0.3, -0.22, temp);
    const mireF = smoothstep(0.2, 0.34, moist) * (1 - smoothstep(0.5, 0.62, rug)) * (1 - cold) * (1 - hot);
    const redF = hot * smoothstep(0.05, 0.25, weird) * (1 - smoothstep(0.1, 0.3, moist));
    const desertF = hot * (1 - smoothstep(-0.08, 0.06, moist)) * (1 - redF);

    let amp = 2 + rug * rug * 24 + redF * 9;
    amp = lerp(amp, amp * 0.5 + 1, desertF);
    let h = base + hills * amp * land;
    const mount = smoothstep(0.58, 0.84, rug);
    if (mount > 0) {
      const ridge = 1 - Math.abs(this.nRidge.noise2(x / 170, z / 170));
      h += mount * ridge * ridge * 42 * land;
    }
    if (mireF > 0) h = lerp(h, SEA + 0.7 + hills * 1.7, mireF * land * 0.88);
    if (redF > 0 && h > SEA + 2) {
      const t = h / 6, f = t - Math.floor(t);
      h = lerp(h, (Math.floor(t) + smoothstep(0.72, 1, f)) * 6, redF);
    }
    h = clamp(h, 3, WORLD_H - 8);
    const hv = Math.round(h);

    let biome;
    if (hv < SEA) biome = BIOME.OCEAN;
    else if (hv <= SEA + 1 && mireF < 0.5) biome = BIOME.BEACH;
    else if (mount > 0.38 || hv > SEA + 36) biome = BIOME.HIGHLANDS;
    else if (cold > 0.5) biome = BIOME.FROST;
    else if (mireF > 0.5) biome = BIOME.MIRE;
    else if (hot > 0.5) biome = redF > 0.5 ? BIOME.REDROCK : moist < -0.01 ? BIOME.DESERT : moist < 0.3 ? BIOME.STEPPE : BIOME.FOREST;
    else if (moist > 0.06) biome = weird < -0.3 ? BIOME.BLOSSOM : BIOME.FOREST;
    else biome = weird < -0.38 ? BIOME.BLOSSOM : BIOME.MEADOW;

    /* Grass colour drifts with climate, so biomes shade into each other. */
    const t = clamp((temp + 0.45) / 0.9, 0, 1), m = clamp((moist + 0.4) / 0.8, 0, 1);
    const mr = lerp(0.55, 0.36, m), mg = lerp(0.76, 0.7, m), mb = lerp(0.36, 0.34, m);
    let r, g, b;
    if (t < 0.5) { const k = t * 2; r = lerp(0.62, mr, k); g = lerp(0.8, mg, k); b = lerp(0.68, mb, k); }
    else { const k = (t - 0.5) * 2; r = lerp(mr, lerp(0.82, 0.34, m), k); g = lerp(mg, lerp(0.74, 0.68, m), k); b = lerp(mb, lerp(0.36, 0.24, m), k); }
    if (mireF > 0) { r = lerp(r, 0.36, mireF); g = lerp(g, 0.5, mireF); b = lerp(b, 0.28, mireF); }
    if (biome === BIOME.BLOSSOM) { r += 0.03; g += 0.04; }

    o.h = hv; o.biome = biome; o.temp = temp; o.moist = moist; o.mount = mount;
    o.r = r; o.g = g; o.b = b;
    return o;
  }

  /* ---------- structure sites ---------- */
  structureFor(ti, rx, rz) {
    const key = ti * 1e12 + (rx + 5e5) * 1e6 + (rz + 5e5);
    const hit = this.structCache.get(key);
    if (hit !== undefined) return hit;
    const T = STRUCT_TYPES[ti];
    const rng = mulberry32(hashInt(this.seed + T.salt, rx, rz));
    const span = T.region - 2 * T.margin;
    const o = {};
    let result = null;
    for (let attempt = 0; attempt < 12 && !result; attempt++) {
      const cx = rx * T.region + T.margin + Math.floor(rng() * span);
      const cz = rz * T.region + T.margin + Math.floor(rng() * span);
      const x = cx * CHUNK + 8, z = cz * CHUNK + 8;
      let lo = 1e9, hi = -1e9, sum = 0, ok = true;
      for (const [dx, dz] of SITE_PTS) {
        const h = this.sample(x + dx * T.radius, z + dz * T.radius, o).h;
        if (h < SEA + 2 || h > WORLD_H - 40) { ok = false; break; }
        if (h < lo) lo = h; if (h > hi) hi = h; sum += h;
      }
      if (!ok || hi - lo > T.slope) continue;
      for (let tj = 0; tj < ti && ok; tj++) {
        const U = STRUCT_TYPES[tj];
        const reach = T.radius + T.blend + U.radius + U.blend + 10;
        const seen = new Set();
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const ux = floorDiv(floorDiv(x + sx * reach, CHUNK), U.region), uz = floorDiv(floorDiv(z + sz * reach, CHUNK), U.region);
          const k2 = ux + ',' + uz;
          if (seen.has(k2)) continue;
          seen.add(k2);
          const s2 = this.structureFor(tj, ux, uz);
          if (s2 && Math.max(Math.abs(s2.x - x), Math.abs(s2.z - z)) < reach) ok = false;
        }
      }
      if (!ok) continue;
      result = { type: T.type, name: T.name, ti, x, z, y: Math.round(sum / SITE_PTS.length), radius: T.radius, blend: T.blend, id: key, spawns: null, biome: this.sample(x, z, o).biome };
    }
    this.structCache.set(key, result);
    return result;
  }
  structureForChunk(ti, cx, cz) {
    const T = STRUCT_TYPES[ti];
    return this.structureFor(ti, floorDiv(cx, T.region), floorDiv(cz, T.region));
  }
  /* Structures whose flattened ground can reach this chunk. */
  structsForChunk(cx, cz) {
    const list = [];
    const x0 = cx * CHUNK - 4, x1 = cx * CHUNK + CHUNK + 4, z0 = cz * CHUNK - 4, z1 = cz * CHUNK + CHUNK + 4;
    for (let ti = 0; ti < STRUCT_TYPES.length; ti++) {
      const s = this.structureForChunk(ti, cx, cz);
      if (!s) continue;
      const reach = s.radius + s.blend;
      if (s.x + reach < x0 || s.x - reach > x1 || s.z + reach < z0 || s.z - reach > z1) continue;
      list.push(s);
    }
    return list;
  }
  /* Nearest structure of a type, searching the surrounding regions. */
  nearestStructure(ti, x, z, rings) {
    const T = STRUCT_TYPES[ti];
    const rx = floorDiv(floorDiv(x, CHUNK), T.region), rz = floorDiv(floorDiv(z, CHUNK), T.region);
    let best = null, bestD = Infinity;
    const R = rings === undefined ? 2 : rings;
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const s = this.structureFor(ti, rx + dx, rz + dz);
      if (!s) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best ? { s: best, dist: bestD } : null;
  }

  flatten(o, x, z, structs) {
    o.site = 0;
    for (const s of structs) {
      const d = Math.max(Math.abs(x - s.x), Math.abs(z - s.z));
      if (d >= s.radius + s.blend) continue;
      const w = 1 - smoothstep(s.radius, s.radius + s.blend, d);
      o.h = Math.round(lerp(o.h, s.y, w));
      if (d <= s.radius + 2) { o.site = 1; if (o.biome === BIOME.OCEAN || o.biome === BIOME.BEACH) o.biome = s.biome; }
    }
    return o;
  }
  /* Final column info including structure flattening. */
  column(x, z, o) {
    this.sample(x, z, o);
    const cx = floorDiv(x, CHUNK), cz = floorDiv(z, CHUNK);
    return this.flatten(o, x, z, this.structsForChunk(cx, cz));
  }
  heightAt(x, z) { return this.column(Math.floor(x), Math.floor(z), this.tmp2).h; }
  biomeAt(x, z) { return this.column(Math.floor(x), Math.floor(z), this.tmp2).biome; }

  isCave(x, y, z, h) {
    if (y < 2 || y > h) return false;
    if (y > SEA - 5 && h < SEA + 6) return false;
    if (y > h - 3 && h < SEA + 6) return false;
    const a = this.nCave1.noise3(x / 44, y / 27, z / 44);
    if (a > -0.16 && a < 0.16) {
      const b = this.nCave2.noise3(x / 44 + 9.3, y / 27 + 3.1, z / 44 - 4.1);
      if (a * a + b * b < 0.0105) return true;
    }
    if (y < 34 && this.nCave3.noise3(x / 58, y / 30, z / 58) > 0.7) return true;
    return false;
  }

  /* Pick a spawn point inside the requested biome. */
  findSpawn(biome) {
    const rng = mulberry32(this.seed ^ 0x51ed27);
    const ox = Math.floor((rng() - 0.5) * 4000), oz = Math.floor((rng() - 0.5) * 4000);
    const o = {};
    let fallback = null;
    for (let i = 0; i < 9000; i++) {
      const rad = 20 + Math.sqrt(i) * 70, ang = i * 2.399963;
      const x = Math.floor(ox + Math.cos(ang) * rad), z = Math.floor(oz + Math.sin(ang) * rad);
      this.sample(x, z, o);
      if (o.h <= SEA + 1) continue;
      if (!fallback) fallback = { x, z };
      if (o.biome !== biome) continue;
      this.column(x, z, o);
      if (o.h <= SEA + 1 || o.site || o.biome !== biome) continue;
      let ok = true;
      for (const [dx, dz] of [[14, 0], [-14, 0], [0, 14], [0, -14]]) {
        this.column(x + dx, z + dz, o);
        if (o.biome !== biome || o.site) { ok = false; break; }
      }
      if (ok) return { x, z, biome };
    }
    const f = fallback || { x: ox, z: oz };
    return { x: f.x, z: f.z, biome: this.biomeAt(f.x, f.z) };
  }

  /* ---------- chunk generation ---------- */
  generate(cx, cz, world) {
    const data = new Uint8Array(CHUNK * CHUNK * WORLD_H);
    const tint = new Uint8Array(CHUNK * CHUNK * 3);
    const biomes = new Uint8Array(CHUNK * CHUNK);
    const seed = this.seed;
    const X0 = cx * CHUNK, Z0 = cz * CHUNK;
    const structs = this.structsForChunk(cx, cz);
    const PAD = 3, W = CHUNK + PAD * 2;
    const colH = new Int16Array(W * W), colB = new Uint8Array(W * W), colS = new Uint8Array(W * W);
    const o = this.tmp;

    for (let pz = 0; pz < W; pz++) for (let px = 0; px < W; px++) {
      const x = X0 + px - PAD, z = Z0 + pz - PAD;
      this.sample(x, z, o);
      this.flatten(o, x, z, structs);
      const ci = pz * W + px;
      colH[ci] = o.h; colB[ci] = o.biome; colS[ci] = o.site;
      if (px < PAD || pz < PAD || px >= PAD + CHUNK || pz >= PAD + CHUNK) continue;
      const lx = px - PAD, lz = pz - PAD, li = lz * CHUNK + lx;
      tint[li * 3] = clamp(o.r, 0, 1) * 255; tint[li * 3 + 1] = clamp(o.g, 0, 1) * 255; tint[li * 3 + 2] = clamp(o.b, 0, 1) * 255;
      biomes[li] = o.biome;
      const h = o.h, biome = o.biome, site = o.site;

      let top = B.GRASS, fill = B.DIRT, depth = 3;
      switch (biome) {
        case BIOME.OCEAN: top = h < SEA - 9 ? B.CLAY : B.SAND; fill = B.SAND; if (rand2(seed + 5, x >> 2, z >> 2) < 0.2) top = B.CLAY; break;
        case BIOME.BEACH: top = B.SAND; fill = B.SAND; break;
        case BIOME.DESERT: top = B.SAND; fill = B.SAND; depth = 4; break;
        case BIOME.FROST: top = B.SNOW; break;
        case BIOME.MIRE: if (h <= SEA) { top = rand2(seed + 6, x >> 1, z >> 1) < 0.4 ? B.CLAY : B.MUD; fill = B.MUD; } break;
        case BIOME.HIGHLANDS:
          if (h > SEA + 40 + rand2(seed + 8, x, z) * 3) { top = B.SNOW; fill = B.STONE; }
          else if (h > SEA + 24 + rand2(seed + 8, x, z) * 4 || o.mount > 0.7) { top = B.STONE; fill = B.STONE; }
          break;
        case BIOME.REDROCK: top = B.REDROCK; fill = B.REDROCK; depth = 12; break;
        default: break;
      }
      for (let y = 0; y <= h; y++) {
        let id;
        if (y === 0) id = B.BEDROCK;
        else if (y === h) id = top;
        else if (y >= h - depth) {
          id = fill;
          if (biome === BIOME.DESERT && y < h - 2) id = B.SANDSTONE;
          else if (biome === BIOME.REDROCK) { const band = (y + ((x >> 3) & 1)) % 7; id = band === 2 ? B.SANDSTONE : band === 5 ? B.CLAY : B.REDROCK; }
        } else id = B.STONE;
        if (y > 0 && !(site && y > h - 7) && this.isCave(x, y, z, h)) continue;
        data[(y * CHUNK + lz) * CHUNK + lx] = id;
      }
      if (h < SEA) {
        for (let y = h + 1; y <= SEA; y++) data[(y * CHUNK + lz) * CHUNK + lx] = B.WATER;
        if (o.temp < -0.26) data[(SEA * CHUNK + lz) * CHUNK + lx] = B.ICE;
      }
    }

    /* Ore veins: short random walks through stone. */
    const rng = mulberry32(hashInt(seed + 301, cx, cz));
    const vein = (id, count, yMin, yMax, lenMin, lenMax) => {
      for (let v = 0; v < count; v++) {
        let x = Math.floor(rng() * CHUNK), z = Math.floor(rng() * CHUNK), y = yMin + Math.floor(rng() * (yMax - yMin));
        const len = lenMin + Math.floor(rng() * (lenMax - lenMin + 1));
        for (let s = 0; s < len; s++) {
          if (x >= 0 && x < CHUNK && z >= 0 && z < CHUNK && y > 0 && y < WORLD_H) {
            const i = (y * CHUNK + z) * CHUNK + x;
            if (data[i] === B.STONE) data[i] = id;
          }
          const dir = Math.floor(rng() * 6);
          if (dir === 0) x++; else if (dir === 1) x--; else if (dir === 2) z++; else if (dir === 3) z--; else if (dir === 4) y++; else y--;
        }
      }
    };
    vein(B.COAL_ORE, 9, 6, 72, 4, 11);
    vein(B.IRON_ORE, 7, 4, 50, 3, 8);
    vein(B.PRISM_ORE, 2, 3, 20, 2, 5);

    const setIn = (x, y, z, id, soft) => {
      const lx = x - X0, lz = z - Z0;
      if (lx < 0 || lz < 0 || lx >= CHUNK || lz >= CHUNK || y < 1 || y >= WORLD_H) return;
      const i = (y * CHUNK + lz) * CHUNK + lx;
      if (soft && data[i] !== B.AIR) return;
      data[i] = id;
    };

    /* Trees may start outside this chunk and hang into it, so scan a padded area. */
    for (let pz = 0; pz < W; pz++) for (let px = 0; px < W; px++) {
      const ci = pz * W + px;
      const h = colH[ci], biome = colB[ci];
      if (colS[ci] || h <= SEA) continue;
      const x = X0 + px - PAD, z = Z0 + pz - PAD;
      const r = rand2(seed + 401, x, z);
      let kind = null;
      switch (biome) {
        case BIOME.FOREST: if (r < 0.05) kind = r < 0.007 ? 'bigoak' : 'oak'; break;
        case BIOME.MEADOW: if (r < 0.0035) kind = 'oak'; break;
        case BIOME.BLOSSOM: if (r < 0.03) kind = 'blossom'; break;
        case BIOME.STEPPE: if (r < 0.006) kind = 'flat'; break;
        case BIOME.FROST: if (r < 0.014) kind = 'pine'; break;
        case BIOME.MIRE: if (r < 0.022 && h > SEA) kind = 'willow'; break;
        case BIOME.HIGHLANDS: if (r < 0.012 && h < SEA + 26) kind = 'pine'; break;
        case BIOME.DESERT: if (r < 0.007) kind = 'cactus'; break;
        case BIOME.REDROCK: if (r < 0.004) kind = 'cactus'; break;
        default: break;
      }
      if (!kind) continue;
      if (this.isCave(x, h, z, h)) continue;
      stampTree(kind, x, h + 1, z, mulberry32(hashInt(seed + 409, x, z)), setIn);
    }

    /* Ground cover. */
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
      const ci = (lz + PAD) * W + lx + PAD;
      const h = colH[ci], biome = colB[ci];
      if (colS[ci] || h < SEA || h + 1 >= WORLD_H) continue;
      const gi = (h * CHUNK + lz) * CHUNK + lx, ai = gi + CHUNK * CHUNK;
      if (data[ai] !== B.AIR) continue;
      const ground = data[gi];
      const x = X0 + lx, z = Z0 + lz;
      const r = rand2(seed + 503, x, z), r2 = rand2(seed + 509, x, z);
      let id = 0;
      if (ground === B.GRASS) {
        const patch = this.nJit.noise2(x / 9 + 50, z / 9 - 50);
        switch (biome) {
          case BIOME.MEADOW:
            if (r < 0.2) id = B.TALL_GRASS;
            else if (r < 0.2 + (patch > 0.3 ? 0.12 : 0.012)) id = [B.FLOWER_RED, B.FLOWER_YELLOW, B.FLOWER_BLUE, B.FLOWER_WHITE][Math.floor(r2 * 4)];
            else if (r > 0.9975) id = B.PUMPKIN_3;
            else if (r > 0.995) id = B.CARROT_3;
            break;
          case BIOME.FOREST: if (r < 0.1) id = B.TALL_GRASS; else if (r < 0.112) id = r2 < 0.5 ? B.FLOWER_BLUE : B.FLOWER_RED; else if (r > 0.997) id = B.BEET_3; break;
          case BIOME.BLOSSOM: if (r < 0.12) id = B.TALL_GRASS; else if (r < 0.2) id = r2 < 0.6 ? B.FLOWER_PINK : B.FLOWER_WHITE; break;
          case BIOME.STEPPE: if (r < 0.28) id = B.TALL_GRASS; else if (r < 0.29) id = B.FLOWER_YELLOW; else if (r < 0.3) id = B.DEAD_BUSH; else if (r > 0.997) id = B.WHEAT_3; break;
          case BIOME.MIRE: if (r < 0.22) id = B.TALL_GRASS; else if (r < 0.23) id = B.FLOWER_BLUE; else if (r > 0.996) id = B.BEET_3; break;
          case BIOME.HIGHLANDS: if (r < 0.08) id = B.TALL_GRASS; else if (r < 0.09) id = B.FLOWER_WHITE; break;
          default: if (r < 0.06) id = B.TALL_GRASS; break;
        }
      } else if (ground === B.SAND && biome === BIOME.DESERT) { if (r < 0.012) id = B.DEAD_BUSH; }
      else if (ground === B.REDROCK) { if (r < 0.01) id = B.DEAD_BUSH; }
      else if (ground === B.SNOW && biome === BIOME.FROST) { if (r < 0.012) id = B.FLOWER_WHITE; else if (r < 0.02) id = B.DEAD_BUSH; }
      if (id) data[ai] = id;
    }

    /* Towns, fortresses and castles. */
    for (const s of structs) {
      const reach = s.radius + 4;
      if (s.x + reach < X0 || s.x - reach >= X0 + CHUNK || s.z + reach < Z0 || s.z - reach >= Z0 + CHUNK) continue;
      const stamp = new Stamp(data, X0, Z0, s, mulberry32(hashInt(seed + 601, s.x, s.z)), world);
      STRUCT_BUILDERS[s.type](stamp);
      if (!s.spawns) s.spawns = stamp.spawns;
    }
    return { data, tint, biomes };
  }
}

function stampTree(kind, x, y, z, rng, set) {
  const blob = (cy, rad, id, cut) => {
    for (let dy = -rad; dy <= rad; dy++) for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
      const d = dx * dx + dz * dz + dy * dy * 1.6;
      if (d > rad * rad + cut) continue;
      set(x + dx, cy + dy, z + dz, id, true);
    }
  };
  const layer = (ly, rad, id, trim) => {
    for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
      if (trim && Math.abs(dx) === rad && Math.abs(dz) === rad && (trim > 1 || rng() < 0.6)) continue;
      set(x + dx, ly, z + dz, id, true);
    }
  };
  if (kind === 'cactus') {
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) set(x, y + i, z, B.CACTUS, true);
    return;
  }
  if (kind === 'oak') {
    const th = 4 + Math.floor(rng() * 3);
    layer(y + th - 2, 2, B.LEAVES, 1); layer(y + th - 1, 2, B.LEAVES, 1); layer(y + th, 1, B.LEAVES, 0); layer(y + th + 1, 1, B.LEAVES, 2);
    for (let i = 0; i < th; i++) set(x, y + i, z, B.LOG);
  } else if (kind === 'bigoak') {
    const th = 7 + Math.floor(rng() * 3);
    blob(y + th, 3, B.LEAVES, 1.5);
    blob(y + th - 3, 2, B.LEAVES, 0.5);
    for (let i = 0; i < th; i++) set(x, y + i, z, B.LOG);
    set(x + 1, y, z, B.LOG, true); set(x - 1, y, z, B.LOG, true); set(x, y, z + 1, B.LOG, true); set(x, y, z - 1, B.LOG, true);
  } else if (kind === 'pine') {
    const th = 7 + Math.floor(rng() * 4);
    for (let ly = 2 + Math.floor(rng() * 2); ly <= th; ly++) {
      const d = th + 1 - ly;
      layer(y + ly, clamp(Math.floor(d * 0.5) + (d % 2), 0, 3), B.PINE_LEAVES, 2);
    }
    set(x, y + th + 1, z, B.PINE_LEAVES, true); set(x, y + th + 2, z, B.PINE_LEAVES, true);
    for (let i = 0; i < th; i++) set(x, y + i, z, B.PINE_LOG);
  } else if (kind === 'blossom') {
    const th = 4 + Math.floor(rng() * 2);
    layer(y + th - 1, 3, B.BLOSSOM_LEAVES, 2); layer(y + th, 3, B.BLOSSOM_LEAVES, 1); layer(y + th + 1, 2, B.BLOSSOM_LEAVES, 1); layer(y + th + 2, 1, B.BLOSSOM_LEAVES, 0);
    for (let k = 0; k < 5; k++) { const dx = Math.floor(rng() * 7) - 3, dz = Math.floor(rng() * 7) - 3; if (Math.abs(dx) + Math.abs(dz) < 6) set(x + dx, y + th - 2, z + dz, B.BLOSSOM_LEAVES, true); }
    for (let i = 0; i < th + 1; i++) set(x, y + i, z, B.PALE_LOG);
  } else if (kind === 'flat') {
    const th = 5 + Math.floor(rng() * 2);
    layer(y + th, 3, B.LEAVES, 2); layer(y + th + 1, 2, B.LEAVES, 1);
    for (let i = 0; i < th + 1; i++) set(x, y + i, z, B.LOG);
    const bx = rng() < 0.5 ? 1 : -1;
    set(x + bx, y + th - 1, z, B.LOG); set(x + bx * 2, y + th, z, B.LOG);
  } else if (kind === 'willow') {
    const th = 5 + Math.floor(rng() * 2);
    layer(y + th - 1, 3, B.LEAVES, 2); layer(y + th, 2, B.LEAVES, 1); layer(y + th + 1, 1, B.LEAVES, 0);
    for (let k = 0; k < 9; k++) {
      const a = Math.floor(rng() * 4), t = Math.floor(rng() * 5) - 2, n = 1 + Math.floor(rng() * 3);
      const dx = a === 0 ? 3 : a === 1 ? -3 : t, dz = a === 2 ? 3 : a === 3 ? -3 : t;
      for (let i = 1; i <= n; i++) set(x + dx, y + th - 1 - i, z + dz, B.LEAVES, true);
    }
    for (let i = 0; i < th; i++) set(x, y + i, z, B.LOG);
  }
}
