// The human under the armour: a continuous, skinned body (torso, arms, legs, neck) and a
// sculpted head, modelled in a rest ("bind") pose of the knight skeleton. Joints blend
// between neighbouring bones so elbows, knees, hips and shoulders bend smoothly instead
// of opening gaps between rigid pieces.

import * as THREE from 'three';
import { B, BODY, BONE_COUNT, newJoints, bonesFromJoints, type Joints } from './skeleton';

/** Extra matrix slots after the 17 bones: the weapon, the off-hand item, the dagger. */
export const SLOT_WEAPON = 17, SLOT_OFFHAND = 18, SLOT_DAGGER = 19, SLOTS = 20;

/** Body regions; each class maps them to a surface (skin, mail, doublet, hose...). */
export const REGION = { torso: 0, arm: 1, leg: 2, neck: 3, head: 4 } as const;

const FWD = new THREE.Vector3(0, 0, -1);

function bindJoints(): Joints {
  const j = newJoints();
  const hipY = BODY.hipY;
  j.pelvis.set(0, hipY, 0);
  j.spine.set(0, hipY + BODY.spineLen, 0);
  j.chest.set(0, j.spine.y + BODY.chestLen, 0);
  j.neck.set(0, j.chest.y + BODY.shoulderY + 0.06, 0);
  j.headTop.set(0, j.neck.y + BODY.neckLen + 0.27, 0);
  for (const side of [-1, 1]) {
    const L = side < 0;
    const sh = L ? j.shoulderL : j.shoulderR, el = L ? j.elbowL : j.elbowR, wr = L ? j.wristL : j.wristR;
    sh.set(side * BODY.shoulderW, j.chest.y + BODY.shoulderY, 0);
    const a = 0.2; // arms hang a little away from the body
    el.set(sh.x + side * Math.sin(a) * BODY.upperArm, sh.y - Math.cos(a) * BODY.upperArm, 0);
    const bend = 0.18; // and bend a touch forward at the elbow, which fixes the bend plane
    wr.set(el.x + side * Math.sin(a) * BODY.forearm * Math.cos(bend), el.y - Math.cos(a) * BODY.forearm * Math.cos(bend), -BODY.forearm * Math.sin(bend));
    const hip = L ? j.hipL : j.hipR, kn = L ? j.kneeL : j.kneeR, an = L ? j.ankleL : j.ankleR, toe = L ? j.toeL : j.toeR;
    hip.set(side * BODY.hipW, hipY - 0.06, 0);
    kn.set(hip.x, hip.y - BODY.thigh, -0.012);
    an.set(hip.x, kn.y - BODY.shin, 0);
    toe.set(hip.x, 0.02, -0.17);
  }
  return j;
}

/** Bind pose: joints, bone matrices and their inverses. */
export const BIND = (() => {
  const joints = bindJoints();
  const bones = Array.from({ length: BONE_COUNT }, () => new THREE.Matrix4());
  bonesFromJoints(joints, bones, { bodyFwd: FWD, chestFwd: FWD, headFwd: FWD, gripL: FWD, gripR: FWD, footFwdL: FWD, footFwdR: FWD });
  const inv = bones.map((m) => m.clone().invert());
  return { joints, bones, inv };
})();

