// Camera rig: third-person over the shoulder (with wall collision), first person, death cam,
// and spectator modes (free flight, follow, and an automatic battle director).

import * as THREE from 'three';
import type { StaticWorld } from '../shared/world/world';
import { clamp, lerp } from '../shared/math';

export type CamMode = 'third' | 'first' | 'death' | 'free' | 'follow' | 'director' | 'menu';

export interface FocusKnight { x: number; y: number; z: number; yaw: number; alive: boolean; id: number; team: number }

export class CameraRig {
  mode: CamMode = 'third';
  readonly pos = new THREE.Vector3();
  readonly look = new THREE.Vector3();
  private smoothPos = new THREE.Vector3();
  private dist = 2.9;
  private shake = 0;
  private shakeT = 0;
  fovKick = 0;
  zoom = 0;
  // free/director state
  freeYaw = 0; freePitch = -0.2;
  private shot = { t: 0, dur: 8, kind: 0, target: -1, ang: 0, h: 3, r: 7, from: new THREE.Vector3(), to: new THREE.Vector3(), cut: true };
  followId = -1;
  private deathT = 0;
  private deathFrom = new THREE.Vector3();

  constructor(private cam: THREE.PerspectiveCamera, private world: StaticWorld | null) {}
  setWorld(w: StaticWorld) { this.world = w; }

  addShake(amount: number) { this.shake = Math.min(1.2, this.shake + amount); }

  private collide(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
    if (!this.world) return to;
    const t = this.world.raycast(from.x, from.y, from.z, to.x, to.y, to.z);
    if (t >= 0) {
      const d = from.distanceTo(to);
      const k = Math.max(0, (t * d - 0.25) / d);
      to.lerpVectors(from, to, k);
    }
    return to;
  }

  /** Third/first person view of the local knight. */
  updatePlayer(dt: number, k: FocusKnight, yaw: number, pitch: number, headPos: THREE.Vector3 | null, sprinting: boolean, fovBase: number) {
    const fwd = _f.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const right = _r.set(Math.cos(yaw), 0, -Math.sin(yaw));
    if (this.mode === 'first' && headPos) {
      this.pos.copy(headPos).addScaledVector(fwd, 0.12).addScaledVector(_u.set(0, 1, 0), 0.02);
    } else {
      const targetDist = lerp(2.85 + (sprinting ? 0.35 : 0), 1.55, this.zoom);
      this.dist = lerp(this.dist, targetDist, 1 - Math.exp(-dt * 8));
      const pivot = _p.set(k.x, k.y + 1.62, k.z).addScaledVector(right, 0.08);
      const want = _w.copy(pivot).addScaledVector(fwd, -this.dist).addScaledVector(right, lerp(0.58, 0.45, this.zoom)).addScaledVector(_u.set(0, 1, 0), 0.22 - pitch * 0.15);
      this.collide(pivot, want);
      if (this.smoothPos.distanceToSquared(want) > 25) this.smoothPos.copy(want);
      this.smoothPos.lerp(want, 1 - Math.exp(-dt * 25));
      this.pos.copy(this.smoothPos);
    }
    this.look.copy(this.pos).addScaledVector(fwd, 50);
    this.fovKick = lerp(this.fovKick, sprinting ? 6 : 0, 1 - Math.exp(-dt * 4));
    this.apply(dt, fovBase + this.fovKick - this.zoom * 18);
  }

  startDeath(k: FocusKnight) {
    this.mode = 'death';
    this.deathT = 0;
    this.deathFrom.copy(this.pos);
  }

  /** Orbit the fallen knight, then turn to the killer. */
  updateDeath(dt: number, body: THREE.Vector3, killer: THREE.Vector3 | null, fovBase: number) {
    this.deathT += dt;
    const ang = this.deathT * 0.25 + 0.6;
    const r = 3.2 + Math.min(2.5, this.deathT * 0.8);
    const want = _w.set(body.x + Math.sin(ang) * r, body.y + 1.6 + Math.min(2.5, this.deathT * 0.6), body.z + Math.cos(ang) * r);
    this.collide(_p.copy(body).setY(body.y + 1.2), want);
    this.pos.lerp(want, 1 - Math.exp(-dt * 3));
    const tgt = killer && this.deathT > 1.2 ? _t.lerpVectors(body, killer, clamp((this.deathT - 1.2) / 1.5, 0, 0.65)) : _t.copy(body);
    tgt.y += 0.8;
    this.look.lerp(tgt, 1 - Math.exp(-dt * 4));
    this.apply(dt, fovBase);
  }

  /** WASD free flight for spectators. */
  updateFree(dt: number, move: { mx: number; mz: number }, up: number, fast: boolean, fovBase: number) {
    const fwd = _f.set(-Math.sin(this.freeYaw) * Math.cos(this.freePitch), Math.sin(this.freePitch), -Math.cos(this.freeYaw) * Math.cos(this.freePitch));
    const right = _r.set(Math.cos(this.freeYaw), 0, -Math.sin(this.freeYaw));
    const sp = fast ? 28 : 9;
    this.pos.addScaledVector(fwd, move.mz * sp * dt).addScaledVector(right, move.mx * sp * dt);
    this.pos.y += up * sp * dt;
    if (this.world) {
      const g = this.world.groundAt(this.pos.x, this.pos.z, 999) + 1.0;
      if (this.pos.y < g) this.pos.y = g;
    }
    this.look.copy(this.pos).add(fwd);
    this.apply(dt, fovBase);
  }

