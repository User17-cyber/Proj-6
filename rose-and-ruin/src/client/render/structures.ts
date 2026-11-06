// Castle architecture from StructureDefs: curtain walls with plinths, parapets, merlons and
// arrow slits; round, square and polygonal towers with corbelling and stair turrets; twin-towered
// gatehouses with arches, portcullis and doors; Norman keeps; stone and timber-framed buildings;
// bridges, ramps and palisades. Everything is merged into one mesh per material.

import * as THREE from 'three';
import type { BuiltMap, StructureDef, StoneStyle } from '../../shared/world/mapgen';
import { Builder, Frame } from './geom';
import { pbr, prepare, type Patch } from './materials';
import type { TextureBaker } from './textures';
import { NOISE_GLSL } from './glsl';
import { Rng } from '../../shared/rng';

const STONE: Record<StoneStyle, { gen: string; tint: [number, number, number]; rows: number }> = {
  ashlar: { gen: 'ashlar', tint: [0.53, 0.48, 0.4], rows: 6 },
  rubble: { gen: 'rubble', tint: [0.52, 0.5, 0.46], rows: 6 },
  banded: { gen: 'ashlar', tint: [0.56, 0.52, 0.48], rows: 6 },
  white: { gen: 'ashlar', tint: [0.7, 0.67, 0.6], rows: 7 },
  red: { gen: 'ashlar', tint: [0.6, 0.45, 0.38], rows: 6 },
};

/** World-space weathering for masonry: damp bases, rain streaks, moss on ledges, stains. */
export function weatherPatch(strength = 1): Patch {
  return (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWN; varying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n{ vec4 wp4 = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n wp4 = instanceMatrix * wp4;\n#endif\n vWP = (modelMatrix * wp4).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal); }');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWN; varying vec3 vWP;\n${NOISE_GLSL}\nuniform float uWeather;`)
      .replace('#include <map_fragment>', /* glsl */ `#include <map_fragment>
{
  vec3 n = normalize(vWN);
  float big = vnoiseP(vWP.xz * 0.04 + vWP.y * 0.02, vec2(1e4)) * 0.6 + vnoiseP(vWP.xy * 0.09 + vWP.zy * 0.07, vec2(1e4)) * 0.4;
  diffuseColor.rgb *= mix(0.68, 1.12, big);
  // rain streaks on vertical faces
  float vert = 1.0 - abs(n.y);
  float streak = vnoiseP(vec2(dot(vWP.xz, vec2(n.z, -n.x)) * 1.7, vWP.y * 0.08), vec2(1e4));
  streak = smoothstep(0.55, 0.9, streak) * vert;
  diffuseColor.rgb *= 1.0 - streak * 0.42 * uWeather;
  // moss and lichen on upward ledges and in damp spots
  float up = smoothstep(0.55, 0.95, n.y);
  float moss = smoothstep(0.45, 0.75, vnoiseP(vWP.xz * 0.6, vec2(1e4)) * 0.7 + vnoiseP(vWP.xz * 3.1, vec2(1e4)) * 0.3);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.19, 0.08), up * moss * 0.65 * uWeather);
  float lich = smoothstep(0.78, 0.86, vnoiseP(vWP.xy * 1.3 + vWP.zx * 1.1, vec2(1e4)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.62, 0.5), lich * 0.25 * vert * uWeather);
}`);
    s.uniforms.uWeather = { value: strength };
  };
}

export interface StructureMaterials {
  get(key: string): THREE.Material;
}

export function structureMaterials(baker: TextureBaker, quality: number): StructureMaterials {
  const mats = new Map<string, THREE.Material>();
  const sz = quality >= 3 ? 2 : quality <= 0 ? 0.5 : 1;
  const make = (key: string): THREE.Material => {
    const [kind, style] = key.split(':') as [string, StoneStyle];
    switch (kind) {
      case 'stone':
      case 'trim': {
        const st = STONE[style ?? 'ashlar'] ?? STONE.ashlar;
        const set = st.gen === 'rubble'
          ? baker.get('rubble', { uTint: new THREE.Color(...st.tint) }, style, sz)
          : baker.get('ashlar', { uTint: new THREE.Color(...st.tint), uRows: st.rows }, style, sz);
        return pbr(set, { vertexColors: true, color: kind === 'trim' ? 0xc8c2b8 : 0xffffff, normalScale: 1.2, patches: [weatherPatch(style === 'white' ? 0.6 : 1)], keys: ['weather' + style] });
      }
      case 'rubbleWall': return pbr(baker.get('rubble', undefined, 'grey', sz), { vertexColors: true, patches: [weatherPatch(1)], keys: ['weatherR'] });
      case 'slate': return pbr(baker.get('slate', undefined, '', sz), { vertexColors: true, envMapIntensity: 0.9 });
      case 'tile': return pbr(baker.get('tile', undefined, '', sz), { vertexColors: true });
      case 'lead': return pbr(baker.get('lead', undefined, '', sz * 0.5), { vertexColors: true, metalness: 0.6, color: 0xb0b4b8 });
      case 'thatch': return pbr(baker.get('thatch', undefined, '', sz), { vertexColors: true, normalScale: 1.5 });
      case 'planks': return pbr(baker.get('planks', undefined, '', sz), { vertexColors: true });
      case 'timber': return pbr(baker.get('timber', undefined, '', sz * 0.5), { vertexColors: true, color: 0x9a8d80 });
      case 'daub': return pbr(baker.get('daub', undefined, '', sz * 0.5), { vertexColors: true });
      case 'iron': return prepare(new THREE.MeshStandardMaterial({ color: 0x2a2a2c, metalness: 0.85, roughness: 0.55, vertexColors: true }));
      case 'void': return prepare(new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 1, metalness: 0, envMapIntensity: 0.05 }));
      case 'glass': return prepare(new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.25, metalness: 0.2 }));
      default: return prepare(new THREE.MeshStandardMaterial({ color: 0xff00ff }));
    }
  };
  return {
    get(key) {
      let m = mats.get(key);
      if (!m) { m = make(key); mats.set(key, m); }
      return m;
    },
  };
}

