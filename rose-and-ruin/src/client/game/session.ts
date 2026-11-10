// Game sessions. The presentation layer only talks to a SessionView: a list of interpolated
// knight states, match status and a stream of simulation events. LocalSession runs the
// authoritative Match in the browser (single player and bots-only); NetSession (net.ts)
// mirrors a server match.

import { Match } from '../../shared/sim/match';
import type { Knight } from '../../shared/sim/knight';
import { buildMap } from '../../shared/world/maps/index';
import type { BuiltMap, ObjectiveDef } from '../../shared/world/mapgen';
import { DT, Act, type InputFrame, type MatchSettings, type SimEvent, type Team } from '../../shared/types';
import { SHIELDS, type ClassId } from '../../shared/data/classes';
import { buffBits, debuffBits } from '../../shared/net/protocol';
import { wrapAngle } from '../../shared/math';

export interface KnightState {
  id: number; name: string; team: Team; cls: ClassId; bot: boolean; alive: boolean;
  x: number; y: number; z: number; yaw: number; pitch: number;
  vx: number; vy: number; vz: number; onGround: boolean;
  act: number; actT: number; actDur: number; atk: number; heavy: boolean; charge: number; draw: number;
  abilitySlot: number; knockT: number; stunT: number; bulwarkT: number; sprinting: boolean;
  hp: number; maxHp: number; stamina: number; maxStamina: number;
  cd0: number; cd1: number; bodkin: boolean; rallyT: number; bloodletT: number; bleedStacks: number; spawnProt: number;
  kills: number; deaths: number; assists: number; score: number; respawnT: number; nextCls: ClassId;
  lastHurt: number;
  /** shield durability left (0..1) and whether it has splintered */
  shield: number; shieldBroken: boolean;
  /** buffs of the renowned orders (see buffBits) */
  buffs: number;
  debuffs: number;
}

/** Input frame as the app maintains it: held buttons plus one-step presses. */
export interface LiveInput extends InputFrame { held: number; pulse: number }

export interface ObjectiveView { def: ObjectiveDef; owner: number; progress: number; contested: boolean; n0: number; n1: number }

export interface SessionView {
  readonly map: BuiltMap;
  readonly settings: MatchSettings;
  localId: number;
  knights: KnightState[];
  phase: 'warmup' | 'live' | 'ended';
  phaseT: number;
  timeLeft: number;
  winner: number;
  teams: { tickets: number; kills: number; startTickets: number }[];
  objectives: ObjectiveView[];
  time: number;
  timeScale: number;
  paused: boolean;
  readonly online: boolean;
  /** the hosts wait in muster for the player to sound the charge */
  readonly held?: boolean;
  update(dt: number): void;
  drainEvents(): SimEvent[];
  setInput(f: InputFrame): void;
  requestSpawn(cls: ClassId, zone?: number): void;
  dispose(): void;
}

export function emptyState(): KnightState {
  return {
    id: 0, name: '', team: 0, cls: 'manatarms', bot: true, alive: false, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, onGround: true,
    act: 0, actT: 0, actDur: 0, atk: 0, heavy: false, charge: 0, draw: 0, abilitySlot: 0, knockT: 0, stunT: 0, bulwarkT: 0, sprinting: false,
    hp: 0, maxHp: 1, stamina: 0, maxStamina: 1, cd0: 0, cd1: 0, bodkin: false, rallyT: 0, bloodletT: 0, bleedStacks: 0, spawnProt: 0,
    kills: 0, deaths: 0, assists: 0, score: 0, respawnT: 0, nextCls: 'manatarms', lastHurt: -99,
    shield: 0, shieldBroken: false, buffs: 0, debuffs: 0,
  };
}

export function copyKnight(s: KnightState, k: Knight) {
  s.id = k.id; s.name = k.name; s.team = k.team; s.cls = k.cls; s.bot = k.bot; s.alive = k.alive;
  s.vx = k.vx; s.vy = k.vy; s.vz = k.vz; s.onGround = k.onGround; s.pitch = k.pitch;
  s.act = k.act; s.actT = k.actT; s.actDur = k.actDur; s.atk = k.atk; s.heavy = k.heavy; s.charge = k.charge; s.draw = k.draw;
  s.abilitySlot = k.abilitySlot; s.knockT = k.knockT; s.stunT = k.stunT; s.bulwarkT = k.bulwarkT; s.sprinting = k.sprinting;
  s.hp = k.hp; s.maxHp = k.def.hp; s.stamina = k.stamina; s.maxStamina = k.def.stamina;
  s.cd0 = k.cds[0]; s.cd1 = k.cds[1]; s.bodkin = k.bodkin; s.rallyT = k.rallyT; s.bloodletT = k.bloodletT; s.bleedStacks = k.bleedStacks; s.spawnProt = k.spawnProt;
  s.kills = k.kills; s.deaths = k.deaths; s.assists = k.assists; s.score = k.score; s.respawnT = k.respawnT; s.nextCls = k.nextCls; s.lastHurt = k.lastHurt;
  s.buffs = buffBits(k); s.debuffs = debuffBits(k);
  s.shield = k.def.shield ? k.shieldHp / SHIELDS[k.def.shield].hp : 0; s.shieldBroken = k.shieldBroken;
}

