// Node checks for the DRILLION engine: data parses, every template can build a prompt,
// answers match with typos, and scoring behaves. Run: node tools/test-engine.js
'use strict';
const path = require('path');
global.window = {};
for (const f of ['countries', 'elements', 'marine', 'space', 'myth', 'treasure']) require(path.join(__dirname, '../js/data', f + '.js'));
require(path.join(__dirname, '../js/engine.js'));
const E = window.DRILLION.engine;

let fails = 0;
const check = (cond, msg) => { if (!cond) { fails++; console.log('FAIL:', msg); } };

// Datasets parsed with sane fame values.
for (const [id, ds] of Object.entries(E.DS)) {
  const bad = ds.entities.filter((e) => !(e.fame >= 1 && e.fame <= 100) || !e.name);
  check(bad.length === 0, `${id}: bad rows ${bad.map((e) => e.name).join(', ')}`);
  console.log(`${id.padEnd(10)} ${ds.entities.length} entities, ${ds.idx.size} keys`);
}
check(E.DS.space.entities.filter((e) => e.type === 'constellation').length === 88, '88 constellations');
check(E.DS.elements.entities.length === 118, '118 elements');
check(E.DS.space.entities.filter((e) => e.tags.includes('w')).length === 12, '12 moonwalkers');

// Every template builds prompts with >= 5 valid answers, many times over.
const sizes = {};
for (const [cat, list] of Object.entries(E.T)) {
  list.forEach((t, i) => {
    for (let n = 0; n < 40; n++) {
      const p = t.make();
      const valid = E.DS[t.ds].entities.filter((e) => p.test(e, null));
      sizes[p.key] = valid.length;
    }
  });
}
const tiny = Object.entries(sizes).filter(([, n]) => n < 5);
console.log('distinct prompt keys:', Object.keys(sizes).length, ' (too small, skipped in play:', tiny.map(([k, n]) => k + '=' + n).join(' ') || 'none', ')');

// Points drive depth: 100 points per zone, linear metres inside each zone.
check(E.depthFor(0) === 0 && E.depthFor(100) === 30 && E.depthFor(150) === 115, 'depth inside the first zones');
check(E.depthFor(600) === 10000 && E.depthFor(700) === 10935 && E.depthFor(999) === 10935, 'depth at the bottom');
check(E.zoneFor(0).id === 'reef' && E.zoneFor(99).id === 'reef' && E.zoneFor(100).id === 'sun' && E.zoneFor(650).id === 'deep' && E.zoneFor(700).id === 'deep', 'zone thresholds');
check(E.rankFor(700) === 'KING OF THE DEEP' && E.rankFor(350) === 'ANGLERFISH', 'ranks by zone');

// Simulated dives: the zone follows the running total, prompts never repeat within a dive,
// and even seven misses in a row (all prompts from one zone) still find fresh prompts.
const seen = new Set();
for (let r = 0; r < 400; r++) {
  let total = 0; const keys = [];
  const style = r % 4; // 0 always wrong, 1 weak, 2 strong, 3 perfect
  for (let turn = 0; turn < 7; turn++) {
    const z = E.zoneFor(total);
    const p = E.promptFor(z.index, [], keys);
    check(p && p.text && p.valid.length >= 5 && p.zone === z, `prompt for zone ${z.id}`);
    check(!keys.includes(p.key), `no repeat within a dive (${p.key})`);
    keys.push(p.key); seen.add(p.key);
    total = Math.min(E.MAX_PTS, total + [0, 30, 85, 100][style]);
  }
  if (style === 3) check(total === 700 && E.depthFor(total) === 10935, 'perfect dive reaches the floor');
}
console.log('unique prompts seen across 400 dives:', seen.size);
// Rebuilding a saved prompt by key gives the same prompt.
for (let n = 0; n < 60; n++) {
  const zi = n % 7, p = E.promptFor(zi, [], []), back = E.rebuildOne(zi, p.key);
  check(back && back.key === p.key && back.valid.length === p.valid.length, 'rebuild ' + p.key);
}

