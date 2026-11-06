// Knight skeleton: 17 bones posed procedurally from joint positions and orientation frames.
// Every bone frame is a world matrix; armour pieces are rigid children of bones.
//
// Bone frame conventions (local axes):
//   torso bones (pelvis, spine, chest, neck, head): +Y up the body, -Z forward, +X right
//   limb bones (upper arm, forearm, thigh, shin): origin at the proximal joint, -Y along the limb
//   hands: origin at the wrist, -Y toward the knuckles, -Z along the grip (weapon direction)
//   feet: origin at the ankle, -Z toward the toes, +Y up

import * as THREE from 'three';

export const B = {
  pelvis: 0, spine: 1, chest: 2, neck: 3, head: 4,
  upperArmL: 5, forearmL: 6, handL: 7,
  upperArmR: 8, forearmR: 9, handR: 10,
  thighL: 11, shinL: 12, footL: 13,
  thighR: 14, shinR: 15, footR: 16,
} as const;
export const BONE_COUNT = 17;
export type BoneId = (typeof B)[keyof typeof B];

/** Body measurements (metres) for a 1.83 m man in harness. */
export const BODY = {
  hipY: 0.98,
  spineLen: 0.13,
  chestLen: 0.2,
  neckLen: 0.12,
  shoulderW: 0.2,
  shoulderY: 0.16, // above the chest joint
  upperArm: 0.29,
  forearm: 0.27,
  hand: 0.09,
  hipW: 0.1,
  thigh: 0.45,
  shin: 0.42,
  ankleY: 0.075,
};

/** Joint positions in world space (filled by the animator or ragdoll). */
export interface Joints {
  pelvis: THREE.Vector3; spine: THREE.Vector3; chest: THREE.Vector3; neck: THREE.Vector3; headTop: THREE.Vector3;
  shoulderL: THREE.Vector3; elbowL: THREE.Vector3; wristL: THREE.Vector3;
  shoulderR: THREE.Vector3; elbowR: THREE.Vector3; wristR: THREE.Vector3;
  hipL: THREE.Vector3; kneeL: THREE.Vector3; ankleL: THREE.Vector3; toeL: THREE.Vector3;
  hipR: THREE.Vector3; kneeR: THREE.Vector3; ankleR: THREE.Vector3; toeR: THREE.Vector3;
}
export const JOINT_NAMES = ['pelvis', 'spine', 'chest', 'neck', 'headTop', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'toeL', 'hipR', 'kneeR', 'ankleR', 'toeR'] as const;
export function newJoints(): Joints {
  const j = {} as Joints;
  for (const n of JOINT_NAMES) (j as unknown as Record<string, THREE.Vector3>)[n] = new THREE.Vector3();
  return j;
}

const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

/** Write a rotation+translation into a matrix from an origin and two (roughly orthogonal) axes. */
export function frameFromYZ(out: THREE.Matrix4, origin: THREE.Vector3, yAxis: THREE.Vector3, zHint: THREE.Vector3) {
  _y.copy(yAxis).normalize();
  _x.crossVectors(_y, zHint);
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0).cross(_y);
  _x.normalize();
  _z.crossVectors(_x, _y).normalize();
  out.set(
    _x.x, _y.x, _z.x, origin.x,
    _x.y, _y.y, _z.y, origin.y,
    _x.z, _y.z, _z.z, origin.z,
    0, 0, 0, 1,
  );
  return out;
}

/** Frame whose -Y points from `origin` to `end` (limb bones), with -Z toward the hint. */
export function limbFrame(out: THREE.Matrix4, origin: THREE.Vector3, end: THREE.Vector3, fwdHint: THREE.Vector3) {
  _y.subVectors(origin, end); // +Y points back up the limb
  _z.copy(fwdHint).negate();
  return frameFromYZ(out, origin, _y, _z);
}

const _d = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Vector3();
/**
 * Analytic two-bone IK. Writes the middle joint (elbow/knee) into `mid`, and clamps the
 * end effector `end` to the reachable range. `pole` is the direction the joint bends toward.
 */
