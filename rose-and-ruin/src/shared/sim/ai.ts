// Bot brains. Bots drive their knight through the same InputFrame a human produces, so
// every combat rule applies to them equally. Difficulty sets reaction time, guard skill,
// aim and tactical sense; each bot also gets a little personality jitter.
//
// Tactics grow with the level (Recruit keeps the plain brawler's mind):
//  Veteran   finishes wounded and reeling foes, punishes openings more often
//  Champion  minds his wind, flanks a foe who is busy with a comrade, cuts in under a slow heavy
//            blow, punishes a whiff, falls back on his friends when outnumbered, and the host sends
//            men where the fighting is hardest
//  Legend    fights as one host: shares a target without mobbing it, rescues hard-pressed archers
//            and wounded comrades, marches as a band, weighs every objective by what it needs,
//            saves rallying cries until the line is close, and baits swings out of reach

import { Act, Btn, type Difficulty } from '../types';
import { ABILITIES } from '../data/classes';
import { ARROW } from '../data/weapons';
import { Rng } from '../rng';
import { angleDiff, clamp, wrapAngle, yawTo } from '../math';
import type { Knight } from './knight';
import type { Match } from './match';

interface Skill { reaction: number; block: number; parry: number; think: number; turn: number; aim: number; ability: number; feint: number; tactics: number; punish: number }
const SKILL: readonly Skill[] = [
  { reaction: 0.32, block: 0.32, parry: 0.04, think: 0.26, turn: 5.0, aim: 1.9, ability: 0.3, feint: 0.0, tactics: 0, punish: 0.25 },
  { reaction: 0.24, block: 0.52, parry: 0.12, think: 0.18, turn: 7.0, aim: 1.3, ability: 0.5, feint: 0.04, tactics: 1, punish: 0.4 },
  { reaction: 0.19, block: 0.68, parry: 0.24, think: 0.12, turn: 9.0, aim: 0.9, ability: 0.7, feint: 0.09, tactics: 2, punish: 0.6 },
  { reaction: 0.14, block: 0.8, parry: 0.38, think: 0.08, turn: 12.0, aim: 0.6, ability: 0.9, feint: 0.14, tactics: 3, punish: 0.75 },
];

export class BotBrain {
  readonly rng: Rng;
  readonly skill: Skill;
  aggression: number;
  target = -1;
  retargetT = 0;
  thinkT = 0;
  path: number[] = [];
  pathIdx = 0;
  pathT = 0;
  pathTX = 0; pathTZ = 0;
  goalIdx = -1;
  goalT = 0;
  /** distance to the fighting ground last marched toward (pitched battle) */
  goalDist = 0;
  /** time spent at an empty fighting ground */
  idleAtGoal = 0;
  holdAttack = 0;
  holdBlock = 0;
  pressKick = false;
  pressThrust = false;
  pressAbility = -1;
  /** a quick light blow, now (Champion+ cutting in under a heavy) */
  pressQuick = false;
  strafe = 1;
  strafeT = 0;
  stuckT = 0;
  unstickT = 0;
  unstickX = 0; unstickZ = 0;
  /** enemy attack we are reacting to: attacker id, and the time we noticed it */
  threatId = -1;
  threatSeen = 0;
  threatDecided = false;
  threatBlock = false;
  threatParryAt = 0;
  targetBlockT = 0;
  drawGoal = 0.9;
  aimJx = 0; aimJy = 0; aimJz = 0;
  retreatT = 0;
  yaw = 0;
  lastX = 0; lastZ = 0;
  /** time left falling back toward comrades (Champion and above) */
  regroupT = 0;
  regroupCd = 0;

  /** `tactics` overrides the level's tactical sense (for tests); the level sets the rest */
  constructor(readonly k: Knight, difficulty: Difficulty, seed: number, tactics?: number) {
    this.rng = new Rng(Math.floor(seed * 4294967295));
    const base = SKILL[difficulty];
    const j = (v: number, f: number) => v * (1 + (this.rng.next() - 0.5) * f);
    this.skill = {
      reaction: j(base.reaction, 0.4), block: clamp(j(base.block, 0.35), 0, 0.95), parry: j(base.parry, 0.5),
      think: j(base.think, 0.3), turn: j(base.turn, 0.2), aim: j(base.aim, 0.4), ability: base.ability, feint: base.feint,
      tactics: tactics ?? base.tactics, punish: tactics !== undefined ? SKILL[clamp(tactics, 0, 3)].punish : base.punish,
    };
    this.aggression = this.rng.range(0.3, 1);
    this.strafe = this.rng.sign();
  }

  reset() {
    this.target = -1;
    this.path.length = 0;
    this.goalIdx = -1;
    this.holdAttack = this.holdBlock = 0;
    this.threatId = -1;
    this.retreatT = 0;
    this.regroupT = 0;
    this.yaw = this.k.yaw;
  }
}

/** How many bots of each house are set on each knight, counted once per tick (Legend focus). */
const focusCache = new WeakMap<Match, { tick: number; n: Int16Array }>();
function focusOn(m: Match, id: number): number {
  let c = focusCache.get(m);
  if (!c || c.n.length < m.knights.length) { c = { tick: -1, n: new Int16Array(m.knights.length + 8) }; focusCache.set(m, c); }
  if (c.tick !== m.tick) {
    c.tick = m.tick; c.n.fill(0);
    for (const br of m.brains.values()) if (br.target >= 0 && br.k.alive) c.n[br.target]++;
  }
  return c.n[id] ?? 0;
}
/** Is this foe busy with one of my comrades (facing him, close)? */
function engagedElsewhere(m: Match, me: Knight, e: Knight): Knight | null {
  let found: Knight | null = null;
  const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
  m.hash.query(e.x, e.z, 3.4, (a) => {
    if (found || a === me || !a.alive || a.team !== me.team) return;
    const dx = a.x - e.x, dz = a.z - e.z, d = Math.hypot(dx, dz) || 1;
    if ((dx * fx + dz * fz) / d > 0.6) found = a;
  });
  return found;
}