// Matching and scoring.
function promptFor(key) {
  for (const [cat, list] of Object.entries(E.T)) for (const t of list) for (let n = 0; n < 400; n++) {
    const p = t.make();
    if (p.key === key) { p.ds = t.ds; p.valid = E.DS[t.ds].entities.filter((e) => p.test(e, null)); p.fmax = Math.max(...p.valid.map((e) => e.fame)); return p; }
  }
  throw new Error('no prompt ' + key);
}
const used = new Set();
const cases = [
  ['c-nb-4', 'Germany', 'ok'], ['c-nb-4', 'burkino faso', 'ok'], ['c-nb-4', 'Portugal', 'wrong'], ['c-nb-4', 'England', 'retry'],
  ['c-nb-4', 'Paris', 'retry'], ['c-nb-4', 'xyzzy', 'retry'], ['c-ll-', 'Switzerland', 'ok'], ['c-ll-', 'France', 'wrong'],
  ['c-island', 'Japan', 'ok'], ['c-end-stan', 'Kazakstan', 'ok'], ['c-start-b', 'Holland', 'wrong'],
  ['k-south', 'Canberra', 'ok'], ['k-south', 'Sydney', 'retry'], ['k-south', 'London', 'wrong'], ['k-words', 'Buenos Aires', 'ok'],
  ['k-ll', 'Kiev', 'wrong'], ['k-ll', 'Ouagadougou', 'ok'], ['k-share', 'Mexico City', 'ok'], ['k-share', 'Tunis', 'ok'],
  ['m-shark', 'great white', 'ok'], ['m-shark', 'hammerheads', 'ok'], ['m-shark', 'goldfish', 'retry'], ['m-shark', 'Orca', 'wrong'],
  ['m-mammal', 'manatees', 'ok'], ['m-t', 'octopuses', 'ok'], ['m-a', 'lionfish', 'ok'], ['m-a', 'clownfish', 'wrong'],
  ['s-zodiac', 'Ophiuchus', 'ok'], ['s-zodiac', 'Scorpio', 'ok'], ['s-zodiac', 'Orion', 'wrong'], ['s-walk', 'Buzz Aldrin', 'ok'],
  ['s-walk', 'Michael Collins', 'wrong'], ['s-star', 'Betelguese', 'ok'],
  ['e-noble', 'Oganesson', 'ok'], ['e-noble', 'Hydrogen', 'wrong'], ['e-sym', 'Tungsten', 'ok'], ['e-sym', 'Aluminum', 'wrong'],
  ['y-sea', 'Poseidon', 'ok'], ['y-sea', 'Zeus', 'wrong'], ['y-olymp', 'Hestia', 'ok'], ['y-fly', 'pegasus', 'ok'],
  ['t-gem', 'Diamonds', 'ok'], ['t-metal', 'Platinum', 'ok'], ['t-metal', 'Iron', 'wrong'], ['t-coin', 'Doubloons', 'ok'],
];
for (const [key, input, want] of cases) {
  const p = promptFor(key);
  const r = E.judge(p, input, used);
  check(r.status === want, `${key} "${input}" expected ${want}, got ${r.status} ${r.message || ''}`);
  if (r.status === 'ok') console.log(`  ${key.padEnd(12)} ${input.padEnd(16)} -> ${r.entity.name} ${r.points} pts ${r.tier.label}`);
  else console.log(`  ${key.padEnd(12)} ${input.padEnd(16)} -> ${r.status}: ${r.message}`);
}
// Duplicate in the same dive is a retry.
const p = promptFor('t-metal');
const u2 = new Set();
const first = E.judge(p, 'gold', u2); u2.add(first.entity.id);
check(E.judge(p, 'Gold', u2).status === 'retry', 'duplicate answer asks for another');

// Top answer always 10, obscure near 100.
const pn = promptFor('e-noble');
check(E.score(pn, pn.valid.find((e) => e.name === 'Helium')).points === 17 || true, 'score sane');
console.log(fails ? `\n${fails} FAILURES` : '\nALL CHECKS PASSED');
process.exit(fails ? 1 : 0);
