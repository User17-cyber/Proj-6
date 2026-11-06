// Network protocol shared by the server and the browser client.
//   * JSON text messages for the lobby, rosters, chat and simulation events.
//   * Binary snapshots (server -> client, 20 Hz) carrying every knight's animated state,
//     the match status and a private block for the receiving player.
//   * Binary input frames (client -> server, one per 60 Hz tick).

import type { MatchSettings, SimEvent, Team, GameMode } from '../types';
import type { ClassId } from '../data/classes';
import { CLASS_IDS, SHIELDS } from '../data/classes';
import type { Match } from '../sim/match';
import type { Knight } from '../sim/knight';
import { wrapAngle } from '../math';

export const PROTOCOL_VERSION = 2;
export const SNAP_EVERY = 3; // ticks between snapshots (60 / 3 = 20 Hz)
export const MSG_SNAPSHOT = 1;
export const MSG_INPUT = 2;
export const NEVER = 6553.5;

export interface RoomSummary { id: string; name: string; mapId: string; mode: GameMode; teamSize: number; humans: number; phase: string; timeLeft: number; difficulty: number }

export type ClientMsg =
  | { t: 'hello'; v: number; name: string }
  | { t: 'list' }
  | { t: 'create'; settings: MatchSettings }
  | { t: 'join'; room: string; team: Team | -1; cls: ClassId; name: string }
  | { t: 'leave' }
  | { t: 'spawn'; cls: ClassId }
  | { t: 'chat'; text: string }
  | { t: 'ping'; at: number };

/** roster row: id, name, team, class, bot (1/0) */
export type RosterRow = [number, string, number, string, number];

export type ServerMsg =
  | { t: 'welcome'; v: number }
  | { t: 'rooms'; rooms: RoomSummary[] }
  | { t: 'created'; room: string }
  | { t: 'joined'; room: string; name: string; knight: number; settings: MatchSettings; tick: number }
  | { t: 'roster'; k: RosterRow[] }
  | { t: 'stats'; s: number[] }
  | { t: 'ev'; e: (SimEvent & { tk: number })[] }
  | { t: 'chat'; name: string; team: number; text: string }
  | { t: 'error'; msg: string }
  | { t: 'pong'; at: number };

// ------------------------------------------------------------------------- snapshots

export interface SnapKnight {
  id: number; alive: boolean; onGround: boolean; sprinting: boolean; heavy: boolean;
  cls: number; team: number; act: number;
  x: number; y: number; z: number; yaw: number; pitch: number; vx: number; vy: number; vz: number;
  actT: number; actDur: number; atk: number; charge: number; draw: number; abilitySlot: number;
  knockT: number; stunT: number; bulwarkT: number; hp: number; bleedStacks: number; shieldBroken: boolean;
}
export interface SnapYou {
  id: number; stamina: number; cd0: number; cd1: number; rallyT: number; bloodletT: number; spawnProt: number;
  bleedStacks: number; bodkin: boolean; respawnT: number; nextCls: number;
  /** shield durability left, 0..1 */
  shield: number;
}
export interface Snapshot {
  tick: number; ack: number; phase: number; phaseT: number; timeLeft: number; winner: number;
  teams: { tickets: number; kills: number; startTickets: number }[];
  objs: { owner: number; progress: number; contested: boolean; n0: number; n1: number }[];
  you: SnapYou | null;
  knights: SnapKnight[];
}

const PHASES = ['warmup', 'live', 'ended'] as const;
export const phaseIndex = (p: string) => Math.max(0, PHASES.indexOf(p as typeof PHASES[number]));
export const phaseName = (i: number) => PHASES[i] ?? 'live';

const q = (v: number, s: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v * s)));

/** Writer for the shared part of a snapshot (knights + status); the per-player block is spliced in. */
export class SnapshotWriter {
  private buf = new ArrayBuffer(64 * 1024);
  private dv = new DataView(this.buf);
  private o = 0;
  /** bytes of the shared knights section */
  private knightsBytes = new Uint8Array(0);
  private head = new Uint8Array(0);

  private u8(v: number) { this.dv.setUint8(this.o, v); this.o += 1; }
  private i8(v: number) { this.dv.setInt8(this.o, v); this.o += 1; }
  private u16(v: number) { this.dv.setUint16(this.o, v, true); this.o += 2; }
  private i16(v: number) { this.dv.setInt16(this.o, v, true); this.o += 2; }
  private u32(v: number) { this.dv.setUint32(this.o, v >>> 0, true); this.o += 4; }
  private f32(v: number) { this.dv.setFloat32(this.o, v, true); this.o += 4; }

