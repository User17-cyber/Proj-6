// Geometry for plate armour, mail, cloth, shields and weapons. Pieces are built in their
// bone's local frame (see skeleton.ts) so they can be instanced rigidly per bone.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Ring = { y: number; rx: number; rz: number; cz?: number; cx?: number };

export interface ShellOpts {
  /** angular coverage, 0 = front (-Z), radians; default full circle */
  from?: number; to?: number;
  segs?: number;
  /** plate thickness; > 0 adds an inner surface and rolled rims at open edges */
  thick?: number;
  /** squareness of the cross-section (2 = ellipse, higher = boxier) */
  square?: number;
  /** medial ridge strength at the front */
  ridge?: number;
  capTop?: boolean;
  capBottom?: boolean;
  /** tile size for UVs (metres) */
  uvs?: number;
  /** vertical cloth folds: amplitude (m) and count around */
  folds?: number; foldCount?: number;
  /** rolled-edge radius at the top/bottom rims */
  rim?: number;
  rimTop?: boolean; rimBottom?: boolean;
}

function superR(th: number, rx: number, rz: number, p: number) {
  // point on a superellipse at parametric angle th (0 = front)
  const s = Math.sin(th), c = Math.cos(th);
  const e = 2 / p;
  const x = Math.sign(s) * Math.pow(Math.abs(s), e) * rx;
  const z = -Math.sign(c) * Math.pow(Math.abs(c), e) * rz;
  return [x, z];
}

/** Lofted shell through elliptical rings stacked along local Y. */
export function shell(rings: Ring[], o: ShellOpts = {}): THREE.BufferGeometry {
  const from = o.from ?? -Math.PI, to = o.to ?? Math.PI;
  const full = Math.abs(to - from - Math.PI * 2) < 1e-6;
  const segs = o.segs ?? 28;
  const square = o.square ?? 2;
  const ridge = o.ridge ?? 0;
  const uvs = o.uvs ?? 0.35;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const cols = segs + 1;
  const pt = (r: Ring, th: number, inset = 0): [number, number, number] => {
    let [x, z] = superR(th, r.rx - inset, r.rz - inset, square);
    const rid = ridge * Math.exp(-(th * th) / 0.06);
    z -= rid * (r.rz - inset) * 0.12;
    if (o.folds) {
      // folds deepen toward the hem (lower rings) like hanging cloth
      const yTop = Math.max(rings[0].y, rings[rings.length - 1].y), yBot = Math.min(rings[0].y, rings[rings.length - 1].y);
      const yN = Math.min(1, Math.max(0, (yTop - r.y) / Math.max(1e-3, yTop - yBot)));
      const f = Math.sin(th * (o.foldCount ?? 9) + r.y * 3.0) * o.folds * (0.25 + yN * 0.75);
      const l = Math.hypot(x, z) || 1;
      x += (x / l) * f; z += (z / l) * f;
    }
    return [x + (r.cx ?? 0), r.y, z + (r.cz ?? 0)];
  };
  const layer = (inset: number, flip: boolean) => {
    const base = pos.length / 3;
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      for (let j = 0; j <= segs; j++) {
        const th = from + ((to - from) * j) / segs;
        const p = pt(r, th, inset);
        pos.push(p[0], p[1], p[2]);
        uv.push(((th - from) * Math.max(r.rx, r.rz)) / uvs, r.y / uvs);
      }
    }
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < segs; j++) {
      const a = base + i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  };
  layer(0, false);
  const t = o.thick ?? 0;
  if (t > 0 && !full) layer(t, true);
  const g0 = new THREE.BufferGeometry();
  g0.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g0.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g0.setIndex(idx);
  const parts = [g0];
  // caps
  const cap = (r: Ring, up: boolean) => {
    const cp: number[] = [], cu: number[] = [], ci: number[] = [];
    cp.push(r.cx ?? 0, r.y, r.cz ?? 0); cu.push(0.5, 0.5);
    for (let j = 0; j <= segs; j++) {
      const th = from + ((to - from) * j) / segs;
      const p = pt(r, th);
      cp.push(p[0], p[1], p[2]); cu.push(0.5 + p[0] / 0.6, 0.5 + p[2] / 0.6);
    }
    for (let j = 0; j < segs; j++) { if (up) ci.push(0, j + 2, j + 1); else ci.push(0, j + 1, j + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2));
    g.setIndex(ci);
    return g;
  };
  if (o.capTop) parts.push(cap(rings[rings.length - 1], true));
  if (o.capBottom) parts.push(cap(rings[0], false));
  // rolled rims (the turned edges of plate armour)
  const rim = o.rim ?? (t > 0 ? t * 0.9 : 0);
  if (rim > 0) {
    const rimRing = (r: Ring, dir: number) => {
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= segs; j++) {
        const th = from + ((to - from) * j) / segs;
        const p = pt(r, th, -rim * 0.3);
        pts.push(new THREE.Vector3(p[0], p[1] + dir * rim * 0.3, p[2]));
      }
      if (full) pts.push(pts[0].clone());
      parts.push(tubeAlong(pts, rim, 6, false));
    };
    if (o.rimBottom !== false) rimRing(rings[0], 1);
    if (o.rimTop !== false && !o.capTop) rimRing(rings[rings.length - 1], -1);
    if (!full) {
      // vertical rims along the open edges
      for (const th of [from, to]) {
        const pts = rings.map((r) => { const p = pt(r, th, -rim * 0.3); return new THREE.Vector3(p[0], p[1], p[2]); });
        parts.push(tubeAlong(pts, rim, 5, false));
      }
    }
  }
  const g = merge(parts);
  g.computeVertexNormals();
  return g;
}

