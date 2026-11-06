// Small allocation-free math helpers shared by the simulation (client and server).
// Conventions: Y is up, metres. A knight with yaw = 0 faces -Z; positive yaw turns left
// (counter-clockwise seen from above), matching three.js Object3D.rotation.y.

export interface V3 { x: number; y: number; z: number }

export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp01((v - a) / (b - a));
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
export const easeIn = (t: number) => t * t;

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = (a + PI) % TAU;
  if (a < 0) a += TAU;
  return a - PI;
}
/** Shortest signed difference b - a. */
export const angleDiff = (a: number, b: number) => wrapAngle(b - a);
export function approachAngle(a: number, target: number, maxStep: number): number {
  const d = angleDiff(a, target);
  if (Math.abs(d) <= maxStep) return target;
  return wrapAngle(a + Math.sign(d) * maxStep);
}
export function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(v + step, target);
  return Math.max(v - step, target);
}

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const set3 = (o: V3, x: number, y: number, z: number) => { o.x = x; o.y = y; o.z = z; return o; };
export const copy3 = (o: V3, a: V3) => { o.x = a.x; o.y = a.y; o.z = a.z; return o; };
export const add3 = (o: V3, a: V3, b: V3) => { o.x = a.x + b.x; o.y = a.y + b.y; o.z = a.z + b.z; return o; };
export const sub3 = (o: V3, a: V3, b: V3) => { o.x = a.x - b.x; o.y = a.y - b.y; o.z = a.z - b.z; return o; };
export const scale3 = (o: V3, a: V3, s: number) => { o.x = a.x * s; o.y = a.y * s; o.z = a.z * s; return o; };
export const addScaled3 = (o: V3, a: V3, b: V3, s: number) => { o.x = a.x + b.x * s; o.y = a.y + b.y * s; o.z = a.z + b.z * s; return o; };
export const dot3 = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const len3 = (a: V3) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const dist3 = (a: V3, b: V3) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
export const distXZ = (ax: number, az: number, bx: number, bz: number) => Math.sqrt((ax - bx) ** 2 + (az - bz) ** 2);
export function norm3(o: V3, a: V3): V3 {
  const l = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) || 1;
  o.x = a.x / l; o.y = a.y / l; o.z = a.z / l;
  return o;
}
export function cross3(o: V3, a: V3, b: V3): V3 {
  const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
  o.x = x; o.y = y; o.z = z;
  return o;
}
export function lerp3(o: V3, a: V3, b: V3, t: number): V3 {
  o.x = a.x + (b.x - a.x) * t; o.y = a.y + (b.y - a.y) * t; o.z = a.z + (b.z - a.z) * t;
  return o;
}

/** Forward unit vector (XZ) for a yaw. */
export const fwdX = (yaw: number) => -Math.sin(yaw);
export const fwdZ = (yaw: number) => -Math.cos(yaw);
/** Yaw that faces from (ax,az) toward (bx,bz). */
export const yawTo = (ax: number, az: number, bx: number, bz: number) => Math.atan2(-(bx - ax), -(bz - az));

/** Rotate a body-space point (x right, y up, z back) by yaw into world offsets. */
export function rotY(o: V3, x: number, y: number, z: number, yaw: number): V3 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  o.x = x * c + z * s;
  o.y = y;
  o.z = -x * s + z * c;
  return o;
}

/** Rotate around the body X axis (pitch); positive pitch tilts -Z forward upward. */
export function rotX(o: V3, x: number, y: number, z: number, pitch: number): V3 {
  const c = Math.cos(pitch), s = Math.sin(pitch);
  o.x = x;
  o.y = y * c - z * s;
  o.z = y * s + z * c;
  return o;
}

// ---------------------------------------------------------------------------------------
// Segment / capsule queries used by melee hit detection and arrows.

const _d1 = v3(), _d2 = v3(), _r = v3();
export interface ClosestResult { dist2: number; s: number; t: number }
const _res: ClosestResult = { dist2: 0, s: 0, t: 0 };

/** Squared distance between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection 5.1.9). */
export function segSegDist2(p1: V3, q1: V3, p2: V3, q2: V3): ClosestResult {
  sub3(_d1, q1, p1); sub3(_d2, q2, p2); sub3(_r, p1, p2);
  const a = dot3(_d1, _d1), e = dot3(_d2, _d2), f = dot3(_d2, _r);
  let s = 0, t = 0;
  const EPS = 1e-9;
  if (a <= EPS && e <= EPS) {
    s = t = 0;
  } else if (a <= EPS) {
    s = 0; t = clamp01(f / e);
  } else {
    const c = dot3(_d1, _r);
    if (e <= EPS) {
      t = 0; s = clamp01(-c / a);
    } else {
      const b = dot3(_d1, _d2);
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp01(-c / a); }
      else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
    }
  }
  const cx = p1.x + _d1.x * s - (p2.x + _d2.x * t);
  const cy = p1.y + _d1.y * s - (p2.y + _d2.y * t);
  const cz = p1.z + _d1.z * s - (p2.z + _d2.z * t);
  _res.dist2 = cx * cx + cy * cy + cz * cz; _res.s = s; _res.t = t;
  return _res;
}

/** Ray/segment vs sphere; returns param t in [0,1] of first contact or -1. */
export function segSphere(p: V3, q: V3, c: V3, r: number): number {
  const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
  const mx = p.x - c.x, my = p.y - c.y, mz = p.z - c.z;
  const a = dx * dx + dy * dy + dz * dz;
  const b = mx * dx + my * dy + mz * dz;
  const cc = mx * mx + my * my + mz * mz - r * r;
  if (cc <= 0) return 0;
  if (a < 1e-12) return -1;
  const disc = b * b - a * cc;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : -1;
}

/** Hermite/Catmull-Rom interpolation of 4 scalars. */
export function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
