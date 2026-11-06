// Instanced rendering of every knight (and corpse) on the field. Each armour piece type is
// one InstancedMesh, so a hundred knights cost the same number of draw calls as one. Per
// instance: team heraldry variant and accumulated blood and mud.

import * as THREE from 'three';
import type { ClassId } from '../../shared/data/classes';
import { CLASS_IDS } from '../../shared/data/classes';
import { KITS, pieceGeometry, type MatKey, type PieceDef } from './kits';
import { B } from './skeleton';
import { pbr, prepare, type Patch } from '../render/materials';
import type { TextureBaker } from '../render/textures';
import { canvasTexture, drawShield, drawTabard, TEAM_COLORS } from '../render/heraldry';
import { NOISE_GLSL } from '../render/glsl';

/** Blood and mud on armour and cloth: object-space noise masks driven by a per-instance attribute. */
const wearPatch: Patch = (s) => {
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 aWear; varying vec2 vWear; varying vec3 vObj;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWear = aWear; vObj = position;');
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec2 vWear; varying vec3 vObj;\n${NOISE_GLSL}\nfloat rrBlood = 0.0;`)
    .replace('#include <map_fragment>', /* glsl */ `#include <map_fragment>
{
  vec3 o = vObj * 9.0;
  float n = vnoiseP(o.xy + o.z * 1.7, vec2(1e4)) * 0.55 + vnoiseP(o.zy * 2.3 + 7.0, vec2(1e4)) * 0.3 + vnoiseP(o.xz * 6.0, vec2(1e4)) * 0.15;
  float drip = vnoiseP(vec2(o.x * 3.0 + o.z * 2.0, o.y * 0.6), vec2(1e4));
  rrBlood = smoothstep(1.0 - vWear.x * 0.85, 1.0 - vWear.x * 0.85 + 0.08, n * 0.75 + drip * 0.35);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.008, 0.004), rrBlood * 0.92);
  float mudN = vnoiseP(o.xz * 0.7 + o.y * 0.4 + 3.0, vec2(1e4));
  float mud = smoothstep(1.0 - vWear.y, 1.0 - vWear.y + 0.25, mudN) * vWear.y;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.1, 0.07), mud * 0.85);
}`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.22, rrBlood * 0.7);')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - rrBlood * 0.85;');
};

interface Batch { mesh: THREE.InstancedMesh; wear: THREE.InstancedBufferAttribute; count: number; cap: number }

export interface KnightDrawable {
  bones: THREE.Matrix4[];
  weapon: THREE.Matrix4 | null;
  offhand: THREE.Matrix4;
  daggerOut: boolean;
  bowBend: number;
  nock: THREE.Vector3;
  arrowNocked: boolean;
  aimYaw: number; aimPitch: number;
}

const SHEATH = new THREE.Matrix4().compose(new THREE.Vector3(-0.17, -0.06, -0.05), new THREE.Quaternion().setFromEuler(new THREE.Euler(2.6, 0, 0.3)), new THREE.Vector3(1, 1, 1));
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

export class KnightRenderer {
  readonly group = new THREE.Group();
  private batches = new Map<string, Batch>();
  private mats = new Map<string, THREE.Material>();
  private lines: Batch;
  private lineMat: THREE.Material;

  constructor(private baker: TextureBaker, readonly capacity: number) {
    this.group.name = 'knights';
    // pre-create every batch so shaders compile up front
    for (const cls of CLASS_IDS) for (const p of KITS[cls]) for (const team of p.team ? [0, 1] : [-1]) this.batch(p, team);
    this.lineMat = prepare(new THREE.MeshStandardMaterial({ color: 0xd8d0bc, roughness: 0.8 }));
    const lg = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    lg.translate(0, 0.5, 0);
    this.lines = this.makeBatch(lg, this.lineMat, capacity * 3);
    this.lines.mesh.castShadow = false;
  }

  private material(key: MatKey, team: number): THREE.Material {
    const id = key + ':' + team;
    let m = this.mats.get(id);
    if (m) return m;
    const b = this.baker;
    const steel = b.get('steel', undefined, '', 0.5);
    const common = { patches: [wearPatch], keys: ['wear'] };
    const teamCol = team >= 0 ? TEAM_COLORS[team][0] : 0xffffff;
    switch (key) {
      case 'steel': m = pbr(steel, { ...common, color: 0xc8cbd0, metalness: 1, roughness: 1, physical: true, envMapIntensity: 1.7, normalScale: 0.35, aoStrength: 0 }); break;
      case 'steelBright': m = pbr(steel, { ...common, color: 0xd8dbe0, metalness: 1, roughness: 0.72, physical: true, envMapIntensity: 1.8, normalScale: 0.25, aoStrength: 0 }); break;
      case 'steelDark': m = pbr(steel, { ...common, color: 0x5a5d62, metalness: 1, roughness: 1.2, physical: true, envMapIntensity: 1.5, normalScale: 0.4, aoStrength: 0 }); break;
      case 'brass': m = pbr(steel, { ...common, color: 0xc9a050, metalness: 1, roughness: 1.1, physical: true, aoStrength: 0 }); break;
      case 'mail': m = pbr(b.get('mail', undefined, '', 0.5), { ...common, color: 0xb6b8bc, metalness: 0.95, roughness: 1, normalScale: 1.6, repeat: [3, 3] }); break;
      case 'leather': m = pbr(b.get('leather', undefined, '', 0.5), { ...common, color: 0x9a7356 }); break;
      case 'leatherDark': m = pbr(b.get('leather', undefined, '', 0.5), { ...common, color: 0x4a3226 }); break;
      case 'grip': m = pbr(b.get('leather', undefined, '', 0.5), { ...common, color: 0x3a261a, repeat: [4, 4] }); break;
      case 'cloth': m = pbr(b.get('cloth', undefined, '', 0.5), { ...common, color: team >= 0 ? teamCol : 0xb0a890, physical: true, sheen: 0.35, sheenColor: new THREE.Color(teamCol).lerp(new THREE.Color(0xffffff), 0.4).getHex(), side: THREE.DoubleSide, repeat: [2, 2] }); break;
      case 'clothDark': m = pbr(b.get('cloth', undefined, '', 0.5), { ...common, color: 0x2e2a26, physical: true, sheen: 0.5, repeat: [2, 2] }); break;
      case 'quilt': m = pbr(b.get('quilt', undefined, '', 0.5), { ...common, color: 0xc2b294, repeat: [1.5, 1.5] }); break;
      case 'wood': m = pbr(b.get('timber', undefined, '', 0.5), { ...common, color: 0xb08860 }); break;
      case 'shieldBack': m = pbr(b.get('planks', undefined, '', 0.5), { ...common, color: 0x8a6a4a }); break;
      case 'void': m = prepare(new THREE.MeshStandardMaterial({ color: 0x030202, roughness: 1, envMapIntensity: 0 })); break;
      case 'plume': m = pbr(b.get('cloth', undefined, '', 0.5), { ...common, color: team >= 0 ? TEAM_COLORS[team][team === 0 ? 0 : 1] : 0xffffff, physical: true, sheen: 1 }); break;
      case 'brig': m = pbr(b.get('cloth', undefined, '', 0.5), { ...common, color: new THREE.Color(teamCol).multiplyScalar(0.75).getHex(), physical: true, sheen: 0.3, sheenColor: new THREE.Color(teamCol).lerp(new THREE.Color(0xffffff), 0.3).getHex(), repeat: [2, 2] }); break;
      case 'tabard': {
        const tex = canvasTexture(512, 512, (c, w, h) => drawTabard(c, w, h, Math.max(0, team)));
        const mm = new THREE.MeshPhysicalMaterial({ map: tex, normalMap: b.get('cloth', undefined, '', 0.5).normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95, sheen: 0.35, sheenColor: new THREE.Color(TEAM_COLORS[Math.max(0, team)][0]).lerp(new THREE.Color(0xffffff), 0.35), sheenRoughness: 0.8, side: THREE.DoubleSide });
        m = prepare(mm, [wearPatch], ['wear', 'tabard']);
        break;
      }
      case 'shieldFace': {
        const tex = canvasTexture(256, 384, (c, w, h) => drawShield(c, w, h, Math.max(0, team), 0));
        const mm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.0 });
        m = prepare(mm, [wearPatch], ['wear', 'shield']);
        break;
      }
      default: m = prepare(new THREE.MeshStandardMaterial({ color: 0xff00ff }));
    }
    this.mats.set(id, m);
    return m;
  }

  private makeBatch(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number): Batch {
    // share vertex data but give each batch its own per-instance wear attribute
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, a);
    if (geo.index) g.setIndex(geo.index);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const wear = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    wear.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aWear', wear);
    const mesh = new THREE.InstancedMesh(g, mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return { mesh, wear, count: 0, cap };
  }

  private batch(p: PieceDef, team: number): Batch {
    const id = p.key + '|' + p.mat + '|' + (p.team ? team : -1);
    let b = this.batches.get(id);
    if (!b) {
      b = this.makeBatch(pieceGeometry(p), this.material(p.mat, p.team ? team : -1), this.capacity * 2);
      if (p.mat === 'void') b.mesh.castShadow = false;
      this.batches.set(id, b);
    }
    return b;
  }

  begin() { for (const b of this.batches.values()) b.count = 0; this.lines.count = 0; }

  /** Queue one knight. lod: 0 near, 1 far (skips details). */
  draw(cls: ClassId, team: number, d: KnightDrawable, blood: number, mud: number, lod: number, hideHead: boolean) {
    for (const p of KITS[cls]) {
      if (lod > 0 && p.detail) continue;
      if (hideHead && p.head) continue;
      let base: THREE.Matrix4;
      if (typeof p.mount === 'number') base = d.bones[p.mount];
      else if (p.mount === 'weapon') { if (!d.weapon) continue; base = d.weapon; }
      else if (p.mount === 'offhand' || p.mount === 'bow') base = d.offhand;
      else if (p.mount === 'dagger') {
        if (d.daggerOut && d.weapon) base = d.weapon;
        else { _m.multiplyMatrices(d.bones[B.pelvis], SHEATH); base = _m; }
      } else continue;
      const b = this.batch(p, team);
      if (b.count >= b.cap) continue;
      b.mesh.setMatrixAt(b.count, base);
      const legPiece = p.mount === B.shinL || p.mount === B.shinR || p.mount === B.footL || p.mount === B.footR;
      b.wear.setXY(b.count, blood, Math.min(1, mud * (legPiece ? 1.6 : 0.6)));
      b.count++;
    }
    if (cls === 'longbowman') this.bowString(d);
  }

  private line(a: THREE.Vector3, b: THREE.Vector3, r: number) {
    const L = this.lines;
    if (L.count >= L.cap) return;
    _v.subVectors(b, a);
    const len = _v.length();
    if (len < 1e-4) return;
    _q.setFromUnitVectors(_v2.set(0, 1, 0), _v.divideScalar(len));
    _m.compose(a, _q, _s.set(r, len, r));
    L.mesh.setMatrixAt(L.count, _m);
    L.wear.setXY(L.count, 0, 0);
    L.count++;
  }

  private bowString(d: KnightDrawable) {
    const top = _t1.set(0, 0.92, -0.01 + d.bowBend * 0.09).applyMatrix4(d.offhand);
    const bot = _t2.set(0, -0.92, -0.01 + d.bowBend * 0.09).applyMatrix4(d.offhand);
    if (d.arrowNocked || d.bowBend > 0.02) {
      this.line(top, d.nock, 0.0028);
      this.line(d.nock, bot, 0.0028);
    } else this.line(top, bot, 0.0028);
    if (d.arrowNocked) {
      _dir.set(-Math.sin(d.aimYaw) * Math.cos(d.aimPitch), Math.sin(d.aimPitch), -Math.cos(d.aimYaw) * Math.cos(d.aimPitch));
      // the arrow lies along the bow hand direction from the nock
      _t3.setFromMatrixPosition(d.offhand).sub(d.nock).normalize();
      _t3.lerp(_dir, 0.2).normalize();
      this.line(d.nock, _t4.copy(d.nock).addScaledVector(_t3, 0.82), 0.0045);
    }
  }

  end() {
    for (const b of [...this.batches.values(), this.lines]) {
      b.mesh.count = b.count;
      if (b.count) { b.mesh.instanceMatrix.needsUpdate = true; b.wear.needsUpdate = true; }
    }
  }

  get drawCalls() { let n = 0; for (const b of this.batches.values()) if (b.count) n++; return n; }
}

const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3(), _t4 = new THREE.Vector3(), _dir = new THREE.Vector3();