// ------------------------------------------------------------------ builder
class Mesh {
  pos: number[] = []; nrm: number[] = []; uv: number[] = []; b0: number[] = []; b1: number[] = []; w: number[] = []; reg: number[] = []; idx: number[] = [];
  get count() { return this.pos.length / 3; }
  vert(p: THREE.Vector3, u: number, v: number, b0: number, b1: number, w: number, region: number) {
    this.pos.push(p.x, p.y, p.z); this.nrm.push(0, 0, 0); this.uv.push(u, v); this.b0.push(b0); this.b1.push(b1); this.w.push(w); this.reg.push(region);
  }
  /** Quad grid between consecutive rings of `cols` vertices starting at `base`. */
  grid(base: number, rows: number, cols: number, flip = false) {
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
      const a = base + i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      if (flip) this.idx.push(a, b, c, b, d, c); else this.idx.push(a, c, b, b, c, d);
    }
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aBones', new THREE.Float32BufferAttribute(this.b0.flatMap((b, i) => [b, this.b1[i]]), 2));
    g.setAttribute('aW', new THREE.Float32BufferAttribute(this.w, 1));
    g.setAttribute('aRegion', new THREE.Float32BufferAttribute(this.reg, 1));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _p = new THREE.Vector3();

/** Torso from the hips to the base of the neck, in bind space (Y up, -Z forward). */
function torso(m: Mesh) {
  // y, half-width, half-depth, forward offset; follows the arming doublet the armour was fitted over
  const R: [number, number, number, number][] = [
    [0.86, 0.139, 0.107, 0.0], [0.93, 0.155, 0.116, 0.0], [1.0, 0.153, 0.116, 0.0], [1.08, 0.148, 0.111, -0.004],
    [1.16, 0.156, 0.116, -0.006], [1.25, 0.169, 0.125, -0.008], [1.33, 0.178, 0.126, -0.01], [1.41, 0.182, 0.121, -0.006],
    [1.46, 0.169, 0.11, 0.0], [1.5, 0.12, 0.085, 0.004], [1.535, 0.075, 0.066, 0.006], [1.555, 0.058, 0.056, 0.006],
  ];
  const segs = 28, cols = segs + 1, base = m.count;
  const yB = BIND.joints;
  for (let i = 0; i < R.length; i++) {
    const [y, rx, rz, cz] = R[i];
    // pelvis -> spine -> chest -> neck weights
    let b0: number = B.pelvis, b1: number = B.spine, w = smooth(yB.pelvis.y + 0.03, yB.spine.y + 0.04, y);
    if (y > yB.spine.y + 0.04) { b0 = B.spine; b1 = B.chest; w = smooth(yB.chest.y - 0.08, yB.chest.y + 0.02, y); }
    if (y > yB.chest.y + 0.02) { b0 = B.chest; b1 = B.neck; w = smooth(1.5, 1.56, y); }
    for (let j = 0; j <= segs; j++) {
      const th = Math.PI + (j / segs) * Math.PI * 2; // seam down the back
      const s = Math.sin(th), c = Math.cos(th);
      // squarer shoulders and chest, rounder belly
      const sq = y > 1.3 && y < 1.47 ? 2.6 : 2.2;
      const e = 2 / sq;
      const x = Math.sign(s) * Math.pow(Math.abs(s), e) * rx;
      let z = -Math.sign(c) * Math.pow(Math.abs(c), e) * rz;
      // shoulder blades and chest
      if (y > 1.2 && y < 1.45) z -= 0.008 * Math.max(0, c) * Math.exp(-(((y - 1.35) / 0.06) ** 2));
      m.vert(_p.set(x, y, z + cz), j / segs, y * 2, b0, b1, w, REGION.torso);
    }
  }
  m.grid(base, R.length, cols);
}

/** A limb as one tube through two bones, bending smoothly at the middle joint. */
function limb(m: Mesh, upper: number, lower: number, lenU: number, lenL: number, prof: [number, number, number][], region: number, parent: number, parentBlend: number, segs: number) {
  const cols = segs + 1, base = m.count;
  const total = lenU + lenL;
  for (let i = 0; i < prof.length; i++) {
    const [s, rx, rz] = prof[i];
    const inLower = s > lenU;
    const bone = inLower ? lower : upper;
    const ly = -(inLower ? s - lenU : s);
    // weights: shoulder/hip into the torso, elbow/knee between the two bones
    let b0: number = upper, b1: number = lower, w = smooth(lenU - 0.045, lenU + 0.045, s);
    if (s < parentBlend) { b0 = upper; b1 = parent; w = 0.5 * (1 - smooth(0, parentBlend, s)); }
    for (let j = 0; j <= segs; j++) {
      const th = Math.PI + (j / segs) * Math.PI * 2; // seam along the back of the limb
      const x = Math.sin(th) * rx;
      let z = -Math.cos(th) * rz;
      // calf and forearm muscle sit toward the back / outside
      if (region === REGION.leg && inLower) z += 0.012 * Math.max(0, Math.cos(th + Math.PI)) * Math.exp(-(((s - lenU - 0.12) / 0.09) ** 2));
      _p.set(x, ly, z).applyMatrix4(BIND.bones[bone]);
      m.vert(_p, j / segs, s / total * 3, b0, b1, w, region);
    }
  }
  // rings run down the limb, so the winding is reversed to face outward
  m.grid(base, prof.length, cols, true);
}

function arms(m: Mesh) {
  const U = BODY.upperArm, F = BODY.forearm;
  // [distance from the shoulder, radius across, radius front-back]: kept inside the sleeves and plate
  const prof: [number, number, number][] = [
    [-0.02, 0.055, 0.055], [0.02, 0.055, 0.054], [0.07, 0.053, 0.052], [0.14, 0.05, 0.05], [0.21, 0.046, 0.046],
    [U - 0.02, 0.042, 0.041], [U + 0.02, 0.042, 0.042], [U + 0.07, 0.045, 0.043], [U + 0.14, 0.04, 0.037], [U + 0.21, 0.035, 0.031], [U + F - 0.01, 0.031, 0.027],
  ];
  limb(m, B.upperArmL, B.forearmL, U, F, prof, REGION.arm, B.chest, 0.07, 14);
  limb(m, B.upperArmR, B.forearmR, U, F, prof, REGION.arm, B.chest, 0.07, 14);
}

function legs(m: Mesh) {
  const T = BODY.thigh, S = BODY.shin;
  const prof: [number, number, number][] = [
    [-0.03, 0.088, 0.086], [0.03, 0.086, 0.085], [0.12, 0.081, 0.08], [0.23, 0.074, 0.073], [0.34, 0.066, 0.065],
    [T - 0.02, 0.057, 0.057], [T + 0.03, 0.055, 0.056], [T + 0.1, 0.057, 0.057], [T + 0.18, 0.053, 0.052], [T + 0.28, 0.045, 0.043], [T + S - 0.02, 0.038, 0.037],
  ];
  limb(m, B.thighL, B.shinL, T, S, prof, REGION.leg, B.pelvis, 0.08, 16);
  limb(m, B.thighR, B.shinR, T, S, prof, REGION.leg, B.pelvis, 0.08, 16);
}

function neck(m: Mesh) {
  const segs = 14, cols = segs + 1, base = m.count;
  const rows: [number, number, number][] = [[1.5, 0.06, 0.058], [1.55, 0.053, 0.054], [1.6, 0.05, 0.052], [1.65, 0.049, 0.05], [1.69, 0.05, 0.05]];
  const yn = BIND.joints.neck.y, yh = BIND.bones[B.head].elements[13];
  for (const [y, rx, rz] of rows) {
    let b0: number = B.chest, b1: number = B.neck, w = smooth(1.5, yn + 0.02, y);
    if (y > yn + 0.02) { b0 = B.neck; b1 = B.head; w = smooth(yh - 0.02, yh + 0.04, y); }
    for (let j = 0; j <= segs; j++) {
      const th = Math.PI + (j / segs) * Math.PI * 2;
      // the throat sits a little forward of the spine
      m.vert(_p.set(Math.sin(th) * rx, y, -Math.cos(th) * rz - 0.008), j / segs, y * 4, b0, b1, w, REGION.neck);
    }
  }
  m.grid(base, rows.length, cols);
}

/**
 * Head in the head bone's frame (origin at the top of the neck, +Y up, -Z forward),
 * sculpted from an egg: jaw and chin, brow ridge, eye sockets, nose, cheekbones, lips, ears.
 * Features below are referenced by the face shader (eyes at y 0.104, mouth at 0.036...).
 */
export function headShape(p: THREE.Vector3, dir: THREE.Vector3) {
  const ax = Math.abs(p.x);
  const front = smooth(-0.3, -0.75, dir.z); // 1 on the face
  // jaw narrows below the cheekbones; the chin comes forward
  const jaw = smooth(0.075, -0.02, p.y);
  p.x *= 1 - 0.2 * jaw;
  if (dir.z < 0) p.z *= 1 - 0.05 * jaw;
  p.z -= 0.011 * Math.exp(-((p.x / 0.026) ** 2) - ((p.y - 0.004) / 0.022) ** 2) * front;
  // flatter face plane
  const facePlane = -0.086;
  if (p.z < facePlane && ax < 0.05 && p.y > 0.02 && p.y < 0.16) p.z = facePlane + (p.z - facePlane) * 0.45;
  // brow ridge and eye sockets
  p.z -= 0.006 * Math.exp(-(((p.y - 0.124) / 0.011) ** 2)) * smooth(0.065, 0.02, ax) * front;
  p.z += 0.0065 * Math.exp(-(((ax - 0.033) / 0.016) ** 2) - ((p.y - 0.104) / 0.012) ** 2) * front;
  // nose: a ridge from the brow to the tip, wider at the nostrils
  const ny = p.y;
  const nAmt = 0.023 * smooth(0.121, 0.068, ny) * smooth(0.05, 0.067, ny);
  const nW = 0.0085 + 0.0085 * smooth(0.098, 0.066, ny);
  p.z -= nAmt * Math.exp(-((p.x / nW) ** 2)) * front;
  // cheekbones
  const cheek = Math.exp(-(((ax - 0.056) / 0.02) ** 2) - ((p.y - 0.083) / 0.02) ** 2) * front;
  p.z -= 0.004 * cheek; p.x += Math.sign(p.x) * 0.003 * cheek;
  // lips
  p.z -= 0.0045 * Math.exp(-((p.x / 0.022) ** 2) - ((p.y - 0.036) / 0.009) ** 2) * front;
  // ears
  const side = smooth(0.55, 0.85, Math.abs(dir.x));
  p.x += Math.sign(p.x) * 0.013 * Math.exp(-(((p.y - 0.104) / 0.022) ** 2) - ((p.z - 0.008) / 0.013) ** 2) * side;
  // fuller back of the skull
  p.z += 0.01 * smooth(0, 0.8, dir.z) * Math.exp(-(((p.y - 0.13) / 0.06) ** 2));
  return p;
}

function head(m: Mesh) {
  const segs = 32, rings = 24, cols = segs + 1, base = m.count;
  const hb = BIND.bones[B.head];
  const c = new THREE.Vector3(0, 0.105, 0.0), r = new THREE.Vector3(0.076, 0.118, 0.098);
  const d = new THREE.Vector3();
  for (let i = 0; i < rings; i++) {
    const phi = -1.05 + (i / (rings - 1)) * (Math.PI / 2 + 1.05); // from under the chin to the crown
    for (let j = 0; j <= segs; j++) {
      const th = (j / segs) * Math.PI * 2 - Math.PI; // seam at the back of the head
      d.set(Math.sin(th) * Math.cos(phi), Math.sin(phi), -Math.cos(th) * Math.cos(phi));
      _p.set(c.x + r.x * d.x, c.y + r.y * d.y, c.z + r.z * d.z);
      headShape(_p, d);
      _p.applyMatrix4(hb);
      m.vert(_p, j / segs, i / (rings - 1), B.head, B.head, 0, REGION.head);
    }
  }
  m.grid(base, rings, cols, false);
}

const cached = new Map<boolean, THREE.BufferGeometry>();
/** The body in bind space (indexed), with bones, weights and regions. Closed helms need no face. */
export function bodyGeometry(withHead = true): THREE.BufferGeometry {
  const hit = cached.get(withHead);
  if (hit) return hit;
  const m = new Mesh();
  torso(m); arms(m); legs(m); neck(m);
  if (withHead) head(m);
  const g = m.geometry();
  cached.set(withHead, g);
  return g;
}

/** Inverse of the head bone in the bind pose (the face shader works in head space). */
export const HEAD_INV = BIND.inv[B.head];
