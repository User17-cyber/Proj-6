// Weapon pose evaluation shared by hit detection (server) and animation (client).

import { Act } from '../types';
import { samplePose, blendPose, type PoseKey, type WeaponDef, type AttackDef } from '../data/weapons';
import { DEG, clamp, smoothstep, easeInOut, rotX, rotY, type V3 } from '../math';

export interface WeaponPose {
  /** body space grip (x right, y up, z back) */
  gx: number; gy: number; gz: number;
  /** body space blade direction (unit) */
  dx: number; dy: number; dz: number;
  twist: number; // radians
  lean: number;  // radians
}

export const newPose = (): WeaponPose => ({ gx: 0, gy: 1, gz: 0, dx: 0, dy: 1, dz: 0, twist: 0, lean: 0 });

const tmp7a: number[] = [0, 0, 0, 0, 0, 0, 0];
const tmp7b: number[] = [0, 0, 0, 0, 0, 0, 0];
const tmp7c: number[] = [0, 0, 0, 0, 0, 0, 0];

/** Release easing: blades accelerate into the strike and decelerate after it. */
export const releaseEase = (u: number) => {
  const t = clamp(u, 0, 1);
  return t * t * (3 - 2 * t) * 0.75 + t * 0.25;
};

/** Window of the release (in eased fraction) during which the blade deals damage. */
export const HIT_FROM = 0.06, HIT_TO = 0.94;

export function keyToPose(k: ArrayLike<number>, out: WeaponPose): WeaponPose {
  out.gx = k[0]; out.gy = k[1]; out.gz = -k[2];
  const yaw = k[3] * DEG, pitch = k[4] * DEG;
  const cp = Math.cos(pitch);
  out.dx = -Math.sin(yaw) * cp;
  out.dy = Math.sin(pitch);
  out.dz = -Math.cos(yaw) * cp;
  out.twist = k[5] * DEG;
  out.lean = k[6] * DEG;
  return out;
}

/** Pose during an attack's release at raw fraction u (0..1). */
export function releasePose(a: AttackDef, u: number, out: WeaponPose): WeaponPose {
  samplePose(tmp7a, a.wind, a.mid, a.end, releaseEase(u));
  return keyToPose(tmp7a, out);
}

/** Interpolate between two keys. */
export function lerpKeys(a: PoseKey | number[], b: PoseKey | number[], t: number, out: WeaponPose): WeaponPose {
  blendPose(tmp7b, a, b, t);
  return keyToPose(tmp7b, out);
}

export interface PoseSource {
  act: Act;
  actT: number;
  actDur: number;
  atk: number;
  heavy: boolean;
  charge: number;
}

/**
 * Full body-space weapon pose for any action state (used by the animator; the sim only needs Release).
 * `rest` is the idle/carry key the knight returns to.
 */
export function weaponPoseFor(w: WeaponDef, s: PoseSource, rest: PoseKey | number[], out: WeaponPose): WeaponPose {
  const atk = w.attacks[clamp(s.atk, 0, 3)];
  switch (s.act) {
    case Act.Windup: {
      const t = s.actDur > 0 ? clamp(s.actT / s.actDur, 0, 1) : 1;
      return lerpKeys(rest, atk.wind, easeInOut(t), out);
    }
    case Act.Charge: {
      // hold the cocked pose, drawing back a little further as the charge builds
      const c = clamp(s.charge / Math.max(0.01, w.heavyChargeMax), 0, 1);
      for (let i = 0; i < 7; i++) tmp7c[i] = atk.wind[i];
      tmp7c[1] += 0.04 * c; tmp7c[2] -= 0.06 * c; tmp7c[4] += 8 * c; tmp7c[5] -= 6 * c;
      return keyToPose(tmp7c, out);
    }
    case Act.Release:
      return releasePose(atk, s.actDur > 0 ? s.actT / s.actDur : 1, out);
    case Act.Recover: {
      const t = s.actDur > 0 ? clamp(s.actT / s.actDur, 0, 1) : 1;
      return lerpKeys(atk.end, rest, smoothstep(0, 1, t), out);
    }
    case Act.Deflect:
    case Act.Parried: {
      // bounced back toward the cocked position, then recover
      const t = s.actDur > 0 ? clamp(s.actT / s.actDur, 0, 1) : 1;
      const k = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
      for (let i = 0; i < 7; i++) tmp7c[i] = atk.mid[i] + (atk.wind[i] - atk.mid[i]) * 0.5 * k;
      lerpKeys(tmp7c, rest, smoothstep(0.3, 1, t), out);
      return out;
    }
    case Act.Block:
      return lerpKeys(rest, w.block, clamp(s.actT / 0.12, 0, 1), out);
    case Act.Feint: {
      const t = s.actDur > 0 ? clamp(s.actT / s.actDur, 0, 1) : 1;
      return lerpKeys(atk.wind, rest, smoothstep(0, 1, t), out);
    }
    default:
      return keyToPose(rest, out);
  }
}

/** Apply view pitch (radians) to a body-space pose around the shoulder pivot. */
export function applyAimPitch(p: WeaponPose, pitch: number): WeaponPose {
  if (Math.abs(pitch) < 1e-4) return p;
  const py = 1.38;
  rotX(_v, p.gx, p.gy - py, p.gz, pitch);
  p.gx = _v.x; p.gy = _v.y + py; p.gz = _v.z;
  rotX(_v, p.dx, p.dy, p.dz, pitch);
  p.dx = _v.x; p.dy = _v.y; p.dz = _v.z;
  return p;
}
const _v: V3 = { x: 0, y: 0, z: 0 };

export const aimPitchFor = (pitch: number) => clamp(pitch * 0.75, -0.6, 0.45);

/** World-space blade segment (base and tip) for a pose. */
export function bladeWorld(
  p: WeaponPose, x: number, y: number, z: number, yaw: number,
  from: number, to: number, base: V3, tip: V3, scale = 1,
) {
  // a bigger man holds his weapon higher and further out, and it is drawn to his size
  rotY(_w, p.gx * scale, p.gy * scale, p.gz * scale, yaw);
  const gx = x + _w.x, gy = y + _w.y, gz = z + _w.z;
  rotY(_w, p.dx, p.dy, p.dz, yaw);
  from *= scale; to *= scale;
  base.x = gx + _w.x * from; base.y = gy + _w.y * from; base.z = gz + _w.z * from;
  tip.x = gx + _w.x * to; tip.y = gy + _w.y * to; tip.z = gz + _w.z * to;
}
const _w: V3 = { x: 0, y: 0, z: 0 };