/** Darken masonry near the ground (damp and dirt). */
function groundAo(map: BuiltMap) {
  const t = map.world.terrain;
  return (x: number, y: number, z: number) => {
    const g = t.height(x, z);
    const above = y - g;
    return 0.6 + 0.4 * THREE.MathUtils.clamp(above / 3.5, 0, 1);
  };
}

export function buildStructures(map: BuiltMap, mats: StructureMaterials): THREE.Group {
  const b = new Builder();
  b.ao = groundAo(map);
  const rng = new Rng(77 + map.def.id.length);
  for (const s of map.structures) build(b, s, rng, map);
  const group = new THREE.Group();
  group.name = 'structures';
  for (const [key, geo] of b.build()) {
    const mesh = new THREE.Mesh(geo, mats.get(key));
    mesh.castShadow = key !== 'void';
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return group;
}

const UV = 4;

function merlonsLine(b: Builder, key: string, f: Frame, x: number, y: number, z0: number, z1: number, depth = 0.5) {
  const len = z1 - z0;
  const n = Math.max(1, Math.floor(len / 2.5));
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const zc = z0 + step * (i + 0.5);
    b.box(key, f, x, y + 0.65, zc, depth, 1.3, Math.min(1.45, step * 0.6), UV);
  }
}

function slit(b: Builder, f: Frame, x: number, y: number, z: number, side: 1 | -1, alongZ = true) {
  // dark arrow loop with a stone surround
  if (alongZ) {
    b.box('void', f, x + side * 0.015, y, z, 0.03, 1.5, 0.16, 1, 0b000011);
  } else {
    b.box('void', f, x, y, z + side * 0.015, 0.16, 1.5, 0.03, 1, 0b110000);
  }
}

function build(b: Builder, s: StructureDef, rng: Rng, map: BuiltMap) {
  switch (s.type) {
    case 'wall': return wall(b, s, rng);
    case 'tower': return tower(b, s, rng);
    case 'gatehouse': return gatehouse(b, s, rng);
    case 'keep': return keep(b, s, rng);
    case 'building': return building(b, s, rng);
    case 'bridge': return bridge(b, s, map);
    case 'ramp': return ramp(b, s);
    case 'palisade': return palisade(b, s, rng, map);
    default: return;
  }
}

function wall(b: Builder, s: Extract<StructureDef, { type: 'wall' }>, rng: Rng) {
  const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
  const rot = Math.atan2(s.bx - s.ax, s.bz - s.az);
  const f = new Frame((s.ax + s.bx) / 2, 0, (s.az + s.bz) / 2, rot);
  const K = 'stone:' + s.style, T = 'trim:' + s.style;
  const t = s.thick;
  const breakLen = 3.2;
  const z0 = -len / 2 + (s.brokenA ? breakLen : 0), z1 = len / 2 - (s.brokenB ? breakLen : 0);
  const h = s.top - s.base;
  // body and battered plinth
  b.box(K, f, 0, s.base + h / 2, (z0 + z1) / 2, t, h, z1 - z0, UV);
  b.box(T, f, 0, s.base + 1.6, (z0 + z1) / 2, t + 0.7, 3.2, z1 - z0, UV, 0b110111);
  b.box(T, f, 0, s.base + 3.25, (z0 + z1) / 2, t + 0.45, 0.12, z1 - z0 + 0.01, UV);
  // string course below the parapet
  b.box(T, f, 0, s.top - 0.3, (z0 + z1) / 2, t + 0.22, 0.25, z1 - z0, UV);
  // parapets and merlons
  if (s.crenel) {
    for (const side of [-1, 1]) {
      const x = side * (t / 2 - 0.22);
      b.box(K, f, x, s.top + 0.55, (z0 + z1) / 2, 0.44, 1.1, z1 - z0, UV);
      merlonsLine(b, K, f, x, s.top + 1.1, z0 + 0.4, z1 - 0.4);
    }
  }
  if (s.slits) {
    for (let z = z0 + 3; z < z1 - 2; z += 6) {
      slit(b, f, t / 2, s.top - 3.4, z, 1);
      slit(b, f, -t / 2, s.top - 3.4, z + 3, -1);
    }
  }
  // broken ends: jagged, stepped masonry
  const broken = (end: number) => {
    const dir = end > 0 ? 1 : -1;
    const start = end > 0 ? z1 : z0;
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const zz = start + dir * (i + 0.5) * (breakLen / steps);
      const hh = h * (0.92 - (i / steps) * 0.75) * rng.range(0.8, 1.05);
      b.box(K, f, rng.range(-0.15, 0.15), s.base + hh / 2, zz, t * rng.range(0.75, 1), hh, breakLen / steps + 0.02, UV);
    }
  };
  if (s.brokenA) broken(-1);
  if (s.brokenB) broken(1);
}

