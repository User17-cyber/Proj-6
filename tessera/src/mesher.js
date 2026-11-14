'use strict';
/* Turns a chunk into two vertex buffers (solid and see-through). Only visible faces are emitted.
   Each vertex carries: position, colour, face uv, and [pattern + tile hash, shade, sky light, block light]. */

const PW = CHUNK + 2, PA = PW * PW, PH = WORLD_H + 2;
const meshPad = new Uint8Array(PA * PH);
const meshHm = new Uint8Array(PA);

class MeshBuf {
  constructor(cap) {
    this.cap = cap; this.n = 0; this.ni = 0;
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3);
    this.uv = new Float32Array(cap * 2); this.dat = new Float32Array(cap * 4);
    this.idx = new Uint32Array(cap * 1.5);
  }
  reset() { this.n = 0; this.ni = 0; }
  ensure(extra) {
    if (this.n + extra <= this.cap) return;
    const cap = Math.max(this.cap * 2, this.n + extra);
    const grow = (a, k, T) => { const b = new T(cap * k); b.set(a); return b; };
    this.pos = grow(this.pos, 3, Float32Array); this.col = grow(this.col, 3, Float32Array);
    this.uv = grow(this.uv, 2, Float32Array); this.dat = grow(this.dat, 4, Float32Array);
    this.idx = grow(this.idx, 1.5, Uint32Array);
    this.cap = cap;
  }
  vert(x, y, z, r, g, b, u, v, d0, d1, d2, d3) {
    const n = this.n, p = n * 3, q = n * 4;
    this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z;
    this.col[p] = r; this.col[p + 1] = g; this.col[p + 2] = b;
    this.uv[n * 2] = u; this.uv[n * 2 + 1] = v;
    this.dat[q] = d0; this.dat[q + 1] = d1; this.dat[q + 2] = d2; this.dat[q + 3] = d3;
    this.n = n + 1;
  }
  quad(flip) {
    const n = this.n - 4, i = this.ni, idx = this.idx;
    if (flip) { idx[i] = n + 1; idx[i + 1] = n + 2; idx[i + 2] = n + 3; idx[i + 3] = n + 1; idx[i + 4] = n + 3; idx[i + 5] = n; }
    else { idx[i] = n; idx[i + 1] = n + 1; idx[i + 2] = n + 2; idx[i + 3] = n; idx[i + 4] = n + 2; idx[i + 5] = n + 3; }
    this.ni = i + 6;
  }
  take() {
    return { n: this.n, pos: this.pos.slice(0, this.n * 3), col: this.col.slice(0, this.n * 3), uv: this.uv.slice(0, this.n * 2), dat: this.dat.slice(0, this.n * 4), idx: this.idx.slice(0, this.ni) };
  }
}
const bufO = new MeshBuf(40000), bufT = new MeshBuf(8000);

/* Faces: +x, -x, +y, -y, +z, -z. Corners run counter-clockwise seen from outside. */
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.8 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.8 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.58 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.9 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.9 },
];
const FACE_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
const AO_LEVEL = [0.56, 0.72, 0.87, 1.0];
for (const f of FACES) {
  f.off = f.n[1] * PA + f.n[2] * PW + f.n[0];
  f.ao = f.c.map((c) => {
    const d = [0, 0, 0], axes = [0, 1, 2].filter((a) => f.n[a] === 0);
    const o = (v) => v[1] * PA + v[2] * PW + v[0];
    const s1 = f.n.slice(), s2 = f.n.slice(), cr = f.n.slice();
    s1[axes[0]] += c[axes[0]] ? 1 : -1; s2[axes[1]] += c[axes[1]] ? 1 : -1;
    cr[axes[0]] += c[axes[0]] ? 1 : -1; cr[axes[1]] += c[axes[1]] ? 1 : -1;
    return [o(s1), o(s2), o(cr), d];
  });
}

