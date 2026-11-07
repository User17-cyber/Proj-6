// Procedural animation: gait with planted feet on the terrain, torso twist/lean from the
// weapon keys, IK arms holding the weapon on the very blade curve the server uses for hit
// detection, head look, hit flinches, stuns, knockdowns, kicks and ability motions.

import * as THREE from 'three';
import { Act } from '../../shared/types';
import { CLASSES, type AbilityId, type ClassId } from '../../shared/data/classes';
import { WEAPONS, ARROW } from '../../shared/data/weapons';
import { weaponPoseFor, applyAimPitch, aimPitchFor, newPose, keyToPose, type WeaponPose } from '../../shared/sim/pose';
import { clamp, lerp, smoothstep, wrapAngle } from '../../shared/math';
import { B, BODY, BONE_COUNT, newJoints, solveTwoBone, bonesFromJoints, type Joints } from './skeleton';

/** What the animator needs to know about a knight (the sim Knight satisfies it). */
export interface AnimSource {
  x: number; y: number; z: number; yaw: number; pitch: number;
  vx: number; vy: number; vz: number; onGround: boolean;
  act: number; actT: number; actDur: number; atk: number; heavy: boolean; charge: number; draw: number;
  abilitySlot: number; knockT: number; stunT: number; bulwarkT: number; sprinting: boolean; alive: boolean;
  cls: ClassId;
  /** the shield has splintered: the left hand is empty */
  shieldBroken?: boolean;
}

export type GroundFn = (x: number, z: number, y: number) => number;

const UP = new THREE.Vector3(0, 1, 0);
const v = () => new THREE.Vector3();

export class KnightAnimator {
  readonly joints: Joints = newJoints();
  readonly prevJoints: Joints = newJoints();
  readonly bones: THREE.Matrix4[] = Array.from({ length: BONE_COUNT }, () => new THREE.Matrix4());
  /** world transform of the main weapon (origin at the grip, +Y along the blade, +Z toward the edge) */
  readonly weapon = new THREE.Matrix4();
  /** shield / buckler / bow in the left hand */
  readonly offhand = new THREE.Matrix4();
  /** bow string anchor (nock point) and whether an arrow is on the string */
  readonly nock = new THREE.Vector3();
  arrowNocked = false;
  bowBend = 0;
  daggerOut = false;
  hasFirstFrame = false;

  private phase = Math.random() * 10;
  private speed = 0;
  private moveDir = new THREE.Vector3(0, 0, -1);
  private edge = new THREE.Vector3(1, 0, 0);
  private prevTip = new THREE.Vector3();
  private flinchT = 0;
  private flinchX = 0;
  private flinchZ = 0;
  private flinchAmp = 0;
  private spin = 0;
  private fall = 0;
  private airT = 0;
  private restBlend = 0;
  private pelvisYS = NaN;
  private strikeS = 0;
  private pose: WeaponPose = newPose();
  private tmp7: number[] = [0, 0, 0, 0, 0, 0, 0];
  private headYawS = 0;
  private headPitchS = 0;
  private lastYaw = 0;
  private turnRate = 0;

  /** Called by the effects layer when the knight is hit (world-space direction of the blow). */
  flinch(dx: number, dz: number, amount: number) {
    this.flinchT = 0.32;
    this.flinchX = dx; this.flinchZ = dz;
    this.flinchAmp = clamp(amount, 0.15, 1);
  }

