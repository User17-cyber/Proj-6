// Per-knight update: status timers, the action state machine driven by the input frame,
// and character movement with collision. Shared by the server sim and client prediction.

import { Act, Btn, GRAVITY } from '../types';
import { ABILITIES } from '../data/classes';
import { ARROW } from '../data/weapons';
import { clamp, approach, approachAngle } from '../math';
import { Knight, KNIGHT_RADIUS } from './knight';
import type { Match } from './match';
import type { StaticWorld } from '../world/world';
import { abilityStart, abilityTick, abilityEnd, abilityMoveMult, canUseAbility } from './abilities';
import { looseArrow, resolveKick } from './combat';

export const KICK_TIME = 0.62, KICK_HIT = 0.22;

export function spend(k: Knight, amount: number) {
  k.stamina = Math.max(0, k.stamina - amount);
  k.staminaDelay = 0.9;
}

/** Multiplier on attack timings: the order's attack speed (faster = shorter), slowed further when exhausted. */
export const attackSpeed = (k: Knight) => (1 / k.def.attackSpeed) * (k.stamina <= 0.5 ? 1.25 : 1);

export function updateKnight(m: Match, k: Knight, dt: number) {
  timers(m, k, dt);
  if (!k.alive) return;
  const live = m.phase === 'live';
  const btn = live ? k.input.buttons : 0;
  const pressed = btn & ~k.prevButtons;
  k.prevButtons = btn;
  actions(m, k, dt, btn, pressed);
  if (!k.alive) return;
  movement(m.world, k, dt, live, pressed, m);
}

function timers(m: Match, k: Knight, dt: number) {
  k.cds[0] = Math.max(0, k.cds[0] - dt);
  k.cds[1] = Math.max(0, k.cds[1] - dt);
  k.spawnProt = Math.max(0, k.spawnProt - dt);
  k.invulnT = Math.max(0, k.invulnT - dt);
  k.feintCd = Math.max(0, k.feintCd - dt);
  k.riposteT = Math.max(0, k.riposteT - dt);
  k.bulwarkT = Math.max(0, k.bulwarkT - dt);
  k.rallyT = Math.max(0, k.rallyT - dt);
  k.bloodletT = Math.max(0, k.bloodletT - dt);
  k.holdT = Math.max(0, k.holdT - dt); k.halfT = Math.max(0, k.halfT - dt); k.hasteT = Math.max(0, k.hasteT - dt);
  k.execT = Math.max(0, k.execT - dt); k.juggerT = Math.max(0, k.juggerT - dt);
  k.bufferT = Math.max(0, k.bufferT - dt);
  if (k.bufferT <= 0) k.bufferedAttack = 0;
  if (k.act === Act.Idle) {
    k.comboTimer -= dt;
    if (k.comboTimer <= 0) k.combo = 0;
  }
  if (k.bleedT > 0) {
    k.bleedT -= dt;
    k.bleedAcc += k.bleedStacks * 5 * dt;
    if (k.bleedAcc >= 5 || (k.bleedT <= 0 && k.bleedAcc >= 1)) {
      const d = Math.floor(k.bleedAcc);
      k.bleedAcc -= d;
      const by = k.bleedBy >= 0 ? m.knights[k.bleedBy] : null;
      m.damage(k, by, d, { zone: 1, dtype: 0, kind: 4, x: k.x, y: k.y + 1.2, z: k.z, dx: 0, dy: -1, dz: 0, noStagger: true });
      if (!k.alive) return;
    }
    if (k.bleedT <= 0) { k.bleedStacks = 0; k.bleedAcc = 0; }
  }
  if (k.hotT > 0) {
    const a = Math.min(k.hotT, dt);
    k.hotT -= dt;
    m.heal(k, k.hotRate * a);
  }
  if (k.staminaDelay > 0) k.staminaDelay -= dt;
  else if (!k.sprinting) k.stamina = Math.min(k.def.stamina, k.stamina + (k.act === Act.Block ? 10 : 21) * dt);
  if (k.sprinting) { k.stamina = Math.max(0, k.stamina - 9 * dt); k.staminaDelay = 0.5; }
}