/** Tube following a polyline (rims, straps, plumes, bow strings...). */
export function tubeAlong(pts: THREE.Vector3[], r: number, segs = 6, caps = true, r1 = r): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const n = pts.length;
  const T = new THREE.Vector3(), N = new THREE.Vector3(), Bn = new THREE.Vector3(), prevN = new THREE.Vector3(0, 0, 0);
  let len = 0;
  for (let i = 0; i < n; i++) {
    if (i < n - 1) T.subVectors(pts[i + 1], pts[i]); else T.subVectors(pts[i], pts[i - 1]);
    T.normalize();
    if (prevN.lengthSq() < 0.5) {
      N.set(0, 1, 0);
      if (Math.abs(T.dot(N)) > 0.9) N.set(1, 0, 0);
    } else N.copy(prevN);
    N.addScaledVector(T, -N.dot(T)).normalize();
    prevN.copy(N);
    Bn.crossVectors(T, N).normalize();
    if (i > 0) len += pts[i].distanceTo(pts[i - 1]);
    const rr = r + (r1 - r) * (i / Math.max(1, n - 1));
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const c = Math.cos(a) * rr, s = Math.sin(a) * rr;
      pos.push(pts[i].x + N.x * c + Bn.x * s, pts[i].y + N.y * c + Bn.y * s, pts[i].z + N.z * c + Bn.z * s);
      uv.push(j / segs, len * 4);
    }
  }
  const cols = segs + 1;
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < segs; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const out = caps ? merge([g, disc(pts[0], pts[1], r), disc(pts[n - 1], pts[n - 2], r1)]) : g;
  out.computeVertexNormals();
  return out;
}

function disc(c: THREE.Vector3, toward: THREE.Vector3, r: number) {
  const g = new THREE.CircleGeometry(r, 8);
  const n = new THREE.Vector3().subVectors(c, toward).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  g.applyQuaternion(q);
  g.translate(c.x, c.y, c.z);
  return g;
}

/** Surface of revolution around Y from a [radius, y] profile (domes, bowls, cups). */
export function lathe(profile: [number, number][], segs = 28, scaleX = 1, scaleZ = 1, phi0 = 0, phiLen = Math.PI * 2): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs, phi0, phiLen);
  g.scale(scaleX, 1, scaleZ);
  g.computeVertexNormals();
  return g;
}

export function merge(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = gs.map((g) => {
    let q = g.index ? g.toNonIndexed() : g;
    if (!q.attributes.uv) q.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
    if (!q.attributes.normal) q.computeVertexNormals();
    for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k);
    q = q.clone();
    return q;
  });
  const m = mergeGeometries(prepared, false)!;
  m.computeBoundingSphere();
  return m;
}

export function xf(g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  const out = g.clone();
  out.applyMatrix4(m);
  return out;
}

const ring = (y: number, rx: number, rz: number, cz = 0, cx = 0): Ring => ({ y, rx, rz, cz, cx });

// ============================================================================ torso

/** Breast- and backplate in the chest frame (origin at the chest joint). */
export function cuirass(o: { bulge?: number; waist?: number; ridge?: number } = {}) {
  const b = o.bulge ?? 1, w = o.waist ?? 1;
  return shell([
    ring(-0.24, 0.158 * w, 0.115 * w, -0.005),
    ring(-0.16, 0.165 * w, 0.122, -0.012),
    ring(-0.06, 0.178, 0.135 * b, -0.02),
    ring(0.04, 0.19, 0.142 * b, -0.022),
    ring(0.12, 0.195, 0.132, -0.012),
    ring(0.18, 0.17, 0.112, 0.0),
    ring(0.215, 0.115, 0.085, 0.01),
  ], { segs: 34, square: 2.3, ridge: o.ridge ?? 1, thick: 0, rim: 0.009, uvs: 0.4 });
}

/** Overlapping lames below the waist (pelvis frame). */
export function fauld(lames = 3) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < lames; i++) {
    const y0 = 0.06 - i * 0.05;
    parts.push(shell([ring(y0 - 0.055, 0.19 + i * 0.012, 0.15 + i * 0.01, -0.01), ring(y0, 0.175 + i * 0.012, 0.135 + i * 0.01, -0.01)], { segs: 30, square: 2.2, from: -Math.PI * 0.78, to: Math.PI * 0.78, thick: 0.004, rim: 0.006 }));
  }
  return merge(parts);
}

/** Tasset hanging over the front of the thigh (thigh frame). */
export function tasset() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const y0 = -0.02 - i * 0.06;
    parts.push(shell([ring(y0 - 0.075, 0.098, 0.094, -0.01), ring(y0, 0.094, 0.092, -0.008)], { segs: 14, from: -1.1, to: 1.1, thick: 0.004, rim: 0.005 }));
  }
  return merge(parts);
}

/** Cloth panels (tabard / surcoat) around the torso (chest frame). */
export function tabardTop(len = 0.46) {
  return shell([
    ring(-len, 0.205, 0.16, -0.012),
    ring(-0.16, 0.19, 0.145, -0.018),
    ring(-0.04, 0.2, 0.156, -0.026),
    ring(0.08, 0.205, 0.15, -0.016),
    ring(0.17, 0.18, 0.125, 0.0),
    ring(0.215, 0.12, 0.09, 0.01),
  ], { segs: 40, square: 2.2, uvs: 0.5, folds: 0.004, foldCount: 13 });
}

/** Front and back skirt panels hanging from the waist (pelvis frame). */
export function skirtPanels(len: number, flare = 1, sideGap = 0.9) {
  const r = (y: number, k: number) => ring(y, 0.2 + k * 0.08 * flare, 0.16 + k * 0.05 * flare, -0.01);
  const rings = [r(0.08, 0), r(-0.02, 0.15), r(-len * 0.5, 0.55), r(-len, 1)];
  const front = shell(rings, { segs: 22, from: -sideGap, to: sideGap, uvs: 0.5, folds: 0.012, foldCount: 11 });
  const back = shell(rings, { segs: 22, from: Math.PI - sideGap, to: Math.PI + sideGap, uvs: 0.5, folds: 0.012, foldCount: 11 });
  return merge([front, back]);
}

