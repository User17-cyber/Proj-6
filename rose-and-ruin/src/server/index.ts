// Rose & Ruin server: serves the built client and runs authoritative matches.
//   node dist/server.mjs            (PORT, default 8787)
// Every room is a full battle; bots fill the places of absent players, a joining
// player takes over a bot's place and gives it back on leaving. Matches step at 60 Hz;
// clients receive snapshots at 20 Hz plus the simulation's events.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import { Match } from '../shared/sim/match';
import { buildMap, MAPS } from '../shared/world/maps/index';
import { Btn, DEFAULT_SETTINGS, DT, type GameMode, type InputFrame, type MatchSettings, type Team } from '../shared/types';
import { CLASS_IDS, type ClassId } from '../shared/data/classes';
import {
  PROTOCOL_VERSION, SNAP_EVERY, SnapshotWriter, compactEvent, decodeInput,
  type ClientMsg, type ServerMsg, type RoomSummary, type RosterRow, type WireInput,
} from '../shared/net/protocol';

const PORT = Number(process.env.PORT ?? 8787);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.CLIENT_DIR ?? path.join(HERE, 'client'));
const MAX_ROOMS = 8;
const MAX_HUMANS = 32;
const HOLD = Btn.Attack | Btn.Block | Btn.Sprint | Btn.Thrust | Btn.Zoom;

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ------------------------------------------------------------------ static files
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.hdr': 'application/octet-stream',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.map': 'application/json', '.txt': 'text/plain',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/status') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: [...rooms.values()].map((r) => r.summary()), players: clients.size }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  let rel: string;
  try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return; }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, '.' + path.posix.normalize(rel));
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Rose & Ruin server is running. Build the client with `npm run build`, or use `npm run dev` and open http://localhost:5173.');
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'content-length': st.size,
      'cache-control': rel.includes('/assets/') && ext !== '.html' ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
});

// ------------------------------------------------------------------ clients & rooms
let nextClientId = 1;
let nextRoomId = 1;

class Client {
  readonly id = nextClientId++;
  name = 'Sir Wanderer';
  room: Room | null = null;
  knightId = -1;
  cls: ClassId = 'manatarms';
  /** orders this player has not unlocked yet (sent by his client) */
  locked: ClassId[] = [];
  team: Team | -1 = -1;
  queue: WireInput[] = [];
  last: WireInput | null = null;
  ack = 0;
  frame: InputFrame = { seq: 0, mx: 0, mz: 0, yaw: 0, pitch: 0, buttons: 0 };
  chatAt = 0;
  createAt = 0;
  alive = true;
  constructor(readonly ws: WebSocket) {}
  send(m: ServerMsg) { if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(m)); }
  sendRaw(d: string | ArrayBuffer) { if (this.ws.readyState === this.ws.OPEN && this.ws.bufferedAmount < 1 << 20) this.ws.send(d); }
}

const clients = new Set<Client>();
const rooms = new Map<string, Room>();

class Room {
  readonly id: string;
  match!: Match;
  readonly clients = new Set<Client>();
  private writer = new SnapshotWriter();
  private events: ReturnType<typeof compactEvent>[] = [];
  private rosterSig = '';
  private statsT = 0;
  tick = 0;
  emptyFor = 0;

  constructor(public name: string, public settings: MatchSettings, readonly persistent: boolean) {
    this.id = String(nextRoomId++);
    this.newMatch(settings);
  }

  private newMatch(settings: MatchSettings) {
    this.settings = settings;
    this.match = new Match(settings, buildMap(settings.mapId));
    this.events = [];
    this.rosterSig = '';
    log(`room ${this.id} "${this.name}": ${settings.mapId} ${settings.mode} ${settings.teamSize}v${settings.teamSize}`);
  }

  summary(): RoomSummary {
    return { id: this.id, name: this.name, mapId: this.settings.mapId, mode: this.settings.mode, teamSize: this.settings.teamSize, humans: this.clients.size, phase: this.match.phase, timeLeft: this.match.timeLeft, difficulty: this.settings.difficulty };
  }

