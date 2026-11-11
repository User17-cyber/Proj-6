// The authoritative battle simulation. Runs at a fixed 60 Hz on the server (multiplayer)
// or in the browser (single player and bots-only). Presentation consumes `events`.

import { Act, DT, type MatchSettings, type SimEvent, type Team, type InputFrame, type HitZone } from '../types';
import { Knight, KNIGHT_RADIUS } from './knight';
import { knockdown } from './combat';
import { CLASSES, CLASS_IDS, SHIELDS, type ClassId } from '../data/classes';
import { knightName } from '../data/names';
import { Rng } from '../rng';
import type { BuiltMap, ObjectiveDef, SpawnZone } from '../world/mapgen';
import type { StaticWorld } from '../world/world';
import { NavGrid } from '../world/nav';
import { updateKnight } from './actions';
import { resolveCombat, stepArrows, stepVolleys, type Arrow, type Volley } from './combat';
import { BotBrain, updateBot } from './ai';
import { clamp } from '../math';

export interface TeamState { tickets: number; kills: number; score: number; startTickets: number }
export interface ObjectiveState { def: ObjectiveDef; owner: number; progress: number; contested: boolean; n0: number; n1: number }

export type MatchPhase = 'warmup' | 'live' | 'ended';

export const WARMUP_TIME = 6;
export const END_TIME = 14;
/** single combat: seconds between a round's deciding blow and the next round */
export const ROUND_PAUSE = 6;
/** single combat: the count of seconds, at the marks, before each round after the first */
export const ROUND_COUNTDOWN = 3;

export class Match {
  readonly settings: MatchSettings;
  readonly map: BuiltMap;
  readonly world: StaticWorld;
  readonly nav: NavGrid;
  readonly rng: Rng;
  tick = 0;
  time = 0;
  phase: MatchPhase = 'warmup';
  phaseT = 0;
  winner = -1;
  knights: Knight[] = [];
  teams: [TeamState, TeamState];
  objectives: ObjectiveState[] = [];
  arrows: Arrow[] = [];
  volleys: Volley[] = [];
  nextArrowId = 1;
  events: SimEvent[] = [];
  brains = new Map<number, BotBrain>();
  readonly hash: KnightHash;
  private usedNames = new Set<string>();
  private bleedTimer = 0;
  paused = false;
  /** keep the hosts mustered (no countdown) until released, e.g. until the player is ready */
  hold = false;
  /** single combat: current round, the pause after a round is won, and who won it */
  round = 0;
  roundT = 0;
  roundWinner = 0;
  /** single combat: seconds left of the countdown at the marks (both fighters held still) */
  roundReadyT = 0;
  /** A* searches bots may still run this tick */
  aiBudget = 0;

  constructor(settings: MatchSettings, map: BuiltMap) {
    // single combat is always one knight a side
    this.settings = settings.mode === 'duel' ? { ...settings, teamSize: 1, friendlyFire: false } : settings;
    settings = this.settings;
    this.map = map;
    this.world = map.world;
    this.nav = new NavGrid(map.world);
    this.rng = new Rng(settings.seed ^ 0x51ed270b);
    const tickets = settings.mode === 'laststand' || settings.mode === 'duel' ? 0 : Math.round(settings.teamSize * settings.ticketScale);
    const start = settings.mode === 'duel' ? Math.max(1, settings.rounds ?? 5) : tickets;
    this.teams = [
      { tickets, kills: 0, score: 0, startTickets: start },
      { tickets, kills: 0, score: 0, startTickets: start },
    ];
    if (settings.mode === 'conquest') {
      this.objectives = map.objectives.map((def) => ({ def, owner: def.owner, progress: def.owner === 0 ? -1 : def.owner === 1 ? 1 : 0, contested: false, n0: 0, n1: 0 }));
    }
    this.hash = new KnightHash(this.world.bounds);
    // fill both teams with bots
    for (let t = 0 as Team; t <= 1; t = (t + 1) as Team) {
      for (let i = 0; i < settings.teamSize; i++) this.createSlot(t);
    }
    // everyone stands in formation for the warmup
    for (const k of this.knights) this.spawn(k, true);
    // precompute the flow fields bots will march along
    if (this.objectives.length) for (const o of this.objectives) this.nav.field(o.def.x, o.def.z);
    else for (const p of map.rally) this.nav.field(p[0], p[1]);
  }