/** Closed skirt (mail or quilted) for lighter harnesses, split at the sides by a little. */
export function skirtRound(len: number, flare = 1) {
  return shell([ring(0.06, 0.19, 0.15, -0.01), ring(-0.04, 0.205, 0.165, -0.01), ring(-len * 0.6, 0.23 * flare, 0.185 * flare), ring(-len, 0.25 * flare, 0.2 * flare)], { segs: 30, uvs: 0.3 });
}

/** Plain body underlayer (arming doublet) so no gaps show (chest frame). */
export function doublet() {
  return shell([ring(-0.36, 0.15, 0.115), ring(-0.2, 0.15, 0.115), ring(-0.04, 0.165, 0.125), ring(0.1, 0.175, 0.12), ring(0.19, 0.15, 0.1), ring(0.26, 0.06, 0.06, 0.01)], { segs: 24, uvs: 0.3, capBottom: true });
}

export function neckTube() {
  return shell([ring(-0.02, 0.058, 0.058), ring(0.16, 0.054, 0.056, 0.005)], { segs: 14 });
}

/** Cape down the back from the shoulders (chest frame). */
export function cape(len = 1.1) {
  return shell([ring(0.2, 0.2, 0.13, 0.02), ring(0.05, 0.25, 0.18, 0.035), ring(-0.3, 0.28, 0.2, 0.06), ring(-len * 0.75, 0.31, 0.22, 0.09), ring(-len, 0.33, 0.24, 0.11)], { segs: 30, from: Math.PI - 1.35, to: Math.PI + 1.35, uvs: 0.6, folds: 0.018, foldCount: 12 });
}

export function belt() {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 28; i++) { const a = (i / 28) * Math.PI * 2; pts.push(new THREE.Vector3(Math.sin(a) * 0.19, -0.035 + Math.sin(a * 2) * 0.004, -Math.cos(a) * 0.15)); }
  return tubeAlong(pts, 0.017, 4, false);
}

// ============================================================================ arms

/** Layered pauldron (upper arm frame, origin at the shoulder; side = +1 right, -1 left). */
export function pauldron(side: number, size = 1) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const r = (0.115 + i * 0.006) * size;
    const y = 0.05 - i * 0.045 * size;
    const g = lathe([[r * 0.2, r * 0.95], [r * 0.6, r * 0.8], [r * 0.9, r * 0.45], [r, 0.05 * r], [r * 1.02, -0.02]], 20, 1, 1.05, 0, Math.PI * 2);
    parts.push(xf(g, 0.015 * side, y, 0, 0, 0, side * 0.35));
  }
  return merge(parts);
}

export function armTube(y0: number, y1: number, r0: number, r1: number, flat = 1) {
  return shell([ring(y0, r0, r0 * flat), ring((y0 + y1) / 2, (r0 + r1) / 2 * 1.04, (r0 + r1) / 2 * flat), ring(y1, r1, r1 * flat)], { segs: 18, thick: 0, rim: 0.005 });
}

/** Elbow cup with a fan on the outside (+Z). Upper arm frame, at y = -upperArm. */
export function couter(y: number) {
  const cup = xf(new THREE.SphereGeometry(0.064, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), 0, y, 0.008, Math.PI / 2, 0, 0, 1, 1, 1);
  const fan = xf(new THREE.CylinderGeometry(0.085, 0.085, 0.006, 16, 1, false, -0.9, 1.8), 0, y, 0.04, Math.PI / 2, 0, 0);
  return merge([cup, fan]);
}

/** Hourglass gauntlet in the hand frame (fist around the grip along -Z). */
export function gauntlet(mailMitten = false) {
  const cuff = shell([ring(0.05, 0.05, 0.045), ring(-0.005, 0.042, 0.038), ring(-0.03, 0.047, 0.042)], { segs: 14, rim: 0.004 });
  const backPlate = xf(new THREE.BoxGeometry(0.085, 0.07, 0.035, 1, 1, 1), 0, -0.06, 0.012);
  const fingers = xf(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 10), 0, -0.1, -0.005, 0, 0, Math.PI / 2);
  const thumb = xf(new THREE.CapsuleGeometry(0.014, 0.04, 3, 6), -0.04, -0.07, -0.02, 0.5, 0, 0.3);
  const parts = [cuff, backPlate, fingers, thumb];
  if (!mailMitten) for (let i = 0; i < 3; i++) parts.push(xf(new THREE.CylinderGeometry(0.032, 0.032, 0.088, 10, 1, true, 0, Math.PI), 0, -0.1 - i * 0.004, 0.004 + i * 0.006, 0, 0, Math.PI / 2));
  return merge(parts);
}

// ============================================================================ legs

export function legTube(y0: number, y1: number, r0: number, r1: number, calf = 0, front = false) {
  const rings = [ring(y0, r0, r0 * 0.95, 0), ring(y0 + (y1 - y0) * 0.35, r0 * 0.98 + calf * 0.2, r0 * 0.96 + calf, calf * 0.6), ring(y1, r1, r1, 0)];
  return shell(rings, { segs: 18, from: front ? -2.2 : -Math.PI, to: front ? 2.2 : Math.PI, thick: front ? 0.004 : 0, rim: 0.005 });
}

