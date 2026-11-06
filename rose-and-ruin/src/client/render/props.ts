// Battlefield and castle props as instanced templates (one InstancedMesh per template part).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuiltMap, PropType } from '../../shared/world/mapgen';
import { Rng } from '../../shared/rng';
import { pbr, prepare } from './materials';
import type { TextureBaker } from './textures';
import { weatherPatch } from './structures';
import { TEAM_COLORS } from './heraldry';

type Part = { mat: string; geo: THREE.BufferGeometry };
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();

function place(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  E.set(rx, ry, rz);
  Q.setFromEuler(E);
  M.compose(P.set(x, y, z), Q, S.set(sx, sy, sz));
  const out = g.index ? g.toNonIndexed() : g.clone();
  out.applyMatrix4(M);
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  return out;
}
const cyl = (r0: number, r1: number, h: number, seg = 12) => new THREE.CylinderGeometry(r1, r0, h, seg, 1);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);

/** Pole/beam between two points as a thin cylinder. */
function pole(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 6): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = cyl(r, r, len, seg);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a).normalize();
  Q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  M.compose(mid, Q, S.set(1, 1, 1));
  const o = g.toNonIndexed(); o.applyMatrix4(M);
  return o;
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function rockGeo(seed: number, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const rng = new Rng(seed);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const offs = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let k = offs.get(key);
    if (k === undefined) { k = rng.range(0.75, 1.2); offs.set(key, k); }
    pos.setXYZ(i, x * k * 1.2, Math.max(-0.35, y * k * 0.7), z * k);
  }
  g.computeVertexNormals();
  return g.index ? g.toNonIndexed() : g;
}