  join(c: Client, team: Team | -1, cls: ClassId) {
    if (this.clients.size >= Math.min(MAX_HUMANS, this.settings.teamSize * 2)) { c.send({ t: 'error', msg: 'That muster is full.' }); return; }
    c.room?.leave(c);
    c.room = this;
    c.cls = cls; c.team = team;
    this.clients.add(c);
    this.place(c);
    this.broadcastChat('Herald', -1, `${c.name} joins the field.`);
  }

  private place(c: Client) {
    const k = this.match.addPlayer(c.name, c.id, c.team, c.cls, c.locked ?? []);
    c.knightId = k.id;
    c.queue = []; c.last = null; c.ack = 0;
    c.send({ t: 'joined', room: this.id, name: c.name, knight: k.id, settings: this.settings, tick: this.tick });
    this.rosterSig = '';
  }

  leave(c: Client) {
    if (!this.clients.has(c)) return;
    this.clients.delete(c);
    if (c.knightId >= 0) this.match.removePlayer(c.knightId);
    c.knightId = -1;
    c.room = null;
    this.rosterSig = '';
    this.broadcastChat('Herald', -1, `${c.name} has left the field.`);
    // an empty muster waits, freshly drawn up, for the next player to arrive
    if (!this.clients.size) this.newMatch({ ...this.settings, seed: (Math.random() * 1e9) | 0 });
  }

  broadcastChat(name: string, team: number, text: string) {
    const m = JSON.stringify({ t: 'chat', name, team, text } satisfies ServerMsg);
    for (const c of this.clients) c.sendRaw(m);
  }

  step() {
    if (!this.clients.size) { this.emptyFor += DT; return; }
    this.emptyFor = 0;
    const m = this.match;
    for (const c of this.clients) {
      if (c.knightId < 0) continue;
      let f = c.queue.shift();
      // a client far ahead of the server: fold the backlog, keeping every press
      if (c.queue.length > 8) {
        let presses = f ? f.buttons : 0;
        while (c.queue.length > 2) presses |= c.queue.shift()!.buttons;
        f = c.queue.shift();
        if (f) f.buttons |= presses & ~HOLD;
      }
      if (f) { c.last = f; c.ack = f.seq; }
      const src = f ?? c.last;
      if (!src) continue;
      const fr = c.frame;
      fr.seq = src.seq;
      fr.mx = Math.max(-1, Math.min(1, src.mx)); fr.mz = Math.max(-1, Math.min(1, src.mz));
      fr.yaw = src.yaw; fr.pitch = src.pitch;
      fr.buttons = f ? src.buttons : src.buttons & HOLD;
      if (Number.isFinite(src.aimX) && Number.isFinite(src.aimY) && Number.isFinite(src.aimZ)) { fr.aimX = src.aimX; fr.aimY = src.aimY; fr.aimZ = src.aimZ; }
      else { fr.aimX = fr.aimY = fr.aimZ = undefined; }
      m.setInput(c.knightId, fr);
    }
    m.step();
    for (const e of m.events) this.events.push(compactEvent(e, this.tick));
    m.events.length = 0;
    this.tick++;
    if (this.tick % SNAP_EVERY === 0) this.broadcast();
    if (m.paused) this.rotate();
  }

