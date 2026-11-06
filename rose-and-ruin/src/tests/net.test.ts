// Multiplayer smoke test: starts the real server, connects two players, joins a room,
// drives one knight with inputs and checks snapshots, events, acks, chat and movement.
//   npm run build:server && node dist-test/net.test.mjs

import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { decodeSnapshot, encodeInput, MSG_SNAPSHOT, PROTOCOL_VERSION, type ServerMsg, type Snapshot } from '../shared/net/protocol';

const PORT = 8790 + Math.floor(Math.random() * 100);
const srv = spawn(process.execPath, ['dist/server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
let srvOut = '';
srv.stdout!.on('data', (d) => { srvOut += String(d); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fails: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

interface Peer { ws: WebSocket; msgs: ServerMsg[]; snaps: Snapshot[]; knight: number }
function connect(name: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    const p: Peer = { ws, msgs: [], snaps: [], knight: -1 };
    ws.binaryType = 'arraybuffer';
    ws.on('open', () => { ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name })); resolve(p); });
    ws.on('error', reject);
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const b = data as ArrayBuffer;
        if (new Uint8Array(b)[0] === MSG_SNAPSHOT) p.snaps.push(decodeSnapshot(b));
        return;
      }
      const m = JSON.parse(String(data)) as ServerMsg;
      p.msgs.push(m);
      if (m.t === 'joined') p.knight = m.knight;
    });
  });
}
const waitFor = async (pred: () => boolean, ms: number) => { const t0 = Date.now(); while (!pred() && Date.now() - t0 < ms) await sleep(50); return pred(); };

async function main() {
  await waitFor(() => srvOut.includes('server on'), 15000);
  const a = await connect('Sir Tester');
  const b = await connect('<b>Lady\u0007Bug</b>');
  a.ws.send(JSON.stringify({ t: 'list' }));
  check(await waitFor(() => a.msgs.some((m) => m.t === 'rooms'), 3000), 'room list arrives');
  const rooms = (a.msgs.find((m) => m.t === 'rooms') as Extract<ServerMsg, { t: 'rooms' }>).rooms;
  check(rooms.length >= 2, `standing rooms exist (${rooms.length})`);
  const room = rooms[0].id;
  a.ws.send(JSON.stringify({ t: 'join', room, team: 0, cls: 'vanguard', name: 'Sir Tester' }));
  b.ws.send(JSON.stringify({ t: 'join', room, team: 1, cls: 'longbowman', name: '<b>Lady\u0007Bug</b>' }));
  check(await waitFor(() => a.knight >= 0 && b.knight >= 0, 4000), 'both players placed in the battle');
  check(await waitFor(() => a.msgs.some((m) => m.t === 'roster'), 3000), 'roster arrives');
  const roster = (a.msgs.filter((m) => m.t === 'roster').pop() as Extract<ServerMsg, { t: 'roster' }>).k;
  check(roster.length === rooms[0].teamSize * 2, `roster holds the whole battle (${roster.length})`);
  const bRow = roster.find((r) => r[0] === b.knight);
  check(!!bRow && !bRow[1].includes('<') && !bRow[1].includes('\u0007'), `names are sanitised (${bRow?.[1]})`);
  check(await waitFor(() => a.snaps.length > 5, 3000), 'snapshots stream');
  const s0 = a.snaps[a.snaps.length - 1];
  check(s0.you?.id === a.knight, 'snapshot carries the private block for the player');
  check(s0.knights.length === roster.length, 'snapshot covers every knight');
  // wait out the muster, then march forward for two seconds
  await waitFor(() => a.snaps.length > 0 && a.snaps[a.snaps.length - 1].phase === 1, 12000);
  const before = a.snaps[a.snaps.length - 1].knights.find((k) => k.id === a.knight)!;
  check(before.alive, 'player knight is alive at the start of battle');
  let seq = 0;
  const yaw = before.yaw;
  const t0 = Date.now();
  while (Date.now() - t0 < 2000) {
    seq++;
    a.ws.send(encodeInput({ seq, mx: 0, mz: 1, yaw, pitch: 0, buttons: seq === 30 ? 1 : 0, aimX: NaN, aimY: NaN, aimZ: NaN }));
    await sleep(1000 / 60);
  }
  await sleep(300);
  const last = a.snaps[a.snaps.length - 1];
  const after = last.knights.find((k) => k.id === a.knight)!;
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  check(moved > 4, `inputs move the knight (${moved.toFixed(2)} m)`);
  check(last.ack > 60 && last.ack <= seq, `server acknowledges inputs (ack ${last.ack} of ${seq})`);
  check(a.msgs.some((m) => m.t === 'ev' && m.e.some((e) => e.t === 'swing' && e.k === a.knight)), 'the attack press produced a swing event');
  b.ws.send(JSON.stringify({ t: 'chat', text: 'For York!' }));
  check(await waitFor(() => a.msgs.some((m) => m.t === 'chat' && m.text === 'For York!'), 2000), 'chat is relayed');
  // leaving hands the place back to a bot
  b.ws.send(JSON.stringify({ t: 'leave' }));
  await sleep(600);
  a.ws.send(JSON.stringify({ t: 'list' }));
  await sleep(300);
  const list2 = (a.msgs.filter((m) => m.t === 'rooms').pop() as Extract<ServerMsg, { t: 'rooms' }>).rooms;
  check(list2.find((r) => r.id === room)!.humans === 1, 'leaving frees the place');
  // bad data does not hurt the server
  a.ws.send('not json');
  a.ws.send(new Uint8Array([2, 1, 2]));
  a.ws.send(JSON.stringify({ t: 'create', settings: { mapId: 'nowhere', teamSize: 9999, mode: 'chaos' } }));
  check(await waitFor(() => a.msgs.some((m) => m.t === 'created'), 3000), 'creating a room with junk settings is sanitised');
  const status = await fetch(`http://localhost:${PORT}/status`).then((r) => r.json()) as { rooms: { teamSize: number; mapId: string }[] };
  const made = status.rooms[status.rooms.length - 1];
  check(made.teamSize === 64 && made.mapId === 'bodiam', `junk settings clamped (${made.teamSize}, ${made.mapId})`);
  a.ws.close(); b.ws.close();
}

main().catch((e) => { fails.push(String(e)); console.error(e); }).finally(() => {
  srv.kill();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall net checks passed');
  process.exit(fails.length ? 1 : 0);
});
