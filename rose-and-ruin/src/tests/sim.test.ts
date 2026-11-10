// Headless checks for the simulation: builds every map, runs bot battles and verifies
// sanity (no NaNs, knights fight and die, matches end, nobody escapes the world).
import { buildMap, MAPS } from '../shared/world/maps/index';
import { Match } from '../shared/sim/match';
import { Act, Btn, DEFAULT_SETTINGS, type GameMode } from '../shared/types';
import { WEAPONS } from '../shared/data/weapons';
import { CLASS_IDS, SHIELDS } from '../shared/data/classes';
import { wearShield } from '../shared/sim/combat';
import { keyToPose, newPose } from '../shared/sim/pose';
import { DEG, rotY } from '../shared/math';

let failures = 0;
const fail = (msg: string) => { failures++; console.error('FAIL', msg); };

// 1. pose reachability: every key pose must be reachable by the arms
function checkPoses() {
  const p = newPose();
  const v = { x: 0, y: 0, z: 0 };
  for (const w of Object.values(WEAPONS)) {
    if (w.visual === 'bow') continue;
    const keys: [string, readonly number[]][] = [['idle', w.idle], ['carry', w.carry], ['block', w.block]];
    w.attacks.forEach((a, i) => { keys.push([`a${i}.wind`, a.wind], [`a${i}.mid`, a.mid], [`a${i}.end`, a.end]); });
    for (const [name, k] of keys) {
      keyToPose(k, p);
      const twist = k[5] * DEG, lean = k[6] * DEG;
      for (const side of [1, -1]) {
        if (side === -1 && w.offhand === null) continue;
        // shoulder: lean about the hips (y=1.0), then twist
        const sx = 0.19 * side, sy0 = 0.45;
        const ly = 1.0 + sy0 * Math.cos(lean), lz = -sy0 * Math.sin(lean);
        rotY(v, sx, ly, lz, twist);
        const gx = side === 1 ? p.gx : p.gx + p.dx * (w.offhand ?? 0);
        const gy = side === 1 ? p.gy : p.gy + p.dy * (w.offhand ?? 0);
        const gz = side === 1 ? p.gz : p.gz + p.dz * (w.offhand ?? 0);
        const d = Math.hypot(gx - v.x, gy - v.y, gz - v.z);
        if (d > 0.66) fail(`${w.id} ${name} ${side === 1 ? 'main' : 'off'} hand out of reach: ${d.toFixed(2)} m`);
      }
    }
  }
}

