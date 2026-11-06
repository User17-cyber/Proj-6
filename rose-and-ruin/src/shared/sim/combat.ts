// Melee hit detection (blade sweeps against head/torso/leg volumes), blocking and parries,
// kicks, arrows and arrow volleys.

import { Act, type HitZone, type Team } from '../types';
import { ARROW, type AttackDef } from '../data/weapons';
import { DEG, angleDiff, clamp, lerp, segSegDist2, v3, yawTo, type V3 } from '../math';
import { hitVolumes, newVolumes, type Knight } from './knight';
import type { Match } from './match';
import { applyAimPitch, aimPitchFor, bladeWorld, newPose, releasePose, releaseEase, HIT_FROM, HIT_TO } from './pose';
import { attackSpeed, spend } from './actions';

export interface Arrow {
  id: number; owner: number; team: Team;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  dmg: number; bodkin: boolean; life: number; pierced: number; volley: boolean;
}
export interface Volley { owner: number; team: Team; x: number; z: number; delay: number; left: number; timer: number; dirx: number; dirz: number }

/** Damage multipliers by zone (head, torso, legs) and type (cut, blunt, pierce). */
export const ZONE_MULT: readonly (readonly number[])[] = [
  [1.6, 1.5, 1.7],
  [1, 1, 1],
  [0.75, 0.8, 0.75],
];

const pose = newPose();
const base = v3(), tip = v3(), ptip = v3(), pbase = v3();
const vol = newVolumes();
const cand: Knight[] = [];

export function resolveCombat(m: Match) {
  for (const k of m.knights) {
    if (!k.alive || k.act !== Act.Release) continue;
    sweep(m, k);
  }
}

function bladeAt(k: Knight, a: AttackDef, u: number, from: number, to: number, b: V3, t: V3) {
  releasePose(a, u, pose);
  applyAimPitch(pose, aimPitchFor(k.pitch));
  bladeWorld(pose, k.x, k.y, k.z, k.yaw, from, to, b, t);
}

function sweep(m: Match, k: Knight) {
  const a = k.weapon.attacks[k.atk];
  const dur = k.actDur;
  const t0 = k.relPrevT, t1 = Math.min(k.actT, dur);
  if (t1 <= t0) { k.relPrevT = t1; return; }
  const from = a.hitStart ?? k.weapon.hitStart, to = a.hitEnd ?? k.weapon.hitEnd;
  const S = 4;
  bladeAt(k, a, t0 / dur, from, to, pbase, ptip);
  for (let s = 1; s <= S; s++) {
    const u = (t0 + ((t1 - t0) * s) / S) / dur;
    bladeAt(k, a, u, from, to, base, tip);
    const ue = releaseEase(u);
    if (ue >= HIT_FROM && ue <= HIT_TO) {
      cand.length = 0;
      m.hash.query(k.x, k.z, to + 1.6, (v) => {
        if (v === k || !v.alive || v.invulnT > 0) return;
        if (v.team === k.team && !m.settings.friendlyFire) return;
        if (k.hitList.includes(v.id) || Math.abs(v.y - k.y) > 3) return;
        cand.push(v);
      });
      if (cand.length > 1) cand.sort((p, q) => ((p.x - k.x) ** 2 + (p.z - k.z) ** 2) - ((q.x - k.x) ** 2 + (q.z - k.z) ** 2));
      for (const v of cand) {
        hitVolumes(v, vol);
        const zone = bladeVsVolumes(base, tip, ptip);
        if (zone < 0) continue;
        contact(m, k, v, a, zone as HitZone, _hit.x, _hit.y, _hit.z, tip.x - ptip.x, tip.y - ptip.y, tip.z - ptip.z);
        if (k.act !== Act.Release) break;
      }
      if (k.act !== Act.Release) { k.relPrevT = t1; return; }
    }
    pbase.x = base.x; pbase.y = base.y; pbase.z = base.z;
    ptip.x = tip.x; ptip.y = tip.y; ptip.z = tip.z;
  }
  k.relPrevT = t1;
}

const _hit = v3();
const _mid = v3();
const _pm = v3();