  update(k: AnimSource, dt: number, ground: GroundFn, time: number) {
    const J = this.joints;
    if (this.hasFirstFrame) for (const key in J) (this.prevJoints as unknown as Record<string, THREE.Vector3>)[key].copy((J as unknown as Record<string, THREE.Vector3>)[key]);
    const def = CLASSES[k.cls];
    const shieldK = k.shieldBroken ? null : def.shield;
    const weapon = WEAPONS[def.weapon];
    const ability: AbilityId | null = k.act === Act.Ability ? def.abilities[k.abilitySlot] : null;
    const abT = k.act === Act.Ability ? k.actT : 0, abDur = k.act === Act.Ability ? Math.max(0.01, k.actDur) : 1;
    const abU = clamp(abT / abDur, 0, 1);

    // ---------------- locomotion parameters
    const sp = Math.hypot(k.vx, k.vz);
    this.speed = lerp(this.speed, sp, 1 - Math.exp(-dt * 10));
    if (sp > 0.25) {
      _a.set(k.vx, 0, k.vz).normalize();
      this.moveDir.lerp(_a, 1 - Math.exp(-dt * 12)).normalize();
    }
    const yawDelta = wrapAngle(k.yaw - this.lastYaw);
    this.lastYaw = k.yaw;
    this.turnRate = lerp(this.turnRate, yawDelta / Math.max(dt, 1e-3), 1 - Math.exp(-dt * 8));
    const speedEff = Math.max(this.speed, Math.min(Math.abs(this.turnRate) * 0.25, 1.2) * (k.act === Act.Idle || k.act === Act.Block ? 1 : 0.4));
    const stride = 1.1 + this.speed * 0.36;
    this.phase += (2 * Math.PI * speedEff / stride) * dt;
    const gait = smoothstep(0.05, 0.9, speedEff);
    const run = smoothstep(2.5, 5.5, this.speed);

    const yawVis = k.yaw + (ability === 'whirlwind' ? this.whirlSpin(abU) : 0);
    const fwd = _fwd.set(-Math.sin(yawVis), 0, -Math.cos(yawVis));
    const right = _right.set(Math.cos(yawVis), 0, -Math.sin(yawVis));
    const root = _root.set(k.x, k.y, k.z);

    // airborne: tuck the legs
    if (!k.onGround) this.airT = Math.min(1, this.airT + dt * 5); else this.airT = Math.max(0, this.airT - dt * 8);

    // ---------------- feet
    // each foot is planted for part of the cycle (stance) and swings through the rest; the
    // planted share falls from 60% walking to about a third sprinting, leaving a flight phase
    const duty = lerp(0.6, 0.28, run);
    const stepLen = duty * stride * gait;
    const lift = (0.09 + run * 0.08) * gait;
    const footW = 0.11 - run * 0.045;
    // runners land nearly under the hip and push off well behind it
    const contactBack = -0.2 * run * stepLen;
    let stanceSum = 0, weightSide = 0;
    const stanceSplit = (k.act === Act.Block || weapon.twoHanded || shieldK) ? 0.13 : 0.06;
    const idleFeet = 1 - gait;
    const legs: [THREE.Vector3, THREE.Vector3, THREE.Vector3, number][] = [[J.ankleL, J.toeL, J.hipL, -1], [J.ankleR, J.toeR, J.hipR, 1]];
    for (const [ankle, toe, , side] of legs) {
      const ph = this.phase + (side > 0 ? Math.PI : 0);
      const t = ((ph / (Math.PI * 2)) % 1 + 1) % 1;
      let u: number, l: number, swing: number, sU = 0;
      if (t < duty) {
        // planted: the foot stays put while the body passes over it
        u = (0.5 - t / duty) * stepLen + contactBack;
        l = 0; swing = -1;
        const c = Math.sin((t / duty) * Math.PI);
        stanceSum += c; weightSide += side * c;
      } else {
        sU = (t - duty) / (1 - duty);
        // the heel kicks up behind first, then the knee drives the foot forward
        const fwdU = smoothstep(0.12 + run * 0.12, 0.92, sU);
        u = (-0.5 + fwdU) * stepLen + contactBack;
        l = lift * Math.sin(Math.PI * sU) + run * gait * 0.26 * Math.sin(Math.PI * Math.min(1, sU / 0.62)) * (1 - fwdU * 0.6);
        swing = Math.sin(Math.PI * sU);
      }
      ankle.copy(root).addScaledVector(right, side * footW * (1 + idleFeet * 0.6)).addScaledVector(this.moveDir, u);
      // relaxed combat stance when standing: left foot forward, right foot back and turned out
      ankle.addScaledVector(fwd, idleFeet * -side * stanceSplit);
      // standing fighters step into their blows with the lead foot
      const sIn = Math.max(0, this.strikeS) * idleFeet;
      ankle.addScaledVector(fwd, side < 0 ? sIn * 0.15 : -sIn * 0.04);
      // kick: the right leg strikes forward
      if (k.act === Act.Kick && side > 0) {
        const t = k.actT;
        const ext = t < 0.14 ? smoothstep(0, 0.14, t) * 0.25 : t < 0.3 ? 0.25 + smoothstep(0.14, 0.24, t) * 0.75 : 1 - smoothstep(0.3, 0.62, t);
        const up = t < 0.3 ? smoothstep(0, 0.2, t) : 1 - smoothstep(0.3, 0.62, t);
        ankle.copy(root).addScaledVector(right, 0.08).addScaledVector(fwd, ext * 0.72);
        ankle.y = k.y + BODY.ankleY + up * 0.55 + ext * 0.12;
      } else {
        const gy = ground(ankle.x, ankle.z, k.y + 0.6);
        ankle.y = Math.max(gy, k.y - 0.4) + BODY.ankleY + l + this.airT * 0.25;
      }
      // toe: pointed down as the foot leaves the ground, up before it lands
      const pitch = (swing > 0 ? -0.55 * (0.6 + run) * Math.sin(Math.PI * Math.min(1, sU / 0.55)) + 0.28 * Math.sin(Math.PI * Math.max(0, (sU - 0.55) / 0.45)) : 0) * gait;
      const footYaw = side * 0.12 + (side > 0 ? idleFeet * 0.35 : -idleFeet * 0.08);
      _b.copy(fwd).applyAxisAngle(UP, -footYaw);
      toe.copy(ankle).addScaledVector(_b, 0.19 * Math.cos(pitch));
      toe.y = ankle.y - 0.06 + Math.sin(pitch) * 0.19;
      if (k.act !== Act.Kick || side < 0) {
        const gt = ground(toe.x, toe.z, k.y + 0.6);
        if (l < 0.02 && this.airT < 0.1) toe.y = Math.max(toe.y, gt + 0.02);
      }
    }

    // ---------------- pelvis and torso
    // the body sinks onto each planted leg and rises between them (most at a run)
    const bob = ((0.5 - Math.min(1, stanceSum)) * (0.008 + run * 0.016)) * gait;
    let crouch = 0;
    if (k.act === Act.Block) crouch = 0.04;
    // a blow is thrown with the whole body: gather on the windup, step and drop into the
    // release, rise through the recovery
    let strike = 0;
    if (k.act === Act.Windup || k.act === Act.Charge) { crouch = (k.heavy ? 0.06 : 0.035) * smoothstep(0, 0.6, k.actT / Math.max(0.05, k.actDur)); strike = -0.25; }
    else if (k.act === Act.Release) { const u = clamp(k.actT / Math.max(0.05, k.actDur), 0, 1); strike = Math.sin(u * Math.PI * 0.8 + 0.3); crouch = (k.heavy ? 0.08 : 0.05) * strike; }
    else if (k.act === Act.Recover) { const u = clamp(k.actT / Math.max(0.05, k.actDur), 0, 1); strike = 0.6 * (1 - smoothstep(0, 1, u)); crouch = 0.04 * strike; }
    this.strikeS = lerp(this.strikeS, strike, 1 - Math.exp(-dt * 14));
    if (ability === 'lunge') crouch = abU < 0.35 ? smoothstep(0, 0.35, abU) * 0.16 : 0.16 * (1 - smoothstep(0.35, 0.9, abU));
    if (ability === 'sweep') crouch = 0.18 * Math.sin(abU * Math.PI);
    if (ability === 'earthshaker') crouch = abU > 0.65 ? 0.22 * (1 - smoothstep(0.75, 1, abU)) : abU < 0.18 ? 0.12 * abU / 0.18 : 0;
    if (ability === 'bulwark' || k.bulwarkT > 0) crouch = Math.max(crouch, 0.08);
    if (k.stunT > 0) crouch = 0.08 + Math.sin(time * 5) * 0.02;
    let pelvisY = k.y + BODY.hipY + bob - crouch - this.airT * 0.05;
    // keep both legs within reach on slopes
    const legLen = BODY.thigh + BODY.shin - 0.015;
    for (const [ankle, , , side] of legs) {
      const hx = k.x + right.x * side * BODY.hipW, hz = k.z + right.z * side * BODY.hipW;
      const hd = Math.hypot(ankle.x - hx, ankle.z - hz);
      const maxY = ankle.y + Math.sqrt(Math.max(0.01, legLen * legLen - hd * hd));
      pelvisY = Math.min(pelvisY, maxY);
    }
    // hips move smoothly; dips from reaching legs are eased rather than snapped
    if (!Number.isFinite(this.pelvisYS) || Math.abs(this.pelvisYS - pelvisY) > 0.5) this.pelvisYS = pelvisY;
    this.pelvisYS = lerp(this.pelvisYS, pelvisY, 1 - Math.exp(-dt * 22));
    pelvisY = Math.min(this.pelvisYS, pelvisY + 0.03);
    // weight shifts over the planted foot
    J.pelvis.set(k.x, pelvisY, k.z).addScaledVector(fwd, 0.02 + run * 0.08 + this.strikeS * 0.09).addScaledVector(right, weightSide * 0.025 * gait * (1 - run * 0.5));
    // the weapon pose decides how the torso twists and leans
    const rest = this.restKey(k, weapon, gait);
    const p = this.weaponPose(k, weapon, rest, ability, abU, time);
    const sprint = smoothstep(5.2, 6.8, this.speed);
    let twist = p.twist, lean = p.lean + this.strikeS * 0.11 + run * 0.14 + sprint * 0.12 + gait * 0.04 + (Math.min(1, stanceSum) - 0.5) * 0.04 * run;
    if (ability === 'charge') lean += 0.28;
    if (ability === 'dash') lean += 0.15;
    if (k.act === Act.Kick) lean -= 0.12 * Math.sin(Math.PI * clamp(k.actT / 0.62, 0, 1));
    const hipTwist = Math.sin(this.phase) * (0.12 + run * 0.06) * gait;
    twist -= hipTwist * (0.7 + run * 0.4);
    // flinch / stagger / stun
    let sideLean = -weightSide * 0.035 * gait;
    if (this.flinchT > 0) {
      this.flinchT -= dt;
      const f = Math.sin((1 - this.flinchT / 0.32) * Math.PI) * this.flinchAmp;
      // lean away from the blow
      const lx = this.flinchX * right.x + this.flinchZ * right.z;
      const lz = this.flinchX * fwd.x + this.flinchZ * fwd.z;
      lean -= lz * 0.35 * f;
      sideLean += lx * 0.3 * f;
      twist += lx * 0.25 * f;
    }
    if (k.act === Act.Stagger || k.act === Act.Deflect || k.act === Act.Parried) {
      const t = clamp(k.actT / Math.max(0.01, k.actDur), 0, 1);
      const amp = k.act === Act.Parried ? 0.45 : k.act === Act.Stagger ? 0.35 : 0.2;
      lean -= Math.sin(t * Math.PI) * amp;
      sideLean += Math.sin(t * Math.PI * 2) * amp * 0.3;
    }
    if (k.stunT > 0) { sideLean += Math.sin(time * 2.3) * 0.12; lean += 0.08 + Math.sin(time * 1.7) * 0.05; }

    // torso frame: lean about the right axis, twist about up
    const torsoUp = _up.copy(UP).applyAxisAngle(right, -lean).applyAxisAngle(fwd, -sideLean);
    const chestRight = _cr.copy(right).applyAxisAngle(UP, twist).applyAxisAngle(_rax.copy(right), 0);
    chestRight.addScaledVector(torsoUp, -chestRight.dot(torsoUp)).normalize();
    const chestFwd = _cf.crossVectors(torsoUp, chestRight).normalize();
    J.spine.copy(J.pelvis).addScaledVector(torsoUp, BODY.spineLen);
    J.chest.copy(J.spine).addScaledVector(torsoUp, BODY.chestLen);
    J.neck.copy(J.chest).addScaledVector(torsoUp, BODY.shoulderY + 0.06);
    J.shoulderL.copy(J.chest).addScaledVector(torsoUp, BODY.shoulderY).addScaledVector(chestRight, -BODY.shoulderW);
    J.shoulderR.copy(J.chest).addScaledVector(torsoUp, BODY.shoulderY).addScaledVector(chestRight, BODY.shoulderW);
    // the hips lead the shoulders into a blow
    const pelvisRight = _pr.copy(right).applyAxisAngle(UP, hipTwist + p.twist * 0.4);
    J.hipL.copy(J.pelvis).addScaledVector(pelvisRight, -BODY.hipW).y -= 0.06;
    J.hipR.copy(J.pelvis).addScaledVector(pelvisRight, BODY.hipW).y -= 0.06;

    // ---------------- head look
    let headYaw = 0, headPitch = clamp(k.pitch * 0.7, -0.7, 0.6);
    if (k.act === Act.Loose || k.act === Act.Draw) headPitch = clamp(k.pitch, -0.8, 0.8);
    headYaw = -twist * 0.75;
    if (ability === 'rally') headPitch = 0.5 * Math.sin(abU * Math.PI);
    if (k.stunT > 0) headPitch -= 0.3;
    this.headYawS = lerp(this.headYawS, headYaw, 1 - Math.exp(-dt * 12));
    this.headPitchS = lerp(this.headPitchS, headPitch, 1 - Math.exp(-dt * 12));
    const headFwd = _hf.copy(chestFwd).applyAxisAngle(torsoUp, this.headYawS);
    const headRight = _hr.crossVectors(headFwd, torsoUp).normalize();
    headFwd.applyAxisAngle(headRight, this.headPitchS);
    const headUp = _hu.crossVectors(headRight, headFwd).normalize();
    J.headTop.copy(J.neck).addScaledVector(headUp, BODY.neckLen + 0.27);

    // ---------------- weapon & hands
    applyAimPitch(p, aimPitchFor(k.pitch) * (def.ranged ? 0 : 1));
    const yawCos = Math.cos(yawVis), yawSin = Math.sin(yawVis);
    const toWorld = (bx: number, by: number, bz: number, o: THREE.Vector3) => o.set(k.x + bx * yawCos + bz * yawSin, k.y + by + bob * 0.6 - crouch * 0.8, k.z - bx * yawSin + bz * yawCos);
    const dirWorld = (dx: number, dy: number, dz: number, o: THREE.Vector3) => o.set(dx * yawCos + dz * yawSin, dy, -dx * yawSin + dz * yawCos).normalize();
    const grip = toWorld(p.gx, p.gy, p.gz, _grip);
    // the weapon hand pumps with the stride when not fighting
    if (k.act === Act.Idle && !def.ranged) {
      const pump = run * gait;
      grip.addScaledVector(fwd, Math.sin(this.phase) * 0.09 * pump).addScaledVector(UP, Math.abs(Math.cos(this.phase)) * 0.035 * pump);
    }
    const bladeDir = dirWorld(p.dx, p.dy, p.dz, _dir);
    const offhandGrip = _og;
    let leftTarget = _lt, leftPole = _lp;
    const rightPole = _rp.copy(chestRight).multiplyScalar(0.7).addScaledVector(UP, -0.7).addScaledVector(chestFwd, -0.25);
    leftPole.copy(chestRight).multiplyScalar(-0.7).addScaledVector(UP, -0.7).addScaledVector(chestFwd, -0.25);
    this.daggerOut = false;
    this.arrowNocked = false;

    if (def.ranged) {
      this.bowPose(k, J, chestFwd, chestRight, torsoUp, headFwd, time, grip, bladeDir, leftTarget, leftPole, rightPole, ability, abU);
    } else {
      if (weapon.offhand !== null) {
        offhandGrip.copy(grip).addScaledVector(bladeDir, weapon.offhand);
        leftTarget.copy(offhandGrip);
      } else if (shieldK === 'heater' || shieldK === 'pavise') {
        const pav = shieldK === 'pavise';
        const blockA = k.act === Act.Block ? smoothstep(0, pav ? 0.14 : 0.1, k.actT) : 0;
        const bash = ability === 'shield_bash' ? Math.sin(clamp(abU / 0.6, 0, 1) * Math.PI) : 0;
        const raise = Math.max(blockA, bash);
        // the pavise is carried before the body and raised to cover from brow to knee
        if (pav) toWorld(lerp(-0.24, -0.04, raise), lerp(1.08, 1.3, raise), -lerp(0.3, 0.46 + bash * 0.22, raise), leftTarget);
        else toWorld(lerp(-0.3, -0.06, raise), lerp(1.05, 1.36, raise), -lerp(0.2, 0.44 + bash * 0.22, raise), leftTarget);
        leftPole.copy(chestRight).multiplyScalar(-0.9).addScaledVector(UP, lerp(-0.6, -0.1, raise));
      } else if (shieldK === 'buckler') {
        const blockA = k.act === Act.Block ? smoothstep(0, 0.08, k.actT) : 0;
        toWorld(lerp(-0.3, -0.1, blockA), lerp(1.02, 1.36, blockA), -lerp(0.18, 0.5, blockA), leftTarget);
      }
      // right hand: wrist slightly behind the fist toward the shoulder
    }
    // wrists sit 8 cm behind the fist, along the forearm
    _a.subVectors(J.shoulderR, grip).normalize();
    J.wristR.copy(grip).addScaledVector(_a, 0.085);
    solveTwoBone(J.shoulderR, J.wristR, BODY.upperArm, BODY.forearm, rightPole, J.elbowR);
    const twoHanded = weapon.offhand !== null || def.ranged || shieldK !== null;
    if (!twoHanded) {
      // free left arm swings with the gait
      // at a run the elbow bends and the arm pumps hard
      const swingA = -Math.sin(this.phase) * (0.35 + run * 0.5) * gait;
      leftTarget.copy(J.shoulderL).addScaledVector(UP, -0.5 + run * 0.2 + Math.max(0, swingA) * run * 0.15).addScaledVector(chestFwd, 0.12 + swingA * 0.4).addScaledVector(chestRight, -0.08);
    }
    _a.subVectors(J.shoulderL, leftTarget).normalize();
    J.wristL.copy(leftTarget).addScaledVector(_a, 0.08);
    solveTwoBone(J.shoulderL, J.wristL, BODY.upperArm, BODY.forearm, leftPole, J.elbowL);

    // legs
    const kneePole = _kp.copy(fwd).addScaledVector(UP, 0.1);
    solveTwoBone(J.hipL, J.ankleL, BODY.thigh, BODY.shin, _kpl.copy(kneePole).addScaledVector(right, -0.15), J.kneeL);
    solveTwoBone(J.hipR, J.ankleR, BODY.thigh, BODY.shin, _kpr.copy(kneePole).addScaledVector(right, 0.15), J.kneeR);

    // knockdown: rotate the whole body backwards about the feet and lay it on the ground
    const knocked = k.act === Act.Knockdown || k.knockT > 0;
    const fallTarget = knocked ? (k.knockT > 0.45 ? 1 : k.knockT / 0.45) : 0;
    this.fall = knocked && this.fall < fallTarget ? Math.min(fallTarget, this.fall + dt / 0.32) : lerp(this.fall, fallTarget, 1 - Math.exp(-dt * 10));
    if (this.fall > 0.001) this.applyFall(J, root, right, fwd, ground, k.y);

    // ---------------- bone frames
    const gripDirL = _gl;
    if (def.ranged) gripDirL.copy(UP).applyAxisAngle(chestFwd, 0.12);
    else if (weapon.offhand !== null) gripDirL.copy(bladeDir);
    else gripDirL.copy(chestFwd);
    bonesFromJoints(J, this.bones, {
      bodyFwd: fwd, chestFwd, headFwd, gripL: gripDirL, gripR: def.ranged && !this.daggerOut ? _gr.copy(UP) : bladeDir,
      footFwdL: _ffl.subVectors(J.toeL, J.ankleL), footFwdR: _ffr.subVectors(J.toeR, J.ankleR),
    });

    // ---------------- weapon matrices
    if (!def.ranged || this.daggerOut) {
      // edge leads the swing
      const tip = _tip.copy(grip).addScaledVector(bladeDir, 0.8);
      if (this.hasFirstFrame) {
        _a.subVectors(tip, this.prevTip);
        _a.addScaledVector(bladeDir, -_a.dot(bladeDir));
        if (_a.lengthSq() > 1e-6 * dt) this.edge.lerp(_a.normalize(), clamp(_a.length() * 30, 0, 1) * (1 - Math.exp(-dt * 30)));
      }
      this.prevTip.copy(tip);
      if (k.act === Act.Idle || k.act === Act.Block) this.edge.lerp(chestFwd, 1 - Math.exp(-dt * 6));
      this.edge.addScaledVector(bladeDir, -this.edge.dot(bladeDir)).normalize();
      if (this.edge.lengthSq() < 0.5) this.edge.copy(chestRight);
      setBasis(this.weapon, grip, bladeDir, this.edge);
    }
    if (shieldK === 'heater' || shieldK === 'pavise') {
      // the shield is strapped to the forearm and faces out from the body
      _a.lerpVectors(J.elbowL, J.wristL, 0.55);
      const blockA = k.act === Act.Block ? smoothstep(0, 0.1, k.actT) : 0;
      const front = shieldK === 'pavise' ? 0.55 : 0;
      _b.copy(chestFwd).lerp(_c.copy(chestRight).negate().addScaledVector(chestFwd, 0.6), (1 - Math.max(blockA, ability === 'shield_bash' ? 1 : 0)) * (1 - front)).normalize();
      _a.addScaledVector(_b, 0.07);
      setBasis(this.offhand, _a, _c.copy(UP).addScaledVector(_b, -0.15).normalize(), _b);
    } else if (shieldK === 'buckler') {
      _b.copy(chestFwd).lerp(_c.copy(chestRight).negate(), 0.3).normalize();
      _a.copy(J.wristL).addScaledVector(_d.subVectors(J.wristL, J.elbowL).normalize(), 0.06);
      setBasis(this.offhand, _a, _c.copy(UP).addScaledVector(_b, -0.2).normalize(), _b);
    } else if (def.shield) {
      this.offhand.makeScale(0, 0, 0); // splintered
    }
    // each order is built to its own size: the whole figure is scaled about the feet
    const size = def.size;
    if (size.height !== 1 || size.girth !== 1) {
      sizeFigure(J, this.bones, [this.weapon, this.offhand], this.nock, _sz.set(k.x, k.y, k.z), right, size.height, size.girth);
    }
    this.hasFirstFrame = true;
  }

