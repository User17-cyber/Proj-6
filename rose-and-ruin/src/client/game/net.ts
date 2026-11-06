// Multiplayer client. NetClient speaks to the server's lobby; NetSession mirrors a server
// match as a SessionView: remote knights are interpolated 100 ms in the past, the local
// knight is predicted with the shared movement code and reconciled on every snapshot, and
// simulation events are released in step with the interpolated view.

import { buildMap } from '../../shared/world/maps/index';
import type { BuiltMap } from '../../shared/world/mapgen';
import { Knight } from '../../shared/sim/knight';
import { movement } from '../../shared/sim/actions';
import { CLASS_IDS, CLASSES, type ClassId } from '../../shared/data/classes';
import { Act, DT, type InputFrame, type MatchSettings, type SimEvent, type Team } from '../../shared/types';
import { wrapAngle } from '../../shared/math';
import {
  PROTOCOL_VERSION, MSG_SNAPSHOT, NEVER, decodeSnapshot, encodeInput, phaseName,
  type ClientMsg, type ServerMsg, type Snapshot, type RoomSummary, type SnapKnight,
} from '../../shared/net/protocol';
import { emptyState, type KnightState, type ObjectiveView, type SessionView, type LiveInput } from './session';

const INTERP = 6; // ticks of interpolation delay (100 ms)

export interface NetClientEvents {
  state(status: 'offline' | 'connecting' | 'online' | 'error', message?: string): void;
  rooms(rooms: RoomSummary[]): void;
  joined(session: NetSession): void;
  created(room: string): void;
  error(msg: string): void;
}

export class NetClient {
  ws: WebSocket | null = null;
  session: NetSession | null = null;
  private pingT = 0;
  rtt = 0.08;
  private listTimer = 0;

  constructor(private on: NetClientEvents) {}

  connect(url: string, name: string) {
    this.disconnect();
    this.on.state('connecting');
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch (e) { this.on.state('error', `Bad server address (${String(e)})`); return; }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.send({ t: 'hello', v: PROTOCOL_VERSION, name });
      this.send({ t: 'list' });
      this.listTimer = window.setInterval(() => { if (!this.session) this.send({ t: 'list' }); }, 3000);
      this.on.state('online');
    };
    ws.onerror = () => this.on.state('error', 'The muster could not be reached.');
    ws.onclose = () => {
      window.clearInterval(this.listTimer);
      if (this.ws === ws) { this.ws = null; this.on.state(this.session ? 'error' : 'offline', this.session ? 'The connection to the muster was lost.' : undefined); if (this.session) this.session.lost = true; }
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') {
        const b = ev.data as ArrayBuffer;
        if (new Uint8Array(b)[0] === MSG_SNAPSHOT && this.session) this.session.onSnapshot(decodeSnapshot(b));
        return;
      }
      let m: ServerMsg;
      try { m = JSON.parse(ev.data) as ServerMsg; } catch { return; }
      this.handle(m);
    };
  }

  private handle(m: ServerMsg) {
    switch (m.t) {
      case 'rooms': this.on.rooms(m.rooms); break;
      case 'created': this.on.created(m.room); break;
      case 'joined': {
        this.session?.disposeQuiet();
        this.session = new NetSession(this, m.settings, m.knight, m.tick);
        this.on.joined(this.session);
        break;
      }
      case 'roster': this.session?.onRoster(m.k); break;
      case 'stats': this.session?.onStats(m.s); break;
      case 'ev': this.session?.onEvents(m.e); break;
      case 'chat': this.session?.onChat?.(m.name, m.team, m.text); break;
      case 'error': this.on.error(m.msg); break;
      case 'pong': this.rtt = this.rtt * 0.8 + ((performance.now() - m.at) / 1000) * 0.2; break;
      default: break;
    }
  }

  send(m: ClientMsg) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  sendBinary(b: ArrayBuffer) { if (this.ws && this.ws.readyState === WebSocket.OPEN && this.ws.bufferedAmount < 64 * 1024) this.ws.send(b); }

  create(settings: MatchSettings) { this.send({ t: 'create', settings }); }
  join(room: string, name: string, team: Team | -1, cls: ClassId) { this.send({ t: 'join', room, team, cls, name }); }
  leave() { this.send({ t: 'leave' }); this.session = null; }

  tickPing(dt: number) {
    this.pingT -= dt;
    if (this.pingT <= 0) { this.pingT = 2; this.send({ t: 'ping', at: performance.now() }); }
  }

  disconnect() {
    window.clearInterval(this.listTimer);
    if (this.ws) { const ws = this.ws; this.ws = null; ws.onclose = null; try { ws.close(); } catch { /* closed */ } }
    this.session = null;
  }
}