const reachOf = (k: Knight) => ((k.weapon.attacks[0].hitEnd ?? k.weapon.hitEnd) + 0.55) * k.def.size.height;
const _dir = { x: 0, z: 0 };

export function updateBot(m: Match, k: Knight, b: BotBrain) {
  const inp = k.input;
  inp.seq++;
  if (!k.alive) { inp.buttons = 0; inp.mx = inp.mz = 0; return; }
  if (m.phase !== 'live') {
    inp.buttons = 0; inp.mx = 0; inp.mz = 0; inp.yaw = k.yaw;
    b.yaw = k.yaw;
    return;
  }
  const dt = 1 / 60;
  b.retargetT -= dt; b.thinkT -= dt; b.pathT -= dt; b.strafeT -= dt; b.goalT -= dt; b.retreatT -= dt; b.regroupT -= dt; b.regroupCd -= dt;
  if (b.retargetT <= 0) { pickTarget(m, k, b); b.retargetT = 0.45 + b.rng.range(0, 0.35); }
  let t = b.target >= 0 ? m.knights[b.target] : null;
  if (t && (!t.alive || t.team === k.team)) { t = null; b.target = -1; b.retargetT = 0; }

  let buttons = 0;
  let wantX = 0, wantZ = 0; // desired world move direction (unnormalised)
  let faceYaw = b.yaw;
  let sprint = false;

  // ------------------------------------------------------------ movement intent
  if (t) {
    const dx = t.x - k.x, dz = t.z - k.z;
    const dist = Math.hypot(dx, dz);
    const toT = yawTo(k.x, k.z, t.x, t.z);
    if (k.def.ranged) {
      archerMove(m, k, b, t, dist, dx, dz);
      wantX = _dir.x; wantZ = _dir.z;
      faceYaw = toT;
    } else {
      const reach = reachOf(k);
      const ideal = reach * 0.78;
      if (dist > 7 || !m.nav.los(k.x, k.z, t.x, t.z)) {
        // travel toward the target
        if (followPath(m, k, b, t.x, t.z)) { wantX = _dir.x; wantZ = _dir.z; }
        faceYaw = dist < 9 ? toT : Math.atan2(-wantX, -wantZ);
        sprint = dist > 11 && k.stamina > 35;
      } else {
        faceYaw = toT;
        if (b.strafeT <= 0) { b.strafeT = b.rng.range(0.8, 2.4); if (b.rng.chance(0.45)) b.strafe = -b.strafe; }
        const nx = dx / (dist || 1), nz = dz / (dist || 1);
        let radial = (dist - ideal) * 1.4;
        if (b.retreatT > 0) radial = -1.2;
        // circle at weapon range, slower when close
        const tang = b.strafe * (dist < reach * 1.3 ? 0.55 : 0.2) * (0.5 + 0.5 * b.aggression);
        wantX = nx * radial + -nz * tang;
        wantZ = nz * radial + nx * tang;
        // spread out from allies crowding the same foe
        m.hash.query(k.x, k.z, 1.8, (o) => {
          if (o === k || !o.alive || o.team !== k.team) return;
          const ox = k.x - o.x, oz = k.z - o.z, d = Math.hypot(ox, oz) || 0.1;
          wantX += (ox / d) * (1.8 - d) * 0.9;
          wantZ += (oz / d) * (1.8 - d) * 0.9;
        });
        if (dist > reach * 1.1) sprint = dist > 5 && k.stamina > 50 && b.aggression > 0.6;
        const T = b.skill.tactics;
        // Champion+: a foe busy with a comrade is taken from the flank (a Legend goes for his back)
        if (T >= 2 && b.retreatT <= 0) {
          const ally = engagedElsewhere(m, k, t);
          if (ally) {
            const fx = -Math.sin(t.yaw), fz = -Math.cos(t.yaw);
            const side = (fx * (k.z - t.z) - fz * (k.x - t.x)) >= 0 ? 1 : -1;
            const ang = (T >= 3 ? 2.4 : 1.6) * side;
            const c = Math.cos(ang), sn = Math.sin(ang);
            const ox = fx * c - fz * sn, oz = fx * sn + fz * c;
            const px = t.x + ox * ideal, pz = t.z + oz * ideal;
            const dpx = px - k.x, dpz = pz - k.z, dp = Math.hypot(dpx, dpz);
            if (dp > 0.6) {
              // swing wide of the foe's point on the way round
              const awayX = k.x - t.x, awayZ = k.z - t.z, ad = Math.hypot(awayX, awayZ) || 1;
              const push = dist < reach * 0.9 ? 0.6 : 0;
              wantX = dpx / dp + (awayX / ad) * push; wantZ = dpz / dp + (awayZ / ad) * push;
              if (dp > 3 && k.stamina > 40) sprint = true;
            }
          }
        }
        // Champion+: hard pressed and alone, fall back on the nearest comrades
        if (T >= 2 && b.regroupCd <= 0) {
          b.regroupCd = 0.5;
          const foes = countEnemies(m, k, 6);
          if (foes >= 3 && k.hp < k.def.hp * (T >= 3 ? 0.8 : 0.6)) {
            let friends = 0;
            m.hash.query(k.x, k.z, 6, (o) => { if (o !== k && o.alive && o.team === k.team) friends++; });
            if (foes >= friends + 3) b.regroupT = 1.6;
          }
        }
        if (T >= 2 && b.regroupT > 0) {
          let best: Knight | null = null, bd = 30 * 30;
          m.hash.query(k.x, k.z, 30, (o) => {
            if (o === k || !o.alive || o.team !== k.team) return;
            const d2 = (o.x - k.x) ** 2 + (o.z - k.z) ** 2;
            if (d2 > 36 && d2 < bd) { bd = d2; best = o; }
          });
          const f = best as Knight | null;
          if (f) { wantX = f.x - k.x; wantZ = f.z - k.z; sprint = k.stamina > 25; faceYaw = dist < 4 ? toT : Math.atan2(-wantX, -wantZ); }
          else b.regroupT = 0;
        }
      }
    }
  } else {
    // no foe in sight: march to the objective or the front (shared flow fields), then
    // spread out around it on arrival
    const goal = pickGoal(m, k, b);
    if (goal) {
      const [gx, gz, ox, oz] = goal;
      const field = m.nav.field(gx, gz);
      const dg = Math.hypot(gx - k.x, gz - k.z);
      b.goalDist = m.settings.mode === 'battle' ? dg : 0;
      if (dg > 10 && field && m.nav.flowDir(field, k.x, k.z, _dir)) { wantX = _dir.x; wantZ = _dir.z; }
      else if (dg > 10) { wantX = gx - k.x; wantZ = gz - k.z; }
      else {
        const px = gx + ox, pz = gz + oz;
        const dp = Math.hypot(px - k.x, pz - k.z);
        if (dp > 1.5 && m.nav.los(k.x, k.z, px, pz)) { wantX = px - k.x; wantZ = pz - k.z; }
        else if (dp > 1.5 && field && m.nav.flowDir(field, k.x, k.z, _dir)) { wantX = _dir.x; wantZ = _dir.z; }
        else { wantX = Math.sin(m.time * 0.7 + k.id) * 0.3; wantZ = Math.cos(m.time * 0.6 + k.id * 1.7) * 0.3; }
        // nobody to fight here: after a while move on to another ground
        if (!m.objectives.length && (b.idleAtGoal += dt) > 7) { b.idleAtGoal = 0; b.goalT = 0; }
      }
      sprint = dg > 25 && k.stamina > 60;
      // Legend: a band marches together; one who has outstripped his fellows checks his pace
      if (b.skill.tactics >= 3 && m.settings.mode === 'battle' && dg > 40) {
        let near = 0, behind = false;
        m.hash.query(k.x, k.z, 30, (o) => {
          if (o === k || !o.alive || o.team !== k.team) return;
          const d2 = (o.x - k.x) ** 2 + (o.z - k.z) ** 2;
          if (d2 < 64) near++;
          else if (Math.hypot(gx - o.x, gz - o.z) > dg + 6) behind = true;
        });
        if (near === 0 && behind) { wantX *= 0.3; wantZ *= 0.3; sprint = false; }
      }
      if (Math.hypot(wantX, wantZ) > 0.1) faceYaw = Math.atan2(-wantX, -wantZ);
    }
  }

  // unstick
  const moved = Math.hypot(k.x - b.lastX, k.z - b.lastZ);
  b.lastX = k.x; b.lastZ = k.z;
  if (Math.hypot(wantX, wantZ) > 0.3 && moved < 0.008 && k.act !== Act.Block) b.stuckT += dt; else b.stuckT = Math.max(0, b.stuckT - dt * 2);
  if (b.stuckT > 0.8) {
    b.stuckT = 0;
    b.unstickT = 0.7;
    const a = b.rng.range(0, Math.PI * 2);
    b.unstickX = Math.cos(a); b.unstickZ = Math.sin(a);
    b.path.length = 0; b.pathT = 0;
  }
  if (b.unstickT > 0) { b.unstickT -= dt; wantX = b.unstickX; wantZ = b.unstickZ; }

  // ------------------------------------------------------------ facing
  const turn = b.skill.turn * dt;
  b.yaw = wrapAngle(b.yaw + clamp(angleDiff(b.yaw, faceYaw), -turn, turn));
  inp.yaw = b.yaw;

  // ------------------------------------------------------------ combat decisions
  if (t) {
    if (k.def.ranged) buttons |= archerCombat(m, k, b, t);
    else buttons |= meleeCombat(m, k, b, t);
  } else {
    b.holdAttack = 0;
    b.holdBlock = 0;
    inp.pitch = 0;
  }

  // ------------------------------------------------------------ to local input
  const wl = Math.hypot(wantX, wantZ);
  if (wl > 0.05) {
    const s = Math.min(1, wl);
    const ux = wantX / wl * s, uz = wantZ / wl * s;
    const fx = -Math.sin(k.yaw), fz = -Math.cos(k.yaw), rx = Math.cos(k.yaw), rz = -Math.sin(k.yaw);
    inp.mz = ux * fx + uz * fz;
    inp.mx = ux * rx + uz * rz;
  } else { inp.mx = 0; inp.mz = 0; }
  if (sprint && inp.mz > 0.5) buttons |= Btn.Sprint;
  inp.buttons = buttons;
}