  private broadcast() {
    const m = this.match;
    if (this.events.length) {
      const msg = JSON.stringify({ t: 'ev', e: this.events } satisfies ServerMsg);
      this.events = [];
      for (const c of this.clients) c.sendRaw(msg);
    }
    if (this.tick % (SNAP_EVERY * 5) === 0 || !this.rosterSig) {
      const sig = m.knights.map((k) => `${k.name}${k.cls}${k.team}${k.bot ? 1 : 0}`).join('|');
      if (sig !== this.rosterSig) {
        this.rosterSig = sig;
        const rows: RosterRow[] = m.knights.map((k) => [k.id, k.name, k.team, k.cls, k.bot ? 1 : 0]);
        const msg = JSON.stringify({ t: 'roster', k: rows } satisfies ServerMsg);
        for (const c of this.clients) c.sendRaw(msg);
      }
    }
    this.statsT += SNAP_EVERY * DT;
    if (this.statsT >= 1) {
      this.statsT = 0;
      const s: number[] = [];
      for (const k of m.knights) s.push(k.id, k.kills, k.deaths, k.assists, k.score);
      const msg = JSON.stringify({ t: 'stats', s } satisfies ServerMsg);
      for (const c of this.clients) c.sendRaw(msg);
    }
    this.writer.prepare(m, this.tick);
    for (const c of this.clients) c.sendRaw(this.writer.build(this.tick, c.ack, c.knightId >= 0 ? m.knights[c.knightId] : null));
  }

  /** The battle is over: the next castle in the rotation, same company. */
  private rotate() {
    const i = MAPS.findIndex((d) => d.id === this.settings.mapId);
    const next = MAPS[(i + 1) % MAPS.length].id;
    this.newMatch({ ...this.settings, mapId: next, seed: (Math.random() * 1e9) | 0 });
    for (const c of this.clients) this.place(c);
  }
}

function sanitizeName(s: unknown): string {
  const t = String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24);
  return t || 'Sir Wanderer';
}

function sanitizeSettings(s: Partial<MatchSettings> | undefined): MatchSettings {
  const d = DEFAULT_SETTINGS;
  const modes: GameMode[] = ['battle', 'conquest', 'laststand', 'duel'];
  const n = (v: unknown, lo: number, hi: number, def: number) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : def; };
  return {
    mapId: MAPS.some((m) => m.id === s?.mapId) ? s!.mapId! : d.mapId,
    mode: modes.includes(s?.mode as GameMode) ? (s!.mode as GameMode) : d.mode,
    teamSize: n(s?.teamSize, 5, 80, d.teamSize),
    difficulty: n(s?.difficulty, 0, 3, d.difficulty) as MatchSettings['difficulty'],
    friendlyFire: !!s?.friendlyFire,
    timeLimit: n(s?.timeLimit, 300, 3600, d.timeLimit),
    seed: n(s?.seed, 0, 2 ** 31 - 1, 1),
    ticketScale: n(s?.ticketScale, 2, 10, d.ticketScale),
    rounds: n(s?.rounds, 1, 15, d.rounds ?? 5),
    duelFoe: CLASS_IDS.includes(s?.duelFoe as ClassId) ? s!.duelFoe : 'random',
  };
}

const isClass = (c: unknown): c is ClassId => CLASS_IDS.includes(c as ClassId);