function wheel(x: number, y: number, z: number, r: number, ry: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const torus = new THREE.TorusGeometry(r, 0.06, 6, 18);
  parts.push(place(torus, x, y, z, 0, ry, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    const sp = box(0.06, r * 2, 0.05);
    parts.push(place(sp, x, y, z, 0, ry, a));
  }
  parts.push(place(cyl(0.1, 0.1, 0.22, 10), x, y, z, Math.PI / 2, ry, 0));
  return parts;
}

function buildTemplate(t: PropType): Part[] {
  const parts: Record<string, THREE.BufferGeometry[]> = {};
  const add = (mat: string, ...g: THREE.BufferGeometry[]) => { (parts[mat] ??= []).push(...g); };
  switch (t) {
    case 'barrel': {
      add('planks', place(cyl(0.3, 0.35, 0.48, 14), 0, 0.24, 0), place(cyl(0.35, 0.3, 0.48, 14), 0, 0.72, 0));
      for (const y of [0.12, 0.42, 0.55, 0.85]) add('iron', place(cyl(0.34, 0.34, 0.04, 14), 0, y, 0, 0, 0, 0, 1.03, 1, 1.03));
      break;
    }
    case 'crate':
      add('planks', place(box(0.9, 0.9, 0.9), 0, 0.45, 0));
      for (const [x, z] of [[-0.43, -0.43], [0.43, -0.43], [0.43, 0.43], [-0.43, 0.43]]) add('timber', place(box(0.08, 0.92, 0.08), x, 0.46, z));
      break;
    case 'cart': {
      add('planks', place(box(1.5, 0.08, 2.6), 0, 0.85, 0), place(box(0.06, 0.45, 2.6), 0.75, 1.1, 0), place(box(0.06, 0.45, 2.6), -0.75, 1.1, 0), place(box(1.5, 0.45, 0.06), 0, 1.1, -1.3));
      add('timber', place(box(0.12, 0.12, 3.6), 0.45, 0.75, 1.0, 0.18, 0, 0), place(box(0.12, 0.12, 3.6), -0.45, 0.75, 1.0, 0.18, 0, 0), place(box(1.6, 0.1, 0.1), 0, 0.62, -0.2));
      add('timber', ...wheel(0.85, 0.6, -0.2, 0.58, Math.PI / 2), ...wheel(-0.85, 0.6, -0.2, 0.58, Math.PI / 2));
      add('hay', place(box(1.2, 0.5, 1.6), 0, 1.15, -0.3, 0.05, 0.1, 0));
      break;
    }
    case 'hay':
      add('hay', place(new THREE.CapsuleGeometry(0.42, 0.75, 4, 10), 0, 0.42, 0, 0, 0, Math.PI / 2, 1, 1, 0.85));
      break;
    case 'tent': {
      const w = 3.2, l = 4.0, h = 2.3;
      const half = Math.atan2(w / 2, h);
      const slant = Math.hypot(w / 2, h);
      for (const side of [-1, 1]) add('cloth', place(box(0.04, slant, l), side * w / 4, h / 2, 0, 0, 0, side * half));
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, h, 0, w / 2, 0, 0, -w / 2, 0, 0, 0, h, 0], 3));
      tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1, 1, 0, 0, 0, 0.5, 1], 2));
      tri.computeVertexNormals();
      add('cloth', place(tri, 0, 0, -l / 2), place(tri, 0, 0, l / 2));
      add('timber', pole(V(0, 0, -l / 2 - 0.1), V(0, h + 0.3, -l / 2 - 0.1), 0.05), pole(V(0, 0, l / 2 + 0.1), V(0, h + 0.3, l / 2 + 0.1), 0.05), pole(V(0, h, -l / 2 - 0.1), V(0, h, l / 2 + 0.1), 0.04));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('timber', pole(V(sx * (w / 2 + 0.6), 0, sz * l / 2), V(sx * w / 2, 0.3, sz * l / 2), 0.03, 4));
      break;
    }
    case 'pavilion': {
      add('cloth', place(new THREE.CylinderGeometry(2.8, 2.8, 2.2, 20, 1, true), 0, 1.1, 0));
      add('cloth', place(new THREE.ConeGeometry(3.2, 2.2, 20, 1, true), 0, 3.3, 0));
      add('timber', pole(V(0, 0, 0), V(0, 5.6, 0), 0.07));
      add('cloth2', place(box(0.02, 0.35, 1.0), 0, 5.35, 0.5));
      break;
    }
    case 'campfire': {
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; add('rock', place(rockGeo(i), Math.cos(a) * 0.55, 0.06, Math.sin(a) * 0.55, 0, a, 0, 0.16, 0.14, 0.14)); }
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; add('timber', pole(V(Math.cos(a) * 0.45, 0.02, Math.sin(a) * 0.45), V(Math.cos(a) * 0.05, 0.45, Math.sin(a) * 0.05), 0.05)); }
      add('ember', place(new THREE.CircleGeometry(0.38, 12), 0, 0.04, 0, -Math.PI / 2));
      break;
    }
    case 'brazier': {
      add('iron', place(cyl(0.18, 0.36, 0.3, 14), 0, 1.0, 0), place(cyl(0.36, 0.38, 0.05, 14), 0, 1.16, 0));
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; add('iron', pole(V(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42), V(Math.cos(a) * 0.15, 0.9, Math.sin(a) * 0.15), 0.025, 5)); }
      add('ember', place(new THREE.CircleGeometry(0.32, 12), 0, 1.15, 0, -Math.PI / 2));
      break;
    }
    case 'torch':
      add('timber', pole(V(0, 0, 0), V(0, 2.1, 0), 0.045));
      add('iron', place(cyl(0.06, 0.1, 0.18, 6), 0, 2.15, 0));
      add('ember', place(new THREE.SphereGeometry(0.07, 6, 4), 0, 2.22, 0));
      break;
    case 'banner': {
      add('timber', pole(V(0, 0, 0), V(0, 5.2, 0), 0.05));
      add('timber', pole(V(0, 4.95, 0), V(0, 4.95, 1.35), 0.03));
      const flag = new THREE.PlaneGeometry(1.3, 2.4, 6, 10);
      add('flag', place(flag, 0.03, 3.72, 0.68, 0, Math.PI / 2, 0));
      add('iron', place(new THREE.ConeGeometry(0.06, 0.25, 6), 0, 5.3, 0));
      break;
    }
    case 'well': {
      add('stone', place(new THREE.CylinderGeometry(1.1, 1.15, 0.9, 18, 1, true), 0, 0.45, 0), place(new THREE.RingGeometry(0.85, 1.12, 18), 0, 0.9, 0, -Math.PI / 2));
      add('void', place(new THREE.CircleGeometry(0.86, 18), 0, 0.6, 0, -Math.PI / 2));
      add('timber', pole(V(-1, 0.8, 0), V(-1, 2.6, 0), 0.07), pole(V(1, 0.8, 0), V(1, 2.6, 0), 0.07), pole(V(-1.1, 2.5, 0), V(1.1, 2.5, 0), 0.06));
      add('thatch', place(box(2.6, 0.08, 1.2), 0, 2.85, 0.42, 0.5, 0, 0), place(box(2.6, 0.08, 1.2), 0, 2.85, -0.42, -0.5, 0, 0));
      add('planks', place(cyl(0.16, 0.18, 0.3, 10), 0.3, 1.6, 0));
      break;
    }
    case 'rack': {
      add('timber', place(box(2.0, 0.1, 0.12), 0, 1.3, 0), place(box(2.0, 0.1, 0.12), 0, 0.4, 0), place(box(0.1, 1.5, 0.1), -0.95, 0.75, 0), place(box(0.1, 1.5, 0.1), 0.95, 0.75, 0));
      for (let i = 0; i < 6; i++) { const x = -0.75 + i * 0.3; add('iron', pole(V(x, 0.2, 0.08), V(x + 0.05, 1.7, -0.05), 0.012, 4)); add('timber', pole(V(x - 0.2, 0.15, 0.1), V(x - 0.1, 2.3, -0.1), 0.02, 5)); }
      break;
    }
    case 'trebuchet': {
      for (const sx of [-1, 1]) {
        add('timber', pole(V(sx * 1.2, 0.2, -2.8), V(sx * 1.2, 0.2, 2.8), 0.14, 6), pole(V(sx * 1.2, 0.2, -1.6), V(sx * 0.7, 5.5, 0), 0.13, 6), pole(V(sx * 1.2, 0.2, 1.6), V(sx * 0.7, 5.5, 0), 0.13, 6));
      }
      add('timber', pole(V(-0.8, 5.5, 0), V(0.8, 5.5, 0), 0.12, 8), pole(V(0, 5.5, 0), V(0, 1.0, -7.5), 0.16, 8), pole(V(0, 5.5, 0), V(0, 7.4, 2.2), 0.16, 8));
      add('planks', place(box(1.5, 1.4, 1.5), 0, 6.4, 2.6));
      add('timber', place(box(2.6, 0.2, 0.2), 0, 0.2, -2.8), place(box(2.6, 0.2, 0.2), 0, 0.2, 2.8));
      break;
    }
    case 'ladder':
      for (const sx of [-0.25, 0.25]) add('timber', pole(V(sx, 0, 0), V(sx, 6.5, 2.2), 0.05, 5));
      for (let i = 1; i < 14; i++) { const t = i / 14; add('timber', pole(V(-0.25, 6.5 * t, 2.2 * t), V(0.25, 6.5 * t, 2.2 * t), 0.025, 4)); }
      break;
    case 'rubbleStones':
      for (let i = 0; i < 3; i++) add('stone', place(rockGeo(i + 11), (i - 1) * 0.5, 0.15, (i % 2) * 0.4, 0.3 * i, i, 0.2, 0.42, 0.3, 0.32));
      break;
    case 'stakes':
      for (let i = 0; i < 6; i++) { const x = -1.4 + i * 0.56; add('timber', pole(V(x, -0.2, -0.3), V(x + 0.05, 1.3, 0.9), 0.06, 5)); }
      add('timber', pole(V(-1.6, 0.4, 0.1), V(1.6, 0.4, 0.1), 0.08, 6));
      break;
    case 'logs':
      for (let i = 0; i < 6; i++) { const row = i < 3 ? 0 : 1; const k = row ? i - 3 : i; add('timber', place(cyl(0.18, 0.18, 3.0, 10), 0, 0.18 + row * 0.32, (k - (row ? 0.5 : 1)) * 0.38, 0, 0, Math.PI / 2)); }
      break;
    case 'table':
      add('planks', place(box(2.0, 0.08, 0.9), 0, 0.82, 0));
      for (const [x, z] of [[-0.9, -0.35], [0.9, -0.35], [0.9, 0.35], [-0.9, 0.35]]) add('timber', place(box(0.08, 0.8, 0.08), x, 0.4, z));
      break;
    case 'sacks':
      for (let i = 0; i < 4; i++) add('cloth', place(new THREE.SphereGeometry(0.32, 10, 8), (i % 2) * 0.55 - 0.25, 0.25 + Math.floor(i / 2) * 0.35, (i % 3) * 0.2, 0, i, 0, 1, 0.75, 0.8));
      break;
    case 'fence':
      for (let z = -1.5; z <= 1.5; z += 1.5) add('timber', place(box(0.1, 1.1, 0.1), 0, 0.55, z));
      add('timber', place(box(0.06, 0.1, 3.1), 0, 0.9, 0), place(box(0.06, 0.1, 3.1), 0, 0.5, 0));
      break;
    case 'cannon':
      add('iron', place(cyl(0.34, 0.3, 2.6, 16), 0, 0.75, 0.1, Math.PI / 2 - 0.08, 0, 0));
      for (let i = 0; i < 6; i++) add('iron', place(cyl(0.37, 0.37, 0.08, 16), 0, 0.75 + (i - 3) * 0.02, -1.0 + i * 0.4, Math.PI / 2 - 0.08, 0, 0));
      add('planks', place(box(1.0, 0.35, 3.4), 0, 0.32, 0.2));
      add('timber', ...wheel(0.62, 0.45, 0.8, 0.42, Math.PI / 2), ...wheel(-0.62, 0.45, 0.8, 0.42, Math.PI / 2));
      break;
    case 'mantlet':
      add('planks', place(box(2.6, 1.9, 0.12), 0, 1.0, 0, -0.12, 0, 0));
      add('timber', pole(V(-1.0, 0, 0.9), V(-1.0, 1.6, 0.1), 0.05), pole(V(1.0, 0, 0.9), V(1.0, 1.6, 0.1), 0.05));
      break;
    case 'cross':
      add('stone', place(box(0.5, 0.5, 0.5), 0, 0.25, 0), place(box(0.24, 2.2, 0.24), 0, 1.5, 0), place(box(0.9, 0.22, 0.22), 0, 2.15, 0));
      break;
    case 'stall':
      for (const [x, z] of [[-1.4, -0.9], [1.4, -0.9], [1.4, 0.9], [-1.4, 0.9]]) add('timber', place(box(0.1, 2.4, 0.1), x, 1.2, z));
      add('cloth2', place(box(3.1, 0.04, 2.2), 0, 2.45, 0, 0.12, 0, 0));
      add('planks', place(box(2.8, 0.08, 1.0), 0, 0.9, -0.4));
      add('cloth', place(new THREE.SphereGeometry(0.25, 8, 6), -0.8, 1.1, -0.4), place(new THREE.SphereGeometry(0.22, 8, 6), 0.6, 1.08, -0.5));
      break;
    case 'boat': {
      const hull = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      add('planks', place(hull, 0, 0.55, 0, 0, 0, 0, 1.1, 0.7, 2.9));
      add('timber', pole(V(0, 0.4, -1.5), V(0, 0.4, 1.5), 0.05), pole(V(-0.9, 0.45, 0.4), V(0.9, 0.45, 0.4), 0.05));
      break;
    }
    case 'rock':
      add('rock', place(rockGeo(5, 2), 0, 0.2, 0, 0, 0, 0, 1.1, 1.0, 0.9));
      break;
    default:
      break;
  }
  return Object.entries(parts).map(([mat, gs]) => {
    const merged = mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }), false)!;
    merged.computeBoundingSphere();
    return { mat, geo: merged };
  });
}