export function solveTwoBone(root: THREE.Vector3, end: THREE.Vector3, a: number, b: number, pole: THREE.Vector3, mid: THREE.Vector3) {
  _d.subVectors(end, root);
  let d = _d.length();
  const maxD = (a + b) * 0.9995, minD = Math.abs(a - b) + 0.02;
  if (d < 1e-5) { _d.set(0, -1, 0); d = 1e-5; }
  _n.copy(_d).divideScalar(d);
  if (d > maxD) { d = maxD; end.copy(root).addScaledVector(_n, d); }
  else if (d < minD) { d = minD; end.copy(root).addScaledVector(_n, d); }
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _m.copy(pole).addScaledVector(_n, -pole.dot(_n));
  if (_m.lengthSq() < 1e-8) _m.set(0, 0, -1).addScaledVector(_n, -_n.z);
  _m.normalize();
  mid.copy(root).addScaledVector(_n, a * cosA).addScaledVector(_m, a * sinA);
}

/** Build all bone matrices from joints and a few orientation hints. */
export function bonesFromJoints(j: Joints, out: THREE.Matrix4[], hints: { bodyFwd: THREE.Vector3; chestFwd: THREE.Vector3; headFwd: THREE.Vector3; gripL: THREE.Vector3; gripR: THREE.Vector3; footFwdL: THREE.Vector3; footFwdR: THREE.Vector3 }) {
  const up = _tmpA.subVectors(j.spine, j.pelvis);
  const pelvisRight = _tmpB.subVectors(j.hipR, j.hipL);
  // pelvis: +Y up the spine, +X toward the right hip
  axesFrom(out[B.pelvis], j.pelvis, up, pelvisRight);
  axesFrom(out[B.spine], j.spine, _tmpA.subVectors(j.chest, j.spine), pelvisRight.lerp(_tmpC.subVectors(j.shoulderR, j.shoulderL), 0.5));
  const chestRight = _tmpC.subVectors(j.shoulderR, j.shoulderL);
  axesFrom(out[B.chest], j.chest, _tmpA.subVectors(j.neck, j.chest), chestRight);
  axesFromFwd(out[B.neck], j.neck, _tmpA.subVectors(j.headTop, j.neck), hints.headFwd, chestRight);
  // head bone sits at the top of the neck
  _tmpD.copy(j.neck).addScaledVector(_tmpA.normalize(), BODY.neckLen * 0.6);
  axesFromFwd(out[B.head], _tmpD, _tmpA.subVectors(j.headTop, j.neck), hints.headFwd, chestRight);
  // arms: bend plane from the elbow position
  armFrames(out, B.upperArmL, B.forearmL, B.handL, j.shoulderL, j.elbowL, j.wristL, hints.gripL, -1, hints.chestFwd);
  armFrames(out, B.upperArmR, B.forearmR, B.handR, j.shoulderR, j.elbowR, j.wristR, hints.gripR, 1, hints.chestFwd);
  legFrames(out, B.thighL, B.shinL, B.footL, j.hipL, j.kneeL, j.ankleL, j.toeL, hints.footFwdL, hints.bodyFwd);
  legFrames(out, B.thighR, B.shinR, B.footR, j.hipR, j.kneeR, j.ankleR, j.toeR, hints.footFwdR, hints.bodyFwd);
}

const _tmpA = new THREE.Vector3(), _tmpB = new THREE.Vector3(), _tmpC = new THREE.Vector3(), _tmpD = new THREE.Vector3(), _tmpE = new THREE.Vector3(), _tmpF = new THREE.Vector3();

