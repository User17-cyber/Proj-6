// Verlet ragdoll for deaths (Jakobsen-style). Particles sit at the skeleton's joints; sticks
// keep bone lengths and brace the torso; hinge corrections stop knees bending backwards.
// A short phase of fading muscle tension makes bodies crumple rather than collapse like rags.

import * as THREE from 'three';
import { B, JOINT_NAMES, bonesFromJoints, newJoints, BONE_COUNT, type Joints } from './skeleton';
import type { GroundFn } from './animator';
import type { StaticWorld } from '../../shared/world/world';

const N_BODY = JOINT_NAMES.length; // 19
const GRIP = N_BODY, TIP = N_BODY + 1;
const RADIUS: number[] = [0.13, 0.12, 0.13, 0.08, 0.12, 0.07, 0.05, 0.045, 0.07, 0.05, 0.045, 0.08, 0.06, 0.05, 0.04, 0.08, 0.06, 0.05, 0.04, 0.03, 0.03];
const J = Object.fromEntries(JOINT_NAMES.map((n, i) => [n, i])) as Record<(typeof JOINT_NAMES)[number], number>;

type Stick = [number, number, number, number, number]; // a, b, rest, stiffness, mode (0 = rigid, 1 = min only, 2 = max only)

export class Ragdoll {
  readonly p: Float32Array;
  readonly q: Float32Array;
  readonly joints: Joints = newJoints();
  readonly bones: THREE.Matrix4[] = Array.from({ length: BONE_COUNT }, () => new THREE.Matrix4());
  readonly weapon = new THREE.Matrix4();
  readonly offhand = new THREE.Matrix4();
  hasWeapon: boolean;
  /** the shield splintered before death: nothing in the left hand */
  noOffhand = false;
  /** the knight's build (height, girth): joints are already to size, the meshes are scaled to match */
  height = 1; girth = 1;
  private sticks: Stick[] = [];
  private pose: Float32Array;
  t = 0;
  frozen = false;
  private calm = 0;
  private weaponEdge = new THREE.Vector3(1, 0, 0);

  constructor(from: Joints, prev: Joints, frameDt: number, weaponM: THREE.Matrix4 | null, impulse: { dx: number; dy: number; dz: number; force: number; zone: number }) {
    const n = N_BODY + 2;
    this.p = new Float32Array(n * 3);
    this.q = new Float32Array(n * 3);
    this.pose = new Float32Array(N_BODY * 3);
    const dt = Math.max(frameDt, 1 / 240);
    const pel = (from as unknown as Record<string, THREE.Vector3>).pelvis;
    JOINT_NAMES.forEach((name, i) => {
      const c = (from as unknown as Record<string, THREE.Vector3>)[name];
      const pv = (prev as unknown as Record<string, THREE.Vector3>)[name];
      this.p[i * 3] = c.x; this.p[i * 3 + 1] = c.y; this.p[i * 3 + 2] = c.z;
      // carry over the animated motion (clamped)
      let vx = (c.x - pv.x) / dt, vy = (c.y - pv.y) / dt, vz = (c.z - pv.z) / dt;
      const sp = Math.hypot(vx, vy, vz);
      if (sp > 8) { vx *= 8 / sp; vy *= 8 / sp; vz *= 8 / sp; }
      const step = 1 / 60;
      this.q[i * 3] = c.x - vx * step; this.q[i * 3 + 1] = c.y - vy * step; this.q[i * 3 + 2] = c.z - vz * step;
      this.pose[i * 3] = c.x - pel.x; this.pose[i * 3 + 1] = c.y - pel.y; this.pose[i * 3 + 2] = c.z - pel.z;
    });
    // the killing blow
    const f = impulse.force * (1 / 60);
    const push = (i: number, k: number) => { this.q[i * 3] -= impulse.dx * f * k; this.q[i * 3 + 1] -= impulse.dy * f * k; this.q[i * 3 + 2] -= impulse.dz * f * k; };
    if (impulse.zone === 0) { push(J.headTop, 3.6); push(J.neck, 2.2); push(J.chest, 1.0); }
    else if (impulse.zone === 2) { push(J.kneeL, 2.4); push(J.kneeR, 2.4); push(J.pelvis, 1.2); }
    else { push(J.chest, 2.6); push(J.spine, 2.0); push(J.shoulderL, 1.4); push(J.shoulderR, 1.4); push(J.pelvis, 0.8); }
    // knees buckle forward a touch
    const fx = this.p[J.kneeL * 3] - this.p[J.hipL * 3], fz = this.p[J.kneeL * 3 + 2] - this.p[J.hipL * 3 + 2];
    void fx; void fz;
    this.hasWeapon = !!weaponM;
    if (weaponM) {
      const o = new THREE.Vector3().setFromMatrixPosition(weaponM);
      const y = new THREE.Vector3().setFromMatrixColumn(weaponM, 1).normalize();
      this.weaponEdge.setFromMatrixColumn(weaponM, 2).normalize();
      const tip = o.clone().addScaledVector(y, 0.9);
      this.p.set([o.x, o.y, o.z, tip.x, tip.y, tip.z], GRIP * 3);
      const w = this.p[J.wristR * 3], wq = this.q[J.wristR * 3];
      const vx = w - wq;
      this.q.set([o.x - vx, o.y, o.z, tip.x - vx, tip.y, tip.z], GRIP * 3);
    }
    this.buildSticks();
    this.updateBones();
  }