  private whirlSpin(u: number) {
    const s = smoothstep(0.08, 0.95, u);
    return -s * Math.PI * 4;
  }

  private restKey(k: AnimSource, weapon: (typeof WEAPONS)[keyof typeof WEAPONS], gait: number): number[] {
    const t = this.tmp7;
    const target = gait > 0.5 ? 1 : 0;
    this.restBlend = lerp(this.restBlend, target, 0.08);
    for (let i = 0; i < 7; i++) t[i] = lerp(weapon.idle[i], weapon.carry[i], this.restBlend);
    void k;
    return t;
  }

  private weaponPose(k: AnimSource, weapon: (typeof WEAPONS)[keyof typeof WEAPONS], rest: number[], ability: AbilityId | null, u: number, time: number): WeaponPose {
    const p = this.pose;
    if (!ability) {
      weaponPoseFor(weapon, k as unknown as Parameters<typeof weaponPoseFor>[1], rest, p);
      if (k.act === Act.Charge) {
        // tremble while holding a charged heavy
        p.gx += Math.sin(time * 37) * 0.004; p.gy += Math.cos(time * 41) * 0.004;
      }
      if (k.act === Act.Stun) { p.gy -= 0.15; p.dy -= 0.4; p.twist *= 0.3; }
      return p;
    }
    const A = weapon.attacks;
    const blend = (a: readonly number[], b: readonly number[], t: number) => { for (let i = 0; i < 7; i++) this.tmp7[i] = lerp(a[i], b[i], t); return keyToPose(this.tmp7, p); };
    switch (ability) {
      case 'whirlwind': {
        // blade held out flat to the side while spinning
        const key = [0.42, 1.2, -0.05, -95, 6, -20, 6];
        return blend(rest, key, smoothstep(0, 0.12, u) * (1 - smoothstep(0.92, 1, u)));
      }
      case 'rally': {
        const key = [0.22, 1.95, 0.05, 0, 86, 0, -6];
        return blend(rest, key, Math.sin(clamp(u * 1.15, 0, 1) * Math.PI));
      }
      case 'charge': {
        const key = [0.18, 1.18, 0.42, 0, 4, 10, 10];
        return blend(rest, key, smoothstep(0, 0.12, u));
      }
      case 'lunge': {
        const t = u * 0.85;
        if (t < 0.3) return blend(rest, A[3].wind, smoothstep(0, 0.3, t));
        if (t < 0.52) { const rr = (t - 0.3) / 0.22; for (let i = 0; i < 7; i++) this.tmp7[i] = lerp(A[3].wind[i], A[3].end[i], smoothstep(0, 1, rr)); this.tmp7[2] += 0.1 * rr; return keyToPose(this.tmp7, p); }
        return blend(A[3].end, rest, smoothstep(0.52, 0.85, t));
      }
      case 'sweep': {
        const t = u;
        if (t < 0.4) return blend(rest, [0.32, 0.9, -0.1, -110, -8, -50, 12], smoothstep(0, 0.4, t));
        if (t < 0.6) { const rr = (t - 0.4) / 0.2; return blend([0.32, 0.9, -0.1, -110, -8, -50, 12], [-0.2, 0.85, 0.1, 100, -15, 50, 16], smoothstep(0, 1, rr)); }
        return blend([-0.2, 0.85, 0.1, 100, -15, 50, 16], rest, smoothstep(0.6, 1, t));
      }
      case 'earthshaker': {
        const t = u * 1.1;
        if (t < 0.6) return blend(rest, A[2].wind, smoothstep(0, 0.5, t));
        if (t < 0.72) { const rr = (t - 0.6) / 0.12; return blend(A[2].wind, [0.1, 0.75, 0.4, 0, -60, 0, 32], rr * rr); }
        return blend([0.1, 0.75, 0.4, 0, -60, 0, 32], rest, smoothstep(0.8, 1.1, t));
      }
      case 'bulwark':
        return blend(rest, weapon.block as unknown as number[], Math.sin(clamp(u * 1.3, 0, 1) * Math.PI * 0.5));
      case 'bloodletting': {
        const key = rest.slice();
        key[4] = rest[4] + Math.sin(u * Math.PI * 4) * 70;
        key[3] = rest[3] + Math.cos(u * Math.PI * 4) * 30;
        key[2] += 0.15 * Math.sin(u * Math.PI);
        return blend(rest, key, Math.sin(u * Math.PI));
      }
      case 'shield_bash':
      case 'dash':
      default:
        return keyToPose(rest, p);
    }
  }