interface SnapRec { tick: number; byId: Map<number, SnapKnight> }

export class NetSession implements SessionView {
  readonly map: BuiltMap;
  settings: MatchSettings;
  readonly online = true;
  localId: number;
  knights: KnightState[] = [];
  phase: 'warmup' | 'live' | 'ended' = 'warmup';
  phaseT = 0;
  timeLeft = 0;
  winner = -1;
  teams = [{ tickets: 0, kills: 0, startTickets: 1 }, { tickets: 0, kills: 0, startTickets: 1 }];
  objectives: ObjectiveView[];
  time = 0;
  timeScale = 1;
  paused = false;
  lost = false;
  onChat: ((name: string, team: number, text: string) => void) | null = null;

  private snaps: SnapRec[] = [];
  private latestTick = 0;
  private renderTick = 0;
  private events: (SimEvent & { tk: number })[] = [];
  private ready: SimEvent[] = [];
  private input: LiveInput | null = null;
  private seq = 0;
  private acc = 0;
  private pending: { seq: number; mx: number; mz: number; yaw: number; pitch: number; buttons: number; prev: number }[] = [];
  private pk = new Knight(0, 0);
  private prevBtn = 0;
  private corr = { x: 0, y: 0, z: 0 };
  private lastSnap: Snapshot | null = null;
  private snapAge = 0;
  private you: Snapshot['you'] = null;

  constructor(private client: NetClient, settings: MatchSettings, knightId: number, tick: number) {
    this.settings = settings;
    this.map = buildMap(settings.mapId);
    this.localId = knightId;
    this.objectives = this.map.objectives.map((def) => ({ def, owner: def.owner, progress: def.owner === 0 ? -1 : def.owner === 1 ? 1 : 0, contested: false, n0: 0, n1: 0 }));
    this.latestTick = this.renderTick = tick;
    this.pk = new Knight(knightId, 0);
  }

  private ensure(id: number): KnightState {
    while (this.knights.length <= id) { const s = emptyState(); s.id = this.knights.length; this.knights.push(s); }
    return this.knights[id];
  }

  onRoster(rows: [number, string, number, string, number][]) {
    for (const [id, name, team, cls, bot] of rows) {
      const s = this.ensure(id);
      s.id = id; s.name = name; s.team = team as Team; s.cls = cls as ClassId; s.bot = bot === 1;
      s.maxHp = CLASSES[s.cls].hp; s.maxStamina = CLASSES[s.cls].stamina;
    }
  }
  onStats(flat: number[]) {
    for (let i = 0; i + 4 < flat.length; i += 5) {
      const s = this.ensure(flat[i]);
      s.kills = flat[i + 1]; s.deaths = flat[i + 2]; s.assists = flat[i + 3]; s.score = flat[i + 4];
    }
  }
  onEvents(e: (SimEvent & { tk: number })[]) { for (const x of e) this.events.push(x); }

  onSnapshot(s: Snapshot) {
    if (s.tick <= this.latestTick && this.snaps.length) return;
    this.latestTick = s.tick;
    if (Math.abs(this.renderTick - (s.tick - INTERP)) > 60) this.renderTick = s.tick - INTERP;
    const byId = new Map<number, SnapKnight>();
    for (const k of s.knights) byId.set(k.id, k);
    this.snaps.push({ tick: s.tick, byId });
    while (this.snaps.length > 40) this.snaps.shift();
    this.lastSnap = s;
    this.snapAge = 0;
    this.you = s.you;
    // match status
    this.phase = phaseName(s.phase) as NetSession['phase'];
    this.phaseT = s.phaseT;
    this.timeLeft = s.timeLeft;
    this.winner = s.winner;
    this.teams = s.teams;
    s.objs.forEach((o, i) => { const v = this.objectives[i]; if (v) { v.owner = o.owner; v.progress = o.progress; v.contested = o.contested; v.n0 = o.n0; v.n1 = o.n1; } });
    // reconcile the local knight
    const me = byId.get(this.localId);
    if (me) {
      const pk = this.pk;
      const before = { x: pk.x, y: pk.y, z: pk.z };
      const wasAlive = pk.alive;
      this.applyToKnight(pk, me);
      if (s.you) { pk.stamina = s.you.stamina * CLASSES[pk.cls].stamina; }
      this.pending = this.pending.filter((p) => p.seq > s.ack);
      if (pk.alive) {
        for (const p of this.pending) {
          pk.input.mx = p.mx; pk.input.mz = p.mz; pk.input.yaw = p.yaw; pk.input.pitch = p.pitch; pk.input.buttons = p.buttons;
          movement(this.map.world, pk, DT, this.phase === 'live', p.buttons & ~p.prev);
          pk.actT += DT;
        }
        if (wasAlive) {
          // smooth out the correction instead of snapping
          this.corr.x += before.x - pk.x; this.corr.y += before.y - pk.y; this.corr.z += before.z - pk.z;
          if (this.corr.x ** 2 + this.corr.z ** 2 > 4) this.corr.x = this.corr.y = this.corr.z = 0;
        }
      }
    }
  }