function startAttack(m: Match, k: Knight, slot: number, chained: boolean) {
  const a = k.weapon.attacks[slot];
  k.act = Act.Windup;
  k.atk = slot;
  k.heavy = slot === 2;
  k.actT = 0;
  k.actDur = a.windup * attackSpeed(k) * (chained ? 0.85 : 1) * (k.riposteT > 0 ? 0.7 : 1) * (k.halfT > 0 && a.kind === 'thrust' ? 0.75 : 1);
  k.riposteT = 0;
  k.charge = 0;
  k.hitList.length = 0;
  k.bufferedAttack = 0;
  // a heavy blow needs the button held from here on, unbroken
  k.attackHeld = (k.input.buttons & Btn.Attack) !== 0;
  if (slot < 2) k.lastSlash = slot;
  spend(k, a.stamina);
}

export function beginRelease(m: Match, k: Knight) {
  const a = k.weapon.attacks[k.atk];
  k.act = Act.Release;
  k.actT = 0;
  k.relPrevT = 0;
  k.actDur = a.release * attackSpeed(k);
  k.hitList.length = 0;
  m.emit({ t: 'swing', k: k.id, atk: k.atk, heavy: k.heavy });
}

/** Cancel a wind-up straight into a guard (costs stamina, short cooldown). */
function feint(k: Knight) {
  k.act = Act.Block;
  k.actT = 0;
  k.actDur = 0;
  k.heavy = false;
  k.charge = 0;
  k.feintCd = 1.0;
  spend(k, 5);
}

function startKick(k: Knight) {
  k.act = Act.Kick;
  k.actT = 0;
  k.actDur = KICK_TIME;
  spend(k, 12);
}

function tryAbility(m: Match, k: Knight, pressed: number): boolean {
  for (let slot = 0; slot < 2; slot++) {
    if (!(pressed & (slot === 0 ? Btn.Ability1 : Btn.Ability2))) continue;
    const id = k.def.abilities[slot];
    const def = ABILITIES[id];
    if (k.cds[slot] > 0 || k.stamina < def.stamina) continue;
    if (!canUseAbility(m, k, id)) continue;
    k.cds[slot] = def.cooldown;
    spend(k, def.stamina);
    if (id === 'bodkin') {
      k.bodkin = true;
      m.emit({ t: 'ability', k: k.id, ab: 9, x: k.x, y: k.y, z: k.z });
      return false; // instant, no action lock
    }
    k.act = Act.Ability;
    k.abilitySlot = slot;
    k.atk = slot;
    k.actT = 0;
    k.actDur = def.duration;
    k.abilityHits.length = 0;
    k.heavy = false;
    abilityStart(m, k, id);
    return true;
  }
  return false;
}