function roundTower(b: Builder, K: string, T: string, x: number, z: number, r: number, base: number, top: number, segs: number, flat: boolean, rng: Rng, roof: 'cone' | 'flat' | 'none', turret?: boolean, rot = 0) {
  const h = top - base;
  b.cylinder(K, x, base, z, r * 1.1, r, h, segs, UV, 0, flat, rot);
  b.cylinder(T, x, base, z, r * 1.16, r * 1.12, 3.6, segs, UV, 0, flat, rot);
  b.cylinder(T, x, top - 5.5, z, r + 0.12, r + 0.12, 0.3, segs, UV, 0, flat, rot);
  // corbelled parapet
  const nCor = Math.max(8, Math.round((2 * Math.PI * r) / 1.1));
  for (let i = 0; i < nCor; i++) {
    const th = (i / nCor) * Math.PI * 2;
    const f = new Frame(x + Math.cos(th) * (r + 0.18), 0, z + Math.sin(th) * (r + 0.18), -th);
    b.box(T, f, 0, top - 0.35, 0, 0.42, 0.55, 0.42, 2);
  }
  b.cylinder(K, x, top, z, r + 0.38, r + 0.38, 1.1, segs, UV, 0b10, flat, rot, r - 0.12);
  const nM = Math.max(6, Math.floor((2 * Math.PI * (r + 0.38)) / 2.5));
  for (let i = 0; i < nM; i++) {
    const th = (i / nM) * Math.PI * 2 + 0.2;
    const f = new Frame(x + Math.cos(th) * (r + 0.13), 0, z + Math.sin(th) * (r + 0.13), -th);
    b.box(K, f, 0, top + 1.1 + 0.65, 0, 0.5, 1.3, 1.25, UV);
  }
  // arrow loops at two heights
  for (let level = 0; level < 2; level++) {
    const y = base + h * (0.45 + level * 0.25);
    const n = Math.max(3, Math.round(r));
    for (let i = 0; i < n; i++) {
      const th = ((i + level * 0.5) / n) * Math.PI * 2 + rng.range(-0.1, 0.1);
      const f = new Frame(x + Math.cos(th) * (r * 1.03 + 0.02), 0, z + Math.sin(th) * (r * 1.03 + 0.02), -th);
      b.box('void', f, 0, y, 0, 0.04, 1.5, 0.17, 1, 0b000001);
    }
  }
  if (roof === 'cone') {
    b.cone('slate', x, top + 0.9, z, r + 0.75, r * 1.5 + 1.5, segs, 3);
  } else if (roof === 'flat') {
    b.cylinder('lead', x, top - 0.05, z, r - 0.1, r - 0.1, 0.1, segs, 4, 0b10);
  }
  if (turret) {
    const th = rng.range(0, Math.PI * 2);
    const tr = Math.min(1.6, r * 0.28);
    const tx = x + Math.cos(th) * (r - tr - 0.2), tz = z + Math.sin(th) * (r - tr - 0.2);
    b.cylinder(K, tx, top, tz, tr, tr, 4.2, 14, UV, 0);
    b.cylinder(K, tx, top + 4.2, tz, tr + 0.2, tr + 0.2, 0.9, 14, UV, 0b10, false, 0, tr - 0.2);
    b.cone('slate', tx, top + 5.1, tz, tr + 0.35, tr * 2.2 + 1, 14, 3);
  }
}