/** Test blade (and the tip's path since the last sample) against the cached hit volumes. */
function bladeVsVolumes(b: V3, t: V3, pt: V3): number {
  let zone = -1, best = 1;
  const test = (p: V3, q: V3) => {
    let r = segSegDist2(p, q, vol.head, vol.head);
    let ratio = Math.sqrt(r.dist2) / vol.headR;
    if (ratio < best) { best = ratio; zone = 0; pointOn(p, q, r.s); }
    r = segSegDist2(p, q, vol.torsoA, vol.torsoB);
    ratio = Math.sqrt(r.dist2) / vol.torsoR;
    if (ratio < best * 1.05 && ratio < 1) { if (zone !== 0 || ratio < best * 0.7) { best = ratio; zone = 1; pointOn(p, q, r.s); } }
    r = segSegDist2(p, q, vol.legsA, vol.legsB);
    ratio = Math.sqrt(r.dist2) / vol.legsR;
    if (ratio < best && ratio < 1) { best = ratio; zone = 2; pointOn(p, q, r.s); }
  };
  test(b, t);
  if (zone < 0) {
    // the outer third of the blade's swept path
    _mid.x = b.x + (t.x - b.x) * 0.66; _mid.y = b.y + (t.y - b.y) * 0.66; _mid.z = b.z + (t.z - b.z) * 0.66;
    _pm.x = pt.x; _pm.y = pt.y; _pm.z = pt.z;
    test(_pm, t);
  }
  return zone;
}
function pointOn(p: V3, q: V3, s: number) {
  _hit.x = p.x + (q.x - p.x) * s; _hit.y = p.y + (q.y - p.y) * s; _hit.z = p.z + (q.z - p.z) * s;
}

export function isBlocking(v: Knight, ax: number, az: number): boolean {
  const arc = v.blockArc;
  if (v.act !== Act.Block || v.actT < 0.05 || arc <= 0) return false;
  const half = (arc * DEG) / 2;
  return Math.abs(angleDiff(v.yaw, yawTo(v.x, v.z, ax, az))) <= half;
}

/**
 * Wear a knight's shield by `amount`. When it splinters the knight is left reeling and fights
 * on without it until he next takes the field. Returns true if the shield broke.
 */
export function wearShield(m: Match, v: Knight, by: number, amount: number, x: number, y: number, z: number): boolean {
  if (!v.shield || amount <= 0) return false;
  v.shieldHp = Math.max(0, v.shieldHp - amount);
  if (v.shieldHp > 0) return false;
  m.emit({ t: 'shieldBreak', k: v.id, by, x, y, z });
  if (v.alive && v.bulwarkT <= 0 && v.knockT <= 0) {
    v.act = Act.Stagger; v.actT = 0; v.actDur = 0.7; v.heavy = false; v.draw = 0;
  }
  return true;
}

function contact(m: Match, k: Knight, v: Knight, a: AttackDef, zone: HitZone, px: number, py: number, pz: number, sdx: number, sdy: number, sdz: number) {
  k.hitList.push(v.id);
  const chargeF = k.heavy ? clamp(k.charge / Math.max(0.01, k.weapon.heavyChargeMax), 0, 1) : 0;
  let dmg = a.damage * (1 + 0.25 * chargeF);
  if (isBlocking(v, k.x, k.z)) {
    const parry = v.actT <= v.weapon.parryWindow;
    let cost = (k.heavy ? 26 : a.kind === 'thrust' ? 11 : 14) * v.blockStamina * (a.damage / 50);
    if (parry) cost *= 0.25;
    const shield = !!v.shield;
    const broke = !parry && v.stamina < cost;
    spend(v, cost);
    m.emit({ t: 'block', a: k.id, v: v.id, x: px, y: py, z: pz, parry, shield, broke });
    // the shield takes the blow: maces and axes splinter it fastest, a parry barely marks it
    if (shield && wearShield(m, v, k.id, dmg * (a.dtype === 1 ? 1.35 : a.dtype === 2 ? 0.8 : 1) * (k.heavy ? 1.3 : 1) * (parry ? 0.3 : 1), px, py, pz)) {
      k.act = Act.Recover; k.actT = 0; k.actDur = a.recover * attackSpeed(k);
      return;
    }
    if (broke) {
      v.act = Act.Stagger; v.actT = 0; v.actDur = 0.85;
      dmg *= 0.5 * ZONE_MULT[1][a.dtype] * (1 - v.def.armor[a.dtype]);
      m.damage(v, k, dmg, { zone: 1, dtype: a.dtype, kind: 0, heavy: k.heavy, x: px, y: py, z: pz, dx: sdx, dy: sdy, dz: sdz, noStagger: true });
      k.act = Act.Recover; k.actT = 0; k.actDur = a.recover * attackSpeed(k);
    } else if (parry) {
      k.act = Act.Parried; k.actT = 0; k.actDur = 0.8; k.heavy = false; k.charge = 0;
      v.riposteT = 0.7;
    } else {
      k.act = Act.Deflect; k.actT = 0; k.actDur = 0.32; k.heavy = false; k.charge = 0;
    }
    return;
  }
  dmg *= ZONE_MULT[zone][a.dtype] * (1 - v.def.armor[a.dtype]);
  const l = Math.hypot(sdx, sdy, sdz) || 1;
  const died = m.damage(v, k, dmg, { zone, dtype: a.dtype, kind: 0, heavy: k.heavy, x: px, y: py, z: pz, dx: sdx / l, dy: sdy / l, dz: sdz / l });
  if (!died && v.alive) {
    if (k.bloodletT > 0 && a.dtype === 0) applyBleed(v, k);
    if (zone === 0 && a.dtype === 1 && k.heavy && v.bulwarkT <= 0) stun(m, v, 0.7);
    v.pushX += (sdx / l) * 1.2; v.pushZ += (sdz / l) * 1.2;
  }
  if (k.hitList.length >= a.maxTargets) {
    k.act = Act.Recover; k.actT = 0; k.actDur = a.recover * attackSpeed(k) * 1.1;
  }
}

