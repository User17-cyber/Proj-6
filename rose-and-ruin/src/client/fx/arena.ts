// The single-combat ring: a sand floor inside a stone wall, three tiers of timber stands rising
// outward, an arcade of piers round the top, the houses' banners and four braziers.

import * as THREE from 'three';
import { clampToArena, DEFAULT_ARENA, type ArenaShape } from '../../shared/sim/arena';
import { TEAM_COLORS } from '../render/heraldry';
import { pbr } from '../render/materials';
import type { TextureBaker } from '../render/textures';
import type { Particles } from './particles';

/** The wall's outline pushed `o` metres outward: a closed loop of points. */
function outline(sh: ArenaShape, o: number): [number, number][] {
  const pts: [number, number][] = [];
  if (sh.kind === 'ellipse') {
    for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; pts.push([Math.cos(a) * (sh.rx + o), Math.sin(a) * (sh.rz + o)]); }
  } else {
    const R = (sh.r + o) / Math.cos(Math.PI / sh.sides);
    for (let i = 0; i < sh.sides; i++) { const a = sh.rot + ((i + 0.5) / sh.sides) * Math.PI * 2; pts.push([Math.cos(a) * R, Math.sin(a) * R]); }
  }
  return pts;
}
/** Where a ray from the middle toward (dx, dz) meets the outline pushed `o` outward. */
function along(sh: ArenaShape, o: number, dx: number, dz: number): [number, number] {
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  let t: number;
  if (sh.kind === 'ellipse') t = 1 / Math.hypot(dx / (sh.rx + o), dz / (sh.rz + o));
  else { let m = 0; for (let i = 0; i < sh.sides; i++) { const a = sh.rot + (i / sh.sides) * Math.PI * 2; m = Math.max(m, dx * Math.cos(a) + dz * Math.sin(a)); } t = (sh.r + o) / m; }
  return [dx * t, dz * t];
}