function tower(b: Builder, s: Extract<StructureDef, { type: 'tower' }>, rng: Rng) {
  const K = 'stone:' + s.style, T = 'trim:' + s.style;
  if (s.shape === 'square') {
    const hx = s.hx ?? s.r, hz = s.hz ?? s.r;
    const f = new Frame(s.x, 0, s.z, s.rot);
    const h = s.top - s.base;
    b.box(K, f, 0, s.base + h / 2, 0, hx * 2, h, hz * 2, UV);
    b.box(T, f, 0, s.base + 1.8, 0, hx * 2 + 0.7, 3.6, hz * 2 + 0.7, UV);
    // corner quoins
    for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(T, f, cx * (hx - 0.3 + 0.05), s.base + h / 2, cz * (hz - 0.3 + 0.05), 0.7, h, 0.7, UV);
    b.box(T, f, 0, s.top - 0.3, 0, hx * 2 + 0.25, 0.25, hz * 2 + 0.25, UV);
    // parapet ring and merlons
    for (const side of [-1, 1]) {
      b.box(K, f, side * (hx - 0.2), s.top + 0.55, 0, 0.45, 1.1, hz * 2, UV);
      b.box(K, f, 0, s.top + 0.55, side * (hz - 0.2), hx * 2, 1.1, 0.45, UV);
      merlonsLine(b, K, f, side * (hx - 0.2), s.top + 1.1, -hz + 0.6, hz - 0.6);
      const fr = new Frame(s.x, 0, s.z, s.rot + Math.PI / 2);
      merlonsLine(b, K, fr, side * (hz - 0.2), s.top + 1.1, -hx + 0.6, hx - 0.6);
    }
    b.box('lead', f, 0, s.top + 0.02, 0, hx * 2 - 0.5, 0.05, hz * 2 - 0.5, 4, 0b000100);
    for (let k = 0; k < 2; k++) {
      const y = s.base + h * (0.5 + k * 0.22);
      slit(b, f, hx, y, (k - 0.5) * hz * 0.6, 1);
      slit(b, f, -hx, y, -(k - 0.5) * hz * 0.6, -1);
      slit(b, f, (k - 0.5) * hx * 0.6, y, hz, 1, false);
      slit(b, f, -(k - 0.5) * hx * 0.6, y, -hz, -1, false);
    }
    if (s.roof === 'cone') {
      // pyramidal spire (church towers)
      b.cone('slate', s.x, s.top + 1.0, s.z, Math.max(hx, hz) * 1.2, Math.max(hx, hz) * 3.2, 4, 3);
    }
    return;
  }
  const segs = s.shape === 'poly' ? s.sides : s.r > 4 ? 30 : 22;
  roundTower(b, K, T, s.x, s.z, s.r, s.base, s.top, segs, s.shape === 'poly', rng, s.roof, s.turret, s.rot + (s.shape === 'poly' ? Math.PI / segs : 0));
}

function arch(b: Builder, key: string, f: Frame, zFace: number, w: number, spring: number, depth: number) {
  // voussoirs around a round arch plus the spandrel fill up to the lintel line
  const r = w / 2;
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI, a1 = ((i + 1) / n) * Math.PI;
    const am = (a0 + a1) / 2;
    const x = Math.cos(am) * (r + 0.3), y = spring + Math.sin(am) * (r + 0.3);
    const fr = new Frame(f.px(x, zFace), 0, f.pz(x, zFace), f.rot);
    b.box(key, fr, 0, y, 0, 0.62 * (Math.abs(Math.cos(am)) + 0.5), 0.62, depth, 2);
  }
  // fill corners between arch and the square opening top
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const x = side * (r - 0.25 - k * 0.38), hgt = r - Math.sqrt(Math.max(0, r * r - (r - 0.12 - k * 0.38) ** 2)) + 0.05;
      b.box(key, f, x, spring + r - hgt / 2 + 0.02, zFace, 0.4, hgt, depth * 0.95, 2);
    }
  }
}