  /** Encode the parts every client shares for this tick. */
  prepare(m: Match, tick: number) {
    // header (without ack, which is per client)
    this.o = 0;
    this.u8(phaseIndex(m.phase));
    this.f32(m.phaseT);
    this.f32(m.timeLeft);
    this.i8(m.winner);
    for (const t of m.teams) { this.u16(Math.min(65535, t.tickets)); this.u16(Math.min(65535, t.kills)); this.u16(Math.min(65535, t.startTickets)); }
    this.u8(m.objectives.length);
    for (const ob of m.objectives) { this.i8(ob.owner); this.i8(q(ob.progress, 100, -100, 100)); this.u8(ob.contested ? 1 : 0); this.u8(Math.min(255, ob.n0)); this.u8(Math.min(255, ob.n1)); }
    this.head = new Uint8Array(this.buf.slice(0, this.o));
    // knights
    this.o = 0;
    const ks = m.knights;
    this.u8(Math.min(255, ks.length));
    for (const k of ks) {
      if (k.id > 255) break;
      this.u8(k.id);
      const flags = (k.alive ? 1 : 0) | (k.onGround ? 2 : 0) | (k.sprinting ? 4 : 0) | (k.heavy ? 8 : 0) | (k.shieldBroken ? 16 : 0);
      this.u8(flags);
      this.u8(CLASS_IDS.indexOf(k.cls) | (k.team << 3));
      if (!k.alive) continue;
      this.u8(k.act);
      this.i16(q(k.x, 50, -32767, 32767)); this.i16(q(k.y, 50, -32767, 32767)); this.i16(q(k.z, 50, -32767, 32767));
      this.i16(q(wrapAngle(k.yaw), 32767 / Math.PI, -32767, 32767));
      this.i16(q(k.pitch, 10000, -32767, 32767));
      this.i16(q(k.vx, 100, -32767, 32767)); this.i16(q(k.vy, 100, -32767, 32767)); this.i16(q(k.vz, 100, -32767, 32767));
      this.u16(q(k.actT, 1000, 0, 65535)); this.u16(q(k.actDur, 1000, 0, 65535));
      this.u8(k.atk & 255); this.u8(q(k.charge, 255, 0, 255)); this.u8(q(k.draw, 255, 0, 255)); this.u8(k.abilitySlot & 255);
      this.u8(q(k.knockT, 100, 0, 255)); this.u8(q(k.stunT, 100, 0, 255)); this.u8(q(k.bulwarkT, 10, 0, 255));
      this.u8(q(Math.max(0, k.hp), 1, 0, 255)); this.u8(Math.min(255, k.bleedStacks));
    }
    this.knightsBytes = new Uint8Array(this.buf.slice(0, this.o));
  }

  /** Full message for one client. */
  build(tick: number, ack: number, you: Knight | null): ArrayBuffer {
    const youLen = you ? 1 + 1 + 1 + 2 + 2 + 1 + 1 + 1 + 1 + 1 + 2 + 1 + 1 : 1;
    const total = 1 + 4 + 4 + this.head.length + youLen + this.knightsBytes.length;
    const out = new ArrayBuffer(total);
    const dv = new DataView(out);
    const bytes = new Uint8Array(out);
    let o = 0;
    dv.setUint8(o, MSG_SNAPSHOT); o += 1;
    dv.setUint32(o, tick >>> 0, true); o += 4;
    dv.setUint32(o, ack >>> 0, true); o += 4;
    bytes.set(this.head, o); o += this.head.length;
    if (you) {
      dv.setUint8(o, 1); o += 1;
      dv.setUint8(o, you.id); o += 1;
      dv.setUint8(o, q(you.stamina / Math.max(1, you.def.stamina), 255, 0, 255)); o += 1;
      dv.setUint16(o, q(you.cds[0], 100, 0, 65535), true); o += 2;
      dv.setUint16(o, q(you.cds[1], 100, 0, 65535), true); o += 2;
      dv.setUint8(o, q(you.rallyT, 10, 0, 255)); o += 1;
      dv.setUint8(o, q(you.bloodletT, 10, 0, 255)); o += 1;
      dv.setUint8(o, q(you.spawnProt, 10, 0, 255)); o += 1;
      dv.setUint8(o, Math.min(255, you.bleedStacks)); o += 1;
      dv.setUint8(o, you.bodkin ? 1 : 0); o += 1;
      dv.setUint16(o, isFinite(you.respawnT) ? q(Math.max(0, you.respawnT), 10, 0, 65534) : 65535, true); o += 2;
      dv.setUint8(o, CLASS_IDS.indexOf(you.nextCls)); o += 1;
      dv.setUint8(o, you.def.shield ? q(you.shieldHp / SHIELDS[you.def.shield].hp, 255, 0, 255) : 0); o += 1;
    } else { dv.setUint8(o, 0); o += 1; }
    bytes.set(this.knightsBytes, o);
    return out;
  }
}