function runBattle(mapId: string, mode: GameMode, teamSize: number, seconds: number, difficulty: 0 | 1 | 2 | 3) {
  const t0 = performance.now();
  const map = buildMap(mapId);
  const tBuild = performance.now() - t0;
  const m = new Match({ ...DEFAULT_SETTINGS, mapId, mode, teamSize, difficulty, seed: 7, timeLimit: seconds + 30 }, map);
  // every spawn zone and objective must be reachable from every other
  const pts: [string, number, number][] = [];
  map.spawns.forEach((zs, t) => zs.forEach((z, i) => pts.push([`spawn${t}.${i}`, z.x, z.z])));
  map.objectives.forEach((o) => pts.push([`obj ${o.short}`, o.x, o.z]));
  map.rally.forEach((r, i) => pts.push([`rally${i}`, r[0], r[1]]));
  const comps = pts.map(([name, x, z]) => { const c = m.nav.nearestWalkable(x, z, 6); return [name, c >= 0 ? m.nav.comp[c] : -1] as const; });
  const c0 = comps[0][1];
  for (const [name, c] of comps) if (c !== c0 || c < 0) fail(`${mapId}: ${name} is not connected to ${comps[0][0]} (component ${c} vs ${c0})`);
  const tNav = performance.now() - t0 - tBuild;
  const steps = seconds * 60;
  let shieldBreaks = 0, hits = 0, blocks = 0, kills = 0, arrows = 0, abilities = 0, parries = 0;
  const byKind = [0, 0, 0, 0, 0, 0];
  const clsKills = new Map<string, number>(), clsDeaths = new Map<string, number>();
  const abilityBy = new Map<string, number>();
  let maxStep = 0;
  const ts = performance.now();
  for (let i = 0; i < steps; i++) {
    const s0 = performance.now();
    m.step();
    maxStep = Math.max(maxStep, performance.now() - s0);
    for (const e of m.events) {
      if (e.t === 'hit') { hits++; byKind[e.kind]++; if (e.kind === 2 && e.a >= 0) { const c = m.knights[e.a].cls; abilityBy.set(c, (abilityBy.get(c) ?? 0) + 1); } }
      if (e.t === 'kill') {
        kills++;
        const kk = m.knights[e.killer], vv = m.knights[e.victim];
        if (kk) clsKills.set(kk.cls, (clsKills.get(kk.cls) ?? 0) + 1);
        clsDeaths.set(vv.cls, (clsDeaths.get(vv.cls) ?? 0) + 1);
      }
      else if (e.t === 'block') { blocks++; if (e.parry) parries++; }
      else if (e.t === 'arrow') arrows++;
      else if (e.t === 'ability') abilities++;
      else if (e.t === 'shieldBreak') shieldBreaks++;
    }
    m.events.length = 0;
    for (const k of m.knights) {
      if (!k.alive) continue;
      if (!isFinite(k.x + k.y + k.z + k.vx + k.vz + k.yaw + k.hp)) { fail(`${mapId}: NaN on knight ${k.id}`); return; }
      if (k.y < -5) fail(`${mapId}: knight ${k.id} fell out of the world at ${k.x.toFixed(1)},${k.z.toFixed(1)}`);
    }
    if (m.phase === 'ended' && m.phaseT > 1) break;
  }
  const simMs = performance.now() - ts;
  const per = simMs / Math.max(1, m.tick);
  console.log(`${mapId.padEnd(9)} ${mode.padEnd(9)} ${teamSize}v${teamSize} d${difficulty}: build ${tBuild.toFixed(0)}ms nav ${tNav.toFixed(0)}ms | ${(m.tick / 60).toFixed(0)}s sim, ${per.toFixed(2)}ms/tick (max ${maxStep.toFixed(1)}) | hits ${hits} blocks ${blocks} (parry ${parries}) kills ${kills} arrows ${arrows} abilities ${abilities} shields broken ${shieldBreaks} | tickets ${m.teams[0].tickets}/${m.teams[1].tickets} phase ${m.phase} winner ${m.winner}`);
  console.log('   hits by kind [melee, arrow, ability, kick, bleed, volley]:', byKind.join(' '), '| K/D by class:', [...new Set([...clsKills.keys(), ...clsDeaths.keys()])].map((c) => `${c} ${clsKills.get(c) ?? 0}/${clsDeaths.get(c) ?? 0}`).join(', '));
  console.log('   ability hits by class:', [...abilityBy].map(([c, n]) => `${c} ${n}`).join(', '));
  if (kills < 3) fail(`${mapId}/${mode}: too few kills (${kills}) - bots are not fighting`);
  if (per > 4) fail(`${mapId}: simulation too slow (${per.toFixed(2)} ms/tick)`);
  return m;
}