function actions(m: Match, k: Knight, dt: number, btn: number, pressed: number) {
  const w = k.weapon;
  k.pitch = clamp(k.input.pitch, -1.35, 1.35);
  const prevT = k.actT;
  k.actT += dt;
  // a jab pressed while the knight cannot act yet (recoiling, staggered, parried, kicking, winding
  // up another blow) is remembered and thrown the moment he is free
  if ((pressed & Btn.Thrust) && k.act !== Act.Idle && k.act !== Act.Block && k.act !== Act.Release && k.act !== Act.Recover && !(k.act === Act.Windup && k.atk === 3)) {
    k.bufferedAttack = 2; k.bufferT = 1.0;
  }
  switch (k.act) {
    case Act.Idle:
    case Act.Block: {
      if (k.act === Act.Block && !(btn & Btn.Block)) { k.act = Act.Idle; k.actT = 0; }
      // throw a blow remembered from a moment ago
      if (k.bufferedAttack && k.bufferT > 0 && !k.def.ranged) {
        const slot = k.bufferedAttack === 2 ? 3 : (k.comboTimer > 0 ? 1 - k.lastSlash : 0);
        startAttack(m, k, slot, false);
        break;
      }
      if (k.bufferedAttack === 2 && k.bufferT > 0 && k.def.ranged) { startAttack(m, k, 3, false); break; }
      if (tryAbility(m, k, pressed)) break;
      if ((pressed & Btn.Kick) && k.stamina >= 4) { startKick(k); break; }
      if (k.def.ranged) {
        if (pressed & Btn.Thrust) { startAttack(m, k, 3, false); break; }
        if (btn & Btn.Attack) { k.act = Act.Draw; k.actT = 0; k.draw = 0; k.drawHold = 0; break; }
      } else {
        if (pressed & Btn.Attack) { startAttack(m, k, k.comboTimer > 0 ? 1 - k.lastSlash : 0, false); break; }
        if (pressed & Btn.Thrust) { startAttack(m, k, 3, false); break; }
        if ((btn & Btn.Block) && w.blockArc > 0 && k.act !== Act.Block) { k.act = Act.Block; k.actT = 0; }
      }
      break;
    }
    case Act.Windup: {
      const a = w.attacks[k.atk];
      // only a continuous hold turns a blow heavy: further clicks while it winds up are ignored
      // (the swing completes) and simply queue the next blow
      if (!(btn & Btn.Attack)) k.attackHeld = false;
      if ((pressed & Btn.Attack) && !k.attackHeld) { k.bufferedAttack = 1; k.bufferT = 0.6; }
      if ((k.atk === 0 || k.atk === 1) && !k.heavy && k.attackHeld && (btn & Btn.Attack) && k.actT >= 0.17 && w.heavyChargeMax > 0) {
        const h = w.attacks[2];
        k.atk = 2;
        k.heavy = true;
        k.actDur = h.windup * attackSpeed(k);
        spend(k, h.stamina - a.stamina);
      }
      if ((pressed & Btn.Block) && k.feintCd <= 0 && w.blockArc > 0) { feint(k); break; }
      if (k.actT >= k.actDur) {
        if (k.heavy && (btn & Btn.Attack) && w.heavyChargeMax > 0) { k.act = Act.Charge; k.actT = 0; k.charge = 0; }
        else beginRelease(m, k);
      }
      break;
    }
    case Act.Charge: {
      k.charge += dt;
      if ((pressed & Btn.Block) && k.feintCd <= 0) { feint(k); break; }
      if (!(btn & Btn.Attack) || k.charge >= w.heavyChargeMax) beginRelease(m, k);
      break;
    }
    case Act.Release: {
      if (pressed & Btn.Attack) { k.bufferedAttack = 1; k.bufferT = 0.6; }
      if (pressed & Btn.Thrust) { k.bufferedAttack = 2; k.bufferT = 1.0; }
      // the transition waits until combat has swept the whole blade path
      if (k.relPrevT >= k.actDur - 1e-6) {
        const a = w.attacks[k.atk];
        k.act = Act.Recover; k.actT = 0; k.actDur = a.recover * attackSpeed(k);
      }
      break;
    }
    case Act.Recover: {
      if (pressed & Btn.Attack) { k.bufferedAttack = 1; k.bufferT = 0.6; }
      if (pressed & Btn.Thrust) { k.bufferedAttack = 2; k.bufferT = 1.0; }
      const canChain = k.actT >= k.actDur * (k.bufferedAttack === 2 ? 0.25 : 0.42);
      if (canChain && k.bufferedAttack && !k.def.ranged) {
        const slot = k.bufferedAttack === 2 ? 3 : (k.atk === 0 ? 1 : 0);
        k.combo++;
        startAttack(m, k, slot, true);
        break;
      }
      if (canChain && k.bufferedAttack === 2 && k.def.ranged) { startAttack(m, k, 3, true); break; }
      if (canChain && (btn & Btn.Block) && w.blockArc > 0) { k.act = Act.Block; k.actT = 0; break; }
      if (canChain && tryAbility(m, k, pressed)) break;
      if (canChain && (pressed & Btn.Kick)) { startKick(k); break; }
      if (k.actT >= k.actDur) { k.act = Act.Idle; k.actT = 0; k.comboTimer = 0.55; }
      break;
    }
    case Act.Draw: {
      k.draw = Math.min(1, k.actT / ARROW.drawTime);
      if (k.draw >= 1) k.drawHold += dt;
      if (pressed & Btn.Block) { k.act = Act.Idle; k.actT = 0; k.draw = 0; break; }
      if (tryAbility(m, k, pressed)) { k.draw = 0; break; }
      if (!(btn & Btn.Attack)) {
        if (k.draw >= 0.2) {
          looseArrow(m, k);
          k.act = Act.Loose; k.actT = 0; k.actDur = 0.34;
        } else { k.act = Act.Idle; k.actT = 0; }
        k.draw = 0;
      }
      break;
    }
    case Act.Kick: {
      if (prevT < KICK_HIT && k.actT >= KICK_HIT) resolveKick(m, k);
      if (k.actT >= k.actDur) { k.act = Act.Idle; k.actT = 0; }
      break;
    }
    case Act.Ability: {
      const id = k.def.abilities[k.abilitySlot];
      abilityTick(m, k, id, prevT, k.actT);
      if (k.act === Act.Ability && k.actT >= k.actDur) {
        abilityEnd(m, k, id);
        if (k.act === Act.Ability) { k.act = Act.Idle; k.actT = 0; }
      }
      break;
    }
    case Act.Knockdown: {
      k.knockT = Math.max(0, k.actDur - k.actT);
      if (k.actT >= k.actDur) { k.act = Act.Idle; k.actT = 0; k.knockT = 0; }
      break;
    }
    case Act.Stun:
      k.stunT = Math.max(0, k.actDur - k.actT);
      if (k.actT >= k.actDur) { k.act = Act.Idle; k.actT = 0; k.stunT = 0; }
      break;
    case Act.Stagger:
    case Act.Deflect:
    case Act.Parried:
    case Act.Feint:
    case Act.Loose:
      if (k.actT >= k.actDur) { k.act = Act.Idle; k.actT = 0; }
      break;
    default:
      break;
  }
}

