// Static world: heightfield terrain, colliders, walkable platforms and water.
// Built deterministically from a map definition (see mapgen.ts) on both client and server.

import { clamp } from '../math';

export class Heightfield {
  readonly size: number;     // world extent (metres)
  readonly res: number;      // cells per side
  readonly cell: number;
  readonly origin: number;   // world coordinate of sample 0
  readonly n: number;        // samples per side (res + 1)
  readonly h: Float32Array;
  /** per-sample surface paint for the renderer: dirt, cobble, sand, rock (0..255) */
  readonly paint: Uint8Array;

  constructor(size: number, res: number) {
    this.size = size; this.res = res; this.cell = size / res; this.origin = -size / 2;
    this.n = res + 1;
    this.h = new Float32Array(this.n * this.n);
    this.paint = new Uint8Array(this.n * this.n * 4);
  }
  idx(ix: number, iz: number) { return iz * this.n + ix; }
  sx(ix: number) { return this.origin + ix * this.cell; }
  /** Bilinear height. */
  height(x: number, z: number): number {
    const fx = clamp((x - this.origin) / this.cell, 0, this.res - 1e-4);
    const fz = clamp((z - this.origin) / this.cell, 0, this.res - 1e-4);
    const ix = fx | 0, iz = fz | 0;
    const tx = fx - ix, tz = fz - iz;
    const n = this.n, h = this.h;
    const i = iz * n + ix;
    const a = h[i], b = h[i + 1], c = h[i + n], d = h[i + n + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }
  normal(x: number, z: number, out: { x: number; y: number; z: number }) {
    const e = this.cell;
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    const l = Math.sqrt(hx * hx + 4 * e * e + hz * hz);
    out.x = -hx / l; out.y = (2 * e) / l; out.z = -hz / l;
    return out;
  }
}

export interface BoxCollider { kind: 0; cx: number; cz: number; hx: number; hz: number; rot: number; c: number; s: number; y0: number; y1: number; mat: number }
export interface CylCollider { kind: 1; cx: number; cz: number; r: number; y0: number; y1: number; mat: number }
export type Collider = BoxCollider | CylCollider;

/** Walkable surface (bridge deck, ramp, rubble slope, wall stair). Top height varies linearly along local z. */
export interface Platform { cx: number; cz: number; hx: number; hz: number; rot: number; c: number; s: number; h0: number; h1: number }

export interface WaterBody { level: number; minX: number; maxX: number; minZ: number; maxZ: number; kind: 'moat' | 'river' | 'sea' | 'pond' }

/** Collider surface material, used for impact sounds/effects. */
export const MAT_STONE = 0, MAT_WOOD = 1, MAT_EARTH = 2, MAT_METAL = 3, MAT_CLOTH = 4;

export function makeBox(cx: number, cz: number, hx: number, hz: number, rot: number, y0: number, y1: number, mat = MAT_STONE): BoxCollider {
  return { kind: 0, cx, cz, hx, hz, rot, c: Math.cos(rot), s: Math.sin(rot), y0, y1, mat };
}
export function makeCyl(cx: number, cz: number, r: number, y0: number, y1: number, mat = MAT_STONE): CylCollider {
  return { kind: 1, cx, cz, r, y0, y1, mat };
}
export function makePlatform(cx: number, cz: number, hx: number, hz: number, rot: number, h0: number, h1 = h0): Platform {
  return { cx, cz, hx, hz, rot, c: Math.cos(rot), s: Math.sin(rot), h0, h1 };
}

const GRID = 8;

export class StaticWorld {
  readonly terrain: Heightfield;
  readonly colliders: Collider[] = [];
  readonly platforms: Platform[] = [];
  readonly water: WaterBody[] = [];
  bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
  private grid: Int32Array[] = [];
  private pgrid: Int32Array[] = [];
  private gw = 0;
  private gOrigin = 0;

  constructor(terrain: Heightfield) { this.terrain = terrain; }

