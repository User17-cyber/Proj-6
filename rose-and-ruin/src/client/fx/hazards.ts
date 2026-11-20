// Ground effects laid by abilities: a field of iron caltrops, a pool of burning pitch and a
// planted house standard. Each lives as long as the simulation says it does.

import * as THREE from 'three';
import { TEAM_COLORS } from '../render/heraldry';
import type { Particles } from './particles';

interface Live { kind: number; x: number; z: number; r: number; t: number; obj: THREE.Object3D | null; light: THREE.PointLight | null; pts: [number, number, number][] }

const CALTROP = (() => {
  // four spikes from a centre, one always pointing up
  const g = new THREE.ConeGeometry(0.016, 0.07, 4);
  g.translate(0, 0.035, 0);
  const parts: THREE.BufferGeometry[] = [];
  const dirs = [[0, 1, 0], [0.94, -0.33, 0], [-0.47, -0.33, 0.82], [-0.47, -0.33, -0.82]];
  for (const d of dirs) {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(d[0], d[1], d[2]));
    parts.push(g.clone().applyQuaternion(q));
  }
  const out = mergeSimple(parts);
  out.translate(0, 0.024, 0);
  return out;
})();

function mergeSimple(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [];
  for (const g of gs) {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.computeVertexNormals();
    pos.push(...(ng.getAttribute('position').array as Float32Array));
    nrm.push(...(ng.getAttribute('normal').array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return out;
}

export class Hazards {
  readonly group = new THREE.Group();
  private live: Live[] = [];
  private steel = new THREE.MeshStandardMaterial({ color: 0x3a3a3c, metalness: 0.9, roughness: 0.55 });
  private wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.8 });
  private cloth = [0, 1].map((t) => new THREE.MeshStandardMaterial({ color: TEAM_COLORS[t][0], roughness: 0.85, side: THREE.DoubleSide }));
  private charred = new THREE.MeshStandardMaterial({ color: 0x120c08, roughness: 1, transparent: true, opacity: 0.8, depthWrite: false });

  constructor(private particles: Particles, private ground: (x: number, z: number) => number) {}

  add(kind: number, team: number, x: number, z: number, r: number, dur: number) {
    const L: Live = { kind, x, z, r, t: dur, obj: null, light: null, pts: [] };
    if (kind === 0) {
      // caltrops scattered across the ground
      const n = 46;
      const im = new THREE.InstancedMesh(CALTROP, this.steel, n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        q.setFromEuler(e.set(0, Math.random() * Math.PI * 2, 0));
        m.compose(new THREE.Vector3(px, this.ground(px, pz), pz), q, new THREE.Vector3(1.6, 1.6, 1.6));
        im.setMatrixAt(i, m);
      }
      im.castShadow = false;
      L.obj = im;
    } else if (kind === 1) {
      // a scorched patch, and flames at a scatter of points across it
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 24), this.charred);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(x, this.ground(x, z) + 0.04, z);
      L.obj = disc;
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r * 0.85;
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        L.pts.push([px, this.ground(px, pz) + 0.05, pz]);
      }
      L.light = new THREE.PointLight(0xff8a3a, 6, r * 4, 2);
      L.light.position.set(x, this.ground(x, z) + 1.2, z);
      this.group.add(L.light);
    } else {
      // the house standard driven into the ground
      const g = new THREE.Group();
      const y = this.ground(x, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 3.4, 8), this.wood);
      pole.position.set(0, 1.7, 0);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.75, 6, 1), this.cloth[team] ?? this.cloth[0]);
      flag.position.set(0.56, 2.95, 0);
      flag.name = 'flag';
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 6), this.steel);
      tip.position.set(0, 3.5, 0);
      g.add(pole, flag, tip);
      g.position.set(x, y, z);
      g.traverse((o) => { o.castShadow = true; });
      L.obj = g;
    }
    if (L.obj) this.group.add(L.obj);
    this.live.push(L);
  }

  update(dt: number, time: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const L = this.live[i];
      L.t -= dt;
      if (L.t <= 0) {
        if (L.obj) this.group.remove(L.obj);
        if (L.light) this.group.remove(L.light);
        this.live.splice(i, 1);
        continue;
      }
      if (L.kind === 1) {
        const fade = Math.min(1, L.t / 0.8);
        for (const p of L.pts) this.particles.fire(p[0], p[1], p[2], 1.6 * fade, dt);
        if (L.light) L.light.intensity = (5 + Math.sin(time * 17 + L.x) * 1.5 + Math.sin(time * 7.3) * 1) * fade;
      } else if (L.kind === 2 && L.obj) {
        // the banner stirs in the wind
        const flag = L.obj.getObjectByName('flag');
        if (flag) flag.rotation.y = Math.sin(time * 1.7 + L.x) * 0.35;
      }
    }
  }

  clear() {
    for (const L of this.live) { if (L.obj) this.group.remove(L.obj); if (L.light) this.group.remove(L.light); }
    this.live.length = 0;
  }
}