  private applyToKnight(k: Knight, s: SnapKnight) {
    const cls = CLASS_IDS[s.cls] ?? 'manatarms';
    if (k.cls !== cls) k.setClass(cls);
    k.team = s.team as Team;
    k.alive = s.alive;
    if (!s.alive) return;
    k.x = s.x; k.y = s.y; k.z = s.z; k.vx = s.vx; k.vy = s.vy; k.vz = s.vz;
    k.onGround = s.onGround; k.sprinting = s.sprinting; k.heavy = s.heavy;
    k.act = s.act as Act; k.actT = s.actT; k.actDur = s.actDur; k.atk = s.atk; k.charge = s.charge; k.draw = s.draw; k.abilitySlot = s.abilitySlot;
    k.knockT = s.knockT; k.stunT = s.stunT; k.bulwarkT = s.bulwarkT; k.hp = s.hp;
    k.yaw = s.yaw;
  }

  get time0() { return this.renderTick * DT; }

  update(dt: number) {
    this.client.tickPing(dt);
    this.snapAge += dt;
    this.time += dt;
    // advance the render clock toward (latest - INTERP), nudging speed to absorb jitter
    const target = this.latestTick - INTERP;
    const err = target - this.renderTick;
    this.renderTick += dt * 60 * (1 + Math.max(-0.25, Math.min(0.25, err * 0.05)));
    if (this.renderTick > this.latestTick) this.renderTick = this.latestTick;
    // local inputs at 60 Hz
    this.acc += Math.min(dt, 0.1);
    let steps = 0;
    while (this.acc >= DT && steps < 6) {
      this.acc -= DT;
      steps++;
      this.stepLocal();
    }
    if (steps === 6) this.acc = 0;
    // decay correction offset
    const d = Math.exp(-dt * 10);
    this.corr.x *= d; this.corr.y *= d; this.corr.z *= d;
    this.interpolate();
    // release events that the view has caught up with
    const rt = this.renderTick;
    let n = 0;
    for (const e of this.events) { if (e.tk <= rt + 1) { this.ready.push(e); n++; } else break; }
    if (n) this.events.splice(0, n);
    if (this.events.length > 600) { for (const e of this.events) this.ready.push(e); this.events.length = 0; }
  }

  private stepLocal() {
    const f = this.input;
    if (!f) return;
    this.seq++;
    const buttons = f.buttons;
    this.client.sendBinary(encodeInput({ seq: this.seq, mx: f.mx, mz: f.mz, yaw: f.yaw, pitch: f.pitch, buttons, aimX: f.aimX ?? NaN, aimY: f.aimY ?? NaN, aimZ: f.aimZ ?? NaN }));
    const pk = this.pk;
    if (pk.alive) {
      this.pending.push({ seq: this.seq, mx: f.mx, mz: f.mz, yaw: f.yaw, pitch: f.pitch, buttons, prev: this.prevBtn });
      if (this.pending.length > 120) this.pending.shift();
      pk.input.mx = f.mx; pk.input.mz = f.mz; pk.input.yaw = f.yaw; pk.input.pitch = f.pitch; pk.input.buttons = buttons;
      movement(this.map.world, pk, DT, this.phase === 'live', buttons & ~this.prevBtn);
      pk.actT += DT;
    }
    this.prevBtn = buttons;
    if (f.pulse) { f.buttons = f.held; f.pulse = 0; }
  }