  /** Build the spatial acceleration grids. Call after all colliders/platforms are added. */
  finalize() {
    const size = this.terrain.size;
    this.gOrigin = -size / 2;
    this.gw = Math.ceil(size / GRID);
    const buckets: number[][] = Array.from({ length: this.gw * this.gw }, () => []);
    const pbuckets: number[][] = Array.from({ length: this.gw * this.gw }, () => []);
    const addAabb = (b: number[][], i: number, minX: number, maxX: number, minZ: number, maxZ: number) => {
      const x0 = clamp(Math.floor((minX - this.gOrigin) / GRID), 0, this.gw - 1);
      const x1 = clamp(Math.floor((maxX - this.gOrigin) / GRID), 0, this.gw - 1);
      const z0 = clamp(Math.floor((minZ - this.gOrigin) / GRID), 0, this.gw - 1);
      const z1 = clamp(Math.floor((maxZ - this.gOrigin) / GRID), 0, this.gw - 1);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) b[z * this.gw + x].push(i);
    };
    this.colliders.forEach((c, i) => {
      if (c.kind === 1) addAabb(buckets, i, c.cx - c.r, c.cx + c.r, c.cz - c.r, c.cz + c.r);
      else {
        const ex = Math.abs(c.c) * c.hx + Math.abs(c.s) * c.hz;
        const ez = Math.abs(c.s) * c.hx + Math.abs(c.c) * c.hz;
        addAabb(buckets, i, c.cx - ex, c.cx + ex, c.cz - ez, c.cz + ez);
      }
    });
    this.platforms.forEach((p, i) => {
      const ex = Math.abs(p.c) * p.hx + Math.abs(p.s) * p.hz;
      const ez = Math.abs(p.s) * p.hx + Math.abs(p.c) * p.hz;
      addAabb(pbuckets, i, p.cx - ex, p.cx + ex, p.cz - ez, p.cz + ez);
    });
    this.grid = buckets.map((b) => Int32Array.from(b));
    this.pgrid = pbuckets.map((b) => Int32Array.from(b));
  }

  cellList(x: number, z: number): Int32Array | null {
    const gx = Math.floor((x - this.gOrigin) / GRID), gz = Math.floor((z - this.gOrigin) / GRID);
    if (gx < 0 || gz < 0 || gx >= this.gw || gz >= this.gw) return null;
    return this.grid[gz * this.gw + gx];
  }