checkPoses();
const only = process.argv[2];
for (const def of MAPS) {
  if (only && def.id !== only) continue;
  runBattle(def.id, 'battle', 24, 150, 1);
}
if (!only) {
  runBattle(MAPS[0].id, 'conquest', 20, 120, 2);
  runBattle(MAPS[0].id, 'laststand', 20, 240, 0);
}
// pitched battle: a player fights as each order once, then is out
{
  const m = new Match({ ...DEFAULT_SETTINGS, mapId: 'bodiam', mode: 'battle', teamSize: 20, seed: 3 }, buildMap('bodiam'));
  const me = m.addPlayer('Tester', 1, 0, 'vanguard');
  for (let i = 0; i < 60 * 7; i++) m.step();
  const seen: string[] = [];
  for (let life = 0; life < CLASS_IDS.length; life++) {
    if (!me.alive) { fail(`life ${life}: player not alive`); break; }
    seen.push(me.cls);
    me.spawnProt = 0; me.invulnT = 0;
    m.damage(me, null, 9999, { zone: 1, dtype: 0, kind: 0, x: me.x, y: me.y + 1, z: me.z, dx: 0, dy: 0, dz: 1 });
    m.requestSpawn(me.id, me.cls); // asking for a spent order is refused
    if (me.wantSpawn) fail('a spent order was accepted');
    const free = m.freeClass(me);
    if (free) m.requestSpawn(me.id, free);
    for (let i = 0; i < 60 * 8 && !me.alive && free; i++) m.step();
  }
  if (new Set(seen).size !== CLASS_IDS.length) fail(`orders reused: ${seen.join(',')}`);
  if (me.alive || isFinite(me.respawnT)) fail('player could respawn after every order fell');
  console.log(`pitched lives: ${seen.join(' > ')}; out after ${seen.length}`);
}
// shields: blocked blows wear them down until they splinter, then the guard is the weapon's own
{
  const m = new Match({ ...DEFAULT_SETTINGS, mapId: 'bodiam', mode: 'battle', teamSize: 20, seed: 5 }, buildMap('bodiam'));
  const me = m.addPlayer('Tester', 0, 0, 'pavisier');
  for (let i = 0; i < 60 * 7; i++) m.step();
  const full = SHIELDS.pavise.hp;
  if (me.shieldHp !== full) fail(`pavise starts at ${me.shieldHp}, expected ${full}`);
  if (me.blockArc !== SHIELDS.pavise.blockArc) fail('pavise guard arc not applied');
  let broke = 0;
  const sub = m.events.length;
  for (let n = 0; n < 40 && me.shieldHp > 0; n++) wearShield(m, me, -1, 60, me.x, me.y + 1, me.z);
  for (const e of m.events.slice(sub)) if (e.t === 'shieldBreak' && e.k === me.id) broke++;
  if (broke !== 1) fail(`expected one shieldBreak event, got ${broke}`);
  if (me.shield || !me.shieldBroken) fail('shield should be broken');
  if (me.blockArc !== WEAPONS.spear.blockArc) fail('broken shield still guards like a shield');
  me.spawnProt = 0; me.invulnT = 0;
  m.damage(me, null, 9999, { zone: 1, dtype: 0, kind: 0, x: me.x, y: me.y + 1, z: me.z, dx: 0, dy: 0, dz: 1 });
  m.requestSpawn(me.id, 'bachelor');
  for (let i = 0; i < 60 * 8 && !me.alive; i++) m.step();
  if (!me.alive || me.shieldHp !== SHIELDS.heater.hp) fail(`a fresh shield on respawn (alive ${me.alive}, hp ${me.shieldHp})`);
  console.log(`shields: pavise ${full} splintered after ${Math.ceil(full / 60)} blows; fresh heater on respawn`);
}
// attack input: spam-clicking completes each blow (no heavy conversion, no restart); a steady hold makes it heavy
{
  const m = new Match({ ...DEFAULT_SETTINGS, mapId: 'bodiam', mode: 'duel', rounds: 99, seed: 21 }, buildMap('bodiam'));
  const me = m.addPlayer('Tester', 1, 0, 'manatarms');
  while (m.phase !== 'live') m.step();
  const foe = m.knights.find((k) => k !== me)!;
  m.brains.delete(foe.id); foe.input.buttons = 0; foe.x = me.x + 30; foe.z = me.z;
  const run = (pattern: (i: number) => boolean, ticks: number) => {
    let swings = 0, heavy = 0, restarts = 0, prevAct = me.act, prevT = me.actT;
    for (let i = 0; i < ticks; i++) {
      me.input = { ...me.input, buttons: pattern(i) ? Btn.Attack : 0 };
      me.stamina = me.def.stamina; me.spawnProt = 0;
      m.step();
      if (me.act === Act.Windup && prevAct === Act.Windup && me.actT < prevT - 1e-6) restarts++;
      prevAct = me.act; prevT = me.actT;
      for (const e of m.events) if (e.t === 'swing' && e.k === me.id) { swings++; if (e.heavy) heavy++; }
      m.events.length = 0;
    }
    return { swings, heavy, restarts };
  };
  // click: 3 ticks down, 4 up, for 6 seconds
  const spam = run((i) => i % 7 < 3, 360);
  if (spam.heavy > 0) fail(`spam-clicking turned ${spam.heavy} blows heavy`);
  if (spam.restarts > 0) fail(`spam-clicking restarted the windup ${spam.restarts} times`);
  if (spam.swings < 4) fail(`spam-clicking produced only ${spam.swings} completed swings in 6 s`);
  for (let i = 0; i < 120; i++) { me.input = { ...me.input, buttons: 0 }; m.step(); m.events.length = 0; }
  const hold = run(() => true, 120);
  if (hold.heavy < 1) fail('holding the attack button no longer makes a heavy blow');
  console.log(`attack input: spam-click ${spam.swings} swings (${spam.heavy} heavy, ${spam.restarts} restarts); hold ${hold.swings} swings (${hold.heavy} heavy)`);
}
// the jab: one press of the thrust key always produces a jab, whatever the knight is doing
{
  const states: [string, (k: import('../shared/sim/knight').Knight) => void][] = [
    ['idle', () => {}],
    ['recoiling', (k) => { k.act = Act.Deflect; k.actT = 0; k.actDur = 0.32; }],
    ['staggered', (k) => { k.act = Act.Stagger; k.actT = 0; k.actDur = 0.36; }],
    ['parried', (k) => { k.act = Act.Parried; k.actT = 0; k.actDur = 0.8; }],
    ['winding up', (k) => { k.act = Act.Windup; k.atk = 0; k.actT = 0.1; k.actDur = 0.42; }],
    ['recovering', (k) => { k.act = Act.Recover; k.atk = 0; k.actT = 0; k.actDur = 0.6; }],
  ];
  const out: string[] = [];
  for (const [name, setup] of states) {
    const m = new Match({ ...DEFAULT_SETTINGS, mapId: 'bodiam', mode: 'duel', rounds: 99, seed: 5 }, buildMap('bodiam'));
    const me = m.addPlayer('Tester', 1, 0, 'manatarms');
    while (m.phase !== 'live') m.step();
    const foe = m.knights.find((k) => k !== me)!; m.brains.delete(foe.id); foe.x = me.x + 40;
    setup(me);
    let at = -1;
    for (let i = 0; i < 90 && at < 0; i++) {
      me.input = { ...me.input, buttons: i < 2 ? Btn.Thrust : 0 };
      m.step(); m.events.length = 0;
      if (me.act === Act.Release && me.atk === 3) at = i;
    }
    if (at < 0) fail(`a jab pressed while ${name} never came`);
    out.push(`${name} ${(at / 60).toFixed(2)}s`);
  }
  console.log(`jab: ${out.join(', ')}`);
}
// melee aim: a blow aimed at a foe in reach lands; one aimed well away does not
{
  const trial = (aimOff: number, pitch: number, cls: 'manatarms' | 'halberdier' | 'errant') => {
    const m = new Match({ ...DEFAULT_SETTINGS, mapId: 'bodiam', mode: 'duel', rounds: 99, seed: 31 }, buildMap('bodiam'));
    const me = m.addPlayer('Tester', 1, 0, cls);
    while (m.phase !== 'live') m.step();
    const foe = m.knights.find((k) => k !== me)!;
    m.brains.delete(foe.id); foe.input.buttons = 0;
    let hits = 0, swings = 0;
    for (let n = 0; n < 6; n++) {
      // the foe stands just inside reach, a little off the straight line of the blade
      const yaw = me.yaw, d = (WEAPONS[me.def.weapon].hitEnd + 0.35) * me.def.size.height;
      foe.x = me.x - Math.sin(yaw) * d + Math.cos(yaw) * 0.25; foe.z = me.z - Math.cos(yaw) * d - Math.sin(yaw) * 0.25; foe.y = me.y;
      foe.hp = foe.def.hp; foe.act = Act.Idle; foe.vx = foe.vz = 0;
      const aimYaw = Math.atan2(-(foe.x - me.x), -(foe.z - me.z)) + aimOff;
      me.yaw = aimYaw;
      me.stamina = me.def.stamina;
      for (let i = 0; i < 70; i++) {
        me.input = { ...me.input, yaw: aimYaw, pitch, buttons: i < 3 ? Btn.Attack : 0 };
        foe.x = me.x - Math.sin(yaw) * d + Math.cos(yaw) * 0.25; foe.z = me.z - Math.cos(yaw) * d - Math.sin(yaw) * 0.25;
        m.step();
        for (const e of m.events) { if (e.t === 'swing' && e.k === me.id) swings++; if (e.t === 'hit' && e.a === me.id && e.v === foe.id) hits++; }
        m.events.length = 0;
      }
    }
    return { hits, swings };
  };
  for (const cls of ['manatarms', 'halberdier', 'errant'] as const) {
    const on = trial(0, 0.05, cls), off = trial(1.2, 0.05, cls);
    if (on.hits < on.swings) fail(`${cls}: only ${on.hits} of ${on.swings} blows aimed at a foe in reach landed`);
    console.log(`melee aim ${cls}: aimed ${on.hits}/${on.swings} land (aimed 70 degrees away: ${off.hits}/${off.swings}, the slash's own arc)`);
  }
}
// renowned orders stay closed to a player who has not won them; a chosen mustering place is honoured
{
  const m = new Match({ ...DEFAULT_SETTINGS, mapId: 'bodiam', mode: 'conquest', teamSize: 20, seed: 41 }, buildMap('bodiam'));
  const me = m.addPlayer('Tester', 1, 0, 'champion', ['yeoman', 'marshal', 'champion']);
  if (me.cls === 'champion') fail('a locked order was granted on joining');
  while (m.phase !== 'live') m.step();
  me.spawnProt = 0; me.invulnT = 0;
  m.damage(me, null, 9999, { zone: 1, dtype: 0, kind: 0, x: me.x, y: me.y + 1, z: me.z, dx: 0, dy: 0, dz: 1 });
  m.requestSpawn(me.id, 'marshal');
  if (me.nextCls === 'marshal') fail('a locked order was accepted on respawn');
  const zones = m.map.spawns[me.team];
  const pick = zones.findIndex((z) => z.minor);
  m.requestSpawn(me.id, 'manatarms', pick);
  for (let i = 0; i < 60 * 10 && !me.alive; i++) m.step();
  const z = zones[pick];
  const d = Math.hypot(me.x - z.x, me.z - z.z);
  if (!me.alive || d > 12) fail(`chosen mustering place ignored: ${z.name} is ${d.toFixed(1)} m away`);
  console.log(`locks and mustering: locked order refused; returned at ${z.name} (${d.toFixed(1)} m from its centre); ${zones.length} places for the house`);
}
// single combat rounds: a countdown at the marks, and the player may change order between rounds
{
  const m = new Match({ ...DEFAULT_SETTINGS, mapId: 'bodiam', mode: 'duel', rounds: 5, seed: 51 }, buildMap('bodiam'));
  const me = m.addPlayer('Tester', 1, 0, 'manatarms');
  while (m.phase !== 'live') m.step();
  const foe = m.knights.find((k) => k !== me)!;
  m.brains.delete(foe.id); foe.input = { ...foe.input, buttons: 0, mx: 0, mz: 0 };
  // win round one, then ask for another order while standing over the fallen
  foe.spawnProt = 0; foe.invulnT = 0;
  m.damage(foe, me, 9999, { zone: 1, dtype: 0, kind: 0, x: foe.x, y: foe.y + 1, z: foe.z, dx: 0, dy: 0, dz: 1 });
  m.requestSpawn(me.id, 'vanguard');
  let counted = false, still = true;
  for (let i = 0; i < 60 * 9 && !counted; i++) { m.step(); m.events.length = 0; if (m.roundReadyT > 0) counted = true; }
  if (!counted) fail('no countdown before round two');
  if (me.cls !== 'vanguard') fail(`order chosen between rounds not used (fighting as ${me.cls})`);
  // during the count: pushing forward, turning and attacking do nothing
  m.step(); m.events.length = 0;
  // both fighters stand squarely facing each other at the marks
  const face = Math.atan2(-(foe.x - me.x), -(foe.z - me.z));
  if (Math.abs(Math.atan2(Math.sin(me.yaw - face), Math.cos(me.yaw - face))) > 0.02) fail(`player not facing the foe at the marks (off by ${(me.yaw - face).toFixed(2)} rad)`);
  const x0 = me.x, z0 = me.z;
  while (m.roundReadyT > 0) {
    // the player tries to turn away and charge in early: he is held, facing his foe
    me.input = { ...me.input, mz: 1, buttons: Btn.Attack, yaw: face + 1.5 };
    m.step(); m.events.length = 0;
    if (me.act === Act.Windup || Math.hypot(me.x - x0, me.z - z0) > 0.3) still = false;
  }
  if (!still) fail('a fighter moved or struck during the countdown');
  if (Math.abs(Math.atan2(Math.sin(me.yaw - face), Math.cos(me.yaw - face))) > 0.05) fail('the player was turned away from his foe when the round began');
  let moved = false;
  for (let i = 0; i < 60; i++) { me.input = { ...me.input, mz: 1, buttons: 0 }; m.step(); m.events.length = 0; if (Math.hypot(me.x - x0, me.z - z0) > 0.5) moved = true; }
  if (!moved) fail('fighters still held after the countdown');
  console.log(`duel rounds: countdown held both still and facing; fought round two as ${me.cls}`);
}
// single combat: one knight a side on the duelling ground, first to three rounds
for (const def of MAPS) {
  const m = new Match({ ...DEFAULT_SETTINGS, mapId: def.id, mode: 'duel', teamSize: 24, rounds: 3, difficulty: 2, seed: 11 }, buildMap(def.id));
  if (m.knights.length !== 2) fail(`duel ${def.id}: ${m.knights.length} knights`);
  const [a, b] = m.knights;
  const gap = Math.hypot(a.x - b.x, a.z - b.z);
  if (gap < 8 || gap > 16) fail(`duel ${def.id}: fighters start ${gap.toFixed(1)} m apart`);
  if (!m.nav.isWalkable(m.map.duel.x, m.map.duel.z)) fail(`duel ${def.id}: duelling ground not walkable`);
  const rounds: string[] = [];
  for (let i = 0; i < 60 * 600 && m.phase !== 'ended'; i++) {
    m.step();
    for (const e of m.events) if (e.t === 'round') {
      rounds.push(`${e.score0}-${e.score1}`);
      for (const k of m.knights) if (!k.alive || k.hp !== k.def.hp) fail(`duel ${def.id}: round ${e.n} began with a fighter not whole`);
    }
    m.events.length = 0;
  }
  const t = m.teams;
  if (m.phase !== 'ended' || Math.max(t[0].tickets, t[1].tickets) !== 3) fail(`duel ${def.id}: did not finish (${m.phase}, ${t[0].tickets}-${t[1].tickets}, ${(m.time / 60).toFixed(0)} min)`);
  console.log(`duel ${def.id.padEnd(9)} ${a.cls} vs ${b.cls}: rounds ${rounds.join(' > ')} final ${t[0].tickets}-${t[1].tickets} in ${m.time.toFixed(0)}s, winner ${m.winner}`);
}
if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all simulation checks passed');