/** A band between two offsets of the outline, its top at y1 and its foot at y0: outer face, inner face, top. */
function band(sh: ArenaShape, oIn: number, oOut: number, y0: number, y1: number, uPerM = 0.4): THREE.BufferGeometry {
  const A = outline(sh, oIn), B = outline(sh, oOut), n = A.length;
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  const add = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number) => { pos.push(x, y, z); nrm.push(nx, ny, nz); uv.push(u, v); return pos.length / 3 - 1; };
  const quad = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d);
  let u = 0;
  const h = (y1 - y0) * uPerM;
  for (let i = 0; i < n; i++) {
    const a0 = A[i], a1 = A[(i + 1) % n], b0 = B[i], b1 = B[(i + 1) % n];
    const ex = b1[0] - b0[0], ez = b1[1] - b0[1], el = Math.hypot(ex, ez) || 1;
    const nx = ez / el, nz = -ex / el;
    const u1 = u + el * uPerM;
    quad(add(b0[0], y0, b0[1], nx, 0, nz, u, 0), add(b1[0], y0, b1[1], nx, 0, nz, u1, 0), add(b1[0], y1, b1[1], nx, 0, nz, u1, h), add(b0[0], y1, b0[1], nx, 0, nz, u, h));
    quad(add(a1[0], y0, a1[1], -nx, 0, -nz, u1, 0), add(a0[0], y0, a0[1], -nx, 0, -nz, u, 0), add(a0[0], y1, a0[1], -nx, 0, -nz, u, h), add(a1[0], y1, a1[1], -nx, 0, -nz, u1, h));
    const w = (oOut - oIn) * uPerM;
    quad(add(a0[0], y1, a0[1], 0, 1, 0, u, 0), add(b0[0], y1, b0[1], 0, 1, 0, u, w), add(b1[0], y1, b1[1], 0, 1, 0, u1, w), add(a1[0], y1, a1[1], 0, 1, 0, u1, 0));
    u = u1;
  }
  // the outline's winding decides which way "outward" faces point: flip if needed
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class Arena {
  readonly group = new THREE.Group();
  private fires: THREE.Vector3[] = [];
  private flags: THREE.Mesh[] = [];

  constructor(baker: TextureBaker, private particles: Particles, cx: number, cz: number, ground: (x: number, z: number) => number, sh: ArenaShape = DEFAULT_ARENA) {
    // the ground under the ring: the wall stands on the lowest of it, the stands rise from the highest
    let lo = Infinity, hi = -Infinity;
    for (const o of [0, 3, 6]) for (const [x, z] of outline(sh, o)) { const h = ground(cx + x, cz + z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    const top = hi + 2.4;
    const stone = pbr(baker.get('ashlar'), { color: 0xd9cbb2, repeat: [1, 1] });
    const timber = pbr(baker.get('planks'), { color: 0xb99a74, repeat: [1, 1], side: THREE.DoubleSide });
    const sand = pbr(baker.get('daub'), { color: 0xe0c99a, repeat: [5, 5], roughness: 1 });
    const g = this.group;
    g.position.set(cx, 0, cz);

    // the sand floor, laid over the ground
    // the sand: a fine grid over the arena, kept to the squares inside the wall's outline so it
    // follows the ground everywhere and never shows outside the wall
    const ext = outline(sh, 0.6).reduce((m, [x, z]) => Math.max(m, Math.abs(x), Math.abs(z)), 0);
    const N = 56, step = (ext * 2) / N;
    const fpos: number[] = [], fidx: number[] = [];
    for (let iz = 0; iz <= N; iz++) for (let ix = 0; ix <= N; ix++) {
      const x = -ext + ix * step, z = -ext + iz * step;
      fpos.push(x, ground(cx + x, cz + z) + 0.035, z);
    }
    const inside = (x: number, z: number) => { const p = { x, z }; return !clampToArena(p, 0, 0, sh, -0.6); };
    for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
      const x = -ext + (ix + 0.5) * step, z = -ext + (iz + 0.5) * step;
      if (!inside(x, z)) continue;
      const a = iz * (N + 1) + ix, b = a + 1, c = a + N + 1, d = c + 1;
      fidx.push(a, c, b, b, c, d);
    }
    const floor = new THREE.BufferGeometry();
    floor.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
    const fuv: number[] = []; for (let k = 0; k < fpos.length; k += 3) fuv.push(fpos[k] / 8, fpos[k + 2] / 8);
    floor.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
    floor.setIndex(fidx);
    floor.computeVertexNormals();
    const floorM = new THREE.Mesh(floor, sand);
    floorM.receiveShadow = true;
    g.add(floorM);

    // the ring wall and the stands
    const wall = new THREE.Mesh(band(sh, 0.3, 0.95, lo - 1.2, top), stone);
    wall.castShadow = wall.receiveShadow = true;
    g.add(wall);
    for (let t = 0; t < 3; t++) {
      const r0 = 0.95 + t * 1.5, r1 = r0 + 1.5;
      const tier = new THREE.Mesh(band(sh, r0, r1, lo - 1.2, top + 0.85 * (t + 1)), t === 0 ? stone : timber);
      tier.castShadow = tier.receiveShadow = true;
      g.add(tier);
    }
    // the outer wall and its arcade of piers
    const rB = 0.95 + 4.5, backTop = top + 0.85 * 3 + 2.4;
    const back = new THREE.Mesh(band(sh, rB + 0.04, rB + 0.64, lo - 1.2, top + 0.85 * 3 + 0.4), stone);
    back.castShadow = back.receiveShadow = true;
    g.add(back);
    const pierGeo = new THREE.BoxGeometry(0.55, backTop - (top + 0.85 * 3 + 0.4), 0.6);
    const piers = new THREE.InstancedMesh(pierGeo, stone, 28);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      const [px, pz] = along(sh, rB + 0.34, Math.cos(a), Math.sin(a));
      m.compose(new THREE.Vector3(px, (top + 0.85 * 3 + 0.4 + backTop) / 2, pz), q, new THREE.Vector3(1, 1, 1));
      piers.setMatrixAt(i, m);
    }
    piers.castShadow = true;
    g.add(piers);
    const lintel = new THREE.Mesh(band(sh, rB - 0.05, rB + 0.69, backTop - 0.5, backTop), stone);
    g.add(lintel);

    // the two gates, one behind each fighter's mark
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x2b1d12, roughness: 0.8 });
    for (const s of [1, -1]) {
      const gate = new THREE.Mesh(new THREE.BoxGeometry(2.6, top - lo + 0.2 - 0.6, 0.3), gateMat);
      const [gx, gz] = along(sh, 0.25, 0, s);
      gate.position.set(gx, (lo + top) / 2 - 0.3, gz);
      g.add(gate);
    }
    // banners of both houses on the wall, and four braziers
    const pole = new THREE.MeshStandardMaterial({ color: 0x5a3f25, roughness: 0.8 });
    const cloth = [0, 1].map((t) => new THREE.MeshStandardMaterial({ color: TEAM_COLORS[t][0], roughness: 0.85, side: THREE.DoubleSide }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const [x, z] = along(sh, 0.6, Math.cos(a), Math.sin(a));
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 3.2, 6), pole);
      p.position.set(x, top + 1.6, z);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), cloth[i % 2]);
      f.position.set(x - Math.sin(a) * 0.42, top + 2.5, z + Math.cos(a) * 0.42);
      f.rotation.y = -a;
      this.flags.push(f);
      g.add(p, f);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const [x, z] = along(sh, 0.62, Math.cos(a), Math.sin(a));
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.18, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0x2a2826, metalness: 0.8, roughness: 0.5 }));
      bowl.position.set(x, top + 0.15, z);
      g.add(bowl);
      this.fires.push(new THREE.Vector3(cx + x, top + 0.3, cz + z));
    }
    g.traverse((o) => { o.frustumCulled = true; });
  }

  update(dt: number, time: number) {
    for (const f of this.fires) this.particles.fire(f.x, f.y, f.z, 0.9, dt);
    this.flags.forEach((f, i) => { f.rotation.z = Math.sin(time * 1.6 + i) * 0.08; });
  }
}