/** Knee cop with side wings (thigh frame, at the knee). */
export function poleyn(y: number) {
  const cup = xf(new THREE.SphereGeometry(0.066, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, y, -0.018, -Math.PI / 2, 0, 0);
  const wingL = xf(new THREE.CylinderGeometry(0.06, 0.06, 0.006, 12, 1, false, 0, Math.PI), -0.055, y, -0.005, 0, 0, Math.PI / 2, 1, 1, 0.8);
  const wingR = xf(new THREE.CylinderGeometry(0.06, 0.06, 0.006, 12, 1, false, Math.PI, Math.PI), 0.055, y, -0.005, 0, 0, Math.PI / 2, 1, 1, 0.8);
  return merge([cup, wingL, wingR]);
}

/** Sabaton or boot in the foot frame (-Z toward the toe). */
export function sabaton(pointed = 0.04, plate = true) {
  // loft along the foot: build along +Y then rotate so +Y maps to -Z
  const rings = [ring(-0.04, 0.045, 0.05), ring(0.0, 0.048, 0.055), ring(0.08, 0.046, 0.05), ring(0.16, 0.042, 0.04), ring(0.21 + pointed, 0.012, 0.01)];
  const g = shell(rings.map((r) => ({ ...r, cz: 0.01 })), { segs: 16, capBottom: true, rim: plate ? 0.004 : 0 });
  const out = xf(g, 0, -0.035, 0, -Math.PI / 2, 0, 0);
  const sole = xf(new THREE.BoxGeometry(0.085, 0.02, 0.27 + pointed * 0.5), 0, -0.072, -0.09 - pointed * 0.2);
  return merge([out, sole]);
}

// ============================================================================ helmets (head frame: origin at top of neck)

export function bascinet() {
  const skull = lathe([[0.0, 0.3], [0.04, 0.29], [0.085, 0.25], [0.118, 0.17], [0.128, 0.08], [0.125, 0.0], [0.122, -0.04]], 26, 1, 1.1);
  // pig-faced visor
  const visor = shell([
    ring(-0.03, 0.12, 0.14, -0.01), ring(0.03, 0.115, 0.18, -0.03), ring(0.07, 0.1, 0.2, -0.05), ring(0.11, 0.11, 0.16, -0.025), ring(0.17, 0.115, 0.13, 0),
  ], { segs: 18, from: -1.35, to: 1.35, thick: 0.004, rim: 0.005, square: 2.2 });
  return { steel: merge([skull, visor]) };
}
/** Bascinet worn open (visor off), so the face shows above the aventail. */
export function bascinetOpen() {
  return lathe([[0.0, 0.3], [0.04, 0.29], [0.085, 0.25], [0.118, 0.17], [0.128, 0.08], [0.125, 0.0], [0.122, -0.04]], 26, 1, 1.1);
}
/** Open-faced sallet: the brow is cut away above the eyes; the tail guards the neck. */
export function salletOpen() {
  const dome = lathe([[0.0, 0.25], [0.06, 0.24], [0.11, 0.19], [0.13, 0.135]], 26, 1, 1.12);
  // sides and back of the skull below the brow line; lathe angle 0 is the back (+Z), PI the front
  const band = lathe([[0.13, 0.135], [0.134, 0.08], [0.135, 0.04]], 22, 1, 1.12, Math.PI + 0.78, Math.PI * 2 - 1.56);
  const tail = shell([ring(0.04, 0.135, 0.15), ring(-0.02, 0.14, 0.17, 0.03), ring(-0.06, 0.15, 0.2, 0.07)], { segs: 20, from: 0.9, to: Math.PI * 2 - 0.9, thick: 0.003, rim: 0.005 });
  return merge([dome, band, tail]);
}
/** A bevor worn low, guarding the throat and chin. */
export function bevorLow() {
  return shell([ring(-0.13, 0.12, 0.12, 0.0), ring(-0.05, 0.118, 0.128, -0.014), ring(0.0, 0.11, 0.125, -0.018), ring(0.022, 0.104, 0.12, -0.012)], { segs: 18, from: -1.6, to: 1.6, thick: 0.004, rim: 0.005, ridge: 1.2 });
}

export function bascinetDetail() {
  // eye slits and breaths (dark)
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) parts.push(xf(new THREE.BoxGeometry(0.06, 0.008, 0.01), s * 0.04, 0.115, -0.152));
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) parts.push(xf(new THREE.CylinderGeometry(0.004, 0.004, 0.01, 6), s * (0.015 + (i % 3) * 0.012), 0.03 + Math.floor(i / 3) * 0.018, -0.205 + Math.floor(i / 3) * 0.01, Math.PI / 2, 0, 0));
  return merge(parts);
}

export function aventail(len = 0.15) {
  return shell([ring(0.02, 0.122, 0.13), ring(-0.05, 0.14, 0.14), ring(-len, 0.2, 0.17, 0.01)], { segs: 24, uvs: 0.2 });
}

export function greatHelm() {
  const body = shell([ring(-0.12, 0.13, 0.15), ring(-0.02, 0.13, 0.152, -0.008), ring(0.1, 0.128, 0.148, -0.006), ring(0.2, 0.122, 0.14), ring(0.24, 0.112, 0.128)], { segs: 30, square: 2.3, ridge: 2.2, rim: 0.006 });
  const top = lathe([[0.112, 0.24], [0.08, 0.262], [0.0, 0.27]], 30, 1, 1.143);
  return merge([body, top]);
}
export function greatHelmTrim() {
  const parts = [xf(new THREE.BoxGeometry(0.022, 0.33, 0.012), 0, 0.06, -0.158), xf(new THREE.BoxGeometry(0.2, 0.02, 0.012), 0, 0.09, -0.155)];
  return merge(parts);
}
export function greatHelmSlits() {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) parts.push(xf(new THREE.BoxGeometry(0.075, 0.012, 0.02), s * 0.055, 0.105, -0.152));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) parts.push(xf(new THREE.CylinderGeometry(0.005, 0.005, 0.02, 6), 0.035 + c * 0.016, -0.02 - r * 0.02, -0.15, Math.PI / 2, 0, 0));
  return merge(parts);
}

export function sallet() {
  const dome = lathe([[0.0, 0.25], [0.06, 0.24], [0.11, 0.19], [0.13, 0.11], [0.135, 0.04]], 26, 1, 1.12);
  const tail = shell([ring(0.04, 0.135, 0.15), ring(-0.02, 0.14, 0.17, 0.03), ring(-0.06, 0.15, 0.2, 0.07)], { segs: 20, from: 0.9, to: Math.PI * 2 - 0.9, thick: 0.003, rim: 0.005 });
  return merge([dome, tail]);
}
export function bevor() {
  return shell([ring(-0.13, 0.12, 0.12, 0.0), ring(-0.04, 0.12, 0.13, -0.015), ring(0.03, 0.115, 0.13, -0.02), ring(0.075, 0.11, 0.125, -0.012)], { segs: 18, from: -1.6, to: 1.6, thick: 0.004, rim: 0.005, ridge: 1.2 });
}
export function slit(y: number, z: number, w = 0.16) {
  return xf(new THREE.BoxGeometry(w, 0.012, 0.02), 0, y, z);
}