export function decodeSnapshot(buf: ArrayBuffer): Snapshot {
  const dv = new DataView(buf);
  let o = 1;
  const u8 = () => dv.getUint8(o++);
  const i8 = () => dv.getInt8(o++);
  const u16 = () => { const v = dv.getUint16(o, true); o += 2; return v; };
  const i16 = () => { const v = dv.getInt16(o, true); o += 2; return v; };
  const u32 = () => { const v = dv.getUint32(o, true); o += 4; return v; };
  const f32 = () => { const v = dv.getFloat32(o, true); o += 4; return v; };
  const tick = u32(), ack = u32();
  const phase = u8(), phaseT = f32(), timeLeft = f32(), winner = i8();
  const teams = [0, 1].map(() => ({ tickets: u16(), kills: u16(), startTickets: u16() }));
  const nObj = u8();
  const objs = [];
  for (let i = 0; i < nObj; i++) objs.push({ owner: i8(), progress: i8() / 100, contested: u8() === 1, n0: u8(), n1: u8() });
  let you: SnapYou | null = null;
  if (u8() === 1) {
    const id = u8(), stamina = u8() / 255, cd0 = u16() / 100, cd1 = u16() / 100, rallyT = u8() / 10, bloodletT = u8() / 10, spawnProt = u8() / 10, bleedStacks = u8(), bodkin = u8() === 1;
    const rr = u16();
    you = { id, stamina, cd0, cd1, rallyT, bloodletT, spawnProt, bleedStacks, bodkin, respawnT: rr === 65535 ? NEVER : rr / 10, nextCls: u8(), shield: 0 };
    you.shield = u8() / 255;
  }
  const n = u8();
  const knights: SnapKnight[] = [];
  for (let i = 0; i < n; i++) {
    const id = u8(), flags = u8(), ct = u8();
    const k: SnapKnight = {
      id, alive: (flags & 1) !== 0, onGround: (flags & 2) !== 0, sprinting: (flags & 4) !== 0, heavy: (flags & 8) !== 0, shieldBroken: (flags & 16) !== 0,
      cls: ct & 7, team: (ct >> 3) & 1, act: 15,
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, actT: 0, actDur: 0, atk: 0, charge: 0, draw: 0, abilitySlot: 0, knockT: 0, stunT: 0, bulwarkT: 0, hp: 0, bleedStacks: 0,
    };
    if (k.alive) {
      k.act = u8();
      k.x = i16() / 50; k.y = i16() / 50; k.z = i16() / 50;
      k.yaw = i16() * Math.PI / 32767; k.pitch = i16() / 10000;
      k.vx = i16() / 100; k.vy = i16() / 100; k.vz = i16() / 100;
      k.actT = u16() / 1000; k.actDur = u16() / 1000;
      k.atk = u8(); k.charge = u8() / 255; k.draw = u8() / 255; k.abilitySlot = u8();
      k.knockT = u8() / 100; k.stunT = u8() / 100; k.bulwarkT = u8() / 10;
      k.hp = u8(); k.bleedStacks = u8();
    }
    knights.push(k);
  }
  return { tick, ack, phase, phaseT, timeLeft, winner, teams, objs, you, knights };
}

// ------------------------------------------------------------------------- inputs

export interface WireInput { seq: number; mx: number; mz: number; yaw: number; pitch: number; buttons: number; aimX: number; aimY: number; aimZ: number }

export function encodeInput(f: WireInput): ArrayBuffer {
  const out = new ArrayBuffer(29);
  const dv = new DataView(out);
  dv.setUint8(0, MSG_INPUT);
  dv.setUint32(1, f.seq >>> 0, true);
  dv.setInt8(5, q(f.mx, 100, -100, 100));
  dv.setInt8(6, q(f.mz, 100, -100, 100));
  dv.setFloat32(7, f.yaw, true);
  dv.setFloat32(11, f.pitch, true);
  dv.setUint16(15, f.buttons & 0xffff, true);
  dv.setFloat32(17, f.aimX, true);
  dv.setFloat32(21, f.aimY, true);
  dv.setFloat32(25, f.aimZ, true);
  return out;
}

export function decodeInput(buf: ArrayBuffer | Uint8Array): WireInput | null {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u.byteLength < 29 || u[0] !== MSG_INPUT) return null;
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const f = {
    seq: dv.getUint32(1, true), mx: dv.getInt8(5) / 100, mz: dv.getInt8(6) / 100,
    yaw: dv.getFloat32(7, true), pitch: dv.getFloat32(11, true), buttons: dv.getUint16(15, true),
    aimX: dv.getFloat32(17, true), aimY: dv.getFloat32(21, true), aimZ: dv.getFloat32(25, true),
  };
  if (![f.yaw, f.pitch].every(Number.isFinite)) return null;
  f.pitch = Math.max(-1.5, Math.min(1.5, f.pitch));
  return f;
}

/** Round floats in an event to keep the JSON small. */
export function compactEvent(e: SimEvent, tk: number): SimEvent & { tk: number } {
  const o: Record<string, unknown> = { tk };
  for (const [k, v] of Object.entries(e)) o[k] = typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v;
  return o as SimEvent & { tk: number };
}