/* Small box-built shapes, in 1/16ths of a block: [x0,y0,z0, x1,y1,z1, colour index, pattern]. */
const GREEN = [0.36, 0.63, 0.3], DKGREEN = [0.27, 0.5, 0.26], IRONC = [0.22, 0.23, 0.27];
const SHAPES = {};
function shape(id, colors, boxes) { SHAPES[id] = { colors, boxes }; }
shape(B.TALL_GRASS, [null], [[3, 0, 4, 5, 9, 6, 0], [7, 0, 9, 9, 13, 11, 0], [11, 0, 3, 13, 7, 5, 0], [10, 0, 11, 12, 10, 13, 0]]);
for (const id of [B.FLOWER_RED, B.FLOWER_YELLOW, B.FLOWER_BLUE, B.FLOWER_WHITE, B.FLOWER_PINK]) {
  shape(id, [GREEN, BLOCKS[id].color, [1, 0.9, 0.45]], [[7, 0, 7, 9, 8, 9, 0], [9, 3, 7, 12, 4, 9, 0], [5, 8, 5, 11, 12, 11, 1], [7, 12, 7, 9, 13, 9, 2]]);
}
shape(B.DEAD_BUSH, [BLOCKS[B.DEAD_BUSH].color], [[7, 0, 7, 9, 7, 9, 0], [3, 6, 7, 7, 8, 9, 0], [3, 8, 7, 5, 12, 9, 0], [9, 5, 7, 13, 7, 9, 0], [11, 7, 7, 13, 11, 9, 0], [7, 7, 4, 9, 12, 6, 0]]);
const STALKS = [[3, 3], [11, 4], [7, 7], [4, 11], [11, 11]];
for (let s = 0; s < 4; s++) {
  const h = [4, 8, 12, 14][s];
  const wc = s < 3 ? [lerp(0.4, 0.62, s / 3), 0.68, 0.3] : [0.86, 0.72, 0.3];
  const wb = STALKS.map(([x, z]) => [x, 0, z, x + 2, h, z + 2, 0]);
  if (s === 3) STALKS.forEach(([x, z]) => wb.push([x - 0.5, h - 5, z - 0.5, x + 2.5, h - 1, z + 2.5, 1]));
  shape(B.WHEAT_0 + s, [wc, [0.8, 0.62, 0.22]], wb);
  const lh = [3, 5, 7, 8][s];
  const tufts = [[4, 4], [10, 5], [5, 10], [11, 11]];
  const cb = tufts.map(([x, z]) => [x, 0, z, x + 2, lh, z + 2, 0]);
  const bb = tufts.map(([x, z]) => [x, 0, z, x + 2, lh + 1, z + 2, 0]);
  if (s === 3) tufts.forEach(([x, z]) => { cb.push([x - 1, 0, z - 1, x + 3, 2, z + 3, 1]); bb.push([x - 1.5, 0, z - 1.5, x + 3.5, 3, z + 3.5, 1]); });
  shape(B.CARROT_0 + s, [GREEN, BLOCKS[B.CARROT_0].color], cb);
  shape(B.BEET_0 + s, [DKGREEN, BLOCKS[B.BEET_0].color], bb);
}
shape(B.PUMPKIN_0, [GREEN], [[7, 0, 7, 9, 3, 9, 0]]);
shape(B.PUMPKIN_1, [GREEN, DKGREEN], [[7, 0, 7, 9, 5, 9, 0], [4, 0, 6, 12, 1, 10, 1]]);
shape(B.PUMPKIN_2, [[0.62, 0.66, 0.28], GREEN, DKGREEN], [[4, 0, 4, 12, 7, 12, 0, PAT.RIBS], [7, 7, 7, 9, 9, 9, 1], [1, 0, 6, 15, 1, 10, 2]]);
shape(B.PUMPKIN_3, [BLOCKS[B.PUMPKIN_0].color, GREEN], [[2, 0, 2, 14, 11, 14, 0, PAT.RIBS], [7, 11, 7, 9, 13, 9, 1]]);
shape(B.LANTERN, [IRONC, BLOCKS[B.LANTERN].color], [[5, 0, 5, 11, 1, 11, 0], [5.5, 1, 5.5, 10.5, 8, 10.5, 1, PAT.GLOW], [5, 8, 5, 11, 9, 11, 0], [7, 9, 7, 9, 10.5, 9, 0]]);
shape(B.BED, [BLOCKS[B.PLANKS].color, BLOCKS[B.BED].color], [[0, 0, 0, 16, 4, 16, 0, PAT.PLANK], [0, 4, 0, 16, 9, 16, 1, PAT.BED_TOP]]);
shape(B.CHEST, [BLOCKS[B.CHEST].color], [[1, 0, 1, 15, 14, 15, 0, PAT.CHEST]]);
shape(B.CACTUS, [BLOCKS[B.CACTUS].color], [[1, 0, 1, 15, 16, 15, 0, PAT.RIBS]]);