export function armet() {
  const skull = lathe([[0, 0.26], [0.06, 0.255], [0.108, 0.21], [0.13, 0.13], [0.132, 0.03], [0.126, -0.06], [0.11, -0.11]], 28, 1, 1.12);
  const visor = shell([ring(-0.08, 0.11, 0.14, -0.005), ring(0.0, 0.12, 0.165, -0.025), ring(0.07, 0.118, 0.17, -0.035), ring(0.15, 0.12, 0.15, -0.02)], { segs: 18, from: -1.25, to: 1.25, ridge: 2.8, thick: 0.004, rim: 0.005 });
  const rondel = xf(new THREE.CylinderGeometry(0.05, 0.05, 0.008, 16), 0, -0.04, 0.15, Math.PI / 2, 0, 0);
  const stalk = xf(new THREE.CylinderGeometry(0.006, 0.008, 0.07, 6), 0, 0.27, 0.06, -0.4, 0, 0);
  return merge([skull, visor, rondel, stalk]);
}
export function plume() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const pts: THREE.Vector3[] = [];
    const spread = (i - 3) * 0.018;
    for (let t = 0; t <= 8; t++) {
      const u = t / 8;
      pts.push(new THREE.Vector3(spread * (0.5 + u), 0.29 + u * 0.12 - u * u * 0.08, 0.07 + u * 0.22 + u * u * 0.08));
    }
    parts.push(tubeAlong(pts, 0.022, 5, false, 0.008));
  }
  return merge(parts);
}

export function kettleHat() {
  const dome = lathe([[0, 0.255], [0.07, 0.245], [0.115, 0.2], [0.132, 0.13], [0.136, 0.1]], 26, 1, 1.08);
  const brim = lathe([[0.13, 0.1], [0.2, 0.085], [0.235, 0.06], [0.24, 0.055]], 30, 1, 1.05);
  return merge([dome, brim]);
}
export function coif() {
  // padded/mail hood covering head and neck with a face opening
  return shell([ring(-0.16, 0.19, 0.17, 0.01), ring(-0.06, 0.13, 0.13), ring(0.02, 0.118, 0.13), ring(0.12, 0.12, 0.13), ring(0.2, 0.09, 0.1)], { segs: 24, from: 0.62, to: Math.PI * 2 - 0.62, capTop: true });
}
export function faceShadow() {
  // the shadowed face inside an open helmet
  return xf(new THREE.SphereGeometry(0.105, 16, 12, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.28, Math.PI * 0.5), 0, 0.1, -0.012, 0, Math.PI, 0, 1, 1.1, 1.05);
}
/** A livery scarf wound about the throat. */
export function scarf() {
  return shell([ring(-0.07, 0.085, 0.09, -0.008), ring(-0.03, 0.078, 0.084, -0.01), ring(0.005, 0.07, 0.078, -0.008)], { segs: 14, from: -1.3, to: 1.3 });
}

export function barbute() {
  const shellG = shell([ring(-0.08, 0.12, 0.13), ring(0.0, 0.128, 0.142), ring(0.08, 0.13, 0.145), ring(0.16, 0.12, 0.132), ring(0.22, 0.09, 0.1)], { segs: 30, from: 0.42, to: Math.PI * 2 - 0.42, thick: 0.004, rim: 0.005 });
  const top = lathe([[0.09, 0.22], [0.05, 0.255], [0, 0.265]], 26, 1, 1.11);
  // brow over the opening, above the eyes so the face shows
  const brow = shell([ring(0.128, 0.126, 0.14), ring(0.17, 0.118, 0.131)], { segs: 10, from: -0.44, to: 0.44, thick: 0.004, rim: 0.004 });
  return merge([shellG, top, brow]);
}

// ============================================================================ shields

/** Heater shield, face toward +Z, strap point at the origin. */
export function heaterShield(): { face: THREE.BufferGeometry; back: THREE.BufferGeometry; rim: THREE.BufferGeometry } {
  const outline: THREE.Vector2[] = [];
  const top = 0.37, bottom = -0.5, hw = 0.3;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const y = top - t * (top - bottom);
    const x = hw * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (top - y) / (top - bottom) - 0.25) / 0.75, 2.2)));
    outline.push(new THREE.Vector2(x, y));
  }
  const curve = (x: number) => -0.07 * (x / hw) * (x / hw);
  const build = (zOff: number, flip: boolean) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const cols = 9;
    for (let i = 0; i < outline.length; i++) {
      const p = outline[i];
      for (let j = 0; j < cols; j++) {
        const x = -p.x + (2 * p.x * j) / (cols - 1);
        pos.push(x, p.y, curve(x) + zOff + 0.08);
        uv.push((x + hw) / (2 * hw), (p.y - bottom) / (top - bottom));
      }
    }
    for (let i = 0; i < outline.length - 1; i++) for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const face = build(0.012, false);
  const back = build(-0.012, true);
  // rim along the outline
  const pts: THREE.Vector3[] = [];
  for (const p of outline) pts.push(new THREE.Vector3(p.x, p.y, curve(p.x) + 0.08));
  const left = outline.slice().reverse().map((p) => new THREE.Vector3(-p.x, p.y, curve(-p.x) + 0.08));
  const rimPts = [...left, ...pts.slice(1)];
  rimPts.push(rimPts[0].clone());
  const rim = tubeAlong(rimPts, 0.016, 6, false);
  // grip straps on the back
  const strap = xf(new THREE.BoxGeometry(0.05, 0.012, 0.03), 0, 0.02, 0.055);
  return { face, back: merge([back, strap]), rim };
}

/**
 * Hand pavise: a tall timber shield with a raised central ridge (the bouge), slightly
 * narrower at the foot. Face toward +Z, strap point at the origin.
 */
