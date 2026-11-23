// The single-combat ring: a sand floor inside a stone wall, three tiers of timber stands rising
// outward, an arcade of piers round the top, the houses' banners and four braziers.

import * as THREE from 'three';
import { ARENA_R } from '../../shared/types';
import { TEAM_COLORS } from '../render/heraldry';
import { pbr } from '../render/materials';
import type { TextureBaker } from '../render/textures';
import type { Particles } from './particles';

const SEG = 72;

/** A ring band between two radii, its top at y1 and its foot at y0, faces outward and inward. */
function band(rIn: number, rOut: number, y0: number, y1: number, uScale: number): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  const add = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number) => { pos.push(x, y, z); nrm.push(nx, ny, nz); uv.push(u, v); return pos.length / 3 - 1; };
  const quad = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d);
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const u0 = (i / SEG) * uScale, u1 = ((i + 1) / SEG) * uScale, h = (y1 - y0) / 2;
    // outer face
    quad(add(c0 * rOut, y0, s0 * rOut, c0, 0, s0, u0, 0), add(c1 * rOut, y0, s1 * rOut, c1, 0, s1, u1, 0), add(c1 * rOut, y1, s1 * rOut, c1, 0, s1, u1, h), add(c0 * rOut, y1, s0 * rOut, c0, 0, s0, u0, h));
    // inner face
    quad(add(c1 * rIn, y0, s1 * rIn, -c1, 0, -s1, u1, 0), add(c0 * rIn, y0, s0 * rIn, -c0, 0, -s0, u0, 0), add(c0 * rIn, y1, s0 * rIn, -c0, 0, -s0, u0, h), add(c1 * rIn, y1, s1 * rIn, -c1, 0, -s1, u1, h));
    // top
    const w = (rOut - rIn) / 2;
    quad(add(c0 * rIn, y1, s0 * rIn, 0, 1, 0, u0, 0), add(c0 * rOut, y1, s0 * rOut, 0, 1, 0, u0, w), add(c1 * rOut, y1, s1 * rOut, 0, 1, 0, u1, w), add(c1 * rIn, y1, s1 * rIn, 0, 1, 0, u1, 0));
  }
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

  constructor(baker: TextureBaker, private particles: Particles, cx: number, cz: number, ground: (x: number, z: number) => number) {
    // the ground under the ring: the wall stands on the lowest of it, the stands rise from the highest
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 48; i++) for (const r of [ARENA_R, ARENA_R + 3, ARENA_R + 6]) {
      const h = ground(cx + Math.cos(i / 48 * Math.PI * 2) * r, cz + Math.sin(i / 48 * Math.PI * 2) * r);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    const top = hi + 2.4;
    const stone = pbr(baker.get('ashlar'), { color: 0xd9cbb2, repeat: [1, 1] });
    const timber = pbr(baker.get('planks'), { color: 0xb99a74, repeat: [1, 1], side: THREE.DoubleSide });
    const sand = pbr(baker.get('daub'), { color: 0xe0c99a, repeat: [5, 5], roughness: 1 });
    const g = this.group;
    g.position.set(cx, 0, cz);

    // the sand floor, laid over the ground
    const floor = new THREE.CircleGeometry(ARENA_R + 0.4, 64, 0, Math.PI * 2);
    floor.rotateX(-Math.PI / 2);
    const fp = floor.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) fp.setY(i, ground(cx + fp.getX(i), cz + fp.getZ(i)) + 0.035);
    floor.computeVertexNormals();
    const floorM = new THREE.Mesh(floor, sand);
    floorM.receiveShadow = true;
    g.add(floorM);

    // the ring wall and the stands
    const wall = new THREE.Mesh(band(ARENA_R + 0.3, ARENA_R + 0.95, lo - 1.2, top, 40), stone);
    wall.castShadow = wall.receiveShadow = true;
    g.add(wall);
    for (let t = 0; t < 3; t++) {
      const r0 = ARENA_R + 0.95 + t * 1.5, r1 = r0 + 1.5;
      const tier = new THREE.Mesh(band(r0, r1, lo - 1.2, top + 0.85 * (t + 1), 48 + t * 6), t === 0 ? stone : timber);
      tier.castShadow = tier.receiveShadow = true;
      g.add(tier);
    }
    // the outer wall and its arcade of piers
    const rB = ARENA_R + 0.95 + 4.5, backTop = top + 0.85 * 3 + 2.4;
    const back = new THREE.Mesh(band(rB + 0.04, rB + 0.64, lo - 1.2, top + 0.85 * 3 + 0.4, 60), stone);
    back.castShadow = back.receiveShadow = true;
    g.add(back);
    const pierGeo = new THREE.BoxGeometry(0.55, backTop - (top + 0.85 * 3 + 0.4), 0.6);
    const piers = new THREE.InstancedMesh(pierGeo, stone, 28);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      m.compose(new THREE.Vector3(Math.cos(a) * (rB + 0.3), (top + 0.85 * 3 + 0.4 + backTop) / 2, Math.sin(a) * (rB + 0.3)), q, new THREE.Vector3(1, 1, 1));
      piers.setMatrixAt(i, m);
    }
    piers.castShadow = true;
    g.add(piers);
    const lintel = new THREE.Mesh(band(rB - 0.05, rB + 0.65, backTop - 0.5, backTop, 60), stone);
    g.add(lintel);

    // the two gates, one behind each fighter's mark
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x2b1d12, roughness: 0.8 });
    for (const s of [1, -1]) {
      const gate = new THREE.Mesh(new THREE.BoxGeometry(2.6, top - lo + 0.2 - 0.6, 0.3), gateMat);
      gate.position.set(0, (lo + top) / 2 - 0.3, s * (ARENA_R + 0.25));
      g.add(gate);
    }
    // banners of both houses on the wall, and four braziers
    const pole = new THREE.MeshStandardMaterial({ color: 0x5a3f25, roughness: 0.8 });
    const cloth = [0, 1].map((t) => new THREE.MeshStandardMaterial({ color: TEAM_COLORS[t][0], roughness: 0.85, side: THREE.DoubleSide }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(a) * (ARENA_R + 0.6), z = Math.sin(a) * (ARENA_R + 0.6);
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
      const x = Math.cos(a) * (ARENA_R + 0.62), z = Math.sin(a) * (ARENA_R + 0.62);
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