export function applyBleed(v: Knight, by: Knight) {
  v.bleedStacks = Math.min(3, v.bleedStacks + 1);
  v.bleedT = 4;
  v.bleedBy = by.id;
}

export function stun(m: Match, v: Knight, t: number) {
  if (!v.alive || v.bulwarkT > 0 || v.knockT > 0) return;
  v.act = Act.Stun; v.actT = 0; v.actDur = t; v.stunT = t; v.draw = 0; v.heavy = false;
  m.emit({ t: 'stun', k: v.id });
}

export function knockdown(m: Match, v: Knight, by: Knight, t: number) {
  if (!v.alive || v.bulwarkT > 0) return;
  v.act = Act.Knockdown; v.actT = 0; v.actDur = t; v.knockT = t; v.draw = 0; v.heavy = false;
  v.vx *= 0.2; v.vz *= 0.2;
  m.emit({ t: 'knockdown', k: v.id, by: by.id });
}

/** Enemies in a frontal cone. */
export function frontal(m: Match, k: Knight, range: number, halfAngleDeg: number, fn: (v: Knight, d: number) => void) {
  const fx = -Math.sin(k.yaw), fz = -Math.cos(k.yaw);
  const cosA = Math.cos(halfAngleDeg * DEG);
  m.hash.query(k.x, k.z, range + 0.5, (v) => {
    if (v === k || !v.alive || v.invulnT > 0) return;
    if (v.team === k.team && !m.settings.friendlyFire) return;
    if (Math.abs(v.y - k.y) > 2.5) return;
    const dx = v.x - k.x, dz = v.z - k.z;
    const d = Math.hypot(dx, dz);
    if (d > range + 0.3) return;
    if (d > 0.05 && (dx * fx + dz * fz) / d < cosA) return;
    fn(v, d);
  });
}

/** Enemies within a radius. */
export function radial(m: Match, k: Knight, r: number, fn: (v: Knight, d: number) => void) {
  m.hash.query(k.x, k.z, r + 0.5, (v) => {
    if (v === k || !v.alive || v.invulnT > 0) return;
    if (v.team === k.team && !m.settings.friendlyFire) return;
    if (Math.abs(v.y - k.y) > 2.5) return;
    const d = Math.hypot(v.x - k.x, v.z - k.z);
    if (d <= r) fn(v, d);
  });
}

export function resolveKick(m: Match, k: Knight) {
  let target: Knight | null = null, best = 1.7;
  frontal(m, k, 1.65, 38, (v, d) => { if (d < best) { best = d; target = v; } });
  const v = target as Knight | null;
  if (!v) { m.emit({ t: 'kick', a: k.id, v: -1, hit: false, broke: false }); return; }
  const fx = -Math.sin(k.yaw), fz = -Math.cos(k.yaw);
  let broke = false;
  const resist = v.bulwarkT > 0 ? 0.4 : 1;
  v.pushX += fx * 4.6 * resist; v.pushZ += fz * 4.6 * resist;
  if (v.bulwarkT <= 0 && v.knockT <= 0) {
    if (v.act === Act.Block) { broke = true; spend(v, 22); v.act = Act.Stagger; v.actT = 0; v.actDur = 0.95; }
    else if (v.act !== Act.Stun && v.act !== Act.Knockdown) { v.act = Act.Stagger; v.actT = 0; v.actDur = 0.5; v.draw = 0; }
  }
  m.emit({ t: 'kick', a: k.id, v: v.id, hit: true, broke });
  m.damage(v, k, 10 * (1 - v.def.armor[1]), { zone: 1, dtype: 1, kind: 3, x: v.x, y: v.y + 1.0, z: v.z, dx: fx, dy: 0, dz: fz, noStagger: true });
}

