// Class abilities. Each ability runs as an Act.Ability action; effects trigger when the
// action clock crosses specific times.

import { Act } from '../types';
import { ABILITY_IDS, type AbilityId } from '../data/classes';
import type { Knight } from './knight';
import type { Match } from './match';
import { frontal, radial, stun, knockdown, isBlocking, applyBleed } from './combat';
import { spend } from './actions';

const crossed = (t0: number, t1: number, at: number) => t0 < at && t1 >= at;
const abIndex = (id: AbilityId) => ABILITY_IDS.indexOf(id);

export function canUseAbility(m: Match, k: Knight, id: AbilityId): boolean {
  if (!k.onGround && id !== 'rally' && id !== 'bulwark' && id !== 'bloodletting') return false;
  return true;
}

export function abilityMoveMult(k: Knight): number {
  switch (k.def.abilities[k.abilitySlot]) {
    case 'whirlwind': return 0.55;
    case 'rally': return 0.5;
    case 'bulwark': return 0.6;
    case 'bloodletting': return 0.8;
    case 'volley': return 0.3;
    case 'sweep': return 0.25;
    case 'earthshaker': return 0.2;
    case 'lunge': return 0.25;
    case 'shield_bash': return 0.3;
    default: return 0.4;
  }
}

function emitAb(m: Match, k: Knight, id: AbilityId, x = k.x, y = k.y, z = k.z) {
  m.emit({ t: 'ability', k: k.id, ab: abIndex(id), x, y, z });
}

export function abilityStart(m: Match, k: Knight, id: AbilityId) {
  k.ovActive = false;
  switch (id) {
    case 'dash': {
      const inp = k.input;
      let mx = inp.mx, mz = inp.mz;
      if (Math.hypot(mx, mz) < 0.2) { mx = 0; mz = -1; }
      const l = Math.hypot(mx, mz);
      mx /= l; mz /= l;
      const fx = -Math.sin(k.yaw), fz = -Math.cos(k.yaw), rx = Math.cos(k.yaw), rz = -Math.sin(k.yaw);
      k.ovx = (rx * mx + fx * mz) * 11;
      k.ovz = (rz * mx + fz * mz) * 11;
      k.ovActive = true;
      k.invulnT = 0.24;
      emitAb(m, k, id);
      break;
    }
    case 'charge':
      k.chargeHit = false;
      emitAb(m, k, id);
      break;
    default:
      emitAb(m, k, id);
  }
}