/** Frame with +Y = up, +X ~= right (orthogonalised). */
function axesFrom(out: THREE.Matrix4, origin: THREE.Vector3, up: THREE.Vector3, right: THREE.Vector3) {
  _y.copy(up).normalize();
  _x.copy(right).addScaledVector(_y, -right.dot(_y));
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
  _x.normalize();
  _z.crossVectors(_x, _y).normalize();
  out.set(_x.x, _y.x, _z.x, origin.x, _x.y, _y.y, _z.y, origin.y, _x.z, _y.z, _z.z, origin.z, 0, 0, 0, 1);
}
/** Frame with +Y = up and -Z ~= forward. */
function axesFromFwd(out: THREE.Matrix4, origin: THREE.Vector3, up: THREE.Vector3, fwd: THREE.Vector3, rightFallback: THREE.Vector3) {
  _y.copy(up).normalize();
  _z.copy(fwd).negate().addScaledVector(_y, fwd.dot(_y));
  if (_z.lengthSq() < 1e-6) { axesFrom(out, origin, up, rightFallback); return; }
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  out.set(_x.x, _y.x, _z.x, origin.x, _x.y, _y.y, _z.y, origin.y, _x.z, _y.z, _z.z, origin.z, 0, 0, 0, 1);
}

function armFrames(out: THREE.Matrix4[], ua: number, fa: number, ha: number, sh: THREE.Vector3, el: THREE.Vector3, wr: THREE.Vector3, grip: THREE.Vector3, side: number, chestFwd: THREE.Vector3) {
  // bend normal: the elbow points away from the inside of the bend
  const upper = _tmpE.subVectors(el, sh);
  const lower = _tmpF.subVectors(wr, el);
  const bend = _tmpA.crossVectors(upper, lower);
  if (bend.lengthSq() < 1e-8) bend.crossVectors(upper, chestFwd).multiplyScalar(side);
  // -Z of each arm bone points to the inside of the elbow bend
  const fwdU = _tmpB.crossVectors(bend, upper);
  limbFrame(out[ua], sh, el, fwdU.lengthSq() > 1e-8 ? fwdU : chestFwd);
  const fwdL = _tmpC.crossVectors(bend, lower);
  limbFrame(out[fa], el, wr, fwdL.lengthSq() > 1e-8 ? fwdL : chestFwd);
  // hand: -Y from wrist toward the fist, -Z along the grip
  _y.subVectors(wr, el).normalize().negate();
  _z.copy(grip).negate();
  _z.addScaledVector(_y, -_z.dot(_y));
  if (_z.lengthSq() < 1e-6) _z.copy(chestFwd).negate();
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  out[ha].set(_x.x, _y.x, _z.x, wr.x, _x.y, _y.y, _z.y, wr.y, _x.z, _y.z, _z.z, wr.z, 0, 0, 0, 1);
}

function legFrames(out: THREE.Matrix4[], th: number, sh: number, ft: number, hip: THREE.Vector3, knee: THREE.Vector3, ankle: THREE.Vector3, toe: THREE.Vector3, footFwd: THREE.Vector3, bodyFwd: THREE.Vector3) {
  const upper = _tmpE.subVectors(knee, hip);
  const lower = _tmpF.subVectors(ankle, knee);
  const bend = _tmpA.crossVectors(upper, lower);
  let fwdU: THREE.Vector3;
  if (bend.lengthSq() < 1e-7) fwdU = bodyFwd;
  else fwdU = _tmpB.crossVectors(upper, bend).normalize().negate();
  if (fwdU.dot(bodyFwd) < 0) fwdU.negate();
  limbFrame(out[th], hip, knee, fwdU);
  const fwdL = bend.lengthSq() < 1e-7 ? bodyFwd : _tmpC.crossVectors(lower, bend).normalize().negate();
  if (fwdL.dot(bodyFwd) < 0) fwdL.negate();
  limbFrame(out[sh], knee, ankle, fwdL);
  // foot: -Z toward the toe, +Y roughly up
  _z.subVectors(ankle, toe);
  if (_z.lengthSq() < 1e-8) _z.copy(footFwd).negate();
  _z.normalize();
  _x.set(0, 1, 0).cross(_z);
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
  _x.normalize();
  _y.crossVectors(_z, _x).normalize();
  out[ft].set(_x.x, _y.x, _z.x, ankle.x, _x.y, _y.y, _z.y, ankle.y, _x.z, _y.z, _z.z, ankle.z, 0, 0, 0, 1);
}