// ------------------------------------------------------------------- arrows

export function looseArrow(m: Match, k: Knight) {
  const draw = k.draw;
  const speed = lerp(ARROW.minSpeed, ARROW.maxSpeed, draw);
  let dmg = lerp(ARROW.minDamage, ARROW.maxDamage, Math.pow(draw, 1.3));
  const rx = Math.cos(k.yaw), rz = -Math.sin(k.yaw);
  const fx = -Math.sin(k.yaw), fz = -Math.cos(k.yaw);
  const ox = k.x + rx * 0.12 + fx * 0.45, oy = k.y + 1.5, oz = k.z + rz * 0.12 + fz * 0.45;
  let dx: number, dy: number, dz: number;
  const inp = k.input;
  if (inp.aimX !== undefined && inp.aimY !== undefined && inp.aimZ !== undefined) {
    // aim at the crosshair point, compensating for the arrow's drop
    const tx = inp.aimX - ox, ty = inp.aimY - oy, tz = inp.aimZ - oz;
    const dist = Math.hypot(tx, tz);
    const tFlight = dist / speed;
    const drop = 0.5 * ARROW.gravity * tFlight * tFlight;
    const l = Math.hypot(tx, ty + drop, tz) || 1;
    dx = tx / l; dy = (ty + drop) / l; dz = tz / l;
    // never shoot behind the knight
    if (dx * fx + dz * fz < 0.2) { const cp = Math.cos(k.pitch); dx = fx * cp; dy = Math.sin(k.pitch); dz = fz * cp; }
  } else {
    const cp = Math.cos(k.pitch);
    dx = fx * cp; dy = Math.sin(k.pitch); dz = fz * cp;
  }
  const spread = 0.004 + (1 - draw) * 0.02 + Math.min(0.03, k.moveSpeed * 0.006) + (k.drawHold > ARROW.holdTime ? 0.03 : 0);
  dx += m.rng.gauss() * spread; dy += m.rng.gauss() * spread * 0.7; dz += m.rng.gauss() * spread;
  const l = Math.hypot(dx, dy, dz) || 1;
  dx /= l; dy /= l; dz /= l;
  const bodkin = k.bodkin;
  if (bodkin) { k.bodkin = false; dmg *= 1.35; }
  const a: Arrow = { id: m.nextArrowId++, owner: k.id, team: k.team, x: ox, y: oy, z: oz, vx: dx * speed, vy: dy * speed, vz: dz * speed, dmg, bodkin, life: 6, pierced: -1, volley: false };
  m.arrows.push(a);
  m.emit({ t: 'arrow', id: a.id, k: k.id, x: ox, y: oy, z: oz, vx: a.vx, vy: a.vy, vz: a.vz, bodkin });
}

const _nrm = { x: 0, y: 1, z: 0 };
const _mat = { mat: 0 };
const aP = v3(), aQ = v3();