  private len(a: number, b: number) {
    return Math.hypot(this.p[a * 3] - this.p[b * 3], this.p[a * 3 + 1] - this.p[b * 3 + 1], this.p[a * 3 + 2] - this.p[b * 3 + 2]);
  }
  private stick(a: number, b: number, stiff = 1, mode = 0, scale = 1) { this.sticks.push([a, b, this.len(a, b) * scale, stiff, mode]); }

  private buildSticks() {
    const s = this.stick.bind(this);
    // spine & head
    s(J.pelvis, J.spine); s(J.spine, J.chest); s(J.chest, J.neck); s(J.neck, J.headTop);
    // torso box
    for (const sh of [J.shoulderL, J.shoulderR]) { s(J.chest, sh); s(J.neck, sh); s(J.spine, sh, 0.9); }
    s(J.shoulderL, J.shoulderR);
    for (const hp of [J.hipL, J.hipR]) { s(J.pelvis, hp); s(J.spine, hp, 0.9); s(J.chest, hp, 0.6); }
    s(J.hipL, J.hipR);
    s(J.shoulderL, J.hipR, 0.45); s(J.shoulderR, J.hipL, 0.45);
    s(J.pelvis, J.chest, 0.6);
    // head can't fold into the chest
    s(J.headTop, J.chest, 1, 1, 0.97); s(J.headTop, J.shoulderL, 0.6, 1, 0.9); s(J.headTop, J.shoulderR, 0.6, 1, 0.9);
    // arms
    for (const [sh, el, wr] of [[J.shoulderL, J.elbowL, J.wristL], [J.shoulderR, J.elbowR, J.wristR]]) {
      s(sh, el); s(el, wr);
      this.sticks.push([sh, wr, 0.2, 1, 1]);
    }
    // legs
    for (const [hp, kn, an, to] of [[J.hipL, J.kneeL, J.ankleL, J.toeL], [J.hipR, J.kneeR, J.ankleR, J.toeR]]) {
      s(hp, kn); s(kn, an); s(an, to); s(kn, to);
      this.sticks.push([hp, an, 0.3, 1, 1]);
    }
    if (this.hasWeapon) s(GRIP, TIP);
  }

