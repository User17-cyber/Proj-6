// Navigation grid for bots: 1 m cells over the playable bounds. Walkability is baked from
// colliders, water, cliffs and bridges. Provides A*, grid line-of-sight, connected components
// and Dijkstra flow fields (used to march dozens of bots toward objectives for free).

import type { StaticWorld } from './world';

const MAX_DH = 1.0;      // max height change per metre that a knight can walk
const INFLATE = 0.42;    // knight radius plus a little

export class NavGrid {
  readonly cell = 1;
  minX = 0; minZ = 0; w = 0; h = 0;
  walk!: Uint8Array;
  hgt!: Float32Array;
  comp!: Int32Array;
  private g!: Float32Array;
  private f!: Float32Array;
  private from!: Int32Array;
  private gen!: Uint32Array;
  private closedGen!: Uint32Array;
  private curGen = 0;
  private heap!: Int32Array;
  private heapKey!: Float32Array;
  private heapSize = 0;
  private fieldCache = new Map<number, Float32Array>();

  constructor(readonly world: StaticWorld) {
    this.build();
  }

  private build() {
    const W = this.world;
    const b = W.bounds;
    this.minX = Math.floor(b.minX); this.minZ = Math.floor(b.minZ);
    this.w = Math.ceil(b.maxX) - this.minX;
    this.h = Math.ceil(b.maxZ) - this.minZ;
    const N = this.w * this.h;
    this.walk = new Uint8Array(N);
    this.hgt = new Float32Array(N);
    for (let iz = 0; iz < this.h; iz++) for (let ix = 0; ix < this.w; ix++) {
      const x = this.minX + ix + 0.5, z = this.minZ + iz + 0.5;
      const g = W.groundAt(x, z, 999, 0);
      const i = iz * this.w + ix;
      this.hgt[i] = g;
      let ok = W.walkable(x, z, g);
      if (ok) {
        W.forColliders(x, z, INFLATE + 0.6, (c) => {
          if (!ok) return;
          if (c.y1 <= g + 0.6 || c.y0 >= g + 1.7) return;
          if (c.kind === 1) {
            const dx = x - c.cx, dz = z - c.cz;
            if (dx * dx + dz * dz < (c.r + INFLATE) ** 2) ok = false;
          } else {
            const dx = x - c.cx, dz = z - c.cz;
            const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
            if (Math.abs(lx) < c.hx + INFLATE && Math.abs(lz) < c.hz + INFLATE) ok = false;
          }
        });
      }
      this.walk[i] = ok ? 1 : 0;
    }
    // cliffs: a cell whose terrain changes too steeply in every direction is unwalkable
    const steep = new Uint8Array(N);
    for (let iz = 1; iz < this.h - 1; iz++) for (let ix = 1; ix < this.w - 1; ix++) {
      const i = iz * this.w + ix;
      if (!this.walk[i]) continue;
      const hc = this.hgt[i];
      const dx = Math.max(Math.abs(this.hgt[i + 1] - hc), Math.abs(this.hgt[i - 1] - hc));
      const dz = Math.max(Math.abs(this.hgt[i + this.w] - hc), Math.abs(this.hgt[i - this.w] - hc));
      if (dx > MAX_DH * 1.6 && dz > MAX_DH * 1.6) steep[i] = 1;
    }
    for (let i = 0; i < N; i++) if (steep[i]) this.walk[i] = 0;
    this.g = new Float32Array(N);
    this.f = new Float32Array(N);
    this.from = new Int32Array(N);
    this.gen = new Uint32Array(N);
    this.closedGen = new Uint32Array(N);
    this.heap = new Int32Array(N * 4 + 8);
    this.heapKey = new Float32Array(N * 4 + 8);
    this.labelComponents();
  }