  private bowPose(k: AnimSource, J: Joints, chestFwd: THREE.Vector3, chestRight: THREE.Vector3, torsoUp: THREE.Vector3, headFwd: THREE.Vector3, time: number,
    grip: THREE.Vector3, bladeDir: THREE.Vector3, leftTarget: THREE.Vector3, leftPole: THREE.Vector3, rightPole: THREE.Vector3, ability: AbilityId | null, abU: number) {
    // aim direction from yaw/pitch
    let aimPitch = k.pitch;
    if (ability === 'volley') aimPitch = 0.75;
    const aim = _aim.set(-Math.sin(k.yaw) * Math.cos(aimPitch), Math.sin(aimPitch), -Math.cos(k.yaw) * Math.cos(aimPitch)).normalize();
    let draw = 0, raise = 0;
    if (k.act === Act.Draw) { draw = clamp(k.draw, 0, 1); raise = smoothstep(0, 0.18, k.actT); }
    else if (k.act === Act.Loose) { raise = 1 - smoothstep(0.1, 0.34, k.actT); }
    else if (ability === 'volley') { raise = smoothstep(0, 0.3, abU); draw = smoothstep(0.05, 0.5, abU) * (abU < 0.56 ? 1 : 0); }
    // bow hand: out along the aim at shoulder height when raised, low at the side otherwise
    _a.copy(J.shoulderL).addScaledVector(aim, 0.6).addScaledVector(chestRight, 0.05);
    _b.copy(J.shoulderL).addScaledVector(torsoUp, -0.48).addScaledVector(chestFwd, 0.18).addScaledVector(chestRight, -0.04);
    leftTarget.lerpVectors(_b, _a, raise);
    leftPole.copy(chestRight).multiplyScalar(-0.6).addScaledVector(torsoUp, -0.9);
    // bow frame: +Y along the stave (up, canted), +Z toward the archer
    const staveUp = _c.copy(torsoUp).applyAxisAngle(aim, 0.18).lerp(_d.copy(chestFwd).addScaledVector(torsoUp, -1.4).normalize(), 1 - raise).normalize();
    const back = _e.copy(aim).negate().lerp(chestRight, 1 - raise).normalize();
    staveUp.addScaledVector(back, -staveUp.dot(back)).normalize();
    setBasis(this.offhand, leftTarget, staveUp, back);
    this.bowBend = draw;
    // string hand
    const bowGrip = leftTarget;
    const anchor = _f.copy(J.headTop).addScaledVector(torsoUp, -0.3).addScaledVector(chestRight, 0.06).addScaledVector(headFwd, 0.02);
    const nockRest = _g.copy(bowGrip).addScaledVector(back, 0.12);
    if (k.act === Act.Draw || (ability === 'volley' && abU < 0.56)) {
      this.nock.lerpVectors(nockRest, anchor, smoothstep(0, 1, draw));
      grip.copy(this.nock);
      this.arrowNocked = true;
    } else if (k.act === Act.Loose) {
      // the hand flies back off the string
      this.nock.copy(nockRest);
      const t = k.actT / 0.34;
      grip.copy(anchor).addScaledVector(aim, -0.12 * Math.sin(Math.min(1, t * 2) * Math.PI * 0.5)).addScaledVector(torsoUp, -0.25 * smoothstep(0.3, 1, t));
    } else if (k.act === Act.Windup || k.act === Act.Release || k.act === Act.Recover) {
      // rondel dagger in the right hand
      this.daggerOut = true;
      const w = WEAPONS.longbow;
      weaponPoseFor(w, k as unknown as Parameters<typeof weaponPoseFor>[1], w.idle as unknown as number[], this.pose);
      const p = this.pose;
      const c = Math.cos(k.yaw), s = Math.sin(k.yaw);
      grip.set(k.x + p.gx * c + p.gz * s, k.y + p.gy, k.z - p.gx * s + p.gz * c);
      bladeDir.set(p.dx * c + p.dz * s, p.dy, -p.dx * s + p.dz * c).normalize();
      this.nock.copy(nockRest);
    } else {
      this.nock.copy(nockRest);
      // relaxed right arm swinging slightly
      grip.copy(J.shoulderR).addScaledVector(torsoUp, -0.55).addScaledVector(chestFwd, 0.08 - Math.sin(this.phase) * 0.12 * smoothstep(0.1, 1, this.speed)).addScaledVector(chestRight, 0.06);
    }
    rightPole.copy(chestRight).multiplyScalar(0.9).addScaledVector(torsoUp, -0.4).addScaledVector(chestFwd, 0.3);
    void time;
  }