  step(dt: number, ground: GroundFn, world: StaticWorld | null) {
    if (this.frozen) return;
    this.t += dt;
    const n = this.hasWeapon ? N_BODY + 2 : N_BODY;
    const p = this.p, q = this.q;
    const g = -9.81 * 1.15 * dt * dt;
    let energy = 0;
    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      const vx = (p[ix] - q[ix]) * 0.992, vy = (p[ix + 1] - q[ix + 1]) * 0.992, vz = (p[ix + 2] - q[ix + 2]) * 0.992;
      q[ix] = p[ix]; q[ix + 1] = p[ix + 1]; q[ix + 2] = p[ix + 2];
      p[ix] += vx; p[ix + 1] += vy + g; p[ix + 2] += vz;
      energy += vx * vx + vy * vy + vz * vz;
    }
    // fading muscle tone: hold the death pose relative to the pelvis for a moment
    const tone = Math.max(0, 1 - this.t / 0.42) * 0.12;
    if (tone > 0) {
      const px = p[0], py = p[1], pz = p[2];
      for (let i = 1; i < N_BODY; i++) {
        const ix = i * 3;
        p[ix] += (px + this.pose[ix] - p[ix]) * tone;
        p[ix + 1] += (py + this.pose[ix + 1] * 0.9 - p[ix + 1]) * tone;
        p[ix + 2] += (pz + this.pose[ix + 2] - p[ix + 2]) * tone;
      }
    }
    for (let it = 0; it < 7; it++) {
      for (const [a, b, rest, k, mode] of this.sticks) {
        const ax = a * 3, bx = b * 3;
        const dx = p[bx] - p[ax], dy = p[bx + 1] - p[ax + 1], dz = p[bx + 2] - p[ax + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (mode === 1 && d >= rest) continue;
        if (mode === 2 && d <= rest) continue;
        const diff = ((d - rest) / d) * 0.5 * k;
        p[ax] += dx * diff; p[ax + 1] += dy * diff; p[ax + 2] += dz * diff;
        p[bx] -= dx * diff; p[bx + 1] -= dy * diff; p[bx + 2] -= dz * diff;
      }
      this.kneeHinge(J.hipL, J.kneeL, J.ankleL);
      this.kneeHinge(J.hipR, J.kneeR, J.ankleR);
      // ground
      for (let i = 0; i < n; i++) {
        const ix = i * 3;
        const r = RADIUS[i];
        const gy = ground(p[ix], p[ix + 2], p[ix + 1] + 0.3) + r;
        if (p[ix + 1] < gy) {
          p[ix + 1] = gy;
          // friction
          q[ix] = p[ix] + (q[ix] - p[ix]) * 0.4;
          q[ix + 2] = p[ix + 2] + (q[ix + 2] - p[ix + 2]) * 0.4;
          if (q[ix + 1] < p[ix + 1] - 0.05) q[ix + 1] = p[ix + 1] - 0.05;
        }
      }
    }
    // walls for the big masses
    if (world) {
      for (const i of [J.pelvis, J.chest, J.headTop]) {
        _w.x = p[i * 3]; _w.y = p[i * 3 + 1] - 0.15; _w.z = p[i * 3 + 2];
        if (world.resolveCylinder(_w, 0.14, 0.3, 0.05)) { p[i * 3] = _w.x; p[i * 3 + 2] = _w.z; }
      }
    }
    if (energy < 2e-5 * n && this.t > 1.2) this.calm += dt; else this.calm = 0;
    if (this.calm > 0.8 || this.t > 9) this.frozen = true;
    this.updateBones();
  }

  private kneeHinge(hip: number, knee: number, ankle: number) {
    // body forward from the hips and spine
    const p = this.p;
    const rx = p[J.hipR * 3] - p[J.hipL * 3], ry = p[J.hipR * 3 + 1] - p[J.hipL * 3 + 1], rz = p[J.hipR * 3 + 2] - p[J.hipL * 3 + 2];
    const ux = p[J.spine * 3] - p[J.pelvis * 3], uy = p[J.spine * 3 + 1] - p[J.pelvis * 3 + 1], uz = p[J.spine * 3 + 2] - p[J.pelvis * 3 + 2];
    // fwd = up x right
    const fx = uy * rz - uz * ry, fy = uz * rx - ux * rz, fz = ux * ry - uy * rx;
    // knee offset from the hip-ankle line
    const hx = p[hip * 3], hy = p[hip * 3 + 1], hz = p[hip * 3 + 2];
    const ax = p[ankle * 3] - hx, ay = p[ankle * 3 + 1] - hy, az = p[ankle * 3 + 2] - hz;
    const al = Math.hypot(ax, ay, az) || 1e-6;
    const kx = p[knee * 3] - hx, ky = p[knee * 3 + 1] - hy, kz = p[knee * 3 + 2] - hz;
    const t = (kx * ax + ky * ay + kz * az) / (al * al);
    const ox = kx - ax * t, oy = ky - ay * t, oz = kz - az * t;
    if (ox * fx + oy * fy + oz * fz < 0) {
      p[knee * 3] -= ox * 1.6; p[knee * 3 + 1] -= oy * 1.6; p[knee * 3 + 2] -= oz * 1.6;
    }
  }

