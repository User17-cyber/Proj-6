// Mesh accumulation helpers used to build castles, buildings, props and armour pieces.
// Geometry is gathered per material key and merged into a few large BufferGeometries.

import * as THREE from 'three';

export class MeshAccum {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  get vcount() { return this.pos.length / 3; }

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c = 1) {
    this.pos.push(x, y, z); this.nrm.push(nx, ny, nz); this.uv.push(u, v); this.col.push(c, c, c);
    return this.vcount - 1;
  }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c); }
  quadIdx(a: number, b: number, c: number, d: number) { this.idx.push(a, b, c, a, c, d); }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.vcount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Transform helper: local frame at (ox, oy, oz) rotated by yaw. */
export class Frame {
  c: number; s: number;
  constructor(public ox: number, public oy: number, public oz: number, public rot = 0) { this.c = Math.cos(rot); this.s = Math.sin(rot); }
  px(x: number, z: number) { return this.ox + x * this.c + z * this.s; }
  pz(x: number, z: number) { return this.oz - x * this.s + z * this.c; }
  nx(x: number, z: number) { return x * this.c + z * this.s; }
  nz(x: number, z: number) { return -x * this.s + z * this.c; }
}

export type AoFn = (x: number, y: number, z: number) => number;

/** Collection of accumulators keyed by material name. */
export class Builder {
  readonly parts = new Map<string, MeshAccum>();
  ao: AoFn | null = null;
  acc(key: string): MeshAccum {
    let a = this.parts.get(key);
    if (!a) { a = new MeshAccum(); this.parts.set(key, a); }
    return a;
  }

  /**
   * Oriented box. Local x = width, y = up, z = length (rotated by f.rot around (cx,cz)).
   * UVs are world-scaled (metres / uvs). faces: bitmask +x,-x,+y,-y,+z,-z (default all but -y).
   */
  box(key: string, f: Frame, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, uvs = 4, faces = 0b110111, uvOff = 0) {
    const a = this.acc(key);
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const P = (lx: number, ly: number, lz: number) => [f.px(cx + lx, cz + lz), f.oy + cy + ly, f.pz(cx + lx, cz + lz)];
    const face = (n: [number, number, number], corners: [number, number, number][], uw: number, vh: number, u0: number, v0: number) => {
      const wn = [f.nx(n[0], n[2]), n[1], f.nz(n[0], n[2])];
      const ids = corners.map((c, i) => {
        const p = P(c[0], c[1], c[2]);
        const u = (i === 1 || i === 2 ? uw : 0) / uvs + u0, v = (i >= 2 ? vh : 0) / uvs + v0;
        const ao = this.ao ? this.ao(p[0], p[1], p[2]) : 1;
        return a.vert(p[0], p[1], p[2], wn[0], wn[1], wn[2], u, v, ao);
      });
      a.quadIdx(ids[0], ids[1], ids[2], ids[3]);
    };
    const yb = cy - hy + f.oy; // base world y for v
    const vb = yb / uvs;
    if (faces & 1) face([1, 0, 0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], sz, sy, uvOff + (cz - hz) / uvs, vb);
    if (faces & 2) face([-1, 0, 0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], sz, sy, uvOff - (cz + hz) / uvs, vb);
    if (faces & 4) face([0, 1, 0], [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], sx, sz, (cx - hx) / uvs, (cz - hz) / uvs);
    if (faces & 8) face([0, -1, 0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], sx, sz, (cx - hx) / uvs, (cz - hz) / uvs);
    if (faces & 16) face([0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], sx, sy, uvOff + (cx - hx) / uvs, vb);
    if (faces & 32) face([0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], sx, sy, uvOff - (cx + hx) / uvs, vb);
  }