function meshChunk(world, chunk) {
  const cx = chunk.cx, cz = chunk.cz;
  /* Gather this chunk and a one-block border from its neighbours. */
  const nb = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) nb.push(world.getChunk(cx + dx, cz + dz));
  let maxY = 0;
  const lights = [];
  for (const c of nb) {
    if (!c) return null;
    if (c.maxY > maxY) maxY = c.maxY;
    for (const l of c.lights) lights.push(l[0] - cx * CHUNK, l[1], l[2] - cz * CHUNK, l[3]);
  }
  const topY = Math.min(maxY + 1, WORLD_H - 1);
  const pad = meshPad, hm = meshHm;
  pad.fill(B.BEDROCK, 0, PA);
  pad.fill(0, PA, PA * (topY + 3));
  for (let pz = 0; pz < PW; pz++) for (let px = 0; px < PW; px++) {
    const sx = px === 0 ? 0 : px === PW - 1 ? 2 : 1, sz = pz === 0 ? 0 : pz === PW - 1 ? 2 : 1;
    const src = nb[sz * 3 + sx];
    const col = ((pz - 1) & 15) * CHUNK + ((px - 1) & 15);
    const data = src.data, pi = pz * PW + px;
    hm[pi] = src.hm[col];
    const lim = Math.min(src.maxY, topY);
    for (let y = 0; y <= lim; y++) pad[(y + 1) * PA + pi] = data[y * 256 + col];
  }

  const O = bufO, T = bufT;
  O.reset(); T.reset();
  const tint = chunk.tint;
  const nLights = lights.length;
  const dirt = BLOCKS[B.DIRT].color;

  const skyAt = (px, pz, y) => {
    const h0 = hm[pz * PW + px];
    if (y >= h0) return 1;
    if ((px > 0 && y >= hm[pz * PW + px - 1]) || (px < PW - 1 && y >= hm[pz * PW + px + 1]) ||
      (pz > 0 && y >= hm[(pz - 1) * PW + px]) || (pz < PW - 1 && y >= hm[(pz + 1) * PW + px])) return 0.8;
    return Math.max(0.2, 0.66 - (h0 - y) * 0.04);
  };
  const lampAt = (x, y, z) => {
    let best = 0;
    for (let i = 0; i < nLights; i += 4) {
      const dx = lights[i] + 0.5 - x, dy = lights[i + 1] + 0.5 - y, dz = lights[i + 2] + 0.5 - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 144) continue;
      const v = lights[i + 3] * (1 - Math.sqrt(d2) / 12);
      if (v > best) best = v;
    }
    return best;
  };

  /* Emit an unculled box (used by plants, crops, chests, beds, lanterns). */
  const box = (buf, bx, by, bz, s, r, g, b, pat, sky, skipBottom) => {
    const x0 = bx + s[0] / 16, y0 = by + s[1] / 16, z0 = bz + s[2] / 16, x1 = bx + s[3] / 16, y1 = by + s[4] / 16, z1 = bz + s[5] / 16;
    const lamp = nLights ? lampAt(bx + 0.5, by + 0.5, bz + 0.5) : 0;
    for (let f = 0; f < 6; f++) {
      if (f === 3 && skipBottom) continue;
      const F = FACES[f];
      buf.ensure(4);
      for (let k = 0; k < 4; k++) {
        const c = F.c[k];
        const vx = c[0] ? x1 : x0, vy = c[1] ? y1 : y0, vz = c[2] ? z1 : z0;
        let u, v;
        if (f < 2) { u = vz - bz; v = vy - by; } else if (f < 4) { u = vx - bx; v = 1 - (vz - bz); } else { u = vx - bx; v = vy - by; }
        buf.vert(vx, vy, vz, r, g, b, u, v, pat, F.shade, sky, lamp);
      }
      buf.quad(false);
    }
  };

  for (let y = 1; y <= topY; y++) {
    for (let z = 0; z < CHUNK; z++) {
      const rowBase = (y + 1) * PA + (z + 1) * PW + 1;
      for (let x = 0; x < CHUNK; x++) {
        const p = rowBase + x;
        const id = pad[p];
        if (id === 0) continue;
        const d = BLOCKS[id];
        const li = (z * CHUNK + x) * 3;
        const hsh = (Math.imul(x + cx * 16, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z + cz * 16, 83492791)) >>> 0;
        const tile = (hsh >>> 8) & 255;
        const jit = 0.955 + ((hsh & 255) / 255) * 0.09;

        if (d.shape !== 'cube') {
          const sh = SHAPES[id];
          if (!sh) continue;
          const sky = skyAt(x + 1, z + 1, y);
          const ox = d.shape === 'plant' ? ((hsh >>> 16) & 3) / 16 - 0.09 : 0, oz = d.shape === 'plant' ? ((hsh >>> 18) & 3) / 16 - 0.09 : 0;
          for (const s of sh.boxes) {
            let c = sh.colors[s[6]];
            let r, g, b;
            if (c === null) { r = tint[li] / 255; g = tint[li + 1] / 255; b = tint[li + 2] / 255; }
            else { r = c[0]; g = c[1]; b = c[2]; }
            const k = d.shape === 'plant' ? 0.9 + ((hsh >>> (s[0] & 7)) & 7) / 40 : 1;
            box(O, x + ox, y, z + oz, s, r * k, g * k, b * k, (s[7] || 0) + tile * 64, sky, d.shape !== 'box');
          }
          continue;
        }

        const isWater = id === B.WATER, isAlpha = d.alpha;
        const buf = isAlpha ? T : O;
        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const nid = pad[p + F.off];
          if (IS_OPAQUE[nid] || (isAlpha && nid === id)) continue;
          /* colour */
          let c, pat;
          if (f === 2) { c = d.top || d.color; pat = d.patTop !== null ? d.patTop : d.pat; }
          else if (f === 3) { c = d.bottom || d.color; pat = d.patBottom !== null ? d.patBottom : d.pat; }
          else { c = d.color; pat = d.pat; }
          let r = c[0], g = c[1], b = c[2];
          if (d.tint === 'grass' && f !== 3) { r = tint[li] / 255; g = tint[li + 1] / 255; b = tint[li + 2] / 255; }
          else if (d.tint === 'leaf') { r = tint[li] / 255 * 0.7; g = tint[li + 1] / 255 * 0.82; b = tint[li + 2] / 255 * 0.72; }
          if (!isWater) { r *= jit; g *= jit; b *= jit; }
          const ax = x + 1 + F.n[0], az = z + 1 + F.n[2], ay = y + F.n[1];
          const sky = skyAt(ax, az, ay);
          const lower = isWater && f !== 3 && pad[p + PA] !== B.WATER ? 0.875 : 1;
          buf.ensure(4);
          let a0 = 3, a1 = 3, a2 = 3, a3 = 3;
          for (let k = 0; k < 4; k++) {
            const cr = F.c[k], ao = F.ao[k];
            let lvl = 3;
            if (!isAlpha) {
              const s1 = IS_OPAQUE[pad[p + ao[0]]], s2 = IS_OPAQUE[pad[p + ao[1]]];
              lvl = s1 && s2 ? 0 : 3 - s1 - s2 - IS_OPAQUE[pad[p + ao[2]]];
            }
            if (k === 0) a0 = lvl; else if (k === 1) a1 = lvl; else if (k === 2) a2 = lvl; else a3 = lvl;
            const vx = x + cr[0], vy = y + (cr[1] ? lower : 0), vz = z + cr[2];
            const lamp = nLights ? lampAt(vx + F.n[0] * 0.4, vy + F.n[1] * 0.4, vz + F.n[2] * 0.4) : 0;
            buf.vert(vx, vy, vz, r, g, b, FACE_UV[k][0], FACE_UV[k][1], pat + tile * 64, F.shade * AO_LEVEL[lvl], sky, lamp);
          }
          buf.quad(a0 + a2 < a1 + a3);
        }
      }
    }
  }
  return { o: O.take(), t: T.take(), minY: 0, maxY: topY + 1 };
}