  private createSlot(team: Team): Knight {
    const k = new Knight(this.knights.length, team);
    const cls = this.pickBotClass(team);
    k.setClass(cls);
    k.nextCls = cls;
    k.name = knightName(this.rng, team, cls, this.usedNames);
    k.bot = true;
    this.knights.push(k);
    this.brains.set(k.id, new BotBrain(k, this.settings.difficulty, this.rng.next()));
    return k;
  }

  pickBotClass(team: Team): ClassId {
    if (this.settings.mode === 'duel') {
      const f = this.settings.duelFoe as ClassId;
      return CLASS_IDS.includes(f) ? f : CLASS_IDS[this.rng.int(CLASS_IDS.length)];
    }
    // keep the composition close to the target weights
    const counts = new Map<ClassId, number>();
    for (const k of this.knights) if (k.team === team) counts.set(k.nextCls, (counts.get(k.nextCls) ?? 0) + 1);
    const total = CLASS_IDS.reduce((s, c) => s + CLASSES[c].botWeight, 0);
    const n = Math.max(1, [...counts.values()].reduce((a, b) => a + b, 0));
    let best: ClassId = 'manatarms', bestScore = -Infinity;
    for (const c of CLASS_IDS) {
      const want = CLASSES[c].botWeight / total;
      const have = (counts.get(c) ?? 0) / n;
      const s = want - have + this.rng.range(0, 0.08);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    return best;
  }

  /** A human takes over a bot slot on the given team. Returns the knight. */
  addPlayer(name: string, playerId: number, team: Team | -1, cls: ClassId, locked: readonly ClassId[] = []): Knight {
    if (team === -1) {
      const humans = [0, 1].map((t) => this.knights.filter((k) => k.team === t && !k.bot).length);
      team = (humans[0] <= humans[1] ? 0 : 1) as Team;
    }
    // prefer a dead bot so nobody vanishes mid-fight
    const candidates = this.knights.filter((k) => k.team === team && k.bot);
    let slot = candidates.find((k) => !k.alive) ?? candidates[candidates.length - 1];
    if (!slot) slot = this.createSlot(team);
    slot.bot = false;
    slot.playerId = playerId;
    slot.name = name;
    slot.setClass(cls);
    slot.nextCls = cls;
    slot.kills = slot.deaths = slot.assists = slot.score = slot.damage = slot.caps = 0;
    slot.usedCls.clear();
    slot.lockedCls = new Set(locked.filter((c) => CLASS_IDS.includes(c)));
    slot.spawnPref = -1;
    if (slot.lockedCls.has(cls)) { cls = this.freeClass(slot) ?? 'manatarms'; slot.setClass(cls); slot.nextCls = cls; }
    this.brains.delete(slot.id);
    if (slot.alive) {
      if (this.phase === 'warmup') {
        this.spawn(slot, true);
      } else {
        slot.alive = false;
        slot.act = Act.Dead;
        slot.respawnT = 2;
      }
    } else {
      slot.respawnT = Math.min(slot.respawnT, 3);
    }
    return slot;
  }

  /** A human leaves; a bot takes the slot over. */
  removePlayer(knightId: number) {
    const k = this.knights[knightId];
    if (!k || k.bot) return;
    k.bot = true;
    k.playerId = -1;
    k.nextCls = this.pickBotClass(k.team);
    this.usedNames.delete(k.name);
    k.name = knightName(this.rng, k.team, k.nextCls, this.usedNames);
    this.brains.set(k.id, new BotBrain(k, this.settings.difficulty, this.rng.next()));
  }

  /** A human on the death screen asks to rejoin the fight with a class. */
  requestSpawn(knightId: number, cls: ClassId, zone?: number) {
    const k = this.knights[knightId];
    if (!k || k.bot) return;
    if (zone !== undefined) k.spawnPref = Number.isInteger(zone) && zone >= 0 && zone < this.map.spawns[k.team].length ? zone : -1;
    if (!this.classAllowed(k, cls)) return;
    k.nextCls = cls;
    if (!k.alive) k.wantSpawn = true;
  }

  setInput(knightId: number, f: InputFrame) {
    const k = this.knights[knightId];
    if (!k) return;
    k.input = f;
  }

  emit(e: SimEvent) { this.events.push(e); }

  // ------------------------------------------------------------------- spawning
  /** The mustering place closest to the enemy that has no enemy within 25 metres of it. */
  private nearestFight(k: Knight, zones: SpawnZone[]): SpawnZone {
    let best = zones[0], bs = Infinity;
    for (const z of zones) {
      let near = Infinity, threat = false;
      for (const e of this.knights) {
        if (!e.alive || e.team === k.team) continue;
        const d = Math.hypot(e.x - z.x, e.z - z.z);
        if (d < 25) threat = true;
        if (d < near) near = d;
      }
      const sc = threat ? near + 1000 : near;
      if (sc < bs) { bs = sc; best = z; }
    }
    return best;
  }

  spawnZoneFor(k: Knight) {
    if (this.settings.mode === 'duel') {
      // face each other twelve paces apart on the duelling ground
      const d = this.map.duel;
      return { x: d.x, z: d.z + (k.team === 0 ? 6 : -6), yaw: k.team === 0 ? 0 : Math.PI, w: 1, d: 1 };
    }
    const zones = this.map.spawns[k.team];
    if (!k.bot && this.phase !== 'warmup') {
      // a player musters where he chose, or else at the place nearest the fighting that is not overrun
      if (k.spawnPref >= 0 && zones[k.spawnPref]) return zones[k.spawnPref];
      if (zones.length > 1) return this.nearestFight(k, zones);
    }
    // the hosts muster at their main camps; bots coming back may return at any of the house's places
    const main = zones.filter((z) => !z.minor);
    if (this.phase === 'warmup' || k.bot && this.rng.chance(0.55)) return main[k.id % main.length] ?? zones[0];
    if (zones.length === 1 || this.objectives.length === 0) return zones[k.id % zones.length];
    // conquest: spawn at the zone closest to a contested or enemy objective
    let best = zones[0], bd = Infinity;
    for (const z of zones) {
      for (const o of this.objectives) {
        if (o.owner === k.team) continue;
        const d = Math.hypot(o.def.x - z.x, o.def.z - z.z);
        if (d < bd) { bd = d; best = z; }
      }
    }
    return best;
  }

  /** Pitched battle: a player may fight as each order once. */
  classAllowed(k: Knight, cls: ClassId) { return k.bot || (!k.lockedCls.has(cls) && (this.settings.mode !== 'battle' || !k.usedCls.has(cls))); }
  freeClass(k: Knight): ClassId | null { return CLASS_IDS.find((c) => this.classAllowed(k, c)) ?? null; }

  spawn(k: Knight, formation = false) {
    if (!this.classAllowed(k, k.nextCls)) k.nextCls = this.freeClass(k) ?? k.nextCls;
    if (k.nextCls !== k.cls || !k.alive) k.setClass(k.nextCls);
    const zone = this.spawnZoneFor(k);
    const c = Math.cos(zone.yaw), s = Math.sin(zone.yaw);
    let px = zone.x, pz = zone.z;
    for (let attempt = 0; attempt < 30; attempt++) {
      let lx: number, lz: number;
      if (this.settings.mode === 'duel' && attempt === 0) {
        lx = 0; lz = 0;
      } else if (formation && attempt === 0) {
        const teamIdx = this.knights.filter((o) => o.team === k.team && o.id < k.id).length;
        const perRow = Math.max(6, Math.ceil(zone.w / 1.8));
        lx = ((teamIdx % perRow) - (perRow - 1) / 2) * 1.6;
        lz = Math.floor(teamIdx / perRow) * 1.9 - zone.d / 2 + 1;
        lx = clamp(lx, -zone.w / 2, zone.w / 2);
      } else {
        lx = this.rng.range(-zone.w / 2, zone.w / 2);
        lz = this.rng.range(-zone.d / 2, zone.d / 2);
      }
      px = zone.x + lx * c + lz * s;
      pz = zone.z - lx * s + lz * c;
      const g = this.world.groundAt(px, pz, 999);
      if (this.world.walkable(px, pz, g) && this.world.dry(px, pz, g, -0.15) && !this.world.pointBlocked(px, g + 1, pz, KNIGHT_RADIUS) && this.nav.isWalkable(px, pz)) break;
      if (attempt === 29) {
        // no clear ground found at random: take the nearest dry walkable cell to the camp
        const i = this.nav.nearestWalkable(zone.x, zone.z, 40);
        if (i >= 0) { px = this.nav.cx(i); pz = this.nav.cz(i); }
      }
    }
    k.x = px; k.z = pz; k.y = this.world.groundAt(px, pz, 999);
    k.vx = k.vy = k.vz = 0;
    k.yaw = zone.yaw; k.pitch = 0;
    k.input = { ...k.input, yaw: zone.yaw, pitch: 0, buttons: 0, mx: 0, mz: 0 };
    k.alive = true;
    k.hp = k.def.hp;
    k.stamina = k.def.stamina;
    k.act = Act.Idle; k.actT = 0; k.actDur = 0;
    k.stunT = k.knockT = k.invulnT = 0;
    k.bulwarkT = k.rallyT = k.bloodletT = k.bleedT = k.hotT = 0;
    k.holdT = k.halfT = k.hasteT = k.execT = k.juggerT = 0;
    k.mordT = k.sbT = k.disarmT = k.slowT = k.steadyT = 0;
    k.bleedStacks = 0; k.bodkin = false; k.draw = 0;
    k.shieldHp = k.def.shield ? SHIELDS[k.def.shield].hp : 0;
    k.cds[0] = 0; k.cds[1] = 0;
    k.combo = 0;
    k.spawnProt = formation ? 0 : 2.5;
    k.dmgBy.clear();
    k.streak = 0;
    k.prevButtons = 0;
    k.wantSpawn = false;
    this.brains.get(k.id)?.reset();
    this.emit({ t: 'spawn', k: k.id, yaw: k.yaw });
  }

  // ------------------------------------------------------------------- damage
  /**
   * Apply damage from attacker to victim. Returns true if the victim died.
   * kind: 0 melee, 1 arrow, 2 ability, 3 kick, 4 bleed, 5 volley
   */
  damage(victim: Knight, attacker: Knight | null, amount: number, opts: { zone: HitZone; dtype: number; kind: number; heavy?: boolean; x: number; y: number; z: number; dx: number; dy: number; dz: number; noStagger?: boolean; silent?: boolean }): boolean {
    if (!victim.alive || victim.spawnProt > 0) return false;
    if (victim.bulwarkT > 0) amount *= 0.5;
    if (victim.holdT > 0) amount *= 0.7;
    if (attacker && attacker.rallyT > 0) amount *= 1.15;
    amount = Math.max(1, Math.round(amount));
    // Executioner: a blow that leaves the foe below a third of his vigour finishes him
    if (attacker && attacker.execT > 0 && attacker !== victim && victim.hp - amount > 0 && victim.hp - amount < victim.def.hp / 3) amount = victim.hp;
    victim.hp -= amount;
    victim.lastHurt = this.time;
    if (attacker && attacker !== victim) {
      const rec = victim.dmgBy.get(attacker.id) ?? { dmg: 0, time: 0 };
      rec.dmg += amount; rec.time = this.time;
      victim.dmgBy.set(attacker.id, rec);
      attacker.damage += amount;
    }
    const killed = victim.hp <= 0;
    if (!opts.silent) {
      this.emit({ t: 'hit', a: attacker ? attacker.id : -1, v: victim.id, dmg: amount, zone: opts.zone, x: opts.x, y: opts.y, z: opts.z, dx: opts.dx, dy: opts.dy, dz: opts.dz, kind: opts.kind, heavy: !!opts.heavy, killed, dtype: opts.dtype });
    }
    if (killed) {
      if (attacker && attacker.execT > 0 && attacker.alive) this.heal(attacker, 25);
      this.kill(victim, attacker, opts);
      return true;
    }
    // flinch: interrupt wind-ups unless armoured against it
    if (!opts.noStagger && amount >= 14 && victim.bulwarkT <= 0 && victim.juggerT <= 0 && victim.steadyT <= 0) {
      const a = victim.act;
      const interruptible = a === Act.Windup || a === Act.Charge || a === Act.Draw || a === Act.Idle || a === Act.Recover || a === Act.Loose;
      const hyper = victim.def.hyperArmor && victim.heavy && (a === Act.Windup || a === Act.Charge);
      const charging = a === Act.Ability && victim.def.abilities[victim.abilitySlot] === 'charge';
      if (interruptible && !hyper && !charging) {
        victim.act = Act.Stagger; victim.actT = 0; victim.actDur = 0.36;
        victim.draw = 0;
      }
    }
    return false;
  }

  kill(victim: Knight, killer: Knight | null, opts: { zone: HitZone; kind: number; dx: number; dy: number; dz: number; dtype: number }) {
    victim.alive = false;
    victim.hp = 0;
    victim.act = Act.Dead;
    victim.actT = 0;
    victim.deaths++;
    victim.deathTime = this.time;
    victim.streak = 0;
    const team = this.teams[victim.team];
    if (this.settings.mode !== 'laststand' && this.settings.mode !== 'duel') team.tickets = Math.max(0, team.tickets - 1);
    // assist: the biggest other contributor in the last 12 seconds
    let assist = -1, best = 24;
    for (const [id, rec] of victim.dmgBy) {
      if (killer && id === killer.id) continue;
      if (this.time - rec.time > 12) continue;
      if (rec.dmg > best) { best = rec.dmg; assist = id; }
    }
    if (assist >= 0) {
      const a = this.knights[assist];
      if (a && a.team !== victim.team) { a.assists++; a.score += 50; } else assist = -1;
    }
    if (killer && killer.team !== victim.team) {
      killer.kills++;
      killer.score += 100 + (opts.zone === 0 ? 20 : 0);
      this.teams[killer.team].kills++;
      killer.streak++;
      if (this.time - killer.lastKillTime < 6) killer.multiKill++; else killer.multiKill = 1;
      killer.lastKillTime = this.time;
      if (killer.multiKill >= 2 || killer.streak === 5 || killer.streak === 10) this.emit({ t: 'streak', k: killer.id, n: killer.multiKill >= 2 ? killer.multiKill : 100 + killer.streak });
    }
    const force = opts.kind === 2 ? 1.6 : opts.zone === 0 ? 1.2 : 1;
    this.emit({ t: 'kill', killer: killer ? killer.id : -1, victim: victim.id, assist, weapon: opts.kind === 1 || opts.kind === 5 ? 99 : killer ? CLASS_IDS.indexOf(killer.cls) : -1, head: opts.zone === 0, dx: opts.dx, dy: opts.dy, dz: opts.dz, force });
    // in a pitched battle each order a player falls as is spent; with every order gone, he is out
    if (!victim.bot && this.settings.mode === 'battle') victim.usedCls.add(victim.cls);
    if (this.settings.mode === 'duel') {
      // the round is decided; after a breath both fighters take their marks again
      if (this.phase === 'warmup') { victim.respawnT = 2; victim.wantSpawn = true; return; }
      if (this.phase === 'live' && this.roundT <= 0) {
        this.roundT = ROUND_PAUSE;
        this.roundWinner = killer && killer.team !== victim.team ? killer.team : 1 - victim.team;
      }
      victim.respawnT = this.roundT;
      return;
    }
    const canRespawn = this.settings.mode !== 'laststand' && team.tickets > 0 && (victim.bot || this.freeClass(victim) !== null);
    victim.respawnT = canRespawn ? (victim.bot ? 7 + this.rng.range(0, 3) : 6) : Infinity;
    if (victim.bot) victim.nextCls = this.rng.chance(0.25) ? this.pickBotClass(victim.team) : victim.cls;
  }

  heal(k: Knight, amount: number) {
    if (!k.alive) return;
    k.hp = Math.min(k.def.hp, k.hp + amount);
  }

  // ------------------------------------------------------------------- main loop
  step() {
    if (this.paused) return;
    this.tick++;
    this.time += DT;
    if (!(this.hold && this.phase === 'warmup')) this.phaseT += DT;
    if (this.phase === 'warmup' && this.phaseT >= WARMUP_TIME) {
      this.phase = 'live'; this.phaseT = 0;
      this.emit({ t: 'horn', team: -1, kind: 0 });
    }
    this.hash.rebuild(this.knights);
    this.aiBudget = 6;
    // bots decide
    for (const k of this.knights) {
      if (!k.bot || !k.active) continue;
      const brain = this.brains.get(k.id);
      if (brain) updateBot(this, k, brain);
    }
    // single combat countdown: both fighters stand at their marks, squarely facing each other,
    // until it runs out (and so through the muster before the first round)
    if (this.settings.mode === 'duel' && (this.phase === 'warmup' || (this.roundReadyT > 0 && this.phase === 'live'))) {
      if (this.phase === 'live') this.roundReadyT = Math.max(0, this.roundReadyT - DT);
      for (const k of this.knights) {
        const o = this.knights.find((x) => x !== k && x.alive && x.active);
        const yaw = o ? Math.atan2(-(o.x - k.x), -(o.z - k.z)) : k.yaw;
        k.yaw = yaw;
        k.input = { ...k.input, yaw, pitch: 0, mx: 0, mz: 0, buttons: this.phase === 'warmup' ? k.input.buttons : 0 };
        if (this.phase === 'live') k.prevButtons = 0;
      }
      if (this.phase === 'live' && this.roundReadyT <= 0) this.emit({ t: 'horn', team: -1, kind: 0 });
    }
    for (const k of this.knights) {
      if (!k.active) continue;
      if (!k.alive) {
        if (this.phase !== 'ended' && isFinite(k.respawnT) && (this.settings.mode !== 'duel' || this.phase === 'warmup')) {
          k.respawnT -= DT;
          // humans respawn when they ask to (death screen), bots when their timer runs out
          if (k.respawnT <= 0 && (k.bot || k.wantSpawn)) this.spawn(k);
        }
        continue;
      }
      updateKnight(this, k, DT);
    }
    this.separate();
    // at the marks, re-aim after any nudge from the crowd or the scenery
    if (this.settings.mode === 'duel' && (this.phase === 'warmup' || this.roundReadyT > 0)) {
      for (const k of this.knights) {
        const o = this.knights.find((x) => x !== k && x.alive && x.active);
        if (o) { k.yaw = Math.atan2(-(o.x - k.x), -(o.z - k.z)); k.input = { ...k.input, yaw: k.yaw }; }
      }
    }
    resolveCombat(this);
    stepArrows(this, DT);
    stepVolleys(this, DT);
    this.updateMode();
  }

  private sepX = new Float32Array(0);
  private sepZ = new Float32Array(0);
  private separate() {
    const ks = this.knights;
    // the broadest knights reach 0.38 * 1.12; query wide enough for any pair
    const rmax = KNIGHT_RADIUS * 2.3;
    const W = this.world;
    if (this.sepX.length < ks.length) { this.sepX = new Float32Array(ks.length * 2); this.sepZ = new Float32Array(ks.length * 2); }
    for (const k of ks) { this.sepX[k.id] = k.x; this.sepZ[k.id] = k.z; }
    for (const a of ks) {
      if (!a.alive || a.knockT > 0) continue;
      const ra = a.radius;
      this.hash.query(a.x, a.z, rmax, (b) => {
        if (b.id <= a.id || !b.alive || b.knockT > 0) return;
        const rr = ra + b.radius;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        // Juggernaut: a foe in the champion's path is bowled off his feet
        if (d2 < rr * rr && a.team !== b.team) {
          if (a.juggerT > 0 && b.knockT <= 0 && Math.hypot(a.vx, a.vz) > 1.5) bowl(this, a, b);
          else if (b.juggerT > 0 && a.knockT <= 0 && Math.hypot(b.vx, b.vz) > 1.5) bowl(this, b, a);
        }
        if (d2 >= rr * rr || Math.abs(a.y - b.y) > 1.4) return;
        const d = Math.sqrt(d2) || 0.01;
        const push = (rr - d) * 0.5;
        const ma = a.def.mass * (a.act === Act.Ability ? 3 : 1), mb = b.def.mass * (b.act === Act.Ability ? 3 : 1);
        const wa = mb / (ma + mb), wb = ma / (ma + mb);
        const nx = d2 > 1e-6 ? dx / d : 1, nz = d2 > 1e-6 ? dz / d : 0;
        a.x -= nx * push * 2 * wa; a.z -= nz * push * 2 * wa;
        b.x += nx * push * 2 * wb; b.z += nz * push * 2 * wb;
      });
    }
    // re-resolve against the static world after crowd pushing
    for (const k of ks) {
      if (!k.alive) continue;
      // the press of the crowd does not shove a man off the bank or the bridge into the water
      const ox = this.sepX[k.id], oz = this.sepZ[k.id];
      if ((k.x !== ox || k.z !== oz) && W.dry(ox, oz, k.y, 0.1) && !W.dry(k.x, k.z, W.groundAt(k.x, k.z, k.y), 0.1)) { k.x = ox; k.z = oz; }
      this.world.resolveCylinder(k, k.radius, 1.8 * k.def.size.height);
      const b = this.world.bounds;
      k.x = clamp(k.x, b.minX + 0.5, b.maxX - 0.5);
      k.z = clamp(k.z, b.minZ + 0.5, b.maxZ - 0.5);
    }
  }

  private updateMode() {
    if (this.phase === 'ended') {
      if (this.phaseT >= END_TIME) this.paused = true;
      return;
    }
    if (this.phase !== 'live') return;
    if (this.settings.mode === 'duel') return this.updateDuel();
    // conquest capture
    if (this.objectives.length) {
      for (const o of this.objectives) {
        let n0 = 0, n1 = 0;
        for (const k of this.knights) {
          if (!k.alive) continue;
          const dx = k.x - o.def.x, dz = k.z - o.def.z;
          if (dx * dx + dz * dz > o.def.r * o.def.r) continue;
          if (k.team === 0) n0++; else n1++;
        }
        o.n0 = n0; o.n1 = n1;
        o.contested = n0 > 0 && n1 > 0;
        const diff = n1 - n0;
        if (diff !== 0) {
          const rate = 0.055 * Math.min(4, Math.abs(diff)) * DT * Math.sign(diff);
          const prevOwner = o.owner;
          o.progress = clamp(o.progress + rate, -1, 1);
          if (o.progress <= -1 && o.owner !== 0) o.owner = 0;
          else if (o.progress >= 1 && o.owner !== 1) o.owner = 1;
          else if (o.owner === 0 && o.progress > 0) o.owner = -1;
          else if (o.owner === 1 && o.progress < 0) o.owner = -1;
          if (o.owner !== prevOwner) {
            this.emit({ t: 'capture', obj: this.objectives.indexOf(o), team: o.owner });
            if (o.owner >= 0) for (const k of this.knights) {
              if (k.alive && k.team === o.owner && (k.x - o.def.x) ** 2 + (k.z - o.def.z) ** 2 <= o.def.r * o.def.r) { k.score += 150; k.caps++; }
            }
          }
        }
      }
      this.bleedTimer += DT;
      if (this.bleedTimer >= 4) {
        this.bleedTimer = 0;
        const own = [0, 0];
        for (const o of this.objectives) if (o.owner >= 0) own[o.owner]++;
        if (own[0] > own[1]) this.teams[1].tickets = Math.max(0, this.teams[1].tickets - (own[0] - own[1]));
        if (own[1] > own[0]) this.teams[0].tickets = Math.max(0, this.teams[0].tickets - (own[1] - own[0]));
      }
    }
    // victory conditions
    const alive = [0, 0];
    for (const k of this.knights) if (k.alive && k.active) alive[k.team]++;
    for (const t of [0, 1] as const) {
      if (this.teams[t].tickets <= 0 && alive[t] === 0) return this.end(1 - t);
    }
    if (this.phaseT >= this.settings.timeLimit) {
      const a = this.teams[0].tickets + alive[0] * 0.01, b = this.teams[1].tickets + alive[1] * 0.01;
      return this.end(a === b ? -1 : a > b ? 0 : 1);
    }
  }

  private updateDuel() {
    if (this.round === 0) {
      this.round = 1;
      this.emit({ t: 'round', n: 1, winner: -1, score0: 0, score1: 0 });
    }
    for (const k of this.knights) if (!k.alive && this.roundT > 0) k.respawnT = this.roundT;
    if (this.roundT <= 0) return;
    this.roundT -= DT;
    if (this.roundT > 0) return;
    this.roundT = 0;
    const w = this.roundWinner;
    // rounds won travel to clients as the teams' tickets
    this.teams[w].tickets++;
    const need = Math.max(1, this.settings.rounds ?? 5);
    if (this.teams[w].tickets >= need) return this.end(w);
    this.round++;
    // both fighters back to their marks, whole again; a random foe changes his order
    for (const k of this.knights) {
      if (!k.active) continue;
      if (k.bot) k.nextCls = this.pickBotClass(k.team);
      this.spawn(k, true);
    }
    this.roundReadyT = ROUND_COUNTDOWN;
    this.emit({ t: 'round', n: this.round, winner: w, score0: this.teams[0].tickets, score1: this.teams[1].tickets });
  }

  end(winner: number) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.phaseT = 0;
    this.winner = winner;
    this.emit({ t: 'end', winner });
    this.emit({ t: 'horn', team: winner, kind: 1 });
  }