function gatehouse(b: Builder, s: Extract<StructureDef, { type: 'gatehouse' }>, rng: Rng) {
  const K = 'stone:' + s.style, T = 'trim:' + s.style;
  const f = new Frame(s.x, 0, s.z, s.rot);
  const sideW = s.w / 2 - s.passW / 2;
  const h = s.top - s.base;
  for (const sg of [-1, 1]) {
    const cx = sg * (s.passW / 2 + sideW / 2);
    b.box(K, f, cx, s.base + h / 2, 0, sideW, h, s.d, UV);
    b.box(T, f, cx, s.base + 1.8, 0, sideW + 0.6, 3.6, s.d + 0.6, UV);
  }
  // over the passage: arch springs at passH - passW/2
  const spring = s.floor + s.passH - s.passW / 2;
  b.box(K, f, 0, (s.floor + s.passH + s.top) / 2, 0, s.passW, s.top - s.floor - s.passH, s.d, UV);
  arch(b, T, f, -s.d / 2 - 0.12, s.passW, spring, 0.3);
  arch(b, T, f, s.d / 2 + 0.12, s.passW, spring, 0.3);
  // dark vault ceiling
  b.box('void', f, 0, s.floor + s.passH - 0.01, 0, s.passW - 0.02, 0.02, s.d - 0.1, 1, 0b001000);
  // portcullis raised into its slot, teeth showing
  const pz = -s.d / 2 + 1.1;
  const pBottom = s.floor + s.passH - 1.0;
  for (let x = -s.passW / 2 + 0.2; x <= s.passW / 2 - 0.15; x += 0.34) b.box('iron', f, x, pBottom + 0.9, pz, 0.07, 1.8, 0.07, 1);
  b.box('iron', f, 0, pBottom + 0.55, pz, s.passW - 0.1, 0.07, 0.07, 1);
  for (let x = -s.passW / 2 + 0.2; x <= s.passW / 2 - 0.15; x += 0.34) b.box('iron', f, x, pBottom - 0.12, pz, 0.05, 0.24, 0.05, 1);
  // doors swung open against the passage walls
  for (const sg of [-1, 1]) {
    b.box('planks', f, sg * (s.passW / 2 - 0.09), s.floor + (s.passH - 0.6) / 2, -s.d / 2 + 2.2 + s.passW / 4, 0.12, s.passH - 0.6, s.passW / 2, 1.5);
    for (let k = 0; k < 3; k++) b.box('iron', f, sg * (s.passW / 2 - 0.16), s.floor + 0.6 + k * (s.passH - 1.6) / 2, -s.d / 2 + 2.2 + s.passW / 4, 0.03, 0.08, s.passW / 2 - 0.05, 1);
  }
  // parapets around the roof
  for (const side of [-1, 1]) {
    b.box(K, f, side * (s.w / 2 - 0.2), s.top + 0.55, 0, 0.45, 1.1, s.d, UV);
    b.box(K, f, 0, s.top + 0.55, side * (s.d / 2 - 0.2), s.w, 1.1, 0.45, UV);
    merlonsLine(b, K, f, side * (s.w / 2 - 0.2), s.top + 1.1, -s.d / 2 + 0.5, s.d / 2 - 0.5);
    const fr = new Frame(s.x, 0, s.z, s.rot + Math.PI / 2);
    merlonsLine(b, K, fr, side * (s.d / 2 - 0.2), s.top + 1.1, -s.w / 2 + 0.5, s.w / 2 - 0.5);
  }
  b.box(T, f, 0, s.top - 0.3, 0, s.w + 0.25, 0.25, s.d + 0.25, UV);
  b.box('lead', f, 0, s.top + 0.02, 0, s.w - 0.6, 0.05, s.d - 0.6, 4, 0b000100);
  // machicolation box over the outer arch
  for (let x = -s.passW / 2 - 0.5; x <= s.passW / 2 + 0.5; x += 0.8) b.box(T, f, x, s.top - 1.1, -s.d / 2 - 0.35, 0.38, 0.6, 0.6, 2);
  b.box(K, f, 0, s.top - 0.2, -s.d / 2 - 0.5, s.passW + 1.8, 1.2, 0.5, UV);
  // window slits over the gate
  slit(b, f, -1.2, s.floor + s.passH + 2.2, -s.d / 2, -1, false);
  slit(b, f, 1.2, s.floor + s.passH + 2.2, -s.d / 2, -1, false);
  if (s.towers !== 'none') {
    for (const sg of [-1, 1]) {
      const tx = f.px(sg * s.towerOff, -s.d / 2), tz = f.pz(sg * s.towerOff, -s.d / 2);
      if (s.towers === 'round') roundTower(b, K, T, tx, tz, s.towerR, s.base, s.top + 2.5, 24, false, rng, 'flat');
      else {
        const ft = new Frame(tx, 0, tz, s.rot);
        const th = s.top + 2.5 - s.base;
        b.box(K, ft, 0, s.base + th / 2, 0, s.towerR * 2, th, s.towerR * 2, UV);
        b.box(T, ft, 0, s.base + 1.8, 0, s.towerR * 2 + 0.6, 3.6, s.towerR * 2 + 0.6, UV);
        for (const side of [-1, 1]) {
          b.box(K, ft, side * (s.towerR - 0.2), s.top + 2.5 + 0.55, 0, 0.45, 1.1, s.towerR * 2, UV);
          b.box(K, ft, 0, s.top + 2.5 + 0.55, side * (s.towerR - 0.2), s.towerR * 2, 1.1, 0.45, UV);
          merlonsLine(b, K, ft, side * (s.towerR - 0.2), s.top + 3.6, -s.towerR + 0.5, s.towerR - 0.5);
        }
        slit(b, ft, 0, s.floor + s.passH + 1.5, -s.towerR, -1, false);
      }
    }
  }
}