export function paviseShield(): { face: THREE.BufferGeometry; back: THREE.BufferGeometry; rim: THREE.BufferGeometry } {
  const top = 0.44, bottom = -0.6, hwTop = 0.27, hwBot = 0.23;
  const rows = 12, cols = 11;
  const hwAt = (y: number) => hwBot + (hwTop - hwBot) * (y - bottom) / (top - bottom);
  // the bouge stands proud down the middle; the edges sweep back toward the bearer
  const zAt = (x: number, hw: number) => 0.035 * (1 - Math.min(1, Math.abs(x) / (hw * 0.32))) - 0.05 * (x / hw) * (x / hw);
  const build = (zOff: number, flip: boolean) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= rows; i++) {
      const y = bottom + (top - bottom) * (i / rows);
      // the top corners are cut round
      const hw = hwAt(y) * (y > top - 0.06 ? 1 - Math.pow((y - (top - 0.06)) / 0.06, 2) * 0.18 : 1);
      for (let j = 0; j < cols; j++) {
        const x = -hw + (2 * hw * j) / (cols - 1);
        pos.push(x, y, zAt(x, hw) + zOff + 0.09);
        uv.push((x + hwTop) / (2 * hwTop), (y - bottom) / (top - bottom));
      }
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const face = build(0.016, false);
  const back = build(-0.016, true);
  const edge: THREE.Vector3[] = [];
  const corner = (x: number, y: number) => new THREE.Vector3(x, y, zAt(x, Math.abs(x) || 1) + 0.09);
  for (let i = 0; i <= rows; i++) { const y = bottom + (top - bottom) * (i / rows); edge.push(corner(hwAt(y) * (y > top - 0.06 ? 0.86 : 1), y)); }
  for (let i = rows; i >= 0; i--) { const y = bottom + (top - bottom) * (i / rows); edge.push(corner(-hwAt(y) * (y > top - 0.06 ? 0.86 : 1), y)); }
  edge.push(edge[0].clone());
  const rim = tubeAlong(edge, 0.02, 6, false);
  // enarmes: a pair of leather loops on the back, and the boss of the bouge's iron strap
  const straps = merge([
    xf(new THREE.BoxGeometry(0.06, 0.014, 0.034), 0, 0.12, 0.06),
    xf(new THREE.BoxGeometry(0.06, 0.014, 0.034), 0, -0.1, 0.06),
  ]);
  return { face, back: merge([back, straps]), rim };
}

export function buckler() {
  const dome = lathe([[0.0, 0.07], [0.05, 0.068], [0.06, 0.05], [0.07, 0.04], [0.16, 0.018], [0.185, 0.0]], 28);
  const rim = lathe([[0.185, 0.0], [0.19, -0.006], [0.18, -0.01]], 28);
  const g = merge([dome, rim]);
  return xf(g, 0, 0, 0.03, Math.PI / 2, 0, 0);
}

// ============================================================================ weapons (origin at the main grip, +Y = blade, +Z = edge)

function bladeGeo(len: number, w0: number, w1: number, t0: number, t1: number, start: number, clipPoint = 0, single = false) {
  const segs = 10;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  // diamond cross-section: 4 points (+Z edge, +X flat, -Z edge, -X flat)
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    let w = w0 + (w1 - w0) * Math.pow(u, 1.4);
    if (clipPoint > 0 && u > 1 - clipPoint) w *= 1 + (1 - u) / clipPoint * 0.4;
    if (u > 0.9) w *= 1 - (u - 0.9) / 0.1 * 0.85;
    const t = t0 + (t1 - t0) * u;
    const y = start + len * u;
    const zb = single ? -w * 0.5 : -w / 2;
    pos.push(0, y, w / 2, t / 2, y, single ? 0.0 : 0, 0, y, zb, -t / 2, y, single ? 0.0 : 0);
    uv.push(1, u, 0.5, u, 0, u, 0.5, u);
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < 4; k++) {
    const a = i * 4 + k, b = i * 4 + ((k + 1) % 4), c = a + 4, d = b + 4;
    idx.push(a, c, b, b, c, d);
  }
  // tip
  const tip = pos.length / 3;
  pos.push(0, start + len + 0.01, 0); uv.push(0.5, 1);
  for (let k = 0; k < 4; k++) idx.push(segs * 4 + k, tip, segs * 4 + ((k + 1) % 4));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface WeaponGeo { steel?: THREE.BufferGeometry; grip?: THREE.BufferGeometry; wood?: THREE.BufferGeometry; brass?: THREE.BufferGeometry }

export function armingSword(): WeaponGeo {
  return {
    steel: merge([
      bladeGeo(0.8, 0.052, 0.014, 0.009, 0.004, 0.1),
      xf(new THREE.BoxGeometry(0.018, 0.018, 0.22), 0, 0.085, 0),
      xf(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), 0, 0.085, 0.115, Math.PI / 2, 0, 0),
      xf(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), 0, 0.085, -0.115, Math.PI / 2, 0, 0),
      xf(new THREE.CylinderGeometry(0.03, 0.03, 0.018, 16), 0, -0.085, 0, 0, 0, Math.PI / 2),
    ]),
    grip: xf(new THREE.CylinderGeometry(0.016, 0.018, 0.14, 10), 0, 0.005, 0),
  };
}
export function greatsword(): WeaponGeo {
  return {
    steel: merge([
      bladeGeo(1.22, 0.058, 0.016, 0.011, 0.005, 0.15),
      xf(new THREE.BoxGeometry(0.02, 0.02, 0.36), 0, 0.13, 0),
      xf(new THREE.BoxGeometry(0.014, 0.08, 0.05), 0, 0.18, 0),
      xf(new THREE.SphereGeometry(0.035, 12, 8), 0, -0.24, 0, 0, 0, 0, 1, 1.3, 1),
    ]),
    grip: xf(new THREE.CylinderGeometry(0.017, 0.019, 0.34, 10), 0, -0.04, 0),
  };
}
export function falchion(): WeaponGeo {
  return {
    steel: merge([
      bladeGeo(0.72, 0.045, 0.075, 0.009, 0.005, 0.1, 0.25, true),
      xf(new THREE.BoxGeometry(0.018, 0.018, 0.17), 0, 0.085, 0),
      xf(new THREE.SphereGeometry(0.024, 10, 8), 0, -0.08, 0),
    ]),
    grip: xf(new THREE.CylinderGeometry(0.016, 0.018, 0.13, 10), 0, 0.005, 0),
  };
}
/** One-handed war spear: ash haft with a leaf-shaped head, gripped a third of the way up. */
export function spear(): WeaponGeo {
  return {
    wood: xf(new THREE.CylinderGeometry(0.016, 0.019, 2.2, 10), 0, 0.45, 0),
    steel: merge([
      bladeGeo(0.3, 0.05, 0.02, 0.012, 0.005, 1.56),
      xf(new THREE.CylinderGeometry(0.016, 0.022, 0.12, 8), 0, 1.5, 0),
      xf(new THREE.ConeGeometry(0.02, 0.06, 8), 0, -0.68, 0, Math.PI, 0, 0),
    ]),
    grip: xf(new THREE.CylinderGeometry(0.021, 0.021, 0.14, 10), 0, 0, 0),
  };
}