  /** Remaining match time in seconds. */
  /** single combat: the countdown at the marks, or (while a fallen man lies there) the pause before it */
  get timeLeft() { if (this.settings.mode === 'duel') return this.phase === 'live' ? (this.roundReadyT > 0 ? this.roundReadyT : this.roundT) : 0; return this.phase === 'live' ? Math.max(0, this.settings.timeLimit - this.phaseT) : this.phase === 'warmup' ? this.settings.timeLimit : 0; }
}

/** Uniform grid of knights rebuilt every tick for neighbour queries. */
export class KnightHash {
  private readonly cell = 3;
  private readonly minX: number; private readonly minZ: number;
  private readonly w: number; private readonly h: number;
  private head: Int32Array;
  private next: Int32Array = new Int32Array(256);
  private list: Knight[] = [];
  constructor(b: { minX: number; maxX: number; minZ: number; maxZ: number }) {
    this.minX = b.minX - 10; this.minZ = b.minZ - 10;
    this.w = Math.ceil((b.maxX - b.minX + 20) / this.cell);
    this.h = Math.ceil((b.maxZ - b.minZ + 20) / this.cell);
    this.head = new Int32Array(this.w * this.h).fill(-1);
  }
  private cellOf(x: number, z: number) {
    const cx = clamp(Math.floor((x - this.minX) / this.cell), 0, this.w - 1);
    const cz = clamp(Math.floor((z - this.minZ) / this.cell), 0, this.h - 1);
    return cz * this.w + cx;
  }
  rebuild(ks: Knight[]) {
    this.head.fill(-1);
    if (this.next.length < ks.length) this.next = new Int32Array(ks.length * 2);
    this.list = ks;
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      if (!k.alive) continue;
      const c = this.cellOf(k.x, k.z);
      this.next[i] = this.head[c];
      this.head[c] = i;
    }
  }
  query(x: number, z: number, r: number, fn: (k: Knight) => void) {
    const x0 = clamp(Math.floor((x - r - this.minX) / this.cell), 0, this.w - 1);
    const x1 = clamp(Math.floor((x + r - this.minX) / this.cell), 0, this.w - 1);
    const z0 = clamp(Math.floor((z - r - this.minZ) / this.cell), 0, this.h - 1);
    const z1 = clamp(Math.floor((z + r - this.minZ) / this.cell), 0, this.h - 1);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      for (let i = this.head[cz * this.w + cx]; i >= 0; i = this.next[i]) fn(this.list[i]);
    }
  }
}

/** A juggernaut walks into a foe: the foe is knocked flat and shoved aside. */
function bowl(m: Match, by: Knight, v: Knight) {
  if (!v.alive || v.bulwarkT > 0 || v.juggerT > 0 || v.holdT > 0) return;
  const dx = v.x - by.x, dz = v.z - by.z, l = Math.hypot(dx, dz) || 1;
  v.pushX += (dx / l) * 4; v.pushZ += (dz / l) * 4;
  m.damage(v, by, 12 * (1 - v.def.armor[1]), { zone: 1, dtype: 1, kind: 2, x: v.x, y: v.y + 1.1, z: v.z, dx: dx / l, dy: 0.2, dz: dz / l, noStagger: true });
  if (v.alive) knockdown(m, v, by, 1.4);
}