  updateBones() {
    const p = this.p;
    JOINT_NAMES.forEach((name, i) => (this.joints as unknown as Record<string, THREE.Vector3>)[name].set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]));
    const j = this.joints;
    const right = _a.subVectors(j.hipR, j.hipL);
    const up = _b.subVectors(j.spine, j.pelvis);
    const bodyFwd = _c.crossVectors(up, right).normalize();
    const cRight = _d.subVectors(j.shoulderR, j.shoulderL);
    const cUp = _e.subVectors(j.neck, j.chest);
    const chestFwd = _f.crossVectors(cUp, cRight).normalize();
    const gripR = _g.subVectors(j.wristR, j.elbowR).normalize();
    const gripL = _h.subVectors(j.wristL, j.elbowL).normalize();
    bonesFromJoints(j, this.bones, {
      bodyFwd, chestFwd, headFwd: chestFwd, gripL, gripR,
      footFwdL: _i.subVectors(j.toeL, j.ankleL), footFwdR: _k.subVectors(j.toeR, j.ankleR),
    });
    if (this.hasWeapon) {
      const o = _l.set(p[GRIP * 3], p[GRIP * 3 + 1], p[GRIP * 3 + 2]);
      const y = _m.set(p[TIP * 3] - o.x, p[TIP * 3 + 1] - o.y, p[TIP * 3 + 2] - o.z).normalize();
      this.weaponEdge.addScaledVector(y, -this.weaponEdge.dot(y)).normalize();
      if (this.weaponEdge.lengthSq() < 0.5) this.weaponEdge.set(0, 1, 0).cross(y).normalize();
      const x = _n.crossVectors(y, this.weaponEdge).normalize();
      this.weapon.set(x.x, y.x, this.weaponEdge.x, o.x, x.y, y.y, this.weaponEdge.y, o.y, x.z, y.z, this.weaponEdge.z, o.z, 0, 0, 0, 1);
    }
    if (this.noOffhand) { this.offhand.makeScale(0, 0, 0); this.applySize(); return; }
    // shield stays strapped to the left forearm, facing out from the body
    const mid = _l.lerpVectors(j.elbowL, j.wristL, 0.55);
    const fore = _m.subVectors(j.wristL, j.elbowL).normalize();
    const out = _n.subVectors(mid, j.chest);
    out.addScaledVector(fore, -out.dot(fore)).normalize();
    mid.addScaledVector(out, 0.07);
    const yv = _o.crossVectors(out, fore).normalize();
    const xv = _a.crossVectors(yv, out).normalize();
    this.offhand.set(xv.x, yv.x, out.x, mid.x, xv.y, yv.y, out.y, mid.y, xv.z, yv.z, out.z, mid.z, 0, 0, 0, 1);
    this.applySize();
  }

  private applySize() {
    const s = this.height, g = this.girth;
    if (s === 1 && g === 1) return;
    for (let i = 0; i < this.bones.length; i++) this.bones[i].multiply(i === B.head || i === B.neck ? _sz.makeScale(s, s, s) : _sz.makeScale(s * g, s, s * g));
    if (this.hasWeapon) this.weapon.multiply(_sz.makeScale(s, s, s));
    if (!this.noOffhand) this.offhand.multiply(_sz.makeScale(s, s, s));
  }
}

const _w = { x: 0, y: 0, z: 0 };
const _sz = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3();
const _g = new THREE.Vector3(), _h = new THREE.Vector3(), _i = new THREE.Vector3(), _k = new THREE.Vector3(), _l = new THREE.Vector3(), _m = new THREE.Vector3(), _n = new THREE.Vector3(), _o = new THREE.Vector3();