  private interpolate() {
    const rt = this.renderTick;
    const snaps = this.snaps;
    if (!snaps.length) return;
    let i = snaps.length - 1;
    while (i > 0 && snaps[i - 1].tick > rt) i--;
    const s1 = snaps[i];
    const s0 = i > 0 ? snaps[i - 1] : s1;
    const span = s1.tick - s0.tick;
    const a = span > 0 ? Math.max(0, Math.min(1, (rt - s0.tick) / span)) : 1;
    const latest = snaps[snaps.length - 1];
    for (const [id, k1] of s1.byId) {
      const s = this.ensure(id);
      const k0 = s0.byId.get(id) ?? k1;
      const isMe = id === this.localId;
      // life and death change when the view reaches the later snapshot, after the
      // kill/spawn event (released up to one tick ahead) has been shown
      const aliveNow = a >= 1 ? k1.alive : k0.alive;
      s.alive = aliveNow;
      const base = k1.alive ? k1 : k0;
      s.cls = CLASS_IDS[base.cls] ?? s.cls; s.team = base.team as Team;
      s.maxHp = CLASSES[s.cls].hp; s.maxStamina = CLASSES[s.cls].stamina;
      if (!aliveNow) { s.act = Act.Dead; continue; }
      // dead entries carry no state: only blend between two living samples
      const both = k0.alive && k1.alive;
      let src = k1.alive ? k1 : k0;
      if (isMe) { const L = latest.byId.get(id); if (L && L.alive) src = L; }
      s.act = src.act;
      if (isMe && this.pk.alive) {
        const pk = this.pk;
        s.x = pk.x + this.corr.x; s.y = pk.y + this.corr.y; s.z = pk.z + this.corr.z;
        s.vx = pk.vx; s.vy = pk.vy; s.vz = pk.vz; s.onGround = pk.onGround; s.sprinting = pk.sprinting;
        s.yaw = this.input && s.act !== Act.Stun && s.act !== Act.Knockdown && s.act !== Act.Release ? this.input.yaw : pk.yaw;
        s.pitch = this.input ? this.input.pitch : src.pitch;
        s.actT = src.actT + this.snapAge;
      } else if (both) {
        const jump = (k1.x - k0.x) ** 2 + (k1.z - k0.z) ** 2 > 9;
        const t = jump ? 1 : a;
        s.x = k0.x + (k1.x - k0.x) * t; s.y = k0.y + (k1.y - k0.y) * t; s.z = k0.z + (k1.z - k0.z) * t;
        s.yaw = k0.yaw + wrapAngle(k1.yaw - k0.yaw) * t;
        s.pitch = k0.pitch + (k1.pitch - k0.pitch) * t;
        s.vx = k1.vx; s.vy = k1.vy; s.vz = k1.vz; s.onGround = k1.onGround; s.sprinting = k1.sprinting;
        s.actT = k1.act === k0.act && k0.actT <= k1.actT ? k0.actT + (k1.actT - k0.actT) * t : Math.max(0, k1.actT - (s1.tick - rt) * DT);
      } else {
        s.x = src.x; s.y = src.y; s.z = src.z; s.yaw = src.yaw; s.pitch = src.pitch;
        s.vx = src.vx; s.vy = src.vy; s.vz = src.vz; s.onGround = src.onGround; s.sprinting = src.sprinting;
        s.actT = src.actT;
      }
      s.actDur = src.actDur; s.atk = src.atk; s.heavy = src.heavy; s.charge = src.charge; s.draw = src.draw;
      s.abilitySlot = src.abilitySlot; s.knockT = src.knockT; s.stunT = src.stunT; s.bulwarkT = src.bulwarkT;
      s.hp = src.hp; s.bleedStacks = src.bleedStacks;
    }
    const me = this.localId >= 0 ? this.knights[this.localId] : null;
    if (me && this.you) {
      const y = this.you;
      me.stamina = y.stamina * me.maxStamina; me.cd0 = y.cd0; me.cd1 = y.cd1; me.rallyT = y.rallyT; me.bloodletT = y.bloodletT;
      me.spawnProt = y.spawnProt; me.bleedStacks = y.bleedStacks; me.bodkin = y.bodkin;
      me.respawnT = y.respawnT >= NEVER ? 9999 : Math.max(0, y.respawnT - this.snapAge);
      me.nextCls = CLASS_IDS[y.nextCls] ?? me.nextCls;
    }
  }

  /** After a long pause (loading a castle): drop the backlog and rejoin the present. */
  catchUp() {
    this.events.length = 0;
    this.ready.length = 0;
    this.renderTick = this.latestTick - INTERP;
    this.acc = 0;
  }

  drainEvents(): SimEvent[] { const e = this.ready; this.ready = []; return e; }
  setInput(f: InputFrame) { this.input = f as LiveInput; }
  requestSpawn(cls: ClassId) { this.client.send({ t: 'spawn', cls }); }
  chat(text: string) { this.client.send({ t: 'chat', text }); }
  dispose() { this.client.leave(); }
  disposeQuiet() { /* replaced by a new session */ }
}