  /** Follow cam behind a chosen knight (spectating). */
  updateFollow(dt: number, k: FocusKnight, fovBase: number) {
    const yaw = this.freeYaw, pitch = this.freePitch;
    const fwd = _f.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const pivot = _p.set(k.x, k.y + 1.6, k.z);
    const want = _w.copy(pivot).addScaledVector(fwd, -4.2);
    want.y += 0.6;
    this.collide(pivot, want);
    this.pos.lerp(want, 1 - Math.exp(-dt * 6));
    this.look.lerp(pivot, 1 - Math.exp(-dt * 10));
    this.apply(dt, fovBase);
  }

  /**
   * Automatic director: picks interesting knights and frames orbit, tracking and wide shots.
   * `pick` returns the next focus (or null) and the battle centroid.
   */
  updateDirector(dt: number, getKnight: (id: number) => FocusKnight | null, pick: () => { id: number; centroid: THREE.Vector3 } | null, fovBase: number, cinematics: { x: number; y: number; z: number; tx: number; ty: number; tz: number }[]) {
    const s = this.shot;
    s.t += dt;
    let k = s.target >= 0 ? getKnight(s.target) : null;
    if (s.t > s.dur || (k && !k.alive && s.t > 2.5) || (!k && s.kind !== 3)) {
      const p = pick();
      s.t = 0;
      s.dur = 6 + Math.random() * 6;
      s.kind = Math.random() < 0.18 && cinematics.length ? 3 : Math.floor(Math.random() * 3);
      s.target = p?.id ?? -1;
      s.ang = Math.random() * Math.PI * 2;
      s.h = 1.6 + Math.random() * 3.5;
      s.r = 4.5 + Math.random() * 5;
      s.cut = true;
      if (s.kind === 3 && p) {
        const c = cinematics[Math.floor(Math.random() * cinematics.length)];
        s.from.set(c.x, c.y, c.z);
        s.to.copy(p.centroid);
      }
      k = s.target >= 0 ? getKnight(s.target) : null;
    }
    const want = _w;
    const tgt = _t;
    if (s.kind === 3 || !k) {
      // wide establishing shot that slowly pushes in toward the fighting
      want.copy(s.from).lerp(s.to, 0.08 * s.t / s.dur).y += Math.sin(s.t * 0.2) * 0.5;
      tgt.copy(s.to);
    } else if (s.kind === 0) {
      // slow orbit
      const a = s.ang + s.t * 0.18;
      want.set(k.x + Math.sin(a) * s.r, k.y + s.h, k.z + Math.cos(a) * s.r);
      tgt.set(k.x, k.y + 1.2, k.z);
    } else if (s.kind === 1) {
      // low tracking shot behind the knight's shoulder
      want.set(k.x + Math.sin(k.yaw) * 3.6 + Math.cos(k.yaw) * 0.8, k.y + 1.9, k.z + Math.cos(k.yaw) * 3.6 - Math.sin(k.yaw) * 0.8);
      tgt.set(k.x - Math.sin(k.yaw) * 6, k.y + 1.3, k.z - Math.cos(k.yaw) * 6);
    } else {
      // crane up and away
      const a = s.ang;
      const r = s.r + s.t * 0.6;
      want.set(k.x + Math.sin(a) * r, k.y + 1.2 + s.t * 0.55, k.z + Math.cos(a) * r);
      tgt.set(k.x, k.y + 1.0, k.z);
    }
    if (this.world && (s.kind !== 3)) {
      const g = this.world.groundAt(want.x, want.z, want.y + 2) + 0.6;
      if (want.y < g) want.y = g;
      this.collide(_p.copy(tgt), want);
    }
    if (s.cut) { this.pos.copy(want); this.look.copy(tgt); s.cut = false; }
    this.pos.lerp(want, 1 - Math.exp(-dt * 3));
    this.look.lerp(tgt, 1 - Math.exp(-dt * 4));
    this.apply(dt, fovBase - 4);
  }

  /** Scripted menu camera drifting between viewpoints. */
  updateMenu(dt: number, time: number, points: { x: number; y: number; z: number; tx: number; ty: number; tz: number }[], fovBase: number) {
    if (!points.length) return;
    const seg = 16;
    const i = Math.floor(time / seg) % points.length;
    const u = (time % seg) / seg;
    const p = points[i];
    const drift = Math.sin(u * Math.PI) * 0.0 + u;
    _w.set(p.x, p.y, p.z).lerp(_t.set(p.tx, p.ty + 2, p.tz), 0.12 * drift);
    _w.x += Math.sin(time * 0.05) * 3;
    _t.set(p.tx, p.ty, p.tz);
    if (u < 0.01 || this.pos.distanceToSquared(_w) > 400) this.pos.copy(_w); else this.pos.lerp(_w, 1 - Math.exp(-dt * 2));
    this.look.lerp(_t, 1 - Math.exp(-dt * 2));
    if (this.look.lengthSq() === 0) this.look.copy(_t);
    this.apply(dt, fovBase - 8);
  }

  private apply(dt: number, fov: number) {
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
    if (this.shake > 0.001) {
      this.shakeT += dt * 38;
      const a = this.shake * this.shake * 0.035;
      this.cam.rotateX(Math.sin(this.shakeT * 1.3) * a);
      this.cam.rotateY(Math.sin(this.shakeT * 0.9 + 1.7) * a);
      this.cam.rotateZ(Math.sin(this.shakeT * 1.7 + 0.4) * a * 0.6);
      this.shake = Math.max(0, this.shake - dt * 2.8);
    }
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = lerp(this.cam.fov, fov, 1 - Math.exp(-dt * 10)); this.cam.updateProjectionMatrix(); }
  }
}

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _p = new THREE.Vector3(), _w = new THREE.Vector3(), _t = new THREE.Vector3();