export function abilityTick(m: Match, k: Knight, id: AbilityId, t0: number, t1: number) {
  const fx = -Math.sin(k.yaw), fz = -Math.cos(k.yaw);
  switch (id) {
    case 'shield_bash': {
      k.ovActive = t1 >= 0.08 && t1 < 0.3;
      k.ovx = fx * 6.5; k.ovz = fz * 6.5;
      if (crossed(t0, t1, 0.2)) {
        let target: Knight | null = null, best = 9;
        frontal(m, k, 1.85, 38, (v, d) => { if (d < best) { best = d; target = v; } });
        const v = target as Knight | null;
        if (v) {
          v.pushX += fx * 3.8; v.pushZ += fz * 3.8;
          m.damage(v, k, 16 * (1 - v.def.armor[1]), { zone: 1, dtype: 1, kind: 2, x: v.x, y: v.y + 1.2, z: v.z, dx: fx, dy: 0, dz: fz, noStagger: true });
          if (v.alive) { if (v.act === Act.Block) spend(v, 25); stun(m, v, 1.2); }
          m.emit({ t: 'kick', a: k.id, v: v.id, hit: true, broke: true });
        }
      }
      break;
    }
    case 'rally':
      if (crossed(t0, t1, 0.4)) {
        for (const a of m.knights) {
          if (!a.alive || a.team !== k.team) continue;
          if ((a.x - k.x) ** 2 + (a.z - k.z) ** 2 > 144) continue;
          a.hotT = 4; a.hotRate = 35 / 4;
          a.rallyT = 8;
          a.bleedT = 0; a.bleedStacks = 0;
          m.emit({ t: 'heal', k: a.id, amt: 35 });
          if (a !== k) k.score += 10;
        }
        emitAb(m, k, id);
      }
      break;
    case 'whirlwind': {
      if (t1 < 0.2 || t0 > 1.2) break;
      const rev = t1 < 0.7 ? 0 : 1;
      radial(m, k, 2.45, (v) => {
        const key = v.id + rev * 100000;
        if (k.abilityHits.includes(key)) return;
        k.abilityHits.push(key);
        const dx = v.x - k.x, dz = v.z - k.z, l = Math.hypot(dx, dz) || 1;
        if (isBlocking(v, k.x, k.z)) {
          spend(v, 16 * v.weapon.blockStamina);
          m.emit({ t: 'block', a: k.id, v: v.id, x: (v.x + k.x) / 2, y: v.y + 1.3, z: (v.z + k.z) / 2, parry: false, shield: !!v.def.shield, broke: false });
          return;
        }
        m.damage(v, k, 24 * (1 - v.def.armor[0]), { zone: 1, dtype: 0, kind: 2, x: v.x - (dx / l) * 0.25, y: v.y + 1.2, z: v.z - (dz / l) * 0.25, dx: -dz / l, dy: 0, dz: dx / l });
        v.pushX += (dx / l) * 2.5; v.pushZ += (dz / l) * 2.5;
      });
      break;
    }
    case 'charge': {
      k.ovActive = t1 < 1.95;
      const sp = t1 < 0.25 ? 8.6 * (t1 / 0.25) : 8.6;
      k.ovx = fx * sp; k.ovz = fz * sp;
      if (t1 > 0.35 && k.moveSpeed < 2.0) { k.actT = k.actDur; break; } // hit a wall
      let target: Knight | null = null, best = 9;
      frontal(m, k, 1.35, 55, (v, d) => { if (d < best) { best = d; target = v; } });
      const v = target as Knight | null;
      if (v && !k.chargeHit) {
        k.chargeHit = true;
        v.pushX += fx * 6; v.pushZ += fz * 6;
        m.damage(v, k, 22 * (1 - v.def.armor[1]), { zone: 1, dtype: 1, kind: 2, x: v.x, y: v.y + 1.1, z: v.z, dx: fx, dy: 0.2, dz: fz, noStagger: true });
        if (v.alive) knockdown(m, v, k, 1.8);
        k.ovActive = false;
        k.act = Act.Recover; k.atk = 0; k.actT = 0; k.actDur = 0.45;
      }
      break;
    }
    case 'lunge': {
      k.ovActive = t1 >= 0.3 && t1 < 0.52;
      k.ovx = fx * 7.6; k.ovz = fz * 7.6;
      if (t1 >= 0.32 && t0 <= 0.56) {
        let target: Knight | null = null, best = 99;
        frontal(m, k, 3.0, 20, (v, d) => { if (!k.abilityHits.includes(v.id) && d < best) { best = d; target = v; } });
        const v = target as Knight | null;
        if (v) {
          k.abilityHits.push(v.id);
          if (isBlocking(v, k.x, k.z)) {
            spend(v, 30 * v.weapon.blockStamina);
            m.emit({ t: 'block', a: k.id, v: v.id, x: v.x + (k.x - v.x) * 0.3, y: v.y + 1.3, z: v.z + (k.z - v.z) * 0.3, parry: false, shield: !!v.def.shield, broke: false });
            k.ovActive = false;
            k.act = Act.Deflect; k.actT = 0; k.actDur = 0.4;
          } else {
            m.damage(v, k, 50 * (1 - v.def.armor[2] * 0.5), { zone: 1, dtype: 2, kind: 2, x: v.x - fx * 0.25, y: v.y + 1.25, z: v.z - fz * 0.25, dx: fx, dy: 0, dz: fz, noStagger: true });
            if (v.alive) stun(m, v, 1.0);
          }
        }
      }
      break;
    }
    case 'sweep':
      if (crossed(t0, t1, 0.45)) {
        frontal(m, k, 2.9, 100, (v) => {
          m.damage(v, k, 12 * (1 - v.def.armor[0]), { zone: 2, dtype: 0, kind: 2, x: v.x, y: v.y + 0.4, z: v.z, dx: Math.cos(k.yaw), dy: 0, dz: -Math.sin(k.yaw), noStagger: true });
          if (v.alive) knockdown(m, v, k, 1.2);
        });
      }
      break;
    case 'earthshaker': {
      if (crossed(t0, t1, 0.18)) { k.vy = 4.6; k.onGround = false; }
      k.ovActive = t1 >= 0.18 && t1 < 0.66;
      k.ovx = fx * 3.2; k.ovz = fz * 3.2;
      if (crossed(t0, t1, 0.7)) {
        const sx = k.x + fx * 1.2, sz = k.z + fz * 1.2;
        radial(m, k, 3.7, (v, d) => {
          const f = Math.max(0.35, 1 - d / 6);
          const dx = v.x - k.x, dz = v.z - k.z, l = Math.hypot(dx, dz) || 1;
          m.damage(v, k, 26 * f * (1 - v.def.armor[1]), { zone: 1, dtype: 1, kind: 2, x: v.x, y: v.y + 0.6, z: v.z, dx: dx / l, dy: 0.5, dz: dz / l, noStagger: true });
          if (v.alive) knockdown(m, v, k, 1.1);
          v.pushX += (dx / l) * 3; v.pushZ += (dz / l) * 3;
        });
        emitAb(m, k, id, sx, m.world.groundAt(sx, sz, k.y + 1), sz);
      }
      break;
    }
    case 'bulwark':
      if (crossed(t0, t1, 0.3)) { k.bulwarkT = 6; k.bleedT = 0; k.bleedStacks = 0; emitAb(m, k, id); }
      break;
    case 'volley':
      if (crossed(t0, t1, 0.45)) {
        let tx = k.x + fx * 40, tz = k.z + fz * 40;
        const inp = k.input;
        if (inp.aimX !== undefined && inp.aimZ !== undefined) {
          const dx = inp.aimX - k.x, dz = inp.aimZ - k.z;
          const d = Math.hypot(dx, dz);
          if (d > 8) {
            const dd = Math.min(d, 75);
            tx = k.x + (dx / d) * dd; tz = k.z + (dz / d) * dd;
          }
        }
        const dx = tx - k.x, dz = tz - k.z, l = Math.hypot(dx, dz) || 1;
        m.volleys.push({ owner: k.id, team: k.team, x: tx, z: tz, delay: 1.1, left: 18, timer: 0, dirx: dx / l, dirz: dz / l });
        m.emit({ t: 'volley', k: k.id, team: k.team, x: tx, y: m.world.groundAt(tx, tz, 999), z: tz, delay: 1.1 });
      }
      break;
    case 'dash':
      if (t1 >= 0.24) { k.ovActive = false; }
      break;
    case 'bloodletting':
      if (crossed(t0, t1, 0.25)) { k.bloodletT = 8; emitAb(m, k, id); }
      break;
    default:
      break;
  }
}

export function abilityEnd(m: Match, k: Knight, id: AbilityId) {
  k.ovActive = false;
  void m; void id;
}

export { applyBleed };