/** Flanged mace: a steel haft and a head of seven flanges. */
export function mace(): WeaponGeo {
  const flanges: THREE.BufferGeometry[] = [];
  const fl = new THREE.Shape();
  fl.moveTo(0, -0.07); fl.lineTo(0.035, -0.04); fl.quadraticCurveTo(0.05, 0.0, 0.035, 0.05); fl.lineTo(0, 0.08); fl.lineTo(0, -0.07);
  for (let i = 0; i < 7; i++) {
    const g = new THREE.ExtrudeGeometry(fl, { depth: 0.007, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 4 });
    g.translate(0.012, 0, -0.0035);
    g.rotateY((i / 7) * Math.PI * 2);
    g.translate(0, 0.56, 0);
    flanges.push(g);
  }
  return {
    steel: merge([
      ...flanges,
      xf(new THREE.CylinderGeometry(0.016, 0.016, 0.24, 10), 0, 0.56, 0),
      xf(new THREE.ConeGeometry(0.018, 0.05, 8), 0, 0.7, 0),
      xf(new THREE.CylinderGeometry(0.013, 0.015, 0.46, 10), 0, 0.26, 0),
      xf(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 12), 0, 0.085, 0),
      xf(new THREE.SphereGeometry(0.024, 10, 8), 0, -0.085, 0),
    ]),
    grip: xf(new THREE.CylinderGeometry(0.017, 0.018, 0.14, 10), 0, 0.005, 0),
  };
}

export function dagger(): WeaponGeo {
  return {
    steel: merge([
      bladeGeo(0.24, 0.022, 0.01, 0.012, 0.006, 0.07),
      xf(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 12), 0, 0.065, 0),
      xf(new THREE.CylinderGeometry(0.028, 0.028, 0.008, 12), 0, -0.065, 0),
    ]),
    grip: xf(new THREE.CylinderGeometry(0.013, 0.014, 0.12, 8), 0, 0, 0),
  };
}
export function halberd(): WeaponGeo {
  const axe = new THREE.Shape();
  axe.moveTo(0, 0); axe.lineTo(0.2, -0.06); axe.quadraticCurveTo(0.26, 0.12, 0.2, 0.3); axe.lineTo(0, 0.2); axe.lineTo(0, 0);
  const axeG = new THREE.ExtrudeGeometry(axe, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1, curveSegments: 6 });
  axeG.translate(0, 0, -0.004);
  const hook = new THREE.Shape();
  hook.moveTo(0, 0.04); hook.lineTo(-0.16, 0.1); hook.lineTo(-0.12, 0.13); hook.lineTo(0, 0.12);
  const hookG = new THREE.ExtrudeGeometry(hook, { depth: 0.008, bevelEnabled: false });
  hookG.translate(0, 0, -0.004);
  // shapes are built in XY with +X toward the edge; rotate so +X maps to +Z
  const head = merge([axeG, hookG]);
  head.rotateY(-Math.PI / 2);
  head.translate(0, 1.42, 0);
  return {
    wood: xf(new THREE.CylinderGeometry(0.018, 0.02, 2.36, 10), 0, 0.68, 0),
    steel: merge([
      head,
      xf(new THREE.ConeGeometry(0.02, 0.34, 4), 0, 1.86, 0),
      xf(new THREE.BoxGeometry(0.03, 0.48, 0.045), 0, 1.45, 0),
      xf(new THREE.CylinderGeometry(0.022, 0.02, 0.06, 8), 0, -0.48, 0),
    ]),
  };
}
export function poleaxe(): WeaponGeo {
  const hammer = merge([
    xf(new THREE.BoxGeometry(0.05, 0.05, 0.12), 0, 1.3, 0.07),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => xf(new THREE.ConeGeometry(0.012, 0.03, 4), a * 0.014, 1.3 + b * 0.014, 0.14, Math.PI / 2, 0, 0)),
    xf(new THREE.ConeGeometry(0.02, 0.16, 4), 0, 1.3, -0.1, -Math.PI / 2, 0, 0),
  ]);
  return {
    wood: xf(new THREE.CylinderGeometry(0.018, 0.02, 1.9, 10), 0, 0.58, 0),
    steel: merge([
      hammer,
      xf(new THREE.ConeGeometry(0.022, 0.3, 4), 0, 1.5, 0),
      xf(new THREE.BoxGeometry(0.03, 0.5, 0.04), 0, 1.15, 0),
      xf(new THREE.CylinderGeometry(0.06, 0.06, 0.008, 16), 0, 0.88, 0),
      xf(new THREE.CylinderGeometry(0.022, 0.02, 0.06, 8), 0, -0.36, 0),
    ]),
  };
}

