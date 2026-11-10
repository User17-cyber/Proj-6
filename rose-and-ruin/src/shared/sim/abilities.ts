// Class abilities. Each ability runs as an Act.Ability action; effects trigger when the
// action clock crosses specific times.

import { Act } from '../types';
import { ABILITY_IDS, type AbilityId } from '../data/classes';
import type { Knight } from './knight';
import type { Match } from './match';
import { frontal, radial, stun, knockdown, isBlocking, applyBleed, wearShield } from './combat';
import { spend } from './actions';

const crossed = (t0: number, t1: number, at: number) => t0 < at && t1 >= at;
const abIndex = (id: AbilityId) => ABILITY_IDS.indexOf(id);

export function canUseAbility(m: Match, k: Knight, id: AbilityId): boolean {
  if (!k.onGround && id !== 'rally' && id !== 'bulwark' && id !== 'bloodletting') return false;
  if (id === 'shield_bash' && !k.shield) return false;
  return true;
}

export function abilityMoveMult(k: Knight): number {
  switch (k.def.abilities[k.abilitySlot]) {
    case 'whirlwind': return 0.55;
    case 'rally': return 0.5;
    case 'bulwark': return 0.6;
    case 'bloodletting': return 0.8;
    case 'billhook': return 0.3;
    case 'holdline': return 0.4;
    case 'halfsword': return 0.7;
    case 'warcry': return 0.45;
    case 'execute': return 0.8;
    case 'juggernaut': return 0.8;
    case 'brace': return 0.05;
    case 'pushofpike': return 0.35;
    case 'bindwounds': return 0.35;
    case 'benediction': return 0.5;
    case 'throw': return 0.3;
    case 'misericorde': return 0.4;
    case 'disarm': return 0.4;
    case 'hamstring': return 0.5;
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
          if (v.alive) {
            if (v.act === Act.Block) { spend(v, 25); wearShield(m, v, k.id, 45, v.x, v.y + 1.2, v.z); }
            stun(m, v, 1.2);
          }
          wearShield(m, k, v.id, 12, k.x + fx * 0.4, k.y + 1.2, k.z + fz * 0.4);
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
          spend(v, 16 * v.blockStamina);
          m.emit({ t: 'block', a: k.id, v: v.id, x: (v.x + k.x) / 2, y: v.y + 1.3, z: (v.z + k.z) / 2, parry: false, shield: !!v.shield, broke: false });
          wearShield(m, v, k.id, 26, (v.x + k.x) / 2, v.y + 1.3, (v.z + k.z) / 2);
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
            spend(v, 30 * v.blockStamina);
            m.emit({ t: 'block', a: k.id, v: v.id, x: v.x + (k.x - v.x) * 0.3, y: v.y + 1.3, z: v.z + (k.z - v.z) * 0.3, parry: false, shield: !!v.shield, broke: false });
            wearShield(m, v, k.id, 40, v.x + (k.x - v.x) * 0.3, v.y + 1.3, v.z + (k.z - v.z) * 0.3);
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
    case 'billhook':
      if (crossed(t0, t1, 0.32)) {
        // hook the nearest foe ahead and haul him in onto the bill
        let target: Knight | null = null, best = 99;
        frontal(m, k, 4.2, 26, (v, d) => { if (d > 1.0 && d < best) { best = d; target = v; } });
        const v = target as Knight | null;
        if (v) {
          if (isBlocking(v, k.x, k.z) && v.shield) {
            spend(v, 20); wearShield(m, v, k.id, 35, v.x, v.y + 1.1, v.z);
            m.emit({ t: 'block', a: k.id, v: v.id, x: v.x, y: v.y + 1.1, z: v.z, parry: false, shield: true, broke: false });
          } else {
            const pull = Math.max(0, best - 1.2);
            v.pushX -= fx * pull * 3.2; v.pushZ -= fz * pull * 3.2;
            m.damage(v, k, 14 * (1 - v.def.armor[0]), { zone: 2, dtype: 0, kind: 2, x: v.x, y: v.y + 0.6, z: v.z, dx: -fx, dy: 0, dz: -fz, noStagger: true });
            if (v.alive) stun(m, v, 1.0);
          }
        }
      }
      break;
    case 'holdline':
      if (crossed(t0, t1, 0.3)) {
        for (const a of m.knights) {
          if (!a.alive || a.team !== k.team || (a.x - k.x) ** 2 + (a.z - k.z) ** 2 > 81) continue;
          a.holdT = 8;
        }
        emitAb(m, k, id);
      }
      break;
    case 'halfsword':
      if (crossed(t0, t1, 0.15)) { k.halfT = 8; emitAb(m, k, id); }
      break;
    case 'warcry':
      if (crossed(t0, t1, 0.35)) {
        for (const a of m.knights) {
          if (!a.alive) continue;
          const d2 = (a.x - k.x) ** 2 + (a.z - k.z) ** 2;
          if (a.team === k.team) { if (d2 <= 100) a.hasteT = 6; continue; }
          if (d2 > 49 || a.bulwarkT > 0 || a.juggerT > 0 || a.knockT > 0) continue;
          // the foe reels: his guard and his blow are both broken off
          a.act = Act.Stagger; a.actT = 0; a.actDur = 0.7; a.heavy = false; a.charge = 0; a.draw = 0;
          spend(a, 15);
        }
        emitAb(m, k, id);
      }
      break;
    case 'execute':
      if (crossed(t0, t1, 0.2)) { k.execT = 10; emitAb(m, k, id); }
      break;
    case 'juggernaut':
      if (crossed(t0, t1, 0.25)) { k.juggerT = 8; k.stunT = 0; emitAb(m, k, id); }
      break;
    case 'murderstroke':
      if (crossed(t0, t1, 0.15)) { k.mordT = 6; emitAb(m, k, id); }
      break;
    case 'shieldbreaker':
      if (crossed(t0, t1, 0.15)) { k.sbT = 6; emitAb(m, k, id); }
      break;
    case 'disarm':
      if (crossed(t0, t1, 0.3)) {
        let target: Knight | null = null, best = 9;
        frontal(m, k, 2.5, 30, (v, d) => { if (d < best) { best = d; target = v; } });
        const v = target as Knight | null;
        if (v && v.juggerT <= 0 && v.bulwarkT <= 0) {
          if (v.shield && isBlocking(v, k.x, k.z)) {
            spend(v, 15);
            m.emit({ t: 'block', a: k.id, v: v.id, x: v.x, y: v.y + 1.2, z: v.z, parry: false, shield: true, broke: false });
          } else {
            v.disarmT = 2.5;
            if (v.act === Act.Windup || v.act === Act.Charge || v.act === Act.Release || v.act === Act.Block) { v.act = Act.Stagger; v.actT = 0; v.actDur = 0.45; v.heavy = false; v.charge = 0; }
            m.emit({ t: 'disarm', k: v.id, by: k.id });
          }
        }
      }
      break;
    case 'throw':
      if (crossed(t0, t1, 0.35)) {
        let target: Knight | null = null, best = 9;
        frontal(m, k, 1.8, 40, (v, d) => { if (d < best) { best = d; target = v; } });
        const v = target as Knight | null;
        if (v) {
          // the heavier the man, the harder he is to throw: a champion in full plate may stand his ground
          if (v.def.mass > k.def.mass * 1.35 && m.rng.chance(0.5)) { spend(v, 20); stun(m, v, 0.5); }
          else {
            v.pushX += fx * 2.5; v.pushZ += fz * 2.5;
            m.damage(v, k, 10 * (1 - v.def.armor[1]), { zone: 1, dtype: 1, kind: 2, x: v.x, y: v.y + 0.9, z: v.z, dx: fx, dy: 0.4, dz: fz, noStagger: true });
            if (v.alive) knockdown(m, v, k, 1.7);
          }
        }
      }
      break;
    case 'misericorde':
      if (crossed(t0, t1, 0.3)) {
        let target: Knight | null = null, best = 9;
        frontal(m, k, 2.3, 40, (v, d) => {
          // a man on the ground or reeling is the one to finish
          const sc = d - (v.knockT > 0 || v.stunT > 0 ? 3 : 0);
          if (sc < best) { best = sc; target = v; }
        });
        const v = target as Knight | null;
        if (v) {
          const helpless = v.knockT > 0 || v.stunT > 0;
          const dmg = helpless ? v.hp + 1 : 40 * (1 - v.def.armor[2] * 0.25);
          m.damage(v, k, dmg, { zone: helpless ? 0 : 1, dtype: 2, kind: 2, x: v.x, y: v.y + (helpless ? 0.4 : 1.3), z: v.z, dx: fx, dy: -0.2, dz: fz, noStagger: !helpless });
        }
      }
      break;
    case 'bindwounds':
      if (crossed(t0, t1, 0.5)) {
        const tend = (a: Knight) => { a.hotT = 4; a.hotRate = 45 / 4; a.bleedT = 0; a.bleedStacks = 0; m.emit({ t: 'heal', k: a.id, amt: 45 }); };
        tend(k);
        let ally: Knight | null = null, worst = 1;
        for (const a of m.knights) {
          if (!a.alive || a === k || a.team !== k.team || (a.x - k.x) ** 2 + (a.z - k.z) ** 2 > 12) continue;
          const f = a.hp / a.def.hp;
          if (f < worst) { worst = f; ally = a; }
        }
        if (ally) { tend(ally); k.score += 10; }
        emitAb(m, k, id);
      }
      break;
    case 'benediction':
      if (crossed(t0, t1, 0.45)) {
        for (const a of m.knights) {
          if (!a.alive || a.team !== k.team || (a.x - k.x) ** 2 + (a.z - k.z) ** 2 > 100) continue;
          a.stamina = Math.min(a.def.stamina, a.stamina + 40);
          a.steadyT = 6;
          if (a !== k) k.score += 5;
        }
        emitAb(m, k, id);
      }
      break;
    case 'brace':
      // the pike set: a foe who comes on at speed runs onto the point
      if (t1 > 0.3) {
        frontal(m, k, 3.4, 22, (v) => {
          if (k.abilityHits.includes(v.id)) return;
          const tx = k.x - v.x, tz = k.z - v.z, tl = Math.hypot(tx, tz) || 1;
          const closing = (v.vx * tx + v.vz * tz) / tl;
          const charging = v.act === Act.Ability && (v.def.abilities[v.abilitySlot] === 'charge' || v.def.abilities[v.abilitySlot] === 'juggernaut');
          if (closing < 2.6 && !charging) return;
          k.abilityHits.push(v.id);
          m.damage(v, k, 75 * (1 - v.def.armor[2] * 0.5), { zone: 1, dtype: 2, kind: 2, x: v.x, y: v.y + 1.2, z: v.z, dx: -tx / tl, dy: 0, dz: -tz / tl, noStagger: true });
          if (v.alive) {
            v.ovActive = false; v.vx *= 0.1; v.vz *= 0.1; v.pushX -= (tx / tl) * 2; v.pushZ -= (tz / tl) * 2;
            v.juggerT = 0;
            stun(m, v, 1.2);
          }
        });
      }
      break;
    case 'pushofpike':
      if (crossed(t0, t1, 0.4)) {
        frontal(m, k, 3.6, 14, (v) => {
          if (isBlocking(v, k.x, k.z)) { spend(v, 22); m.emit({ t: 'block', a: k.id, v: v.id, x: v.x, y: v.y + 1.2, z: v.z, parry: false, shield: !!v.shield, broke: false }); v.pushX += fx * 2.5; v.pushZ += fz * 2.5; return; }
          m.damage(v, k, 34 * (1 - v.def.armor[2] * 0.7), { zone: 1, dtype: 2, kind: 2, x: v.x, y: v.y + 1.2, z: v.z, dx: fx, dy: 0, dz: fz, noStagger: true });
          if (v.alive) { v.pushX += fx * 5; v.pushZ += fz * 5; v.act = Act.Stagger; v.actT = 0; v.actDur = 0.5; v.heavy = false; }
        });
      }
      break;
    case 'hamstring':
      if (crossed(t0, t1, 0.3)) {
        let target: Knight | null = null, best = 9;
        frontal(m, k, 2.6, 35, (v, d) => { if (d < best) { best = d; target = v; } });
        const v = target as Knight | null;
        if (v) {
          if (isBlocking(v, k.x, k.z) && v.shield) { spend(v, 12); m.emit({ t: 'block', a: k.id, v: v.id, x: v.x, y: v.y + 0.5, z: v.z, parry: false, shield: true, broke: false }); }
          else {
            m.damage(v, k, 22 * (1 - v.def.armor[0] * 0.6), { zone: 2, dtype: 0, kind: 2, x: v.x, y: v.y + 0.45, z: v.z, dx: fx, dy: 0, dz: fz, noStagger: true });
            if (v.alive) { v.slowT = 6; applyBleed(v, k); }
          }
        }
      }
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