  /** Visit colliders whose grid cells overlap the AABB around (x,z) with radius r. */
  forColliders(x: number, z: number, r: number, fn: (c: Collider) => void) {
    const x0 = clamp(Math.floor((x - r - this.gOrigin) / GRID), 0, this.gw - 1);
    const x1 = clamp(Math.floor((x + r - this.gOrigin) / GRID), 0, this.gw - 1);
    const z0 = clamp(Math.floor((z - r - this.gOrigin) / GRID), 0, this.gw - 1);
    const z1 = clamp(Math.floor((z + r - this.gOrigin) / GRID), 0, this.gw - 1);
    const stamp = ++this.stamp;
    for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
      const list = this.grid[gz * this.gw + gx];
      for (let k = 0; k < list.length; k++) {
        const i = list[k];
        if (this.marks[i] === stamp) continue;
        this.marks[i] = stamp;
        fn(this.colliders[i]);
      }
    }
  }
  private stamp = 0;
  private marksArr: Int32Array | null = null;
  private get marks(): Int32Array {
    if (!this.marksArr || this.marksArr.length < this.colliders.length) this.marksArr = new Int32Array(this.colliders.length + 16);
    return this.marksArr;
  }

  /** Top of the highest platform under (x,z) that is not above maxY, or -Infinity. */
  platformTop(x: number, z: number, maxY: number): number {
    const gx = Math.floor((x - this.gOrigin) / GRID), gz = Math.floor((z - this.gOrigin) / GRID);
    if (gx < 0 || gz < 0 || gx >= this.gw || gz >= this.gw) return -Infinity;
    const list = this.pgrid[gz * this.gw + gx];
    let best = -Infinity;
    for (let k = 0; k < list.length; k++) {
      const p = this.platforms[list[k]];
      const dx = x - p.cx, dz = z - p.cz;
      const lx = dx * p.c - dz * p.s;
      const lz = dx * p.s + dz * p.c;
      if (lx < -p.hx || lx > p.hx || lz < -p.hz || lz > p.hz) continue;
      const top = p.h0 + (p.h1 - p.h0) * ((lz + p.hz) / (2 * p.hz));
      if (top <= maxY && top > best) best = top;
    }
    return best;
  }

  waterAt(x: number, z: number): WaterBody | null {
    for (const w of this.water) if (x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ) return w;
    return null;
  }

  /** Ground height for a character whose feet are at y (it can step up `step`). */
  groundAt(x: number, z: number, y: number, step = 0.6): number {
    const t = this.terrain.height(x, z);
    const p = this.platformTop(x, z, y + step);
    return p > t ? p : t;
  }

  /** Is (x,z) standable ground at roughly height y? (rejects deep water). */
  walkable(x: number, z: number, y: number): boolean {
    if (x < this.bounds.minX || x > this.bounds.maxX || z < this.bounds.minZ || z > this.bounds.maxZ) return false;
    const t = this.terrain.height(x, z);
    const p = this.platformTop(x, z, y + 0.8);
    if (p > -Infinity && p >= t - 0.01) return true;
    const w = this.waterAt(x, z);
    if (w && t < w.level - 0.85) return false;
    return true;
  }

  /** Water depth at a point (0 when dry or on a platform). */
  waterDepth(x: number, z: number, y: number): number {
    const w = this.waterAt(x, z);
    if (!w) return 0;
    const g = this.groundAt(x, z, y);
    return Math.max(0, w.level - g);
  }

  /**
   * Push a vertical cylinder (feet at y, height hgt, radius r) out of static colliders.
   * Returns true if any collision happened. Mutates pos.
   */
  resolveCylinder(pos: { x: number; y: number; z: number }, r: number, hgt: number, step = 0.55): boolean {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      this.forColliders(pos.x, pos.z, r + 0.1, (c) => {
        if (c.y1 <= pos.y + step || c.y0 >= pos.y + hgt) return;
        if (c.kind === 1) {
          const dx = pos.x - c.cx, dz = pos.z - c.cz;
          const d2 = dx * dx + dz * dz, rr = c.r + r;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 1e-4;
            const push = rr - d;
            pos.x += (dx / d) * push; pos.z += (dz / d) * push;
            moved = true;
          }
        } else {
          const dx = pos.x - c.cx, dz = pos.z - c.cz;
          // into local frame (inverse rotation)
          const lx = dx * c.c - dz * c.s;
          const lz = dx * c.s + dz * c.c;
          const qx = clamp(lx, -c.hx, c.hx), qz = clamp(lz, -c.hz, c.hz);
          let ox = lx - qx, oz = lz - qz;
          const d2 = ox * ox + oz * oz;
          let nlx = 0, nlz = 0, push = 0;
          if (d2 > 1e-10) {
            if (d2 >= r * r) return;
            const d = Math.sqrt(d2);
            nlx = ox / d; nlz = oz / d; push = r - d;
          } else {
            // centre inside the box: push out along the axis of least penetration
            const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
            if (px < pz) { nlx = Math.sign(lx) || 1; push = px + r; }
            else { nlz = Math.sign(lz) || 1; push = pz + r; }
          }
          // back to world
          const nx = nlx * c.c + nlz * c.s;
          const nz = -nlx * c.s + nlz * c.c;
          pos.x += nx * push; pos.z += nz * push;
          moved = true;
          ox = oz = 0;
        }
      });
      if (!moved) break;
      hit = true;
    }
    return hit;
  }

  /** Is a point inside any collider (used for blade/wall contact and spawn checks)? */
  pointBlocked(x: number, y: number, z: number, pad = 0): boolean {
    let blocked = false;
    this.forColliders(x, z, pad + 0.1, (c) => {
      if (blocked || y < c.y0 || y > c.y1) return;
      if (c.kind === 1) {
        const dx = x - c.cx, dz = z - c.cz;
        if (dx * dx + dz * dz < (c.r + pad) ** 2) blocked = true;
      } else {
        const dx = x - c.cx, dz = z - c.cz;
        const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
        if (Math.abs(lx) < c.hx + pad && Math.abs(lz) < c.hz + pad) blocked = true;
      }
    });
    return blocked;
  }

  /**
   * Segment raycast against terrain, platforms (as boxes 0.3m thick) and colliders.
   * Returns parametric t in [0,1] of the first hit, or -1. Writes the surface normal.
   */
  raycast(ax: number, ay: number, az: number, bx: number, by: number, bz: number, normal?: { x: number; y: number; z: number }, matOut?: { mat: number }): number {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    let best = 2;
    let nx = 0, ny = 1, nz = 0, mat = MAT_EARTH;
    // colliders: visit cells along the segment
    const len = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.max(1, Math.ceil(len / (GRID * 0.5)));
    const stamp = ++this.stamp;
    const marks = this.marks;
    for (let si = 0; si <= steps; si++) {
      const t = si / steps;
      const px = ax + dx * t, pz = az + dz * t;
      const x0 = Math.floor((px - this.gOrigin) / GRID), z0 = Math.floor((pz - this.gOrigin) / GRID);
      for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
        const gx = x0 + ox, gz = z0 + oz;
        if (gx < 0 || gz < 0 || gx >= this.gw || gz >= this.gw) continue;
        const list = this.grid[gz * this.gw + gx];
        for (let k = 0; k < list.length; k++) {
          const ci = list[k];
          if (marks[ci] === stamp) continue;
          marks[ci] = stamp;
          const c = this.colliders[ci];
          const r = c.kind === 1
            ? rayCyl(ax, ay, az, dx, dy, dz, c)
            : rayBox(ax, ay, az, dx, dy, dz, c);
          if (r >= 0 && r < best) { best = r; nx = _n.x; ny = _n.y; nz = _n.z; mat = c.mat; }
        }
      }
    }
    // terrain: march
    const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const nSteps = Math.max(2, Math.ceil(segLen / 0.4));
    let prevT = 0;
    let prevAbove = ay - this.groundAt(ax, az, ay) ;
    for (let i = 1; i <= nSteps; i++) {
      const t = i / nSteps;
      if (t > best) break;
      const px = ax + dx * t, py = ay + dy * t, pz = az + dz * t;
      const g = this.groundAt(px, pz, py);
      const above = py - g;
      if (above < 0) {
        // refine
        let lo = prevT, hi = t;
        for (let k = 0; k < 6; k++) {
          const m = (lo + hi) * 0.5;
          const mx = ax + dx * m, my = ay + dy * m, mz = az + dz * m;
          if (my - this.groundAt(mx, mz, my) < 0) hi = m; else lo = m;
        }
        if (hi < best) {
          best = hi;
          const hx = ax + dx * hi, hz = az + dz * hi;
          this.terrain.normal(hx, hz, _n);
          nx = _n.x; ny = _n.y; nz = _n.z; mat = MAT_EARTH;
          if (this.platformTop(hx, hz, ay + dy * hi + 0.1) > this.terrain.height(hx, hz)) { nx = 0; ny = 1; nz = 0; mat = MAT_WOOD; }
        }
        break;
      }
      prevAbove = above; prevT = t;
    }
    void prevAbove;
    if (best > 1) return -1;
    if (normal) { normal.x = nx; normal.y = ny; normal.z = nz; }
    if (matOut) matOut.mat = mat;
    return best;
  }

  /** Line of sight between two points (eye heights included by caller). */
  los(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    return this.raycast(ax, ay, az, bx, by, bz) < 0;
  }
}