/** English bill: a hooked, curving chopping blade with a top spike and a back spur. */
export function bill(): WeaponGeo {
  const blade = new THREE.Shape();
  // the cutting edge curves forward into a hook at the top
  blade.moveTo(0, 0); blade.lineTo(0.13, 0.02); blade.quadraticCurveTo(0.2, 0.18, 0.15, 0.36); blade.quadraticCurveTo(0.1, 0.44, 0.02, 0.42);
  blade.quadraticCurveTo(0.08, 0.36, 0.06, 0.3); blade.lineTo(0, 0.26); blade.lineTo(0, 0);
  const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1, curveSegments: 6 });
  bg.translate(0, 0, -0.004);
  const spur = new THREE.Shape();
  spur.moveTo(0, 0.12); spur.lineTo(-0.12, 0.2); spur.lineTo(-0.09, 0.23); spur.lineTo(0, 0.2);
  const sg = new THREE.ExtrudeGeometry(spur, { depth: 0.008, bevelEnabled: false });
  sg.translate(0, 0, -0.004);
  const head = merge([bg, sg]);
  head.rotateY(-Math.PI / 2);
  head.translate(0, 1.4, 0);
  return {
    wood: xf(new THREE.CylinderGeometry(0.018, 0.021, 2.34, 10), 0, 0.68, 0),
    steel: merge([
      head,
      xf(new THREE.ConeGeometry(0.018, 0.3, 4), 0, 1.95, 0),
      xf(new THREE.CylinderGeometry(0.024, 0.021, 0.18, 8), 0, 1.36, 0),
      xf(new THREE.CylinderGeometry(0.022, 0.02, 0.05, 8), 0, -0.48, 0),
    ]),
  };
}
/** Hand-and-a-half sword: a long, tapering blade, a long grip and a pear pommel. */
export function bastardSword(): WeaponGeo {
  return {
    steel: merge([
      bladeGeo(1.02, 0.05, 0.012, 0.01, 0.004, 0.14),
      xf(new THREE.BoxGeometry(0.02, 0.02, 0.28), 0, 0.12, 0),
      xf(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), 0, 0.12, 0.15, Math.PI / 2, 0, 0),
      xf(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), 0, 0.12, -0.15, Math.PI / 2, 0, 0),
      xf(new THREE.SphereGeometry(0.03, 12, 8), 0, -0.19, 0, 0, 0, 0, 1, 1.35, 1),
    ]),
    grip: xf(new THREE.CylinderGeometry(0.016, 0.019, 0.26, 10), 0, -0.03, 0),
  };
}
/** Great axe: a broad bearded blade with a back spike on a long haft. */
export function greatAxe(): { steel: THREE.BufferGeometry; wood: THREE.BufferGeometry; brass: THREE.BufferGeometry } {
  const blade = new THREE.Shape();
  blade.moveTo(0, -0.06); blade.lineTo(0.08, -0.08); blade.quadraticCurveTo(0.2, -0.2, 0.27, -0.18);
  blade.quadraticCurveTo(0.33, 0.04, 0.26, 0.24); blade.quadraticCurveTo(0.17, 0.14, 0.08, 0.13); blade.lineTo(0, 0.12); blade.lineTo(0, -0.06);
  const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 8 });
  bg.translate(0, 0, -0.005);
  bg.rotateY(-Math.PI / 2);
  bg.translate(0, 1.3, 0);
  return {
    wood: xf(new THREE.CylinderGeometry(0.019, 0.022, 1.95, 10), 0, 0.56, 0),
    steel: merge([
      bg,
      xf(new THREE.ConeGeometry(0.02, 0.16, 4), 0, 1.31, -0.1, -Math.PI / 2, 0, 0),
      xf(new THREE.ConeGeometry(0.02, 0.2, 4), 0, 1.52, 0),
    ]),
    brass: merge([
      xf(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10), 0, 1.3, 0),
      xf(new THREE.CylinderGeometry(0.026, 0.026, 0.05, 10), 0, 0.9, 0),
      xf(new THREE.CylinderGeometry(0.024, 0.02, 0.06, 8), 0, -0.4, 0),
    ]),
  };
}

/** Longbow in its frame: +Y along the stave, +Z toward the archer. Built for a given bend. */
export function longbow(): WeaponGeo {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20 * 2 - 1;
    pts.push(new THREE.Vector3(0, t * 0.92, -0.06 * (1 - t * t) - 0.01));
  }
  const stave = tubeAlong(pts, 0.016, 6, true, 0.016);
  // taper by scaling x/z of the ends
  const pos = stave.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 1 - Math.abs(y) / 0.92 * 0.55;
    pos.setX(i, pos.getX(i) * k);
  }
  stave.computeVertexNormals();
  return { wood: stave, grip: xf(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8), 0, 0, -0.065) };
}
export function quiver() {
  const body = xf(new THREE.CylinderGeometry(0.05, 0.045, 0.5, 10, 1, true), 0, 0, 0);
  const shafts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) { const a = i * 2.4; shafts.push(xf(new THREE.CylinderGeometry(0.004, 0.004, 0.18, 4), Math.cos(a) * 0.025, 0.32, Math.sin(a) * 0.025)); }
  const fletch: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) { const a = i * 2.4; fletch.push(xf(new THREE.BoxGeometry(0.02, 0.07, 0.002), Math.cos(a) * 0.025, 0.37, Math.sin(a) * 0.025, 0, a, 0)); }
  return { leather: body, wood: merge(shafts), cloth: merge(fletch) };
}

/** Unit arrow along +Y (0..0.78) for flying/stuck arrows. */
export function arrowGeo() {
  return {
    wood: xf(new THREE.CylinderGeometry(0.0045, 0.0045, 0.74, 5), 0, 0.37, 0),
    steel: xf(new THREE.ConeGeometry(0.008, 0.05, 4), 0, 0.765, 0),
    cloth: merge([0, 1, 2].map((i) => xf(new THREE.BoxGeometry(0.0015, 0.1, 0.022), 0, 0.06, 0, 0, (i * Math.PI * 2) / 3, 0))),
  };
}