  private labelComponents() {
    const N = this.w * this.h;
    this.comp = new Int32Array(N).fill(-1);
    const queue = new Int32Array(N);
    let label = 0;
    for (let s = 0; s < N; s++) {
      if (!this.walk[s] || this.comp[s] >= 0) continue;
      let qh = 0, qt = 0;
      queue[qt++] = s; this.comp[s] = label;
      while (qh < qt) {
        const i = queue[qh++];
        const ix = i % this.w, iz = (i / this.w) | 0;
        for (let k = 0; k < 4; k++) {
          const nx = ix + DX4[k], nz = iz + DZ4[k];
          if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.h) continue;
          const j = nz * this.w + nx;
          if (!this.walk[j] || this.comp[j] >= 0) continue;
          if (Math.abs(this.hgt[j] - this.hgt[i]) > MAX_DH) continue;
          this.comp[j] = label; queue[qt++] = j;
        }
      }
      label++;
    }
  }

  index(x: number, z: number): number {
    const ix = Math.floor(x - this.minX), iz = Math.floor(z - this.minZ);
    if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) return -1;
    return iz * this.w + ix;
  }
  cx(i: number) { return this.minX + (i % this.w) + 0.5; }
  cz(i: number) { return this.minZ + ((i / this.w) | 0) + 0.5; }
  isWalkable(x: number, z: number) { const i = this.index(x, z); return i >= 0 && this.walk[i] === 1; }
  component(x: number, z: number) { const i = this.index(x, z); return i >= 0 ? this.comp[i] : -1; }

  /** Nearest walkable cell centre within radius, preferring a given component. */
  nearestWalkable(x: number, z: number, maxR = 12, comp = -1): number {
    const i0 = this.index(x, z);
    if (i0 >= 0 && this.walk[i0] && (comp < 0 || this.comp[i0] === comp)) return i0;
    const ix0 = Math.floor(x - this.minX), iz0 = Math.floor(z - this.minZ);
    for (let r = 1; r <= maxR; r++) {
      let best = -1, bd = Infinity;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const ix = ix0 + dx, iz = iz0 + dz;
        if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) continue;
        const i = iz * this.w + ix;
        if (!this.walk[i] || (comp >= 0 && this.comp[i] !== comp)) continue;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** Grid line of sight: every sampled cell walkable and no cliff between consecutive samples. */
  los(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / 0.5));
    let prev = this.index(ax, az);
    if (prev < 0) return false;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const i = this.index(ax + dx * t, az + dz * t);
      if (i < 0 || !this.walk[i]) return false;
      if (i !== prev && Math.abs(this.hgt[i] - this.hgt[prev]) > MAX_DH * 1.2) return false;
      // keep a clear corridor: reject lines grazing blocked cells
      prev = i;
    }
    return true;
  }

  /** A* from (sx,sz) to (tx,tz). Writes a smoothed polyline [x0,z0,x1,z1,...] into out. */
  findPath(sx: number, sz: number, tx: number, tz: number, out: number[], maxIter = 30000): boolean {
    out.length = 0;
    let s = this.nearestWalkable(sx, sz, 4);
    if (s < 0) return false;
    let t = this.nearestWalkable(tx, tz, 10, this.comp[s]);
    if (t < 0) return false;
    if (s === t) { out.push(tx, tz); return true; }
    const gen = ++this.curGen;
    const W = this.w;
    const txi = t % W, tzi = (t / W) | 0;
    const hfn = (i: number) => {
      const dx = Math.abs((i % W) - txi), dz = Math.abs(((i / W) | 0) - tzi);
      return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
    };
    this.heapSize = 0;
    this.g[s] = 0; this.f[s] = hfn(s); this.gen[s] = gen; this.from[s] = -1;
    this.push(s, this.f[s]);
    let found = false, iter = 0;
    let closest = s, closestH = this.f[s];
    while (this.heapSize > 0 && iter++ < maxIter) {
      const i = this.pop();
      if (this.closedGen[i] === gen) continue;
      this.closedGen[i] = gen;
      if (i === t) { found = true; break; }
      const hi = this.f[i] - this.g[i];
      if (hi < closestH) { closestH = hi; closest = i; }
      const ix = i % W, iz = (i / W) | 0;
      const hgtI = this.hgt[i];
      for (let k = 0; k < 8; k++) {
        const nx = ix + DX8[k], nz = iz + DZ8[k];
        if (nx < 0 || nz < 0 || nx >= W || nz >= this.h) continue;
        const j = nz * W + nx;
        if (!this.walk[j] || this.closedGen[j] === gen) continue;
        const diag = k >= 4;
        if (diag && (!this.walk[iz * W + nx] || !this.walk[nz * W + ix])) continue;
        const dh = Math.abs(this.hgt[j] - hgtI);
        if (dh > (diag ? MAX_DH * SQRT2 : MAX_DH)) continue;
        const ng = this.g[i] + (diag ? SQRT2 : 1) + dh * 0.6;
        if (this.gen[j] !== gen || ng < this.g[j]) {
          this.gen[j] = gen;
          this.g[j] = ng;
          this.f[j] = ng + hfn(j);
          this.from[j] = i;
          this.push(j, this.f[j]);
        }
      }
    }
    const end = found ? t : closest;
    if (!found && end === s) return false;
    // reconstruct
    const cells: number[] = [];
    for (let i = end; i >= 0; i = this.from[i]) { cells.push(i); if (i === s) break; }
    cells.reverse();
    // string pulling
    let ax = sx, az = sz;
    let k = 0;
    while (k < cells.length - 1) {
      let far = k + 1;
      for (let m = cells.length - 1; m > k + 1; m--) {
        if (this.los(ax, az, this.cx(cells[m]), this.cz(cells[m]))) { far = m; break; }
      }
      ax = this.cx(cells[far]); az = this.cz(cells[far]);
      out.push(ax, az);
      k = far;
    }
    if (found) { out[out.length - 2] = tx; out[out.length - 1] = tz; if (!this.isWalkable(tx, tz)) { out[out.length - 2] = this.cx(t); out[out.length - 1] = this.cz(t); } }
    return true;
  }

  /** Dijkstra distance field toward a target point (cached per cell). */
  field(tx: number, tz: number): Float32Array | null {
    const t = this.nearestWalkable(tx, tz, 12);
    if (t < 0) return null;
    const cached = this.fieldCache.get(t);
    if (cached) return cached;
    const N = this.w * this.h, W = this.w;
    const dist = new Float32Array(N).fill(Infinity);
    dist[t] = 0;
    // simple binary-heap Dijkstra (reuses the A* heap with f = dist)
    const gen = ++this.curGen;
    this.heapSize = 0;
    this.push(t, 0);
    while (this.heapSize > 0) {
      const i = this.pop();
      if (this.closedGen[i] === gen) continue;
      this.closedGen[i] = gen;
      const ix = i % W, iz = (i / W) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = ix + DX8[k], nz = iz + DZ8[k];
        if (nx < 0 || nz < 0 || nx >= W || nz >= this.h) continue;
        const j = nz * W + nx;
        if (!this.walk[j] || this.closedGen[j] === gen) continue;
        const diag = k >= 4;
        if (diag && (!this.walk[iz * W + nx] || !this.walk[nz * W + ix])) continue;
        const dh = Math.abs(this.hgt[j] - this.hgt[i]);
        if (dh > (diag ? MAX_DH * SQRT2 : MAX_DH)) continue;
        const nd = dist[i] + (diag ? SQRT2 : 1) + dh * 0.6;
        if (nd < dist[j]) { dist[j] = nd; this.push(j, nd); }
      }
    }
    this.fieldCache.set(t, dist);
    return dist;
  }

  /** Direction (unit xz) to step along a flow field from (x,z); returns false at the goal or if unreachable. */
  flowDir(field: Float32Array, x: number, z: number, out: { x: number; z: number }, lookahead = 6): boolean {
    let i = this.index(x, z);
    if (i < 0) return false;
    if (!this.walk[i] || !isFinite(field[i])) {
      const j = this.nearestWalkable(x, z, 3);
      if (j < 0 || !isFinite(field[j])) return false;
      out.x = this.cx(j) - x; out.z = this.cz(j) - z;
      const l = Math.hypot(out.x, out.z) || 1; out.x /= l; out.z /= l;
      return true;
    }
    if (field[i] < 0.5) return false;
    // walk downhill a few cells and aim at the furthest one still in line of sight
    let cur = i, target = i;
    for (let step = 0; step < lookahead; step++) {
      const ix = cur % this.w, iz = (cur / this.w) | 0;
      let best = cur, bd = field[cur];
      for (let k = 0; k < 8; k++) {
        const nx = ix + DX8[k], nz = iz + DZ8[k];
        if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.h) continue;
        const j = nz * this.w + nx;
        if (field[j] < bd) { bd = field[j]; best = j; }
      }
      if (best === cur) break;
      cur = best;
      if (this.los(x, z, this.cx(cur), this.cz(cur))) target = cur;
    }
    if (target === i) {
      // fall back to the immediate downhill neighbour
      target = cur;
    }
    out.x = this.cx(target) - x; out.z = this.cz(target) - z;
    const l = Math.hypot(out.x, out.z);
    if (l < 1e-4) return false;
    out.x /= l; out.z /= l;
    return true;
  }

  private push(i: number, key: number) {
    if (this.heapSize >= this.heap.length) return; // pathological; drop
    const heap = this.heap, hk = this.heapKey;
    let k = this.heapSize++;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hk[p] <= key) break;
      heap[k] = heap[p]; hk[k] = hk[p]; k = p;
    }
    heap[k] = i; hk[k] = key;
  }
  private pop(): number {
    const heap = this.heap, hk = this.heapKey;
    const top = heap[0];
    const n = --this.heapSize;
    const last = heap[n], lastKey = hk[n];
    let k = 0;
    while (true) {
      let c = 2 * k + 1;
      if (c >= n) break;
      if (c + 1 < n && hk[c + 1] < hk[c]) c++;
      if (hk[c] >= lastKey) break;
      heap[k] = heap[c]; hk[k] = hk[c]; k = c;
    }
    heap[k] = last; hk[k] = lastKey;
    return top;
  }
}

const SQRT2 = Math.SQRT2;
const DX4 = [1, -1, 0, 0], DZ4 = [0, 0, 1, -1];
const DX8 = [1, -1, 0, 0, 1, 1, -1, -1], DZ8 = [0, 0, 1, -1, 1, -1, 1, -1];