function pickTarget(m: Match, k: Knight, b: BotBrain) {
  // a band marching to a distant fighting ground keeps its order and only turns on foes that
  // come close (or the one it is already fighting), so the battle spreads over the field
  const cur = b.target;
  const marching = b.goalDist > 35 && m.phaseT < 1e9;
  const range = k.def.ranged ? (marching ? 36 : 80) : (marching ? (cur >= 0 ? 22 : 13) : 42);
  let best = -1, bestScore = Infinity;
  m.hash.query(k.x, k.z, range, (e) => {
    if (!e.alive || e.team === k.team) return;
    const d = Math.hypot(e.x - k.x, e.z - k.z);
    if (d > range) return;
    let score = d;
    // attackers aimed at me come first
    if ((e.act === Act.Windup || e.act === Act.Release || e.act === Act.Charge) && d < 4) score -= 6;
    score -= (1 - e.hp / e.def.hp) * 4;
    // run down archers loosing nearby
    if (e.def.ranged && !k.def.ranged && d < 26 && (e.act === Act.Draw || e.act === Act.Loose)) score -= 7;
    // crowding: how many allies already fight this foe
    let crowd = 0;
    m.hash.query(e.x, e.z, 2.6, (o) => { if (o.alive && o.team === k.team && o !== k) crowd++; });
    score += Math.max(0, crowd - 1) * 5;
    if (e.id === cur) score -= 5;
    const T = b.skill.tactics;
    if (T >= 1) {
      // finish the wounded and the reeling
      score -= (1 - e.hp / e.def.hp) * 4;
      if (d < 7 && (e.stunT > 0 || e.knockT > 0 || e.act === Act.Stagger)) score -= 4;
    }
    if (T >= 2 && !k.def.ranged && d < 10 && engagedElsewhere(m, k, e)) score -= 4; // his back is to me
    if (T >= 2 && k.def.ranged) {
      if (e.def.ranged) score -= 6; // silence their bows first
      if (e.shield && Math.abs(angleDiff(e.yaw, yawTo(e.x, e.z, k.x, k.z))) < 1.1) score += 6; // a raised shield takes the arrow
      if (m.settings.friendlyFire && crowd > 0) score += 15;
    }
    if (T >= 3) {
      // the host shares its targets: join one or two comrades, never a mob
      const f = focusOn(m, e.id) - (e.id === cur ? 1 : 0);
      if (!k.def.ranged) score += f >= 1 && f <= 2 ? -4 : f >= 3 ? 6 : 0;
      // rescue: a foe on a comrade archer or a badly wounded comrade is dealt with first
      if (!k.def.ranged && d < 16) {
        let ward = false;
        m.hash.query(e.x, e.z, 3.2, (o) => { if (!ward && o !== k && o.alive && o.team === k.team && (o.def.ranged || o.hp < o.def.hp * 0.35)) ward = true; });
        if (ward) score -= 6;
      }
    }
    if (d > 12 && !m.nav.los(k.x, k.z, e.x, e.z)) score += 14;
    if (k.def.ranged && !m.world.los(k.x, k.y + 1.5, k.z, e.x, e.y + 1.3, e.z)) score += 60;
    if (m.nav.component(e.x, e.z) !== m.nav.component(k.x, k.z) && !k.def.ranged) score += 80;
    if (score < bestScore) { bestScore = score; best = e.id; }
  });
  b.target = best;
}