function keep(b: Builder, s: Extract<StructureDef, { type: 'keep' }>, rng: Rng) {
  const K = 'stone:' + s.style, T = 'trim:' + s.style;
  const f = new Frame(s.x, 0, s.z, s.rot);
  const h = s.top - s.base;
  b.box(K, f, 0, s.base + h / 2, 0, s.w, h, s.d, UV);
  b.box(T, f, 0, s.base + 2.2, 0, s.w + 1.0, 4.4, s.d + 1.0, UV);
  // pilaster buttresses
  const pil = (len: number, along: 'x' | 'z') => {
    const n = Math.max(2, Math.round(len / 7));
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (i / n) * len;
      for (const side of [-1, 1]) {
        if (along === 'x') b.box(T, f, t, s.base + h / 2, side * (s.d / 2 + 0.25), 1.5, h, 0.5, UV);
        else b.box(T, f, side * (s.w / 2 + 0.25), s.base + h / 2, t, 0.5, h, 1.5, UV);
      }
    }
  };
  pil(s.w, 'x'); pil(s.d, 'z');
  // string courses
  for (const k of [0.38, 0.68]) b.box(T, f, 0, s.base + h * k, 0, s.w + 0.7, 0.3, s.d + 0.7, UV);
  // windows: round-headed lights on the upper floors
  for (const lvl of [0.5, 0.8]) {
    const y = s.base + h * lvl;
    for (const side of [-1, 1]) {
      const nx = Math.max(2, Math.round(s.w / 7));
      for (let i = 0; i < nx; i++) {
        const x = -s.w / 2 + ((i + 0.5) / nx) * s.w;
        b.box('void', f, x, y, side * (s.d / 2 + 0.02), 0.9, 1.9, 0.04, 1, side > 0 ? 0b010000 : 0b100000);
        b.box(T, f, x, y + 1.15, side * (s.d / 2 + 0.06), 1.5, 0.35, 0.1, 2);
      }
      const nz = Math.max(2, Math.round(s.d / 7));
      for (let i = 0; i < nz; i++) {
        const z = -s.d / 2 + ((i + 0.5) / nz) * s.d;
        b.box('void', f, side * (s.w / 2 + 0.02), y, z, 0.04, 1.9, 0.9, 1, side > 0 ? 0b000001 : 0b000010);
        b.box(T, f, side * (s.w / 2 + 0.06), y + 1.15, z, 0.1, 0.35, 1.5, 2);
      }
    }
  }
  // roof parapet
  for (const side of [-1, 1]) {
    b.box(K, f, side * (s.w / 2 - 0.25), s.top + 0.6, 0, 0.5, 1.2, s.d, UV);
    b.box(K, f, 0, s.top + 0.6, side * (s.d / 2 - 0.25), s.w, 1.2, 0.5, UV);
    merlonsLine(b, K, f, side * (s.w / 2 - 0.25), s.top + 1.2, -s.d / 2 + 4, s.d / 2 - 4);
    const fr = new Frame(s.x, 0, s.z, s.rot + Math.PI / 2);
    merlonsLine(b, K, fr, side * (s.d / 2 - 0.25), s.top + 1.2, -s.w / 2 + 4, s.w / 2 - 4);
  }
  b.box('lead', f, 0, s.top + 0.03, 0, s.w - 0.8, 0.06, s.d - 0.8, 4, 0b000100);
  // corner turrets
  if (s.turrets !== 'none') {
    const corners: [number, number][] = [[1, -1], [-1, -1], [-1, 1], [1, 1]];
    corners.forEach(([cx, cz], i) => {
      const round = s.turrets === 'round' || (s.turrets === 'mixed' && i === 0);
      const tx = f.px(cx * (s.w / 2 - 1.6), cz * (s.d / 2 - 1.6)), tz = f.pz(cx * (s.w / 2 - 1.6), cz * (s.d / 2 - 1.6));
      const t0 = s.top - 6, t1 = s.top + 5;
      if (round) {
        b.cylinder(K, tx, t0, tz, 3.2, 3.2, t1 - t0, 22, UV);
        b.cylinder(K, tx, t1, tz, 3.45, 3.45, 1.1, 22, UV, 0b10, false, 0, 3.0);
      } else {
        const ft = new Frame(tx, 0, tz, s.rot);
        b.box(K, ft, 0, (t0 + t1) / 2, 0, 5.6, t1 - t0, 5.6, UV);
        for (const side of [-1, 1]) {
          b.box(K, ft, side * 2.6, t1 + 0.55, 0, 0.45, 1.1, 5.6, UV);
          b.box(K, ft, 0, t1 + 0.55, side * 2.6, 5.6, 1.1, 0.45, UV);
        }
      }
      if (s.turrets === 'mixed') {
        // leaded ogee cupolas of the White Tower
        b.cylinder('lead', tx, t1 + 1.1, tz, 2.9, 3.0, 1.4, 20, 3, 0);
        b.cone('lead', tx, t1 + 2.5, tz, 3.0, 3.6, 20, 3);
        b.cylinder('iron', tx, t1 + 6.0, tz, 0.08, 0.08, 1.8, 6, 1, 0);
      }
      slit(b, new Frame(tx, 0, tz, s.rot), 0, s.top + 1.5, round ? -3.2 : -2.8, -1, false);
    });
  }
  void rng;
}

