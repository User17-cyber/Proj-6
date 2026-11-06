// Headless test of the browser multiplayer client (NetClient + NetSession) against the real
// server: the predicted local knight must track the server's authoritative position, remote
// knights must interpolate smoothly, and events must arrive in order.
//   node dist-test/predict.test.mjs   (after npm run build:server)

import { spawn } from 'node:child_process';
(globalThis as unknown as { window: typeof globalThis }).window = globalThis;
const { NetClient, NetSession } = await import('../client/game/net');
const { Act } = await import('../shared/types');

const PORT = 8900 + Math.floor(Math.random() * 90);
const srv = spawn(process.execPath, ['dist/server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
let out = '';
srv.stdout!.on('data', (d) => { out += String(d); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fails: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
const until = async (p: () => boolean, ms: number) => { const t0 = Date.now(); while (!p() && Date.now() - t0 < ms) await sleep(20); return p(); };

async function main() {
  await until(() => out.includes('server on'), 15000);
  let session: InstanceType<typeof NetSession> | null = null;
  let rooms: { id: string }[] = [];
  const client = new NetClient({
    state: () => { /* */ }, rooms: (r) => { rooms = r; }, created: () => { /* */ },
    joined: (s) => { session = s; }, error: (m) => fails.push('server error: ' + m),
  });
  client.connect(`ws://localhost:${PORT}/ws`, 'Sir Predictor');
  check(await until(() => rooms.length > 0, 5000), 'client receives the room list');
  client.join(rooms[0].id, 'Sir Predictor', 0, 'manatarms');
  check(await until(() => !!session, 5000), 'client joins and gets a session');
  const s = session! as InstanceType<typeof NetSession>;
  const input = { seq: 0, mx: 0, mz: 0, yaw: 0, pitch: 0, buttons: 0, held: 0, pulse: 0 };
  s.setInput(input);
  // run the client loop at 60 Hz in real time
  let last = performance.now();
  let errMax = 0, errSum = 0, errN = 0;
  let remoteJump = 0;
  const prevRemote = new Map<number, { x: number; z: number }>();
  let events = 0;
  let marching = false;
  const loop = setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    s.update(dt);
    events += s.drainEvents().length;
    const me = s.knights[s.localId];
    if (!me) return;
    if (s.phase === 'live' && me.alive) {
      if (!marching) { marching = true; input.yaw = me.yaw; }
      // weave left and right while marching
      input.mz = 1; input.mx = Math.sin(now / 400) > 0 ? 0.6 : -0.6;
      input.yaw += 0.004;
      input.buttons = input.held = 0;
    }
    // remote smoothness: no knight should hop more than ~sprint speed per frame
    for (const k of s.knights) {
      if (k.id === s.localId || !k.alive) { prevRemote.delete(k.id); continue; }
      const p = prevRemote.get(k.id);
      if (p) remoteJump = Math.max(remoteJump, Math.hypot(k.x - p.x, k.z - p.z) / Math.max(dt, 1e-3));
      prevRemote.set(k.id, { x: k.x, z: k.z });
    }
  }, 1000 / 60);
  await until(() => marching, 15000);
  check(marching, 'battle goes live and the knight can march');
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) {
    await sleep(100);
    // compare prediction with the server's newest view of us, allowing for the round trip
    const snap = (s as unknown as { lastSnap: { knights: { id: number; x: number; z: number; alive: boolean }[] } | null }).lastSnap;
    const me = s.knights[s.localId];
    const sk = snap?.knights.find((k) => k.id === s.localId);
    if (sk && sk.alive && me.alive && me.act !== Act.Knockdown) {
      const pk = (s as unknown as { pk: { x: number; z: number } }).pk;
      // the snapshot lags the prediction by the inputs in flight; measure the replayed error instead
      const e = Math.hypot(pk.x - me.x, pk.z - me.z);
      errMax = Math.max(errMax, e); errSum += e; errN++;
    }
  }
  clearInterval(loop);
  const me = s.knights[s.localId];
  const snap = (s as unknown as { lastSnap: { knights: { id: number; x: number; z: number }[] } }).lastSnap;
  const sk = snap.knights.find((k) => k.id === s.localId)!;
  const gap = Math.hypot(me.x - sk.x, me.z - sk.z);
  console.log(`  visual correction max ${errMax.toFixed(3)} m, mean ${(errSum / Math.max(1, errN)).toFixed(3)} m; prediction ahead of server by ${gap.toFixed(2)} m; fastest remote step ${remoteJump.toFixed(1)} m/s; ${events} events`);
  check(errN > 10 && errMax < 0.8, 'prediction corrections stay small');
  check(gap < 2.5, 'prediction stays close to the authoritative position');
  check(remoteJump < 16, 'remote knights move smoothly');
  check(events > 20, 'events flow to the view');
  client.disconnect();
}

main().catch((e) => { fails.push(String(e)); console.error(e); }).finally(() => {
  srv.kill();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall prediction checks passed');
  process.exit(fails.length ? 1 : 0);
});