export function propMaterials(baker: TextureBaker) {
  const cache = new Map<string, THREE.Material>();
  return (key: string): THREE.Material => {
    let m = cache.get(key);
    if (m) return m;
    switch (key) {
      case 'planks': m = pbr(baker.get('planks'), { repeat: [1, 1] }); break;
      case 'timber': m = pbr(baker.get('timber', undefined, '', 0.5), { color: 0x8a7d70 }); break;
      case 'iron': m = prepare(new THREE.MeshStandardMaterial({ color: 0x3a3a3c, metalness: 0.9, roughness: 0.5 })); break;
      case 'hay': m = pbr(baker.get('thatch'), { color: 0xd8c690 }); break;
      case 'cloth': m = pbr(baker.get('cloth', undefined, '', 0.5), { color: 0xffffff, side: THREE.DoubleSide, physical: true, sheen: 0.6 }); break;
      case 'cloth2': m = pbr(baker.get('cloth', undefined, '', 0.5), { color: 0xffffff, side: THREE.DoubleSide }); break;
      case 'flag': m = pbr(baker.get('cloth', undefined, '', 0.5), { side: THREE.DoubleSide, physical: true, sheen: 0.5 }); break;
      case 'stone': m = pbr(baker.get('rubble', undefined, 'grey'), { patches: [weatherPatch(1)], keys: ['weatherP'] }); break;
      case 'rock': m = pbr(baker.get('rock'), { patches: [weatherPatch(0.8)], keys: ['weatherRk'] }); break;
      case 'thatch': m = pbr(baker.get('thatch')); break;
      case 'void': m = prepare(new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 })); break;
      case 'ember': m = prepare(new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff5a14, emissiveIntensity: 3, roughness: 1 })); break;
      default: m = prepare(new THREE.MeshStandardMaterial({ color: 0xff00ff })); break;
    }
    cache.set(key, m);
    return m;
  };
}

