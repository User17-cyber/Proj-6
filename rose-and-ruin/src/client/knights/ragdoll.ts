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

type Stick = [number, number, number, number, number];

/**
 * How a knight dies. Each kind but 'limp' and 'hurled' begins with a short scripted throe:
 * the pelvis is held up (or let down to the knees) and the upper body is drawn into a pose,
 * then the drive fades and the ragdoll finishes the fall.
 *  clutch  - a body wound: stagger back a step, hunch over it, sink to the knees, topple
 *  buckle  - legs cut away: drop to the knees at once, reach out, pitch forward
 *  arrow   - struck by a shaft: reel, clutch, slump slowly
 *  bleed   - bled out: sway, sink slowly to the knees and keel over
 *  hurled  - a heavy blow or charge: thrown off the feet with a spin
 *  limp    - a blow to the head: every muscle goes at once
 */
export type DeathKind = 'clutch' | 'buckle' | 'arrow' | 'bleed' | 'hurled' | 'limp';
const THROE_DUR: Record<DeathKind, number> = { clutch: 1.25, buckle: 0.85, arrow: 1.55, bleed: 1.9, hurled: 0, limp: 0 }; // a, b, rest, stiffness, mode (0 = rigid, 1 = min only, 2 = max only)

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
  /** death throe */
  readonly kind: DeathKind;
  private dur = 0;
  private side = 1;
  private fwdX = 0; private fwdZ = 1; private rightX = 1; private rightZ = 0;
  private standH = 1; private groundY = NaN; private released = false;

  constructor(from: Joints, prev: Joints, frameDt: number, weaponM: THREE.Matrix4 | null, impulse: { dx: number; dy: number; dz: number; force: number; zone: number }, kind: DeathKind = 'limp') {
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
    // the body's frame at the moment of death (feet point forward)
    this.kind = kind;
    this.dur = THROE_DUR[kind] * (0.85 + Math.random() * 0.35);
    this.side = Math.random() < 0.5 ? -1 : 1;
    {
      const P = (n: string) => (from as unknown as Record<string, THREE.Vector3>)[n];
      let fx = P('toeL').x - P('ankleL').x + P('toeR').x - P('ankleR').x, fz = P('toeL').z - P('ankleL').z + P('toeR').z - P('ankleR').z;
      const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      this.fwdX = fx; this.fwdZ = fz; this.rightX = -fz; this.rightZ = fx;
      this.standH = Math.max(0.6, P('pelvis').y - Math.min(P('ankleL').y, P('ankleR').y) + 0.08);
    }
    // a heavy blow throws the body off its feet, turning it as it goes
    if (kind === 'hurled') { impulse = { ...impulse, force: impulse.force * 1.7, dy: Math.max(impulse.dy, 0) + 0.45 }; }
    // the killing blow (a dying man who stays on his feet a moment takes it gentler)
    const f = impulse.force * (1 / 60) * (this.dur > 0 ? 0.45 : 1);
    const push = (i: number, k: number) => { this.q[i * 3] -= impulse.dx * f * k; this.q[i * 3 + 1] -= impulse.dy * f * k; this.q[i * 3 + 2] -= impulse.dz * f * k; };
    if (impulse.zone === 0) { push(J.headTop, 3.6); push(J.neck, 2.2); push(J.chest, 1.0); }
    else if (impulse.zone === 2) { push(J.kneeL, 2.4); push(J.kneeR, 2.4); push(J.pelvis, 1.2); }
    else { push(J.chest, 2.6); push(J.spine, 2.0); push(J.shoulderL, 1.4); push(J.shoulderR, 1.4); push(J.pelvis, 0.8); }
    if (kind === 'hurled') {
      // spin: one shoulder driven harder than the other
      const sx = this.rightX * this.side * f * 1.6, sz = this.rightZ * this.side * f * 1.6;
      this.q[J.shoulderL * 3] -= sx; this.q[J.shoulderL * 3 + 2] -= sz;
      this.q[J.shoulderR * 3] += sx; this.q[J.shoulderR * 3 + 2] += sz;
    }
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
    // once down, the body loses its energy quicker so it comes to rest instead of twitching
    const damp = this.t > this.dur + 1.4 ? 0.95 : 0.992;
    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      const vx = (p[ix] - q[ix]) * damp, vy = (p[ix + 1] - q[ix + 1]) * damp, vz = (p[ix + 2] - q[ix + 2]) * damp;
      q[ix] = p[ix]; q[ix + 1] = p[ix + 1]; q[ix + 2] = p[ix + 2];
      p[ix] += vx; p[ix + 1] += vy + g; p[ix + 2] += vz;
      energy += vx * vx + vy * vy + vz * vz;
    }
    if (this.t < this.dur) this.throe(ground, dt);
    else if (this.dur > 0 && !this.released) this.release();
    // fading muscle tone: hold the death pose relative to the pelvis for a moment (none when struck in the head)
    const tone = this.kind === 'limp' || this.dur > 0 ? 0 : Math.max(0, 1 - this.t / 0.42) * 0.12;
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
    if (energy < 2e-5 * n && this.t > 1.2 + this.dur) this.calm += dt; else this.calm = 0;
    if (this.calm > 0.8 || this.t > 9) this.frozen = true;
    this.updateBones();
  }

  /** The scripted part of a death: hold the pelvis at a height and pull the upper body into a pose. */
  private throe(ground: GroundFn, dt: number) {
    const p = this.p, u = this.t / this.dur, k = this.kind, s = this.standH / 1.0;
    const pi = J.pelvis * 3;
    if (Number.isNaN(this.groundY)) this.groundY = ground(p[pi], p[pi + 2], p[pi + 1]);
    const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    // how far the knees have given way (1 standing, ~0.5 kneeling)
    const kneel = k === 'buckle' ? sm(0, 0.32, u) : k === 'bleed' ? sm(0.15, 0.75, u) : k === 'arrow' ? sm(0.35, 0.9, u) : sm(0.35, 0.85, u);
    const h = this.standH * (1 - 0.47 * kneel);
    const w = 0.24 * (1 - sm(0.8, 1, u));
    // stagger: a step or two back from the blow (sideways for an arrow), a sway when bleeding
    const back = k === 'clutch' ? 1.0 * (1 - sm(0, 0.45, u)) : k === 'arrow' ? 0.5 * (1 - sm(0, 0.5, u)) : 0;
    const sway = k === 'bleed' ? Math.sin(this.t * 5) * 0.35 : k === 'arrow' ? this.side * 0.3 * (1 - sm(0, 0.6, u)) : 0;
    const q = this.q;
    const vx = -this.fwdX * back + this.rightX * sway, vz = -this.fwdZ * back + this.rightZ * sway;
    // steer the hips' horizontal velocity toward the stagger (verlet: velocity is p - q)
    for (const i of [J.pelvis, J.hipL, J.hipR, J.spine]) {
      const ix = i * 3;
      const cx = p[ix] - q[ix], cz = p[ix + 2] - q[ix + 2];
      const nx = cx + (vx * dt - cx) * 0.25, nz = cz + (vz * dt - cz) * 0.25;
      q[ix] = p[ix] - nx; q[ix + 2] = p[ix + 2] - nz;
    }
    // hold the hips at the height of the moment (standing, sinking, kneeling), damped
    const ty = this.groundY + h;
    const dy = (ty - p[pi + 1]) * w * 1.6;
    for (const i of [J.pelvis, J.hipL, J.hipR]) { p[i * 3 + 1] += dy; q[i * 3 + 1] += dy * 0.85; }
    // the upper body, in the frame of the death (x right, y up, z forward), scaled to the man
    const px = p[pi], py = p[pi + 1], pz = p[pi + 2];
    const S = this.side;
    const hunch = k === 'buckle' ? 0.22 : k === 'bleed' ? 0.1 + 0.08 * u : 0.16;
    const pose: [number, number, number, number][] = [
      [J.spine, 0, 0.2, 0.03], [J.chest, 0, 0.4, 0.04 + hunch * 0.4], [J.neck, 0, 0.55, 0.06 + hunch * 0.7], [J.headTop, 0, 0.76, 0.1 + hunch],
      [J.shoulderL, -0.19, 0.47, hunch * 0.5], [J.shoulderR, 0.19, 0.47, hunch * 0.5],
    ];
    if (k === 'buckle') {
      // arms thrown out to break the fall
      pose.push([J.elbowL, -0.26, 0.28, 0.26], [J.elbowR, 0.26, 0.28, 0.26], [J.wristL, -0.24, 0.12, 0.5], [J.wristR, 0.24, 0.12, 0.5]);
    } else if (k === 'bleed') {
      pose.push([J.elbowL, -0.2, 0.24, 0.05], [J.elbowR, 0.2, 0.24, 0.05], [J.wristL, -0.12, 0.08, 0.1], [J.wristR, 0.12, 0.08, 0.1]);
    } else {
      // one hand clutches the wound, the other hangs or reaches out for balance
      pose.push([S < 0 ? J.elbowL : J.elbowR, 0.18 * S, 0.24, 0.16], [S < 0 ? J.wristL : J.wristR, 0.04 * S, 0.3, 0.22]);
      pose.push([S < 0 ? J.elbowR : J.elbowL, -0.26 * S, 0.24, 0.04], [S < 0 ? J.wristR : J.wristL, -0.32 * S, 0.06, 0.08]);
    }
    const rx = this.rightX, rz = this.rightZ, fx = this.fwdX, fz = this.fwdZ;
    for (const [i, x, y, z] of pose) {
      const ix = i * 3;
      const tx = px + (rx * x + fx * z) * s, tyj = py + y * s, tz = pz + (rz * x + fz * z) * s;
      // a damped pull: most of the correction is position, little of it becomes velocity
      const ax = (tx - p[ix]) * w, ay = (tyj - p[ix + 1]) * w, az = (tz - p[ix + 2]) * w;
      p[ix] += ax; p[ix + 1] += ay; p[ix + 2] += az;
      q[ix] += ax * 0.85; q[ix + 1] += ay * 0.85; q[ix + 2] += az * 0.85;
    }
  }

  /** The throe ends: the last strength goes and the body pitches over. */
  private release() {
    this.released = true;
    const q = this.q, d = 1 / 60;
    // forward onto the face mostly; an arrow victim may fall to the side
    const side = this.kind === 'arrow' ? this.side * 0.8 : this.side * 0.2;
    const dx = this.fwdX + this.rightX * side, dz = this.fwdZ + this.rightZ * side;
    for (const [i, k] of [[J.headTop, 1.6], [J.neck, 1.3], [J.chest, 1.0], [J.shoulderL, 0.9], [J.shoulderR, 0.9]] as const) {
      q[i * 3] -= dx * k * d; q[i * 3 + 2] -= dz * k * d;
    }
  }

  private kneeHinge(hip: number, knee: number, ankle: number) {
    // body forward from the hips and spine
    const p = this.p;
    const rx = p[J.hipR * 3] - p[J.hipL * 3], ry = p[J.hipR * 3 + 1] - p[J.hipL * 3 + 1], rz = p[J.hipR * 3 + 2] - p[J.hipL * 3 + 2];
    const ux = p[J.spine * 3] - p[J.pelvis * 3], uy = p[J.spine * 3 + 1] - p[J.pelvis * 3 + 1], uz = p[J.spine * 3 + 2] - p[J.pelvis * 3 + 2];
    // lying down, "forward" is ill-defined and correcting it only makes the legs twitch
    const ul = Math.hypot(ux, uy, uz) || 1;
    if (uy / ul < 0.45) return;
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
      p[knee * 3] -= ox * 1.2; p[knee * 3 + 1] -= oy * 1.2; p[knee * 3 + 2] -= oz * 1.2;
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