/** Goal point (shared by many bots, so its flow field is cached) plus this bot's personal offset. */
function pickGoal(m: Match, k: Knight, b: BotBrain): [number, number, number, number] | null {
  // late in a fight with few foes left (or last stand), hunt the nearest enemy anywhere
  if (m.settings.mode === 'laststand' || m.settings.mode === 'duel' || m.phaseT > 45) {
    let alive = 0, best: Knight | null = null, bd = Infinity;
    for (const e of m.knights) {
      if (!e.alive || e.team === k.team) continue;
      alive++;
      const d = (e.x - k.x) ** 2 + (e.z - k.z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    if (best && (m.settings.mode === 'laststand' || m.settings.mode === 'duel' || alive <= 6)) {
      // snap to a coarse grid so bots chasing the same foe share fields
      return [Math.round(best.x / 8) * 8, Math.round(best.z / 8) * 8, 0, 0];
    }
  }
  if (m.objectives.length) {
    if (b.goalIdx < 0 || b.goalT <= 0 || (m.objectives[b.goalIdx].owner === k.team && !m.objectives[b.goalIdx].contested && b.rng.chance(0.02))) {
      // weigh objectives: not ours first, closer first, a few defenders stay
      let best = 0, bs = Infinity;
      const T = b.skill.tactics;
      m.objectives.forEach((o, i) => {
        const d = Math.hypot(o.def.x - k.x, o.def.z - k.z);
        let s = d + b.rng.range(0, T >= 3 ? 15 : 40);
        if (T >= 3) {
          // Legend: weigh each objective by what it needs: foes on it against comrades bound there
          let foes = 0, coming = 0;
          for (const e of m.knights) if (e.alive && e.team !== k.team && (e.x - o.def.x) ** 2 + (e.z - o.def.z) ** 2 < (o.def.r + 14) ** 2) foes++;
          for (const br of m.brains.values()) if (br !== b && br.k.team === k.team && br.k.alive && br.goalIdx === i) coming++;
          const need = foes * 1.3 + (o.owner !== k.team ? 3 : 0) + (o.contested ? 4 : 0) - coming;
          s = d * 0.6 + b.rng.range(0, 15) - need * 12 + (o.owner === k.team && !o.contested && foes === 0 ? 70 : 0);
        } else if (o.owner === k.team) s += o.contested ? -10 : 70;
        else if (o.owner >= 0) s -= 10;
        if (s < bs) { bs = s; best = i; }
      });
      b.goalIdx = best;
      b.goalT = b.rng.range(8, 16);
    }
    const o = m.objectives[b.goalIdx].def;
    return [o.x, o.z, Math.sin(k.id * 2.4) * o.r * 0.55, Math.cos(k.id * 1.7) * o.r * 0.55];
  }
  const rally = m.map.rally;
  if (!rally.length) return null;
  if (b.goalIdx < 0 || b.goalIdx >= rally.length || b.goalT <= 0) {
    // lean toward the enemy's half: pick among the points nearest the enemy's spawn
    const es = m.map.spawns[1 - k.team][0];
    // each host is split into bands of five, and band n of both hosts is sent to the same
    // fighting ground, so the battle spreads over the whole field and every ground sees a fight
    let rank = 0;
    for (const o of m.knights) if (o.team === k.team && o.id < k.id) rank++;
    const band = Math.floor(rank / 5);
    const T = b.skill.tactics;
    if (b.rng.chance(T >= 3 ? 0.15 : T >= 2 ? 0.5 : 0.75)) {
      // the bands' grounds rotate every two minutes, the same for both hosts
      const epoch = Math.floor(m.time / 120);
      b.goalIdx = (band * 3 + epoch * 5 + 1) % rally.length;
    } else {
      // otherwise go where the foe is: grounds he holds in strength draw the most help
      let bi = 0, bs = Infinity;
      rally.forEach((p, i) => {
        let foes = 0, friends = 0;
        for (const o of m.knights) {
          if (!o.alive || o === k || (o.x - p[0]) ** 2 + (o.z - p[1]) ** 2 > 900) continue;
          if (o.team === k.team) friends++; else foes++;
        }
        // a Legend host also counts the comrades already on their way there
        let coming = 0;
        if (T >= 3) for (const br of m.brains.values()) if (br !== b && br.k.team === k.team && br.k.alive && br.goalIdx === i) coming++;
        const sc = Math.hypot(p[0] - k.x, p[1] - k.z) * 0.35 + Math.hypot(p[0] - es.x, p[1] - es.z) * 0.15
          - 4 * foes - 12 * Math.max(0, foes - friends - coming) + (foes === 0 ? 20 : 0) + coming * (T >= 3 ? 2 : 0) + b.rng.range(0, T >= 3 ? 25 : T >= 2 ? 50 : 80);
        if (sc < bs) { bs = sc; bi = i; }
      });
      b.goalIdx = bi;
    }
    b.goalT = b.rng.range(18, 30);
  }
  const p = rally[b.goalIdx];
  return [p[0], p[1], Math.sin(k.id * 2.4) * 6, Math.cos(k.id * 1.7) * 6];
}

/** Set _dir to the direction to walk toward (tx,tz), using LOS or A*. */
function followPath(m: Match, k: Knight, b: BotBrain, tx: number, tz: number): boolean {
  if (m.nav.los(k.x, k.z, tx, tz)) {
    _dir.x = tx - k.x; _dir.z = tz - k.z;
    const l = Math.hypot(_dir.x, _dir.z) || 1; _dir.x /= l; _dir.z /= l;
    b.path.length = 0;
    return true;
  }
  const moved = Math.hypot(tx - b.pathTX, tz - b.pathTZ);
  if ((b.pathT <= 0 || moved > 6 || b.path.length === 0) && m.aiBudget > 0) {
    m.aiBudget--;
    b.pathT = b.rng.range(1.2, 2.2);
    b.pathTX = tx; b.pathTZ = tz;
    if (m.nav.findPath(k.x, k.z, tx, tz, b.path, 20000)) b.pathIdx = 0;
    else b.path.length = 0;
  }
  while (b.path.length && b.pathIdx < b.path.length / 2) {
    const px = b.path[b.pathIdx * 2], pz = b.path[b.pathIdx * 2 + 1];
    const d = Math.hypot(px - k.x, pz - k.z);
    if (d < 1.2 && b.pathIdx < b.path.length / 2 - 1) { b.pathIdx++; continue; }
    _dir.x = (px - k.x) / (d || 1); _dir.z = (pz - k.z) / (d || 1);
    return true;
  }
  // no path yet: head straight for it
  _dir.x = tx - k.x; _dir.z = tz - k.z;
  const l = Math.hypot(_dir.x, _dir.z) || 1; _dir.x /= l; _dir.z /= l;
  return true;
}

function threatFrom(m: Match, k: Knight, b: BotBrain): Knight | null {
  // the most immediate enemy attack aimed at this bot
  let best: Knight | null = null, bd = 9;
  m.hash.query(k.x, k.z, 4.2, (e) => {
    if (!e.alive || e.team === k.team) return;
    if (e.act !== Act.Windup && e.act !== Act.Charge && e.act !== Act.Release && !(e.act === Act.Ability && (e.def.abilities[e.abilitySlot] === 'lunge' || e.def.abilities[e.abilitySlot] === 'whirlwind'))) return;
    const d = Math.hypot(e.x - k.x, e.z - k.z);
    if (d > reachOf(e) + 0.8) return;
    if (Math.abs(angleDiff(e.yaw, yawTo(e.x, e.z, k.x, k.z))) > 0.9) return;
    if (d < bd) { bd = d; best = e; }
  });
  void b;
  return best;
}

function meleeCombat(m: Match, k: Knight, b: BotBrain, t: Knight): number {
  let buttons = 0;
  const dt = 1 / 60;
  const dist = Math.hypot(t.x - k.x, t.z - k.z);
  const reach = reachOf(k);
  const facingErr = Math.abs(angleDiff(k.yaw, yawTo(k.x, k.z, t.x, t.z)));
  const S = b.skill;
  // aim pitch at the target's chest (useful on slopes and against fallen foes)
  const dy = (t.y + (t.knockT > 0 ? 0.3 : 1.25)) - (k.y + 1.4);
  k.input.pitch = clamp(Math.atan2(dy, Math.max(0.5, dist)), -0.9, 0.7);

  // --- defence: react to an incoming blow
  const threat = threatFrom(m, k, b);
  if (threat) {
    if (b.threatId !== threat.id || threat.act === Act.Windup && threat.actT < 0.05) {
      b.threatId = threat.id; b.threatSeen = m.time; b.threatDecided = false;
    }
    if (!b.threatDecided && m.time - b.threatSeen >= S.reaction) {
      b.threatDecided = true;
      const canBlock = k.blockArc > 0 && k.stamina > 8;
      const shieldBonus = k.shield ? (k.shield.id === 'buckler' ? 0.05 : 0.15) : 0;
      const committed = (k.act === Act.Windup && k.actT > k.actDur * 0.45) || k.act === Act.Release || k.act === Act.Charge;
      b.threatBlock = canBlock && !committed && b.rng.chance(clamp(S.block + shieldBonus, 0, 0.97));
      // a skilled bot waits to raise the guard at the last instant for a parry
      b.threatParryAt = b.rng.chance(S.parry) ? Math.max(0, remainingWindup(threat) - 0.1) : 0;
      // Legend: a blow begun at the edge of its reach is slipped by stepping back, then punished
      if (S.tactics >= 3 && Math.hypot(threat.x - k.x, threat.z - k.z) > reachOf(threat) - 0.75 && remainingWindup(threat) > 0.25 && b.rng.chance(0.4)) {
        b.threatBlock = false; b.retreatT = 0.45;
      }
      // Champion+: cut in under a slow heavy blow with a quick one
      else if (S.tactics >= 2 && threat.heavy && Math.hypot(threat.x - k.x, threat.z - k.z) <= reach && (k.act === Act.Idle || k.act === Act.Block)
        && remainingWindup(threat) > k.weapon.attacks[0].windup / k.def.attackSpeed + 0.1 && k.stamina > 10 && b.rng.chance(0.5)) {
        b.threatBlock = false; b.holdAttack = 0; b.holdBlock = 0;
        if (k.weapon.attacks[3] && b.rng.chance(0.5)) b.pressThrust = true; else b.pressQuick = true;
      }
      if (!b.threatBlock && k.def.abilities.includes('dash') && b.rng.chance(0.35 * S.ability)) b.pressAbility = k.def.abilities.indexOf('dash');
      if (b.threatBlock) b.holdAttack = 0;
    }
    if (b.threatDecided && b.threatBlock) {
      if (b.threatParryAt > 0) b.threatParryAt -= dt;
      else b.holdBlock = 0.25;
    }
  } else {
    b.threatId = -1;
  }

  if (b.holdBlock > 0) {
    b.holdBlock -= dt;
    if (k.act === Act.Idle || k.act === Act.Block || k.act === Act.Recover) buttons |= Btn.Block;
    // feint/cancel our own wind-up to block
    if (k.act === Act.Windup || k.act === Act.Charge) buttons |= Btn.Block;
  }

  // track how long the target has turtled
  if (t.act === Act.Block) b.targetBlockT += dt; else b.targetBlockT = 0;
  // the foe just bounced off our guard or was parried: punish it
  const opening = t.act === Act.Deflect || t.act === Act.Parried || t.act === Act.Stagger || t.act === Act.Stun || t.knockT > 0
    || (S.tactics >= 2 && t.act === Act.Recover && t.actT < t.actDur * 0.6); // a whiffed blow leaves him open
  if (opening && dist <= reach + 0.2 && (k.act === Act.Idle || k.act === Act.Block) && b.holdBlock <= 0.05) {
    if (b.rng.chance(S.punish)) { buttons |= Btn.Attack; b.thinkT = S.think; return buttons; }
  }

  // --- held attack (heavy charge) in progress
  if (b.holdAttack > 0) {
    b.holdAttack -= dt;
    if (!(buttons & Btn.Block)) buttons |= Btn.Attack;
    // skilled feint against a blocker
    if ((k.act === Act.Windup || k.act === Act.Charge) && t.act === Act.Block && b.rng.chance(S.feint * dt * 6)) { buttons |= Btn.Block; b.holdAttack = 0; }
  }

  if (b.pressKick) { buttons |= Btn.Kick; b.pressKick = false; }
  if (b.pressThrust) { buttons |= Btn.Thrust; b.pressThrust = false; }
  if (b.pressQuick && (k.act === Act.Idle || k.act === Act.Block)) { buttons = (buttons & ~Btn.Block) | Btn.Attack; b.pressQuick = false; }
  else if (b.pressQuick && k.act !== Act.Recover) b.pressQuick = false;
  if (b.pressAbility >= 0) { buttons |= b.pressAbility === 0 ? Btn.Ability1 : Btn.Ability2; b.pressAbility = -1; }

  if (b.thinkT > 0) return buttons;
  b.thinkT = S.think * b.rng.range(0.7, 1.3);
  const free = k.act === Act.Idle || k.act === Act.Block || (k.act === Act.Recover && k.actT > k.actDur * 0.45);
  if (!free || b.holdBlock > 0.05) return buttons;

  // low health and outnumbered: step back for a moment
  if (k.hp < k.def.hp * 0.3 && b.retreatT <= -3 && b.rng.chance(0.3 * (1 - b.aggression))) b.retreatT = 1.2;

  // --- abilities
  if (tryBotAbility(m, k, b, t, dist)) return buttons;

  // Champion+: winded, he keeps his guard up and steps off to get his breath back
  if (S.tactics >= 2 && k.stamina < 22 && t.act !== Act.Stun && t.knockT <= 0) {
    if (k.blockArc > 0 && dist < reach * 1.4) b.holdBlock = b.rng.range(0.3, 0.6);
    else b.retreatT = 0.5;
    return buttons;
  }

  // --- guard stance: a cautious fighter raises his guard while sizing the foe up
  if (dist <= reach * 1.35 && k.blockArc > 0 && t.act !== Act.Block && b.rng.chance(0.22 * (1.2 - b.aggression)) && k.stamina > 30) {
    b.holdBlock = b.rng.range(0.25, 0.7);
    return buttons;
  }
  // --- offence
  if (dist <= reach + 0.15 && facingErr < 0.45 && k.stamina > 6) {
    if (b.targetBlockT > 0.35 && b.rng.chance(0.55)) { b.pressKick = true; return buttons; }
    // Champion+: against a guard, mix in feinted heavies and thrusts rather than battering it
    if (S.tactics >= 2 && t.act === Act.Block && b.targetBlockT > 0.15 && b.rng.chance(0.5)) {
      if (b.rng.chance(0.5) && k.stamina > 30) b.holdAttack = k.weapon.attacks[2].windup / k.def.attackSpeed + 0.3;
      else b.pressThrust = true;
      return buttons;
    }
    const r = b.rng.next();
    const polearm = k.weapon.visual === 'halberd' || k.weapon.visual === 'poleaxe' || k.weapon.visual === 'spear';
    if (r < (polearm ? 0.3 : 0.22)) b.pressThrust = true;
    else if (r < (polearm ? 0.5 : 0.44) && k.stamina > (S.tactics >= 3 ? 45 : 30)) b.holdAttack = k.weapon.attacks[2].windup / k.def.attackSpeed + b.rng.range(0.05, 0.45);
    else { buttons |= Btn.Attack; b.holdAttack = 0; }
  } else if (dist < reach * 0.55 && b.rng.chance(0.25)) {
    b.pressKick = true; // too close: shove them off
  }
  return buttons;
}

function remainingWindup(e: Knight): number {
  if (e.act === Act.Windup) return Math.max(0, e.actDur - e.actT) + (e.heavy ? 0.2 : 0);
  if (e.act === Act.Charge) return 0.15;
  return 0;
}

function countEnemies(m: Match, k: Knight, r: number, frontOnly = false): number {
  let n = 0;
  const fx = -Math.sin(k.yaw), fz = -Math.cos(k.yaw);
  m.hash.query(k.x, k.z, r, (e) => {
    if (!e.alive || e.team === k.team) return;
    const dx = e.x - k.x, dz = e.z - k.z, d = Math.hypot(dx, dz);
    if (d > r) return;
    if (frontOnly && d > 0.1 && (dx * fx + dz * fz) / d < 0.2) return;
    n++;
  });
  return n;
}

function tryBotAbility(m: Match, k: Knight, b: BotBrain, t: Knight, dist: number): boolean {
  const p = b.skill.ability;
  for (let slot = 0; slot < 2; slot++) {
    if (k.cds[slot] > 0) continue;
    const id = k.def.abilities[slot];
    if (k.stamina < ABILITIES[id].stamina + 4) continue;
    let use = false;
    switch (id) {
      case 'shield_bash': use = dist < 1.8 && (t.act === Act.Block || b.rng.chance(0.2)); break;
      case 'rally': {
        let hurt = 0;
        for (const a of m.knights) if (a.alive && a.team === k.team && a.hp < a.def.hp * 0.6 && (a.x - k.x) ** 2 + (a.z - k.z) ** 2 < 144) hurt++;
        use = k.hp < k.def.hp * 0.5 || hurt >= 3;
        break;
      }
      case 'whirlwind': use = countEnemies(m, k, 2.6) >= 2 || (dist < 2.4 && b.rng.chance(0.08)); break;
      case 'charge': use = dist > 5 && dist < 14 && m.nav.los(k.x, k.z, t.x, t.z) && Math.abs(angleDiff(k.yaw, yawTo(k.x, k.z, t.x, t.z))) < 0.25 && b.rng.chance(0.35); break;
      case 'lunge': use = dist > 2.0 && dist < 2.9 && b.rng.chance(0.3); break;
      case 'sweep': use = countEnemies(m, k, 2.9, true) >= 2 || (dist < 2.6 && b.rng.chance(0.1)); break;
      case 'earthshaker': use = countEnemies(m, k, 3.6) >= 2; break;
      case 'bulwark': use = k.hp < k.def.hp * 0.6 && countEnemies(m, k, 5) >= 2; break;
      case 'dash': use = dist > 3 && dist < 5.5 && b.rng.chance(0.15); break;
      case 'bloodletting': use = dist < 4; break;
      case 'billhook': use = dist > 2.2 && dist < 4.0 && Math.abs(angleDiff(k.yaw, yawTo(k.x, k.z, t.x, t.z))) < 0.35 && b.rng.chance(0.4); break;
      case 'holdline': use = countEnemies(m, k, 6) >= 2 || k.hp < k.def.hp * 0.55; break;
      case 'halfsword': use = dist < 4 && t.def.armor[0] >= 0.3; break;
      case 'warcry': use = countEnemies(m, k, 6.5) >= 2 || (dist < 3 && t.act === Act.Windup && b.rng.chance(0.4)); break;
      case 'execute': use = dist < 4 && t.hp < t.def.hp * 0.75; break;
      case 'murderstroke': use = dist < 3.2 && t.def.armor[0] >= 0.3; break;
      case 'disarm': use = dist < 2.4 && !t.shield && (t.act === Act.Windup || t.act === Act.Block || b.rng.chance(0.25)); break;
      case 'throw': use = dist < 1.7 && b.rng.chance(0.5); break;
      case 'misericorde': use = dist < 2.2 && (t.knockT > 0 || t.stunT > 0 || b.rng.chance(0.1)); break;
      case 'bindwounds': use = k.hp < k.def.hp * 0.6 || k.bleedStacks > 0; break;
      case 'benediction': use = countEnemies(m, k, 8) >= 2 || k.stamina < 40; break;
      case 'brace': use = dist > 3.2 && dist < 8 && (t.act === Act.Ability || Math.hypot(t.vx, t.vz) > 3) && b.rng.chance(0.5); break;
      case 'pushofpike': use = dist > 1.4 && dist < 3.4 && (countEnemies(m, k, 3.6) >= 2 || b.rng.chance(0.25)); break;
      case 'hamstring': use = dist < 2.5 && t.slowT <= 0 && b.rng.chance(0.4); break;
      case 'shieldbreaker': use = dist < 4 && (!!t.shield || t.act === Act.Block); break;
      case 'juggernaut': use = countEnemies(m, k, 8) >= 3 || (t.def.ranged && dist > 3 && dist < 22) || (dist > 3 && dist < 9 && b.rng.chance(0.15)); break;
      default: break;
    }
    // Legend: cries and blessings that serve the whole line wait until the line is close by
    if (use && b.skill.tactics >= 3 && (id === 'rally' || id === 'benediction' || id === 'holdline' || id === 'warcry') && k.hp > k.def.hp * 0.35) {
      let near = 0;
      m.hash.query(k.x, k.z, 9, (a) => { if (a !== k && a.alive && a.team === k.team) near++; });
      if (near < 2) use = false;
    }
    if (use && b.rng.chance(clamp(p, 0, 1))) { b.pressAbility = slot; return true; }
  }
  return false;
}

// ------------------------------------------------------------------- archers

function archerMove(m: Match, k: Knight, b: BotBrain, t: Knight, dist: number, dx: number, dz: number) {
  // nearest threat of any kind
  let near = 99, nx = 0, nz = 0;
  m.hash.query(k.x, k.z, 12, (e) => {
    if (!e.alive || e.team === k.team) return;
    const d = Math.hypot(e.x - k.x, e.z - k.z);
    if (d < near) { near = d; nx = e.x - k.x; nz = e.z - k.z; }
  });
  const hasLos = m.world.los(k.x, k.y + 1.5, k.z, t.x, t.y + 1.3, t.z);
  if (near < 9 && near > 2.2) {
    // back off from melee
    _dir.x = -nx; _dir.z = -nz;
    const l = Math.hypot(_dir.x, _dir.z) || 1; _dir.x /= l; _dir.z /= l;
    // but not into a wall: sidestep if the retreat is blocked
    if (!m.nav.isWalkable(k.x + _dir.x * 2, k.z + _dir.z * 2)) { const tx = _dir.x; _dir.x = -_dir.z; _dir.z = tx; }
    return;
  }
  if (!hasLos || dist > 62) {
    if (followPath(m, k, b, t.x, t.z)) return;
  } else if (dist < 16) {
    _dir.x = -dx / dist; _dir.z = -dz / dist;
    return;
  }
  // in a good spot: small sidesteps so we are not a statue
  if (b.strafeT <= 0) { b.strafeT = b.rng.range(1.5, 3.5); b.strafe = b.rng.chance(0.5) ? -b.strafe : b.strafe; }
  const l = dist || 1;
  _dir.x = (-dz / l) * 0.25 * b.strafe;
  _dir.z = (dx / l) * 0.25 * b.strafe;
}

function archerCombat(m: Match, k: Knight, b: BotBrain, t: Knight): number {
  let buttons = 0;
  const dist = Math.hypot(t.x - k.x, t.z - k.z);
  // close quarters: stab and shove
  if (dist < 2.2) {
    if (b.thinkT <= 0) {
      b.thinkT = b.skill.think;
      if (k.act === Act.Idle) { if (b.rng.chance(0.3)) b.pressKick = true; else b.pressThrust = true; }
    }
    if (b.pressKick) { buttons |= Btn.Kick; b.pressKick = false; }
    if (b.pressThrust) { buttons |= Btn.Thrust; b.pressThrust = false; }
    k.input.pitch = 0;
    k.input.aimX = undefined; k.input.aimY = undefined; k.input.aimZ = undefined;
    return buttons;
  }
  const losOk = m.world.los(k.x, k.y + 1.5, k.z, t.x, t.y + 1.3, t.z);
  // abilities
  if (b.thinkT <= 0) {
    b.thinkT = b.skill.think * 1.5;
    for (let slot = 0; slot < 2; slot++) {
      if (k.cds[slot] > 0) continue;
      const id = k.def.abilities[slot];
      if (id === 'volley' && dist > 18 && dist < 75 && b.rng.chance(0.5 * b.skill.ability)) {
        let cluster = 0;
        m.hash.query(t.x, t.z, 7, (e) => { if (e.alive && e.team !== k.team) cluster++; });
        let friends = 0;
        m.hash.query(t.x, t.z, 7, (e) => { if (e.alive && e.team === k.team) friends++; });
        if (cluster >= 4 && friends <= cluster / 3) {
          k.input.aimX = t.x; k.input.aimY = t.y; k.input.aimZ = t.z;
          b.pressAbility = slot;
        }
      }
      if (id === 'bodkin' && !k.bodkin && (t.def.armor[2] > 0.25 || !!t.shield?.arrows) && b.rng.chance(0.6)) b.pressAbility = slot;
    }
  }
  if (b.pressAbility >= 0) { buttons |= b.pressAbility === 0 ? Btn.Ability1 : Btn.Ability2; b.pressAbility = -1; return buttons; }
  if (!losOk) { k.input.pitch = 0; return buttons; }
  // aim: lead the target, add error that grows with distance
  const speed = ARROW.minSpeed + (ARROW.maxSpeed - ARROW.minSpeed) * Math.max(k.draw, 0.6);
  const tf = dist / speed;
  if (k.act !== Act.Draw || k.actT < 0.05) {
    const sigma = 0.022 * dist * b.skill.aim + 0.25;
    b.aimJx = b.rng.gauss() * sigma; b.aimJy = b.rng.gauss() * sigma * 0.6; b.aimJz = b.rng.gauss() * sigma;
    b.drawGoal = b.rng.range(0.78, 1);
  }
  const head = b.skill.aim < 0.7 && b.rng.chance(0.002) ? 0.38 : 0;
  const ax = t.x + t.vx * tf + b.aimJx;
  const ay = t.y + 1.2 + head + b.aimJy;
  const az = t.z + t.vz * tf + b.aimJz;
  k.input.aimX = ax; k.input.aimY = ay; k.input.aimZ = az;
  k.input.pitch = clamp(Math.atan2(ay - (k.y + 1.5), dist), -0.8, 0.8);
  const facingErr = Math.abs(angleDiff(k.yaw, yawTo(k.x, k.z, t.x, t.z)));
  if (k.act === Act.Draw) {
    if (k.draw < b.drawGoal || facingErr > 0.08) buttons |= Btn.Attack; // keep drawing; release when ready
  } else if (k.act === Act.Idle && facingErr < 0.5 && dist < 85) {
    buttons |= Btn.Attack;
  }
  return buttons;
}