export class LocalSession implements SessionView {
  readonly map: BuiltMap;
  readonly settings: MatchSettings;
  readonly match: Match;
  readonly online = false;
  localId = -1;
  knights: KnightState[] = [];
  private prev: Float32Array;
  private acc = 0;
  private events: SimEvent[] = [];
  private input: InputFrame | null = null;
  timeScale = 1;
  paused = false;
  /** most simulation steps per frame before the clock is allowed to slip */
  maxSteps = 8;

  constructor(settings: MatchSettings, player: { name: string; team: Team | -1; cls: ClassId; locked?: ClassId[] } | null) {
    this.settings = settings;
    this.map = buildMap(settings.mapId);
    this.match = new Match(settings, this.map);
    if (player) {
      const k = this.match.addPlayer(player.name, 1, player.team, player.cls, player.locked ?? []);
      this.localId = k.id;
    }
    this.prev = new Float32Array(this.match.knights.length * 4 + 64);
    this.knights = this.match.knights.map(() => emptyState());
    this.savePrev();
    this.sync(1);
  }

  private savePrev() {
    const ks = this.match.knights;
    if (this.prev.length < ks.length * 4) this.prev = new Float32Array(ks.length * 8);
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      this.prev[i * 4] = k.x; this.prev[i * 4 + 1] = k.y; this.prev[i * 4 + 2] = k.z; this.prev[i * 4 + 3] = k.yaw;
    }
  }

  private sync(alpha: number) {
    const ks = this.match.knights;
    while (this.knights.length < ks.length) this.knights.push(emptyState());
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i], s = this.knights[i];
      const wasAlive = s.alive;
      copyKnight(s, k);
      const px = this.prev[i * 4], py = this.prev[i * 4 + 1], pz = this.prev[i * 4 + 2], pyaw = this.prev[i * 4 + 3];
      // don't interpolate across a respawn teleport
      const jump = (k.x - px) ** 2 + (k.z - pz) ** 2 > 9 || (!wasAlive && k.alive);
      const a = jump ? 1 : alpha;
      s.x = px + (k.x - px) * a; s.y = py + (k.y - py) * a; s.z = pz + (k.z - pz) * a;
      s.yaw = pyaw + wrapAngle(k.yaw - pyaw) * a;
      // the local player's facing comes straight from the mouse for responsiveness
      if (i === this.localId && this.input && k.alive && k.act !== Act.Stun && k.act !== Act.Knockdown && k.act !== Act.Release) s.yaw = this.input.yaw;
    }
  }

  get phase() { return this.match.phase; }
  get phaseT() { return this.match.phaseT; }
  get held() { return this.match.hold && this.match.phase === 'warmup'; }
  /** Sound the charge: a short countdown, then battle. */
  release(countdown = 3) {
    if (!this.match.hold) return;
    this.match.hold = false;
    this.match.phaseT = Math.max(this.match.phaseT, 6 - countdown);
  }
  get timeLeft() { return this.match.timeLeft; }
  get winner() { return this.match.winner; }
  get teams() { return this.match.teams; }
  get objectives() { return this.match.objectives; }
  get time() { return this.match.time; }

  update(dt: number) {
    if (this.paused) { this.sync(1); return; }
    this.acc += Math.min(dt, 0.1 * this.maxSteps / 8) * this.timeScale;
    let steps = 0;
    while (this.acc >= DT && steps < this.maxSteps) {
      this.savePrev();
      if (this.localId >= 0 && this.input) this.match.setInput(this.localId, this.input);
      this.match.step();
      for (const e of this.match.events) this.events.push(e);
      this.match.events.length = 0;
      this.acc -= DT;
      steps++;
      // presses last for one step only; held buttons stay down
      const li = this.input as LiveInput | null;
      if (li && li.pulse) { li.buttons = li.held ?? (li.buttons & ~li.pulse); li.pulse = 0; }
    }
    if (steps === this.maxSteps) this.acc = 0;
    this.sync(this.acc / DT);
  }

  drainEvents(): SimEvent[] { const e = this.events; this.events = []; return e; }

  setInput(f: InputFrame) { this.input = f; }

  requestSpawn(cls: ClassId, zone?: number) { if (this.localId >= 0) this.match.requestSpawn(this.localId, cls, zone); }

  dispose() { /* nothing to free */ }
}