  /** Vertical cylinder (or prism with few segments) from y0 to y1, open or capped. */
  cylinder(key: string, x: number, y0: number, z: number, r0: number, r1: number, h: number, segs: number, uvs = 4, caps = 0b10, flat = false, rot = 0, r1Inner = 0) {
    const a = this.acc(key);
    const circ = 2 * Math.PI * Math.max(r0, r1);
    const urep = Math.max(1, Math.round(circ / uvs));
    for (let i = 0; i < segs; i++) {
      const t0 = (i / segs) * Math.PI * 2 + rot, t1 = ((i + 1) / segs) * Math.PI * 2 + rot;
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      const cm = Math.cos((t0 + t1) / 2), sm = Math.sin((t0 + t1) / 2);
      const slope = (r0 - r1) / h;
      const ny = slope / Math.sqrt(1 + slope * slope), nk = 1 / Math.sqrt(1 + slope * slope);
      const n0x = flat ? cm : c0, n0z = flat ? sm : s0, n1x = flat ? cm : c1, n1z = flat ? sm : s1;
      const u0 = (i / segs) * urep, u1 = ((i + 1) / segs) * urep;
      const ao0 = this.ao ? this.ao(x + c0 * r0, y0, z + s0 * r0) : 1;
      const ao1 = this.ao ? this.ao(x + c1 * r0, y0, z + s1 * r0) : 1;
      const ao2 = this.ao ? this.ao(x + c1 * r1, y0 + h, z + s1 * r1) : 1;
      const ao3 = this.ao ? this.ao(x + c0 * r1, y0 + h, z + s0 * r1) : 1;
      const v0 = y0 / uvs, v1 = (y0 + h) / uvs;
      const A = a.vert(x + c0 * r0, y0, z + s0 * r0, n0x * nk, ny, n0z * nk, u0, v0, ao0);
      const B = a.vert(x + c1 * r0, y0, z + s1 * r0, n1x * nk, ny, n1z * nk, u1, v0, ao1);
      const C = a.vert(x + c1 * r1, y0 + h, z + s1 * r1, n1x * nk, ny, n1z * nk, u1, v1, ao2);
      const D = a.vert(x + c0 * r1, y0 + h, z + s0 * r1, n0x * nk, ny, n0z * nk, u0, v1, ao3);
      a.idx.push(A, C, B, A, D, C);
      if (caps & 2) {
        // top cap (annulus if r1Inner > 0)
        const yy = y0 + h;
        if (r1Inner > 0) {
          const E = a.vert(x + c0 * r1Inner, yy, z + s0 * r1Inner, 0, 1, 0, (x + c0 * r1Inner) / uvs, (z + s0 * r1Inner) / uvs);
          const F = a.vert(x + c1 * r1Inner, yy, z + s1 * r1Inner, 0, 1, 0, (x + c1 * r1Inner) / uvs, (z + s1 * r1Inner) / uvs);
          const G2 = a.vert(x + c1 * r1, yy, z + s1 * r1, 0, 1, 0, (x + c1 * r1) / uvs, (z + s1 * r1) / uvs);
          const H2 = a.vert(x + c0 * r1, yy, z + s0 * r1, 0, 1, 0, (x + c0 * r1) / uvs, (z + s0 * r1) / uvs);
          a.idx.push(E, F, G2, E, G2, H2);
        } else {
          const ctr = a.vert(x, yy, z, 0, 1, 0, x / uvs, z / uvs);
          const p0 = a.vert(x + c0 * r1, yy, z + s0 * r1, 0, 1, 0, (x + c0 * r1) / uvs, (z + s0 * r1) / uvs);
          const p1 = a.vert(x + c1 * r1, yy, z + s1 * r1, 0, 1, 0, (x + c1 * r1) / uvs, (z + s1 * r1) / uvs);
          a.idx.push(ctr, p1, p0);
        }
      }
      if (caps & 1) {
        const ctr = a.vert(x, y0, z, 0, -1, 0, 0, 0);
        const p0 = a.vert(x + c0 * r0, y0, z + s0 * r0, 0, -1, 0, 0, 0);
        const p1 = a.vert(x + c1 * r0, y0, z + s1 * r0, 0, -1, 0, 0, 0);
        a.idx.push(ctr, p0, p1);
      }
      // inner wall for parapet rings
      if (r1Inner > 0) {
        const I0 = a.vert(x + c0 * r1Inner, y0, z + s0 * r1Inner, -n0x, 0, -n0z, u0, v0, 0.7);
        const I1 = a.vert(x + c1 * r1Inner, y0, z + s1 * r1Inner, -n1x, 0, -n1z, u1, v0, 0.7);
        const I2 = a.vert(x + c1 * r1Inner, y0 + h, z + s1 * r1Inner, -n1x, 0, -n1z, u1, v1, 0.9);
        const I3 = a.vert(x + c0 * r1Inner, y0 + h, z + s0 * r1Inner, -n0x, 0, -n0z, u0, v1, 0.9);
        a.idx.push(I0, I1, I2, I0, I2, I3);
      }
    }
  }