function onMessage(c: Client, data: RawData, isBinary: boolean) {
  if (isBinary) {
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    const f = decodeInput(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    if (f && c.room && c.knightId >= 0) {
      c.queue.push(f);
      if (c.queue.length > 30) c.queue.splice(0, c.queue.length - 30);
    }
    return;
  }
  let m: ClientMsg;
  try { m = JSON.parse(String(data)) as ClientMsg; } catch { return; }
  if (!m || typeof m !== 'object') return;
  const now = Date.now();
  switch (m.t) {
    case 'hello':
      c.name = sanitizeName(m.name);
      c.send({ t: 'welcome', v: PROTOCOL_VERSION });
      if (m.v !== PROTOCOL_VERSION) c.send({ t: 'error', msg: 'This client is a different version from the server. Reload the page.' });
      break;
    case 'list':
      c.send({ t: 'rooms', rooms: [...rooms.values()].map((r) => r.summary()) });
      break;
    case 'create': {
      if (now - c.createAt < 5000) { c.send({ t: 'error', msg: 'Wait a moment before raising another banner.' }); break; }
      if (rooms.size >= MAX_ROOMS) { c.send({ t: 'error', msg: 'The server cannot hold more musters.' }); break; }
      c.createAt = now;
      const settings = sanitizeSettings(m.settings);
      const def = MAPS.find((d) => d.id === settings.mapId)!;
      const r = new Room(`${c.name}'s muster at ${def.name.replace(/^The /, '')}`, settings, false);
      rooms.set(r.id, r);
      c.send({ t: 'created', room: r.id });
      break;
    }
    case 'join': {
      const r = rooms.get(String(m.room));
      if (!r) { c.send({ t: 'error', msg: 'That muster has disbanded.' }); break; }
      c.name = sanitizeName(m.name ?? c.name);
      const team = m.team === 0 || m.team === 1 ? m.team : -1;
      c.locked = Array.isArray(m.locked) ? m.locked.filter(isClass).slice(0, 16) : [];
      r.join(c, team, isClass(m.cls) ? m.cls : 'manatarms');
      break;
    }
    case 'leave':
      c.room?.leave(c);
      break;
    case 'spawn':
      if (c.room && c.knightId >= 0 && isClass(m.cls)) { c.cls = m.cls; c.room.match.requestSpawn(c.knightId, m.cls, typeof m.zone === 'number' ? m.zone : undefined); }
      break;
    case 'chat': {
      if (!c.room || now - c.chatAt < 600) break;
      c.chatAt = now;
      const text = String(m.text ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
      if (!text) break;
      const k = c.knightId >= 0 ? c.room.match.knights[c.knightId] : null;
      c.room.broadcastChat(c.name, k ? k.team : -1, text);
      break;
    }
    case 'ping':
      c.send({ t: 'pong', at: Number(m.at) || 0 });
      break;
    default: break;
  }
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname !== '/ws') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});
wss.on('connection', (ws: WebSocket) => {
  const c = new Client(ws);
  clients.add(c);
  ws.on('message', (data, isBinary) => { try { onMessage(c, data, isBinary); } catch (e) { log('message error', e); } });
  ws.on('pong', () => { c.alive = true; });
  ws.on('close', () => { c.room?.leave(c); clients.delete(c); });
  ws.on('error', () => { /* closed below */ });
});
// drop connections that stopped answering
setInterval(() => {
  for (const c of clients) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false;
    try { c.ws.ping(); } catch { /* closing */ }
  }
}, 20000);

// ------------------------------------------------------------------ the clock
function standingRooms() {
  const a = new Room("The King's Muster at Bodiam", { ...DEFAULT_SETTINGS, mapId: 'bodiam', mode: 'battle', teamSize: 24, seed: 11 }, true);
  const b = new Room('The Siege of Harlech', { ...DEFAULT_SETTINGS, mapId: 'harlech', mode: 'conquest', teamSize: 24, seed: 12 }, true);
  rooms.set(a.id, a); rooms.set(b.id, b);
}
standingRooms();

let last = performance.now();
let acc = 0;
let worst = 0;
function clock() {
  const now = performance.now();
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  let n = 0;
  while (acc >= DT && n < 8) {
    const t0 = performance.now();
    for (const r of rooms.values()) r.step();
    worst = Math.max(worst, performance.now() - t0);
    acc -= DT;
    n++;
  }
  if (n === 8) acc = 0;
  for (const [id, r] of rooms) if (!r.persistent && r.emptyFor > 120) { rooms.delete(id); log(`room ${id} disbanded`); }
  setTimeout(clock, Math.max(0, (DT - acc) * 1000 - 0.5));
}
setInterval(() => { if (clients.size) log(`${clients.size} connected, worst step ${worst.toFixed(2)} ms`); worst = 0; }, 60000);

server.listen(PORT, () => {
  log(`Rose & Ruin server on http://localhost:${PORT} (client: ${fs.existsSync(path.join(ROOT, 'index.html')) ? ROOT : 'not built; use npm run dev'})`);
  clock();
});