function moveMult(k: Knight): number {
  switch (k.act) {
    case Act.Idle: return 1;
    case Act.Block: return 0.62;
    case Act.Windup: return k.weapon.attacks[k.atk].moveMult * (k.heavy ? 0.9 : 1);
    case Act.Charge: return 0.55;
    case Act.Release: return k.weapon.attacks[k.atk].moveMult * 0.85;
    case Act.Recover: return 0.8;
    case Act.Kick: return 0.35;
    case Act.Stagger: return 0.3;
    case Act.Deflect: return 0.55;
    case Act.Parried: return 0.35;
    case Act.Stun: case Act.Knockdown: case Act.Dead: return 0;
    case Act.Draw: return 0.5;
    case Act.Loose: return 0.65;
    case Act.Feint: return 0.85;
    case Act.Ability: return abilityMoveMult(k);
    default: return 1;
  }
}

const _p = { x: 0, y: 0, z: 0 };

/** Move one knight. Pure with respect to (world, knight, input) so clients can predict it. */
export function movement(world: StaticWorld, k: Knight, dt: number, live: boolean, pressed: number, m?: Match) {
  const inp = k.input;
  // facing
  let maxTurn = 18;
  if (k.act === Act.Release) maxTurn = 4.4;
  else if (k.act === Act.Stun || k.act === Act.Knockdown || k.act === Act.Stagger) maxTurn = k.act === Act.Stagger ? 3 : 0;
  else if (k.act === Act.Ability && k.def.abilities[k.abilitySlot] === 'charge') maxTurn = 1.7;
  else if (k.act === Act.Ability && k.def.abilities[k.abilitySlot] === 'whirlwind') maxTurn = 3;
  k.yaw = approachAngle(k.yaw, inp.yaw, maxTurn * dt);

  let mx = live ? inp.mx : 0, mz = live ? inp.mz : 0;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const canSprint = k.act === Act.Idle || (k.act === Act.Recover && k.actT > k.actDur * 0.5);
  k.sprinting = live && !!(inp.buttons & Btn.Sprint) && mz > 0.3 && k.stamina > 3 && canSprint && k.onGround;
  let speed = k.sprinting ? k.def.sprint : k.def.speed;
  speed *= (mz < -0.1 ? 0.72 : 1) * (Math.abs(mx) > Math.abs(mz) + 0.05 ? 0.88 : 1) * moveMult(k);
  const depth = world.waterDepth(k.x, k.z, k.y);
  if (depth > 0.35) speed *= 0.55;
  if (k.bulwarkT > 0) speed *= 0.85;
  if (k.hasteT > 0) speed *= 1.2;
  if (k.juggerT > 0) speed *= 1.25;
  const fx = -Math.sin(k.yaw), fz = -Math.cos(k.yaw);
  const rx = Math.cos(k.yaw), rz = -Math.sin(k.yaw);
  let dvx = (rx * mx + fx * mz) * speed;
  let dvz = (rz * mx + fz * mz) * speed;
  // attacks step into the blow
  if (k.act === Act.Release) {
    const a = k.weapon.attacks[k.atk];
    const u = k.actDur > 0 ? k.actT / k.actDur : 1;
    const env = Math.sin(Math.PI * clamp(u, 0, 1));
    dvx += fx * a.lunge * env * (k.heavy ? 1 + k.charge * 0.5 : 1);
    dvz += fz * a.lunge * env * (k.heavy ? 1 + k.charge * 0.5 : 1);
  }
  let overridden = false;
  if (k.act === Act.Ability && k.ovActive) { dvx = k.ovx; dvz = k.ovz; overridden = true; }
  const accel = overridden ? 60 : k.onGround ? (ml > 0.1 ? 30 : 34) : 4;
  k.vx = approach(k.vx, dvx, accel * dt);
  k.vz = approach(k.vz, dvz, accel * dt);
  // knockback impulse
  const pushDecay = Math.exp(-7 * dt);
  const tvx = k.vx + k.pushX, tvz = k.vz + k.pushZ;
  k.pushX *= pushDecay; k.pushZ *= pushDecay;
  if (Math.abs(k.pushX) < 0.01) k.pushX = 0;
  if (Math.abs(k.pushZ) < 0.01) k.pushZ = 0;

  // jump
  if (live && (pressed & Btn.Jump) && k.onGround && (k.act === Act.Idle || k.act === Act.Block || k.act === Act.Recover) && k.stamina >= 5) {
    k.vy = 5.3;
    k.onGround = false;
    spend(k, 5);
    m?.emit({ t: 'jump', k: k.id });
  }

  const ox = k.x, oy = k.y, oz = k.z;
  let nx = ox + tvx * dt, nz = oz + tvz * dt;
  k.vy -= GRAVITY * dt;
  let ny = oy + k.vy * dt;
  _p.x = nx; _p.y = Math.max(oy, ny); _p.z = nz;
  world.resolveCylinder(_p, k.radius, 1.8 * k.def.size.height);
  nx = _p.x; nz = _p.z;
  if (!stepOk(world, ox, oy, oz, nx, nz)) {
    if (stepOk(world, ox, oy, oz, nx, oz)) nz = oz;
    else if (stepOk(world, ox, oy, oz, ox, nz)) nx = ox;
    else { nx = ox; nz = oz; k.vx *= 0.5; k.vz *= 0.5; }
  }
  const b = world.bounds;
  nx = clamp(nx, b.minX + 0.5, b.maxX - 0.5);
  nz = clamp(nz, b.minZ + 0.5, b.maxZ - 0.5);
  const g = world.groundAt(nx, nz, Math.max(oy, ny));
  if (ny <= g) {
    ny = g;
    if (k.vy < 0) k.vy = 0;
    k.onGround = true;
  } else if (k.onGround && k.vy <= 0 && ny - g < 0.55) {
    ny = g; k.vy = 0;
  } else {
    k.onGround = false;
  }
  k.x = nx; k.y = ny; k.z = nz;
  k.moveSpeed = Math.hypot(nx - ox, nz - oz) / dt;
}

function stepOk(world: StaticWorld, ox: number, oy: number, oz: number, nx: number, nz: number): boolean {
  const g = world.groundAt(nx, nz, oy);
  if (!world.walkable(nx, nz, g)) return false;
  const climb = g - oy;
  if (climb > 0.62) return false;
  if (climb <= 0.002) return true;
  const t = world.terrain;
  // standing on a deck or ramp: no slope limit, small steps allowed
  if (world.platformTop(nx, nz, oy + 0.62) >= t.height(nx, nz) - 0.01) return climb <= 0.45;
  const dx = nx - ox, dz = nz - oz;
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) return true;
  const ux = dx / l, uz = dz / l;
  const slope = (t.height(nx + ux * 0.5, nz + uz * 0.5) - t.height(nx - ux * 0.5, nz - uz * 0.5));
  return slope <= 1.15;
}