  /** Cone roof with an optional overhang. */
  cone(key: string, x: number, y0: number, z: number, r: number, h: number, segs: number, uvs = 3) {
    const a = this.acc(key);
    const slant = Math.hypot(r, h);
    for (let i = 0; i < segs; i++) {
      const t0 = (i / segs) * Math.PI * 2, t1 = ((i + 1) / segs) * Math.PI * 2, tm = (t0 + t1) / 2;
      const ny = r / slant, nr = h / slant;
      const A = a.vert(x + Math.cos(t0) * r, y0, z + Math.sin(t0) * r, Math.cos(t0) * nr, ny, Math.sin(t0) * nr, (i / segs) * (2 * Math.PI * r) / uvs, 0);
      const B = a.vert(x + Math.cos(t1) * r, y0, z + Math.sin(t1) * r, Math.cos(t1) * nr, ny, Math.sin(t1) * nr, ((i + 1) / segs) * (2 * Math.PI * r) / uvs, 0);
      const C = a.vert(x, y0 + h, z, Math.cos(tm) * nr, ny, Math.sin(tm) * nr, ((i + 0.5) / segs) * (2 * Math.PI * r) / uvs, slant / uvs);
      a.idx.push(A, C, B);
    }
  }

  /** Gable roof over a w x d footprint (ridge along local z). */
  gable(key: string, f: Frame, w: number, d: number, eave: number, rise: number, over = 0.5, thick = 0.25, uvs = 3) {
    const a = this.acc(key);
    const hw = w / 2 + over, hd = d / 2 + over;
    const y0 = f.oy + eave, y1 = f.oy + eave + rise;
    const slant = Math.hypot(hw, rise);
    for (const side of [-1, 1]) {
      const nxl = side * rise / slant, nyl = hw / slant;
      const nx = f.nx(nxl, 0), nz = f.nz(nxl, 0);
      const p = (lx: number, ly: number, lz: number) => [f.px(lx, lz), ly, f.pz(lx, lz)];
      const c0 = p(side * hw, y0, -hd), c1 = p(side * hw, y0, hd), c2 = p(0, y1, hd), c3 = p(0, y1, -hd);
      const ids = [c0, c1, c2, c3].map((c, i) => a.vert(c[0], c[1], c[2], nx, nyl, nz, (i === 1 || i === 2 ? hd * 2 : 0) / uvs, (i >= 2 ? slant : 0) / uvs));
      if (side > 0) a.quadIdx(ids[0], ids[3], ids[2], ids[1]); else a.quadIdx(ids[0], ids[1], ids[2], ids[3]);
      // underside / fascia thickness
      const t0 = p(side * hw, y0 - thick, -hd), t1 = p(side * hw, y0 - thick, hd);
      const n2 = [f.nx(side, 0), 0, f.nz(side, 0)];
      const e = [c0, c1, t1, t0].map((c, i) => a.vert(c[0], c[1], c[2], n2[0], n2[1], n2[2], (i === 1 || i === 2 ? hd * 2 : 0) / uvs, (i >= 2 ? thick : 0) / uvs));
      if (side > 0) a.quadIdx(e[0], e[1], e[2], e[3]); else a.quadIdx(e[0], e[3], e[2], e[1]);
    }
  }