function building(b: Builder, s: Extract<StructureDef, { type: 'building' }>, rng: Rng) {
  const gy = s.base + 1.2;
  const eave = gy + s.wallH;
  // ridge along the longer side
  const alongZ = s.d >= s.w;
  const f = new Frame(s.x, 0, s.z, s.rot);
  const fr = alongZ ? f : new Frame(s.x, 0, s.z, s.rot + Math.PI / 2);
  const span = alongZ ? s.w : s.d, length = alongZ ? s.d : s.w;
  if (s.style === 'ruin') {
    const K = 'stone:rubble';
    for (const side of [-1, 1]) {
      let z = -length / 2;
      while (z < length / 2) {
        const seg = Math.min(rng.range(1.2, 3), length / 2 - z);
        const hh = s.wallH * rng.range(0.25, 1);
        b.box(K, fr, side * (span / 2 - 0.4), s.base + (hh + 1.2) / 2, z + seg / 2, 0.8, hh + 1.2, seg, UV);
        z += seg;
      }
      let x = -span / 2;
      while (x < span / 2) {
        const seg = Math.min(rng.range(1.2, 3), span / 2 - x);
        const hh = s.wallH * rng.range(0.2, 0.95);
        b.box(K, fr, x + seg / 2, s.base + (hh + 1.2) / 2, side * (length / 2 - 0.4), seg, hh + 1.2, 0.8, UV);
        x += seg;
      }
    }
    return;
  }
  const rise = s.roof === 'lead' ? span * 0.18 : s.roof === 'thatch' ? span * 0.72 : span * 0.55;
  const roofKey = s.roof === 'none' ? '' : s.roof;
  if (s.style === 'stone') {
    const K = 'stone:rubble', T = 'trim:ashlar';
    b.box(K, fr, 0, (s.base + eave) / 2, 0, span, eave - s.base, length, UV);
    b.gableEnd(K, new Frame(fr.ox, 0, fr.oz, fr.rot), span, length / 2, eave - 0, rise, UV);
    b.gableEnd(K, new Frame(fr.ox, 0, fr.oz, fr.rot), span, -length / 2, eave - 0, rise, UV);
    b.box(T, fr, 0, eave - 0.15, 0, span + 0.2, 0.3, length + 0.2, UV);
    // windows and a door
    const nWin = Math.max(1, Math.floor(length / 3.2));
    for (let fl = 0; fl < s.floors; fl++) {
      const y = gy + 1.7 + fl * 3.2;
      for (let i = 0; i < nWin; i++) {
        const z = -length / 2 + ((i + 0.5) / nWin) * length;
        for (const side of [-1, 1]) {
          b.box('void', fr, side * (span / 2 + 0.02), y, z, 0.04, 1.4, 0.7, 1, side > 0 ? 0b000001 : 0b000010);
          b.box(T, fr, side * (span / 2 + 0.06), y + 0.85, z, 0.12, 0.25, 1.0, 2);
        }
      }
    }
    b.box('planks', fr, span / 2 + 0.03, gy + 1.15, length * 0.12, 0.08, 2.3, 1.3, 1.5);
    b.box(T, fr, span / 2 + 0.08, gy + 2.45, length * 0.12, 0.14, 0.3, 1.7, 2);
    if (roofKey) b.gable(roofKey, new Frame(fr.ox, 0, fr.oz, fr.rot), span, length, eave, rise, 0.35, 0.18, 3);
    if (rng.chance(0.6)) b.box(K, fr, span * 0.2, eave + rise * 0.7, length / 2 - 0.8, 0.9, rise * 0.9 + 1.4, 0.9, UV);
    return;
  }
  // timber-framed
  const plinth = 0.7;
  b.box('stone:rubble', fr, 0, s.base + (plinth + 1.2) / 2, 0, span + 0.12, plinth + 1.2, length + 0.12, UV);
  const jetty = s.floors > 1 ? 0.45 : 0;
  const floorH = s.wallH / s.floors;
  for (let fl = 0; fl < s.floors; fl++) {
    const y0 = gy + plinth * (fl === 0 ? 1 : 0) + fl * floorH;
    const y1 = gy + (fl + 1) * floorH;
    const sp = span + (fl > 0 ? jetty * 2 : 0), ln = length + (fl > 0 ? jetty * 2 : 0);
    b.box('daub', fr, 0, (y0 + y1) / 2, 0, sp, y1 - y0, ln, 3);
    // frame: corner posts, studs, rails, braces
    const T = 'timber';
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(T, fr, sx * (sp / 2 + 0.02), (y0 + y1) / 2, sz * (ln / 2 + 0.02), 0.26, y1 - y0, 0.26, 1);
    b.box(T, fr, 0, y0 + 0.1, 0, sp + 0.1, 0.2, ln + 0.1, 1);
    b.box(T, fr, 0, y1 - 0.1, 0, sp + 0.12, 0.22, ln + 0.12, 1);
    b.box(T, fr, 0, (y0 + y1) / 2, 0, sp + 0.06, 0.14, ln + 0.06, 1);
    const studs = Math.max(2, Math.floor(ln / 1.4));
    for (let i = 1; i < studs; i++) {
      const z = -ln / 2 + (i / studs) * ln;
      for (const side of [-1, 1]) b.box(T, fr, side * (sp / 2 + 0.03), (y0 + y1) / 2, z, 0.06, y1 - y0, 0.18, 1);
    }
    const studsX = Math.max(2, Math.floor(sp / 1.4));
    for (let i = 1; i < studsX; i++) {
      const x = -sp / 2 + (i / studsX) * sp;
      for (const side of [-1, 1]) b.box(T, fr, x, (y0 + y1) / 2, side * (ln / 2 + 0.03), 0.18, y1 - y0, 0.06, 1);
    }
    // corner braces
    for (const side of [-1, 1]) {
      const xw = side * (sp / 2 + 0.05);
      const pA = [fr.px(xw, -ln / 2 + 0.2), y0 + 0.2, fr.pz(xw, -ln / 2 + 0.2)];
      const pB = [fr.px(xw, -ln / 2 + 1.4), y1 - 0.2, fr.pz(xw, -ln / 2 + 1.4)];
      b.beam(T, pA[0], pA[1], pA[2], pB[0], pB[1], pB[2], 0.16, 0.08, 1);
      const pC = [fr.px(xw, ln / 2 - 0.2), y0 + 0.2, fr.pz(xw, ln / 2 - 0.2)];
      const pD = [fr.px(xw, ln / 2 - 1.4), y1 - 0.2, fr.pz(xw, ln / 2 - 1.4)];
      b.beam(T, pC[0], pC[1], pC[2], pD[0], pD[1], pD[2], 0.16, 0.08, 1);
    }
    // windows with shutters
    const nWin = Math.max(1, Math.floor(ln / 3));
    for (let i = 0; i < nWin; i++) {
      const z = -ln / 2 + ((i + 0.5) / nWin) * ln;
      const y = (y0 + y1) / 2 + 0.25;
      for (const side of [-1, 1]) {
        if (fl === 0 && i === Math.floor(nWin / 2) && side > 0) continue;
        b.box('void', fr, side * (sp / 2 + 0.05), y, z, 0.03, 0.8, 0.6, 1, side > 0 ? 0b000001 : 0b000010);
        b.box('planks', fr, side * (sp / 2 + 0.09), y, z - 0.55, 0.04, 0.85, 0.42, 1.2);
      }
    }
  }
  // door
  b.box('planks', fr, span / 2 + 0.06, gy + plinth + 1.0, 0, 0.07, 2.0, 1.05, 1.2);
  const roofSpan = span + jetty * 2;
  if (roofKey) {
    const fRoof = new Frame(fr.ox, 0, fr.oz, fr.rot);
    b.gable(roofKey, fRoof, roofSpan, length + jetty * 2, eave, rise, s.roof === 'thatch' ? 0.75 : 0.4, s.roof === 'thatch' ? 0.45 : 0.18, 3);
    b.gableEnd('daub', fRoof, roofSpan, (length + jetty * 2) / 2, eave, rise, 3);
    b.gableEnd('daub', fRoof, roofSpan, -(length + jetty * 2) / 2, eave, rise, 3);
  }
  if (rng.chance(0.5)) b.box('stone:rubble', fr, -span * 0.25, eave + rise * 0.6, length / 2 - 0.6, 0.8, rise + 1.2, 0.8, UV);
}