export interface PropsView { group: THREE.Group; banners: THREE.InstancedMesh[]; dispose(): void }

export function buildProps(map: BuiltMap, baker: TextureBaker, flagTex: (team: number) => THREE.Texture): PropsView {
  const group = new THREE.Group();
  group.name = 'props';
  const getMat = propMaterials(baker);
  const byType = new Map<PropType, typeof map.props>();
  for (const p of map.props) (byType.get(p.type) ?? byType.set(p.type, []).get(p.type)!).push(p);
  const banners: THREE.InstancedMesh[] = [];
  const disposables: THREE.BufferGeometry[] = [];
  const mat4 = new THREE.Matrix4();
  for (const [type, list] of byType) {
    const parts = buildTemplate(type);
    for (const part of parts) {
      disposables.push(part.geo);
      if (part.mat === 'flag') {
        // one mesh per team so each flies its own heraldry
        for (const team of [0, 1, -1]) {
          const sub = list.filter((p) => (p.team ?? -1) === team);
          if (!sub.length) continue;
          const fm = new THREE.MeshPhysicalMaterial({ map: flagTex(team < 0 ? 0 : team), side: THREE.DoubleSide, roughness: 0.85, sheen: 0.5, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.7 });
          prepare(fm, [flagWind], ['flagwind']);
          const im = new THREE.InstancedMesh(part.geo, fm, sub.length);
          sub.forEach((p, i) => { mat4.compose(P.set(p.x, p.y, p.z), Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot), S.setScalar(p.s)); im.setMatrixAt(i, mat4); });
          im.castShadow = true; im.receiveShadow = true;
          im.frustumCulled = false;
          group.add(im);
          banners.push(im);
        }
        continue;
      }
      const im = new THREE.InstancedMesh(part.geo, getMat(part.mat), list.length);
      const colorize = part.mat === 'cloth' || part.mat === 'cloth2';
      list.forEach((p, i) => {
        mat4.compose(P.set(p.x, p.y, p.z), Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot), S.setScalar(p.s));
        im.setMatrixAt(i, mat4);
        if (colorize) {
          const c = p.team === undefined || p.team < 0
            ? new THREE.Color().setHSL(0.09 + ((i * 0.13) % 0.05), 0.25, 0.62)
            : new THREE.Color(TEAM_COLORS[p.team][part.mat === 'cloth' ? (i % 3 === 0 ? 1 : 0) : 1]);
          im.setColorAt(i, c);
        }
      });
      // only props big enough to matter cast shadows (each caster costs a draw per cascade)
      if (!part.geo.boundingSphere) part.geo.computeBoundingSphere();
      im.castShadow = part.mat !== 'ember' && (part.geo.boundingSphere?.radius ?? 1) * (list[0]?.s ?? 1) > 0.7;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      group.add(im);
    }
  }
  return { group, banners, dispose() { disposables.forEach((g) => g.dispose()); } };
}

/** Banner cloth rippling in the wind (vertex displacement grows away from the pole). */
export const flagWind = (s: THREE.WebGLProgramParametersWithUniforms) => {
  s.uniforms.uTime = { value: 0 };
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uTime;')
    .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
{
  float k = clamp(uv.x, 0.0, 1.0);
  float ph = uTime * 3.2 + position.y * 1.6 - uv.x * 4.0;
  transformed.z += sin(ph) * 0.14 * k + sin(ph * 2.3 + 1.0) * 0.05 * k;
  transformed.y += sin(ph * 0.7) * 0.03 * k;
}`);
  flagUniforms.push(s.uniforms.uTime);
};
export const flagUniforms: { value: number }[] = [];