  /** Vertical triangle (gable end wall). */
  gableEnd(key: string, f: Frame, w: number, lz: number, eave: number, rise: number, uvs = 4) {
    const a = this.acc(key);
    const nzl = Math.sign(lz) || 1;
    const nx = f.nx(0, nzl), nz = f.nz(0, nzl);
    const y0 = f.oy + eave;
    const A = a.vert(f.px(-w / 2, lz), y0, f.pz(-w / 2, lz), nx, 0, nz, 0, y0 / uvs);
    const B = a.vert(f.px(w / 2, lz), y0, f.pz(w / 2, lz), nx, 0, nz, w / uvs, y0 / uvs);
    const C = a.vert(f.px(0, lz), y0 + rise, f.pz(0, lz), nx, 0, nz, w / 2 / uvs, (y0 + rise) / uvs);
    if (nzl > 0) a.tri(A, B, C); else a.tri(A, C, B);
  }

  /** Box between two arbitrary points (beams, braces, poles, logs). w = width, h = height of the section. */
  beam(key: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w: number, h: number, uvs = 2, ends = true) {
    const a = this.acc(key);
    let ax = x1 - x0, ay = y1 - y0, az = z1 - z0;
    const len = Math.hypot(ax, ay, az) || 1e-6;
    ax /= len; ay /= len; az /= len;
    // side = axis x up (fallback x axis when vertical)
    let sx = ay * 0 - az * 1, sy = az * 0 - ax * 0, sz = ax * 1 - ay * 0;
    let sl = Math.hypot(sx, sy, sz);
    if (sl < 1e-3) { sx = 1; sy = 0; sz = 0; sl = 1; }
    sx /= sl; sy /= sl; sz /= sl;
    const ux = sy * az - sz * ay, uy = sz * ax - sx * az, uz = sx * ay - sy * ax;
    const hw = w / 2, hh = h / 2;
    const corner = (t: number, i: number, j: number): [number, number, number] => [
      x0 + ax * t + sx * hw * i + ux * hh * j,
      y0 + ay * t + sy * hw * i + uy * hh * j,
      z0 + az * t + sz * hw * i + uz * hh * j,
    ];
    const faceQ = (p: [number, number, number][], n: [number, number, number], uw: number, vh: number) => {
      const ids = p.map((c, k) => {
        const ao = this.ao ? this.ao(c[0], c[1], c[2]) : 1;
        return a.vert(c[0], c[1], c[2], n[0], n[1], n[2], (k === 1 || k === 2 ? uw : 0) / uvs, (k >= 2 ? vh : 0) / uvs, ao);
      });
      a.quadIdx(ids[0], ids[1], ids[2], ids[3]);
    };
    // four long faces
    faceQ([corner(0, 1, -1), corner(len, 1, -1), corner(len, 1, 1), corner(0, 1, 1)], [sx, sy, sz], len, h);
    faceQ([corner(0, -1, 1), corner(len, -1, 1), corner(len, -1, -1), corner(0, -1, -1)], [-sx, -sy, -sz], len, h);
    faceQ([corner(0, 1, 1), corner(len, 1, 1), corner(len, -1, 1), corner(0, -1, 1)], [ux, uy, uz], len, w);
    faceQ([corner(0, -1, -1), corner(len, -1, -1), corner(len, 1, -1), corner(0, 1, -1)], [-ux, -uy, -uz], len, w);
    if (ends) {
      faceQ([corner(len, 1, -1), corner(len, -1, -1), corner(len, -1, 1), corner(len, 1, 1)], [ax, ay, az], w, h);
      faceQ([corner(0, -1, -1), corner(0, 1, -1), corner(0, 1, 1), corner(0, -1, 1)], [-ax, -ay, -az], w, h);
    }
  }

  build(): Map<string, THREE.BufferGeometry> {
    const out = new Map<string, THREE.BufferGeometry>();
    for (const [k, a] of this.parts) if (a.idx.length) out.set(k, a.toGeometry());
    return out;
  }
}