export function stepArrows(m: Match, dt: number) {
  const arrows = m.arrows;
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    const px = a.x, py = a.y, pz = a.z;
    a.vy -= ARROW.gravity * dt;
    a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
    a.life -= dt;
    aP.x = px; aP.y = py; aP.z = pz; aQ.x = a.x; aQ.y = a.y; aQ.z = a.z;
    // knights along the segment
    let hitK: Knight | null = null, hitS = 2, hitZone = 1 as HitZone;
    const mx = (px + a.x) / 2, mz = (pz + a.z) / 2;
    const segLen = Math.hypot(a.x - px, a.z - pz);
    m.hash.query(mx, mz, segLen / 2 + 1.5, (v) => {
      if (!v.alive || v.id === a.owner || v.id === a.pierced || v.invulnT > 0) return;
      if (v.team === a.team && !m.settings.friendlyFire) return;
      hitVolumes(v, vol);
      const tests: [V3, V3, number, HitZone][] = [[vol.head, vol.head, vol.headR, 0], [vol.torsoA, vol.torsoB, vol.torsoR, 1], [vol.legsA, vol.legsB, vol.legsR, 2]];
      for (const [p, q, r, z] of tests) {
        const res = segSegDist2(aP, aQ, p, q);
        if (res.dist2 < r * r && res.s < hitS) { hitS = res.s; hitK = v; hitZone = z; }
      }
    });
    const tw = m.world.raycast(px, py, pz, a.x, a.y, a.z, _nrm, _mat);
    if (hitK && (tw < 0 || hitS <= tw)) {
      const v = hitK as Knight;
      const hx = px + (a.x - px) * hitS, hy = py + (a.y - py) * hitS, hz = pz + (a.z - pz) * hitS;
      const spd = Math.hypot(a.vx, a.vy, a.vz) || 1;
      const ndx = a.vx / spd, ndy = a.vy / spd, ndz = a.vz / spd;
      const sh = v.shield;
      const shieldBlock = !!sh && sh.arrows && !a.bodkin && (isBlocking(v, px, pz) || (v.act !== Act.Release && Math.abs(angleDiff(v.yaw, yawTo(v.x, v.z, px, pz))) < (sh.id === 'pavise' ? 0.8 : 0.5) && hitZone !== 0 && m.rng.chance(sh.cover)));
      if (shieldBlock) {
        spend(v, 5);
        m.emit({ t: 'arrowHit', id: a.id, v: v.id, x: hx, y: hy, z: hz, nx: -ndx, ny: -ndy, nz: -ndz, stuck: true, shield: true });
        m.emit({ t: 'block', a: a.owner, v: v.id, x: hx, y: hy, z: hz, parry: false, shield: true, broke: false });
        wearShield(m, v, a.owner, a.dmg * 0.6, hx, hy, hz);
        arrows.splice(i, 1);
        continue;
      }
      let dmg = a.dmg * ZONE_MULT[hitZone][2] * (a.bodkin ? 1 : 1 - v.def.armor[2]);
      if (a.volley) dmg = a.dmg * (hitZone === 0 ? 1.3 : 1) * (1 - v.def.armor[2] * 0.6);
      const owner = m.knights[a.owner] ?? null;
      m.damage(v, owner, dmg, { zone: hitZone, dtype: 2, kind: a.volley ? 5 : 1, x: hx, y: hy, z: hz, dx: ndx, dy: ndy, dz: ndz, noStagger: a.volley });
      m.emit({ t: 'arrowHit', id: a.id, v: v.id, x: hx, y: hy, z: hz, nx: -ndx, ny: -ndy, nz: -ndz, stuck: true, shield: false });
      if (a.bodkin && a.pierced < 0) { a.pierced = v.id; a.dmg *= 0.7; continue; }
      arrows.splice(i, 1);
      continue;
    }
    if (tw >= 0) {
      const hx = px + (a.x - px) * tw, hy = py + (a.y - py) * tw, hz = pz + (a.z - pz) * tw;
      m.emit({ t: 'arrowHit', id: a.id, v: -1, x: hx, y: hy, z: hz, nx: _nrm.x, ny: _nrm.y, nz: _nrm.z, stuck: _mat.mat !== 3, shield: false });
      arrows.splice(i, 1);
      continue;
    }
    if (a.life <= 0 || a.y < -40) arrows.splice(i, 1);
  }
}

export function stepVolleys(m: Match, dt: number) {
  for (let i = m.volleys.length - 1; i >= 0; i--) {
    const v = m.volleys[i];
    v.delay -= dt;
    if (v.delay > 0) continue;
    v.timer -= dt;
    while (v.timer <= 0 && v.left > 0) {
      v.timer += 1.5 / 18;
      v.left--;
      const ang = m.rng.range(0, Math.PI * 2), r = Math.sqrt(m.rng.next()) * 6.5;
      const tx = v.x + Math.cos(ang) * r, tz = v.z + Math.sin(ang) * r;
      const ty = m.world.groundAt(tx, tz, 999);
      const T = 1.15;
      const sx = tx - v.dirx * 26, sz = tz - v.dirz * 26, sy = ty + 34;
      const vx = (tx - sx) / T, vz = (tz - sz) / T;
      const vy = (ty - sy + 0.5 * ARROW.gravity * T * T) / T;
      const a: Arrow = { id: m.nextArrowId++, owner: v.owner, team: v.team, x: sx, y: sy, z: sz, vx, vy, vz, dmg: 26, bodkin: false, life: 3, pierced: -1, volley: true };
      m.arrows.push(a);
      m.emit({ t: 'arrow', id: a.id, k: v.owner, x: sx, y: sy, z: sz, vx, vy, vz, bodkin: false });
    }
    if (v.left <= 0) m.volleys.splice(i, 1);
  }
}