const _n = { x: 0, y: 1, z: 0 };

function rayCyl(ax: number, ay: number, az: number, dx: number, dy: number, dz: number, c: CylCollider): number {
  const mx = ax - c.cx, mz = az - c.cz;
  const a = dx * dx + dz * dz;
  const b = mx * dx + mz * dz;
  const cc = mx * mx + mz * mz - c.r * c.r;
  let best = -1;
  if (cc <= 0) {
    // starting inside the cylinder footprint: hit only if inside the vertical span
    if (ay >= c.y0 && ay <= c.y1) { _n.x = mx; _n.y = 0; _n.z = mz; normalize(_n); return 0; }
  }
  if (a > 1e-12) {
    const disc = b * b - a * cc;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / a;
      if (t >= 0 && t <= 1) {
        const y = ay + dy * t;
        if (y >= c.y0 && y <= c.y1) {
          best = t;
          _n.x = mx + dx * t; _n.y = 0; _n.z = mz + dz * t; normalize(_n);
        }
      }
    }
  }
  // top cap
  if (Math.abs(dy) > 1e-9) {
    const t = (c.y1 - ay) / dy;
    if (t >= 0 && t <= 1 && (best < 0 || t < best)) {
      const px = mx + dx * t, pz = mz + dz * t;
      if (px * px + pz * pz <= c.r * c.r) { best = t; _n.x = 0; _n.y = 1; _n.z = 0; }
    }
  }
  return best;
}

function rayBox(ax: number, ay: number, az: number, dx: number, dy: number, dz: number, c: BoxCollider): number {
  // to local frame
  const ox = ax - c.cx, oz = az - c.cz;
  const lx = ox * c.c - oz * c.s, lz = ox * c.s + oz * c.c;
  const ldx = dx * c.c - dz * c.s, ldz = dx * c.s + dz * c.c;
  let tmin = 0, tmax = 1, axis = -1, sign = 1;
  const slab = (o: number, d: number, mn: number, mx: number, ax_: number): boolean => {
    if (Math.abs(d) < 1e-12) return o >= mn && o <= mx;
    let t1 = (mn - o) / d, t2 = (mx - o) / d, s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = ax_; sign = s; }
    if (t2 < tmax) tmax = t2;
    return tmin <= tmax;
  };
  if (!slab(lx, ldx, -c.hx, c.hx, 0)) return -1;
  if (!slab(ay, dy, c.y0, c.y1, 1)) return -1;
  if (!slab(lz, ldz, -c.hz, c.hz, 2)) return -1;
  let nlx = 0, nly = 0, nlz = 0;
  if (axis === 0) nlx = sign; else if (axis === 1) nly = sign; else if (axis === 2) nlz = sign; else { nly = 1; }
  _n.x = nlx * c.c + nlz * c.s; _n.y = nly; _n.z = -nlx * c.s + nlz * c.c;
  return tmin;
}

function normalize(v: { x: number; y: number; z: number }) {
  const l = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
  v.x /= l; v.y /= l; v.z /= l;
}
