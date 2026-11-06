// Arrows: flying (re-simulated from spawn events), stuck in the ground, walls and shields,
// and stuck in knights (riding on their bones, ragdolls included).

import * as THREE from 'three';
import { ARROW } from '../../shared/data/weapons';
import { arrowGeo } from '../knights/armorGeo';
import { pbr, prepare } from '../render/materials';
import type { TextureBaker } from '../render/textures';

interface Flying { id: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }
interface Stuck { m: THREE.Matrix4; age: number }
export interface BodyArrow { bone: number; local: THREE.Matrix4 }

export class Arrows {
  readonly group = new THREE.Group();
  private parts: THREE.InstancedMesh[] = [];
  private flying = new Map<number, Flying>();
  private stuck: Stuck[] = [];
  private count = 0;
  private m = new THREE.Matrix4();
  constructor(baker: TextureBaker, private cap = 900) {
    const g = arrowGeo();
    const wood = pbr(baker.get('timber', undefined, '', 0.5), { color: 0xc8a070 });
    const steel = prepare(new THREE.MeshStandardMaterial({ color: 0x555558, metalness: 1, roughness: 0.4 }));
    const feather = prepare(new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.9, side: THREE.DoubleSide }));
    for (const [geo, mat] of [[g.wood, wood], [g.steel, steel], [g.cloth, feather]] as const) {
      const im = new THREE.InstancedMesh(geo, mat, cap);
      im.count = 0; im.frustumCulled = false; im.castShadow = true;
      this.parts.push(im);
      this.group.add(im);
    }
  }

  launch(id: number, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    this.flying.set(id, { id, x, y, z, vx, vy, vz, life: 6 });
  }

  /** Arrow struck something; returns the flight direction (for effects). */
  land(id: number, x: number, y: number, z: number, stickWorld: boolean): THREE.Vector3 | null {
    const f = this.flying.get(id);
    this.flying.delete(id);
    if (!f) return null;
    const dir = new THREE.Vector3(f.vx, f.vy, f.vz).normalize();
    if (stickWorld) {
      // embed a third of the shaft
      const tip = new THREE.Vector3(x, y, z).addScaledVector(dir, 0.22);
      this.stuck.push({ m: arrowMatrix(tip, dir, new THREE.Matrix4()), age: 0 });
      if (this.stuck.length > 300) this.stuck.shift();
    }
    return dir;
  }

  /** Matrix for an arrow embedded in a bone, from a world hit point and flight direction. */
  static bodyArrow(boneM: THREE.Matrix4, bone: number, x: number, y: number, z: number, dir: THREE.Vector3): BodyArrow {
    const world = arrowMatrix(new THREE.Vector3(x, y, z).addScaledVector(dir, 0.12), dir, new THREE.Matrix4());
    const inv = boneM.clone().invert();
    return { bone, local: inv.multiply(world) };
  }

  begin(dt: number) {
    this.count = 0;
    for (const f of this.flying.values()) {
      f.vy -= ARROW.gravity * dt;
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      f.life -= dt;
      if (f.life <= 0) { this.flying.delete(f.id); continue; }
      _d.set(f.vx, f.vy, f.vz).normalize();
      arrowMatrix(_p.set(f.x, f.y, f.z), _d, this.m);
      this.put(this.m);
    }
    for (const s of this.stuck) this.put(s.m);
  }
  /** Add an arrow riding on a knight bone. */
  body(boneM: THREE.Matrix4, a: BodyArrow) { this.put(this.m.multiplyMatrices(boneM, a.local)); }
  private put(m: THREE.Matrix4) {
    if (this.count >= this.cap) return;
    for (const p of this.parts) p.setMatrixAt(this.count, m);
    this.count++;
  }
  end() { for (const p of this.parts) { p.count = this.count; p.instanceMatrix.needsUpdate = true; } }
  clear() { this.flying.clear(); this.stuck.length = 0; }
}

/** Arrow geometry runs along +Y from the nock (0) to the tip (0.78). */
function arrowMatrix(tip: THREE.Vector3, dir: THREE.Vector3, out: THREE.Matrix4) {
  _q.setFromUnitVectors(_y.set(0, 1, 0), dir);
  const nock = _n.copy(tip).addScaledVector(dir, -0.78);
  return out.compose(nock, _q, _s.set(1, 1, 1));
}

const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _y = new THREE.Vector3(), _n = new THREE.Vector3(), _s = new THREE.Vector3();