function bridge(b: Builder, s: Extract<StructureDef, { type: 'bridge' }>, map: BuiltMap) {
  const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
  const rot = Math.atan2(s.bx - s.ax, s.bz - s.az);
  const f = new Frame((s.ax + s.bx) / 2, 0, (s.az + s.bz) / 2, rot);
  const t = map.world.terrain;
  if (s.style === 'stone') {
    const K = 'stone:ashlar', T = 'trim:ashlar';
    b.box(K, f, 0, s.y - 0.6, 0, s.w, 1.2, len, UV);
    for (const side of [-1, 1]) {
      b.box(K, f, side * (s.w / 2 + 0.05), s.y + 0.5, 0, 0.4, 1.0, len, UV);
      b.box(T, f, side * (s.w / 2 + 0.05), s.y + 1.05, 0, 0.55, 0.12, len, UV);
    }
    const piers = Math.max(1, Math.round(len / 9));
    for (let i = 0; i <= piers; i++) {
      const z = -len / 2 + (i / piers) * len;
      const px = f.px(0, z), pz = f.pz(0, z);
      const g = t.height(px, pz);
      if (s.y - g < 1.5) continue;
      b.box(K, f, 0, (g - 1 + s.y - 1.1) / 2, z, s.w + 0.6, s.y - 1.1 - g + 1, 1.8, UV);
      b.box(T, f, 0, s.y - 1.2, z, s.w + 0.8, 0.3, 2.2, UV);
    }
    return;
  }
  b.box('planks', f, 0, s.y - 0.14, 0, s.w, 0.28, len, 2);
  const step = 3;
  for (let z = -len / 2; z <= len / 2 + 0.01; z += step) {
    b.box('timber', f, 0, s.y - 0.45, z, s.w + 0.4, 0.3, 0.3, 1);
    for (const side of [-1, 1]) {
      const px = f.px(side * (s.w / 2 + 0.1), z), pz = f.pz(side * (s.w / 2 + 0.1), z);
      const g = t.height(px, pz);
      b.cylinder('timber', px, g - 1, pz, 0.16, 0.15, s.y + 1.15 - g + 1, 8, 1, 0b10);
    }
  }
  if (s.rails) {
    for (const side of [-1, 1]) {
      b.box('timber', f, side * (s.w / 2 + 0.1), s.y + 1.05, 0, 0.14, 0.14, len, 1);
      b.box('timber', f, side * (s.w / 2 + 0.1), s.y + 0.55, 0, 0.09, 0.1, len, 1);
    }
  }
}

function ramp(b: Builder, s: Extract<StructureDef, { type: 'ramp' }>) {
  if (s.style === 'earth') return;
  const key = s.style === 'wood' ? 'planks' : 'stone:ashlar';
  b.beam(key, s.ax, s.y0 - 0.2, s.az, s.bx, s.y1 - 0.2, s.bz, s.w, 0.4, 3);
}

function palisade(b: Builder, s: Extract<StructureDef, { type: 'palisade' }>, rng: Rng, map: BuiltMap) {
  const t = map.world.terrain;
  for (let i = 0; i < s.pts.length - 1; i++) {
    const [ax, az] = s.pts[i], [bx, bz] = s.pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(len / 0.34);
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      const x = ax + (bx - ax) * u, z = az + (bz - az) * u;
      const g = t.height(x, z);
      const h = s.h * rng.range(0.9, 1.1);
      b.beam('timber', x, g - 0.5, z, x + rng.range(-0.05, 0.05), g + h, z + rng.range(-0.05, 0.05), 0.3, 0.3, 1, false);
      b.cone('timber', x, g + h, z, 0.16, 0.45, 6, 1);
    }
  }
}