  private applyFall(J: Joints, root: THREE.Vector3, right: THREE.Vector3, fwd: THREE.Vector3, ground: GroundFn, y: number) {
    const ang = smoothstep(0, 1, this.fall) * (Math.PI / 2 - 0.08);
    const pivot = _a.copy(root);
    const q = _q.setFromAxisAngle(right, ang);
    for (const key in J) {
      const p = (J as unknown as Record<string, THREE.Vector3>)[key];
      p.sub(pivot).applyQuaternion(q).add(pivot);
      // slide the body back so it lies where the knight stood
      p.addScaledVector(fwd, -0.15 * this.fall);
    }
    // keep everything above the ground
    const gy = ground(root.x, root.z, y + 0.5);
    for (const key in J) {
      const p = (J as unknown as Record<string, THREE.Vector3>)[key];
      if (p.y < gy + 0.08) p.y = gy + 0.08;
    }
  }
}

function setBasis(m: THREE.Matrix4, origin: THREE.Vector3, yAxis: THREE.Vector3, zHint: THREE.Vector3) {
  _y.copy(yAxis).normalize();
  _z.copy(zHint).addScaledVector(_y, -zHint.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  m.set(_x.x, _y.x, _z.x, origin.x, _x.y, _y.y, _z.y, origin.y, _x.z, _y.z, _z.z, origin.z, 0, 0, 0, 1);
}

const _a = v(), _b = v(), _c = v(), _d = v(), _e = v(), _f = v(), _g = v();
const _x = v(), _y = v(), _z = v();
const _fwd = v(), _right = v(), _root = v(), _up = v(), _cr = v(), _cf = v(), _rax = v(), _pr = v();
const _hf = v(), _hr = v(), _hu = v(), _grip = v(), _dir = v(), _og = v(), _lt = v(), _lp = v(), _rp = v();
const _kp = v(), _kpl = v(), _kpr = v(), _gl = v(), _gr = v(), _ffl = v(), _ffr = v(), _tip = v(), _aim = v();
const _q = new THREE.Quaternion();
void ARROW;

const _sz = new THREE.Vector3(), _sd = new THREE.Vector3(), _so = new THREE.Vector3(), _sl = new THREE.Matrix4();
/** Move a point as the figure grows: s taller and broader, girth g wider across the body. */
function sizePoint(v: THREE.Vector3, root: THREE.Vector3, right: THREE.Vector3, s: number, g: number) {
  _sd.subVectors(v, root);
  const lat = _sd.dot(right);
  v.copy(root).addScaledVector(_sd, s).addScaledVector(right, lat * s * (g - 1));
}
/**
 * Resize a posed figure about its feet: joints and bone origins move outward, each bone's
 * mesh is scaled along its length (height) and across it (girth), and the head, weapon and
 * shield keep their proportions. Shared with the ragdoll, so the fallen keep their size.
 */
export function sizeFigure(J: Joints | null, bones: THREE.Matrix4[], held: THREE.Matrix4[], nock: THREE.Vector3 | null, root: THREE.Vector3, right: THREE.Vector3, s: number, g: number) {
  if (J) for (const key in J) sizePoint((J as unknown as Record<string, THREE.Vector3>)[key], root, right, s, g);
  for (let i = 0; i < bones.length; i++) {
    const m = bones[i];
    _so.setFromMatrixPosition(m);
    sizePoint(_so, root, right, s, g);
    m.setPosition(_so);
    const head = i === B.head || i === B.neck;
    m.multiply(head ? _sl.makeScale(s, s, s) : _sl.makeScale(s * g, s, s * g));
  }
  for (const m of held) {
    _so.setFromMatrixPosition(m);
    sizePoint(_so, root, right, s, g);
    m.setPosition(_so);
    m.multiply(_sl.makeScale(s, s, s));
  }
  if (nock) sizePoint(nock, root, right, s, g);
}
