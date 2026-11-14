'use strict';
/* Items, pixel sprites and Maker Table recipes.
   Ids below 256 are placeable blocks (same id as the block); 256+ are tools, armour, food and materials. */

const I = {};
const ITEMS = {};
let nextItemId = 256;

function defItem(key, name, props) {
  const id = nextItemId++;
  I[key] = id;
  ITEMS[id] = Object.assign({ id, key, name, stack: 64, kind: 'mat', desc: '' }, props || {});
  return id;
}

/* ---------- pixel sprites (16 x 16) ---------- */
const SPR = {
  sword: [
    '.............MMM', '............MLLM', '...........MLmLM', '..........MLmLM.', '.........MLmLM..', '........MLmLM...',
    '.......MLmLM....', '..HH..MLmLM.....', '..HhHMLmLM......', '...HhHmLM.......', '....HhHM........', '...HhhHH........',
    '..HhH.HhH.......', '.HhH...HH.......', 'HhH.............', 'HH..............'],
  pick: [
    '................', '.....MMMMMM.....', '....MLLLLLLMM...', '.....MMMMmLLhH..', '.........MhhLM..', '........HhHMLmM.',
    '.......HhH.MLmM.', '......HhH..MLmM.', '.....HhH....MmM.', '....HhH.....MM..', '...HhH..........', '..HhH...........',
    '.HhH............', 'HhH.............', 'HH..............', '................'],
  spade: [
    '................', '..........MMMM..', '.........MLLLmM.', '........MLLmmmM.', '........MLmmmmM.', '........MmmmmM..',
    '.......HhMMMM...', '......HhH.......', '.....HhH........', '....HhH.........', '...HhH..........', '..HhH...........',
    '.HhH............', 'HhH.............', 'HH..............', '................'],
  tiller: [
    '................', '......MMMMMM....', '.....MLLLLLmM...', '.....MmMMMhmM...', '.....MM..HhMM...', '.........HhH....',
    '........HhH.....', '.......HhH......', '......HhH.......', '.....HhH........', '....HhH.........', '...HhH..........',
    '..HhH...........', '.HhH............', 'HhH.............', 'HH..............'],
  axe: [
    '................', '.......MMM......', '......MLLmMHH...', '.....MLLmmhhH...', '.....MLmmmhHM...', '.....MLmmhHmM...',
    '......MMmHhMM...', '........HhHM....', '.......HhH......', '......HhH.......', '.....HhH........', '....HhH.........',
    '...HhH..........', '..HhH...........', '.HhH............', '.HH.............'],
  bow: [
    '................', '........HHH.....', '.......Hhhs.....', '......Hh..s.....', '.....Hh...s.....', '.....Hh...s.....',
    '....Hh....s.....', '....Hh....s.....', '....Hh....s.....', '....Hh....s.....', '.....Hh...s.....', '.....Hh...s.....',
    '......Hh..s.....', '.......Hhhs.....', '........HHH.....', '................'],
  arrow: [
    '................', '...........MMM..', '...........LMM..', '..........hLM...', '.........hH.....', '........hH......',
    '.......hH.......', '......hH........', '.....hH.........', '...aahH.........', '...aaH..........', '..a.aa..........',
    '.....a..........', '................', '................', '................'],
  helm: [
    '................', '................', '....MMMMMMMM....', '...MLLLLLLLmM...', '..MLLmmmmmmmmM..', '..MLmmmmmmmmmM..',
    '..MLmmmmmmmmmM..', '..MLmMMMMMMmmM..', '..MLmM....MmmM..', '..MLmM....MmmM..', '..MMMM....MMMM..', '................',
    '................', '................', '................', '................'],
  chest: [
    '................', '..MMM......MMM..', '.MLLmM....MLmmM.', '.MLmmmMMMMmmmmM.', '.MLmmmmmmmmmmmM.', '.MMmmmmmmmmmmMM.',
    '...MLmmmmmmmM...', '...MLmmmmmmmM...', '...MLmmmmmmmM...', '...MLmmmmmmmM...', '...MLmmmmmmmM...', '...MLmmmmmmmM...',
    '...MMMMMMMMMM...', '................', '................', '................'],
  legs: [
    '................', '...MMMMMMMMMM...', '...MLLLLLLLmM...', '...MLmmmmmmmM...', '...MLmmmmmmmM...', '...MLmmMMmmmM...',
    '...MLmM..MLmM...', '...MLmM..MLmM...', '...MLmM..MLmM...', '...MLmM..MLmM...', '...MLmM..MLmM...', '...MLmM..MLmM...',
    '...MMMM..MMMM...', '................', '................', '................'],
  boots: [
    '................', '................', '................', '................', '..MMMM....MMMM..', '..MLmM....MLmM..',
    '..MLmM....MLmM..', '..MLmM....MLmM..', '..MLmM....MLmM..', '.MMLmM...MMLmM..', '.MLLmM...MLLmM..', '.MLmmM...MLmmM..',
    '.MMMMM...MMMMM..', '................', '................', '................'],
  stick: [
    '................', '................', '............HH..', '...........HhH..', '..........HhH...', '.........HhH....',
    '........HhH.....', '.......HhH......', '......HhH.......', '.....HhH........', '....HhH.........', '...HhH..........',
    '..HhH...........', '..HH............', '................', '................'],
  nugget: [
    '................', '................', '................', '......bbbb......', '....bbaaaabb....', '...baacaaaab....',
    '...bacaaaaaab...', '..baaaaaabaab...', '..baaaaaaaaab...', '..baaabaaaaab...', '...baaaaaaab....', '...bbaaaabb.....',
    '.....bbbb.......', '................', '................', '................'],
  ingot: [
    '................', '................', '................', '................', '.....MMMMMMMMM..', '....MLLLLLLLmM..',
    '...MLLLLLLLmmM..', '..MLLLLLLLmmMM..', '..MmmmmmmmmMM...', '..MmmmmmmmMM....', '..MMMMMMMMM.....', '................',
    '................', '................', '................', '................'],
  shard: [
    '................', '.......MM.......', '......MLLM......', '.....MLLmmM.....', '.....MLLmmM.....', '....MLLmmmmM....',
    '....MLLmmmmM....', '....MLmmmmMM....', '....MLmmmmMM....', '....MLmmmMMM....', '.....MmmmMM.....', '.....MmmMMM.....',
    '......MmMM......', '.......MM.......', '................', '................'],
  hide: [
    '................', '..bb........bb..', '.baab......baab.', '.baaabbbbbbaaab.', '..baacccccaaab..', '...bacccccaab...',
    '...baccccaaab...', '...baccaaaaab...', '...baaaaaaaab...', '...baaaaaaaab...', '..baaaaaaaaaab..', '.baaabbbbbbaaab.',
    '.baab......baab.', '..bb........bb..', '................', '................'],
  feather: [
    '................', '...........bbb..', '.........bbaab..', '........baaaab..', '.......baaaab...', '......baaaaab...',
    '.....baaabab....', '.....baabaab....', '....baabaab.....', '....babaab......', '....bbaab.......', '...cbbbb........',
    '..c.............', '.c..............', '................', '................'],
  fiber: [
    '................', '................', '....bb...bb.....', '...baab.baab....', '...baaabaaab....', '....baaaaab.....',
    '.....baaab......', '....bbbbbbb.....', '.....baaab......', '....baaaaab.....', '...baabaaab.....', '...bab.baab.....',
    '...bb...bab.....', '.........bb.....', '................', '................'],
  wheat: [
    '................', '..........bb....', '.........baab...', '....bb...baab...', '...baab.baab....', '...baab.bab.bb..',
    '....bab.bb.baab.', '....bbabb..baab.', '.....bab..bab...', '.....gbg.bbb....', '......gg.g......', '......gbg.......',
    '.....gg.........', '....gg..........', '...gg...........', '................'],
  carrot: [
    '................', '..........gG.gG.', '.........gGggG..', '..........GgG...', '.......bbbGG....', '......baaaab....',
    '.....baaaaab....', '.....baaaaab....', '....baaaaab.....', '....baaaab......', '...baaaab.......', '...baaab........',
    '..baaab.........', '..babb..........', '..bb............', '................'],
  beet: [
    '................', '.....gG..gG.....', '......gGgG......', '.......GG.......', '.....bbGGbb.....', '....baaaaaab....',
    '...baacaaaaab...', '...bacaaaaaab...', '...baaaaaaaab...', '...baaaaaaaab...', '....baaaaaab....', '.....baaaab.....',
    '......baab......', '.......bb.......', '.......b........', '................'],
  pumpkin: [
    '................', '................', '.......gg.......', '.......gg.......', '....bbbggbbb....', '...bacabbacab...',
    '..bacaabaacaab..', '..bacaabaacaab..', '..bacaabaacaab..', '..bacaabaacaab..', '..bacaabaacaab..', '..bacaabaacaab..',
    '...bacabbacab...', '....bbbbbbbb....', '................', '................'],
  bread: [
    '................', '................', '................', '....bbbbbbbb....', '...bccccccccb...', '..bcabcabcabab..',
    '..baaaaaaaaaab..', '..baaaaaaaaaab..', '..baaaaaaaaaab..', '..baaaaaaaaaab..', '...bbbbbbbbbb...', '................',
    '................', '................', '................', '................'],
  meat: [
    '................', '................', '.....bbbbb......', '....bdddaab.....', '...bdaaaaaab....', '...baaaaaaab....',
    '...baaaaaaab....', '...baaaaaab.....', '....baaaab......', '.....bbbcc......', '........cc......', '.........cc.c...',
    '..........ccc...', '.........c.c....', '................', '................'],
  apple: [
    '................', '........s.gg....', '........sgg.....', '....bbb.sbbb....', '...bacabbaaab...', '..bacaaaaaaaab..',
    '..baaaaaaaaaab..', '..baaaaaaaaaab..', '..baaaaaaaaaab..', '..baaaaaaaaaab..', '...baaaaaaaab...', '...baaaaaaaab...',
    '....baabbaab....', '.....bb..bb.....', '................', '................'],
  seeds: [
    '................', '................', '.....bbbbbb.....', '.....baaaab.....', '......tttt......', '.....baaaab.....',
    '....baaaaaab....', '...baaassaaab...', '...baassssaab...', '...baassssaab...', '...baaassaaab...', '...baaaaaaaab...',
    '....baaaaaab....', '.....bbbbbb.....', '................', '................'],
};

const HANDLE = { h: 0xa87b4a, H: 0x6b4a2a };
const TIERS = [null,
  { key: 'W', name: 'Wooden', mat: 'PLANKS', pal: { L: 0xe2b877, m: 0xbf8c4e, M: 0x7a5230 }, speed: 2.6 },
  { key: 'S', name: 'Stone', mat: 'STONE', pal: { L: 0xcfd4dc, m: 0x9aa1ac, M: 0x5c636f }, speed: 4.2 },
  { key: 'I', name: 'Iron', mat: 'IRON_INGOT', pal: { L: 0xfafbfd, m: 0xcfd6e0, M: 0x808a9c }, speed: 6.5 },
  { key: 'P', name: 'Prism', mat: 'PRISM', pal: { L: 0xd4fff6, m: 0x5fe3d0, M: 0x1f93a6 }, speed: 10 },
];
const ARMOR_TIERS = [
  { key: 'H', name: 'Hide', mat: 'HIDE', pal: { L: 0xd09a66, m: 0xa66a3c, M: 0x6e4222 }, pts: [1, 3, 2, 1] },
  { key: 'I', name: 'Iron', mat: 'IRON_INGOT', pal: { L: 0xfafbfd, m: 0xcfd6e0, M: 0x808a9c }, pts: [2, 5, 3, 2] },
  { key: 'P', name: 'Prism', mat: 'PRISM', pal: { L: 0xd4fff6, m: 0x5fe3d0, M: 0x1f93a6 }, pts: [3, 7, 5, 3] },
];

function makeSprite(tpl, pal) {
  const rows = SPR[tpl];
  const grid = new Int32Array(256).fill(-1);
  for (let y = 0; y < 16; y++) {
    const row = (rows[y] || '');
    for (let x = 0; x < 16; x++) {
      const ch = row[x];
      if (ch === undefined || ch === '.') continue;
      const c = pal[ch] !== undefined ? pal[ch] : HANDLE[ch];
      if (c !== undefined) grid[y * 16 + x] = c;
    }
  }
  return grid;
}

/* ---------- materials, food, seeds ---------- */
defItem('STICK', 'Stick', { sprite: makeSprite('stick', {}) });
defItem('COAL', 'Coal', { sprite: makeSprite('nugget', { a: 0x3a3d45, b: 0x1f2126, c: 0x5d626e }) });
defItem('RAW_IRON', 'Raw Iron', { sprite: makeSprite('nugget', { a: 0xc9a184, b: 0x8a6a55, c: 0xecd2bc }) });
defItem('IRON_INGOT', 'Iron Ingot', { sprite: makeSprite('ingot', TIERS[3].pal) });
defItem('PRISM', 'Prism Shard', { sprite: makeSprite('shard', TIERS[4].pal) });
defItem('HIDE', 'Hide', { sprite: makeSprite('hide', { a: 0xa66a3c, b: 0x6e4222, c: 0xc98e5a }) });
defItem('FEATHER', 'Feather', { sprite: makeSprite('feather', { a: 0xf4f4f0, b: 0xb9bcc4, c: 0x8a8e99 }) });
defItem('FIBER', 'Fiber', { sprite: makeSprite('fiber', { a: 0xd9d2b8, b: 0x9d957a }) });
defItem('WHEAT', 'Wheat', { sprite: makeSprite('wheat', { a: 0xe3c15a, b: 0xb38f33, g: 0x7fa84a }) });
defItem('CARROT', 'Carrot', { kind: 'food', heal: 3, sprite: makeSprite('carrot', { a: 0xf08a2e, b: 0xb85e14, g: 0x5fae4a, G: 0x3c7a30 }) });
defItem('BEET', 'Beet', { kind: 'food', heal: 3, sprite: makeSprite('beet', { a: 0xb0345e, b: 0x7a1f3f, c: 0xd0688c, g: 0x5fae4a, G: 0x3c7a30 }) });
defItem('PUMPKIN', 'Pumpkin', { kind: 'food', heal: 4, sprite: makeSprite('pumpkin', { a: 0xe8862a, b: 0xb05f14, c: 0xf5a64e, g: 0x4f8a3a }) });
defItem('BREAD', 'Bread', { kind: 'food', heal: 6, sprite: makeSprite('bread', { a: 0xd9a55a, b: 0x9a6a2c, c: 0xf0cf8e }) });
defItem('MEAT', 'Raw Meat', { kind: 'food', heal: 2, sprite: makeSprite('meat', { a: 0xe0606a, b: 0xa8343f, c: 0xf5e9dc, d: 0xf09aa0 }) });
defItem('ROAST', 'Roast', { kind: 'food', heal: 8, sprite: makeSprite('meat', { a: 0xa8652e, b: 0x6b3a14, c: 0xf5e9dc, d: 0xc98b4e }) });
defItem('APPLE', 'Apple', { kind: 'food', heal: 3, sprite: makeSprite('apple', { a: 0xe5484d, b: 0xa82a30, c: 0xf58a8d, s: 0x6b4a2a, g: 0x5fae4a }) });
const SEED_PAL = { a: 0xc9a36b, b: 0x8a6a3c, t: 0x6b4a2a };
defItem('SEEDS_WHEAT', 'Wheat Seeds', { kind: 'seed', plants: B.WHEAT_0, desc: 'Plant on tilled soil', sprite: makeSprite('seeds', Object.assign({ s: 0xf0d264 }, SEED_PAL)) });
defItem('SEEDS_CARROT', 'Carrot Seeds', { kind: 'seed', plants: B.CARROT_0, desc: 'Plant on tilled soil', sprite: makeSprite('seeds', Object.assign({ s: 0xf08a2e }, SEED_PAL)) });
defItem('SEEDS_BEET', 'Beet Seeds', { kind: 'seed', plants: B.BEET_0, desc: 'Plant on tilled soil', sprite: makeSprite('seeds', Object.assign({ s: 0xc03a6a }, SEED_PAL)) });
defItem('SEEDS_PUMPKIN', 'Pumpkin Seeds', { kind: 'seed', plants: B.PUMPKIN_0, desc: 'Plant on tilled soil', sprite: makeSprite('seeds', Object.assign({ s: 0xf6efd8 }, SEED_PAL)) });
defItem('ARROW', 'Arrow', { sprite: makeSprite('arrow', { L: 0xcfd4dc, M: 0x6b7280, a: 0xf4f4f0 }) });
defItem('BOW', 'Bow', { kind: 'tool', tool: 'bow', stack: 1, dmg: 1, tier: 1, desc: 'Right-click to loose an arrow', sprite: makeSprite('bow', { s: 0xe8e4d8 }) });

/* ---------- tools and weapons ---------- */
const TOOL_KINDS = [
  { key: 'PICK', tpl: 'pick', name: 'Pick', tool: 'pick', desc: 'Stone digging tool', dmg: [0, 2, 3, 4, 5] },
  { key: 'SPADE', tpl: 'spade', name: 'Spade', tool: 'spade', desc: 'Dirt digging tool. Right-click grass to lay a path', dmg: [0, 2, 2, 3, 4] },
  { key: 'TILLER', tpl: 'tiller', name: 'Tiller', tool: 'tiller', desc: 'Farming tool. Right-click soil to till it', dmg: [0, 2, 2, 3, 4] },
  { key: 'AXE', tpl: 'axe', name: 'Axe', tool: 'axe', desc: 'Chops wood, hits hard', dmg: [0, 3, 4, 6, 8] },
  { key: 'SWORD', tpl: 'sword', name: 'Sword', tool: 'sword', desc: 'For fighting monsters', dmg: [0, 4, 5, 7, 10] },
];
for (const tk of TOOL_KINDS) {
  for (let t = 1; t <= 4; t++) {
    const T = TIERS[t];
    defItem(tk.key + '_' + T.key, T.name + ' ' + tk.name, {
      kind: 'tool', tool: tk.tool, tier: t, stack: 1, dmg: tk.dmg[t], speed: T.speed, desc: tk.desc,
      sprite: makeSprite(tk.tpl, T.pal),
    });
  }
}
const ARMOR_SLOTS = [
  { key: 'HELM', tpl: 'helm', name: 'Helm' },
  { key: 'CHEST', tpl: 'chest', name: 'Cuirass' },
  { key: 'LEGS', tpl: 'legs', name: 'Greaves' },
  { key: 'BOOTS', tpl: 'boots', name: 'Boots' },
];
for (const A of ARMOR_TIERS) {
  ARMOR_SLOTS.forEach((s, si) => {
    defItem(s.key + '_' + A.key, A.name + ' ' + s.name, {
      kind: 'armor', slot: si, armor: A.pts[si], stack: 1, desc: 'Armour +' + A.pts[si],
      sprite: makeSprite(s.tpl, A.pal),
    });
  });
}

/* Block items. */
const NON_ITEM_BLOCKS = new Set([B.AIR, B.WATER, B.BEDROCK]);
for (const d of BLOCKS) {
  if (NON_ITEM_BLOCKS.has(d.id) || d.shape === 'crop') continue;
  ITEMS[d.id] = { id: d.id, key: d.key, name: d.name, stack: 64, kind: 'block', desc: '' };
}
ITEMS[B.MAKER_TABLE].desc = 'Right-click to craft on its 3 x 3 grid';
ITEMS[B.CHEST].desc = 'Stores 27 stacks';
ITEMS[B.BED].desc = 'Sleep through the night and set your spawn';
ITEMS[B.LANTERN].desc = 'Lights up the dark';

function itemName(id) { return ITEMS[id] ? ITEMS[id].name : '?'; }
function maxStack(id) { return ITEMS[id] ? ITEMS[id].stack : 64; }

/* ---------- recipes ---------- */
const RECIPES = [];
function ids(v) { return Array.isArray(v) ? v : [v]; }
function shaped(out, n, rows, key, group) {
  const k = {};
  for (const ch in key) k[ch] = ids(key[ch]);
  RECIPES.push({ out, n, rows, key: k, group: group || 'Blocks' });
}
function shapeless(out, n, list, group) {
  RECIPES.push({ out, n, list: list.map(ids), group: group || 'Blocks' });
}

shaped(B.PLANKS, 4, ['L'], { L: LOG_BLOCKS }, 'Basics');
shaped(I.STICK, 4, ['P', 'P'], { P: B.PLANKS }, 'Basics');
shaped(B.MAKER_TABLE, 1, ['PP', 'PP'], { P: B.PLANKS }, 'Basics');
shaped(B.CHEST, 1, ['PPP', 'P P', 'PPP'], { P: B.PLANKS }, 'Basics');
shaped(B.LANTERN, 2, ['C', 'S'], { C: I.COAL, S: I.STICK }, 'Basics');
shaped(B.BED, 1, ['WWW', 'PPP'], { W: B.WOOL, P: B.PLANKS }, 'Basics');
shapeless(I.IRON_INGOT, 1, [I.RAW_IRON, I.COAL], 'Basics');

for (let t = 1; t <= 4; t++) {
  const T = TIERS[t];
  const M = t <= 2 ? B[T.mat] : I[T.mat];
  const k = { M, S: I.STICK };
  shaped(I['PICK_' + T.key], 1, ['MMM', ' S ', ' S '], k, 'Tools');
  shaped(I['SPADE_' + T.key], 1, ['M', 'S', 'S'], k, 'Tools');
  shaped(I['TILLER_' + T.key], 1, ['MM', ' S', ' S'], k, 'Tools');
  shaped(I['AXE_' + T.key], 1, ['MM', 'MS', ' S'], k, 'Tools');
  shaped(I['SWORD_' + T.key], 1, ['M', 'M', 'S'], k, 'Weapons');
}
shaped(I.BOW, 1, [' SF', 'S F', ' SF'], { S: I.STICK, F: I.FIBER }, 'Weapons');
shaped(I.ARROW, 4, ['T', 'S', 'F'], { T: B.STONE, S: I.STICK, F: I.FEATHER }, 'Weapons');
for (const A of ARMOR_TIERS) {
  const k = { M: I[A.mat] };
  shaped(I['HELM_' + A.key], 1, ['MMM', 'M M'], k, 'Armour');
  shaped(I['CHEST_' + A.key], 1, ['M M', 'MMM', 'MMM'], k, 'Armour');
  shaped(I['LEGS_' + A.key], 1, ['MMM', 'M M', 'M M'], k, 'Armour');
  shaped(I['BOOTS_' + A.key], 1, ['M M', 'M M'], k, 'Armour');
}

shaped(B.STONE_BRICK, 4, ['SS', 'SS'], { S: B.STONE });
shaped(B.SANDSTONE, 4, ['SS', 'SS'], { S: B.SAND });
shaped(B.BRICKS, 4, ['CC', 'CC'], { C: B.CLAY });
shapeless(B.GLASS, 2, [B.SAND, B.SAND, I.COAL]);
shapeless(B.MOSSY_STONE, 1, [B.STONE_BRICK, [B.LEAVES, B.PINE_LEAVES, B.TALL_GRASS]]);
shaped(B.DARK_BRICK, 4, ['BB', 'BB', 'C '], { B: B.STONE_BRICK, C: I.COAL });
shaped(B.ROOF_RED, 6, ['BBB'], { B: B.BRICKS });
shaped(B.ROOF_BLUE, 6, ['BBB'], { B: B.PAINT_BLUE });
shaped(B.WOOL, 1, ['FF', 'FF'], { F: I.FIBER });
shaped(B.HAY, 1, ['WWW', 'WWW', 'WWW'], { W: I.WHEAT });
const PAINTS = [[B.PAINT_RED, B.FLOWER_RED], [B.PAINT_BLUE, B.FLOWER_BLUE], [B.PAINT_YELLOW, B.FLOWER_YELLOW],
  [B.PAINT_WHITE, B.FLOWER_WHITE], [B.PAINT_PINK, B.FLOWER_PINK], [B.PAINT_GREEN, [B.LEAVES, B.PINE_LEAVES, B.CACTUS]]];
for (const [out, dye] of PAINTS) shaped(out, 8, ['PPP', 'PDP', 'PPP'], { P: B.PLANKS, D: dye });
shaped(B.IRON_BLOCK, 1, ['MMM', 'MMM', 'MMM'], { M: I.IRON_INGOT });
shaped(B.PRISM_BLOCK, 1, ['MMM', 'MMM', 'MMM'], { M: I.PRISM });
shapeless(I.IRON_INGOT, 9, [B.IRON_BLOCK]);
shapeless(I.PRISM, 9, [B.PRISM_BLOCK]);

shaped(I.BREAD, 1, ['WWW'], { W: I.WHEAT }, 'Food & Farming');
shapeless(I.ROAST, 1, [I.MEAT, I.COAL], 'Food & Farming');
shapeless(I.SEEDS_PUMPKIN, 4, [I.PUMPKIN], 'Food & Farming');
shapeless(I.SEEDS_WHEAT, 2, [I.WHEAT], 'Food & Farming');
shapeless(I.SEEDS_CARROT, 2, [I.CARROT], 'Food & Farming');
shapeless(I.SEEDS_BEET, 2, [I.BEET], 'Food & Farming');
shapeless(I.WHEAT, 9, [B.HAY], 'Food & Farming');

/* grid: array of 9 item ids (0 = empty). Returns the matching recipe or null. */
function matchRecipe(grid) {
  let minX = 3, minY = 3, maxX = -1, maxY = -1, count = 0;
  for (let i = 0; i < 9; i++) {
    if (!grid[i]) continue;
    const x = i % 3, y = (i / 3) | 0;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    count++;
  }
  if (count === 0) return null;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  for (const r of RECIPES) {
    if (r.list) {
      if (r.list.length !== count) continue;
      const used = new Array(9).fill(false);
      let ok = true;
      for (const opts of r.list) {
        let found = false;
        for (let i = 0; i < 9; i++) {
          if (grid[i] && !used[i] && opts.indexOf(grid[i]) >= 0) { used[i] = true; found = true; break; }
        }
        if (!found) { ok = false; break; }
      }
      if (ok) return r;
      continue;
    }
    if (r.rows.length !== h || r.rows[0].length !== w) continue;
    for (let mirror = 0; mirror < 2; mirror++) {
      let ok = true;
      for (let y = 0; y < h && ok; y++) {
        for (let x = 0; x < w; x++) {
          const ch = r.rows[y][mirror ? w - 1 - x : x];
          const id = grid[(minY + y) * 3 + minX + x];
          if (ch === ' ') { if (id) { ok = false; break; } }
          else if (!id || r.key[ch].indexOf(id) < 0) { ok = false; break; }
        }
      }
      if (ok) return r;
    }
  }
  return null;
}

/* A 3x3 layout (array of 9 option-lists or null) used by the recipe guide and auto-fill. */
function recipeLayout(r) {
  const cells = new Array(9).fill(null);
  if (r.list) r.list.forEach((opts, i) => { cells[i] = opts; });
  else r.rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== ' ') cells[y * 3 + x] = r.key[row[x]]; });
  return cells;
}

/* ---------- icons ---------- */
const ICON_CACHE = {};
function itemIcon(id) {
  if (ICON_CACHE[id]) return ICON_CACHE[id];
  if (typeof document === 'undefined') return '';
  const it = ITEMS[id];
  const cv = document.createElement('canvas');
  let url;
  if (it && it.sprite) {
    cv.width = cv.height = 16;
    const g = cv.getContext('2d');
    for (let i = 0; i < 256; i++) {
      const c = it.sprite[i];
      if (c < 0) continue;
      g.fillStyle = '#' + c.toString(16).padStart(6, '0');
      g.fillRect(i % 16, (i / 16) | 0, 1, 1);
    }
    url = cv.toDataURL();
  } else {
    cv.width = cv.height = 48;
    drawBlockIcon(cv.getContext('2d'), BLOCKS[id]);
    url = cv.toDataURL();
  }
  ICON_CACHE[id] = url;
  return url;
}

const DEFAULT_GRASS = [0.44, 0.74, 0.38];
const DEFAULT_LEAF = [0.33, 0.62, 0.3];
function blockBaseColor(d, face) {
  if (d.tint === 'grass' && face !== 'bottom') return face === 'side' && d.id === B.GRASS ? BLOCKS[B.DIRT].color : DEFAULT_GRASS;
  if (d.tint === 'leaf') return DEFAULT_LEAF;
  if (face === 'top' && d.top) return d.top;
  return d.color;
}

/* Block icons are built from rectangles only: a lit top band, a front face and a shaded side band. */
function drawBlockIcon(g, d) {
  const R = (x, y, w, h, c, m) => { g.fillStyle = rgbCss(c, m); g.fillRect(x, y, w, h); };
  const side = blockBaseColor(d, 'side'), top = blockBaseColor(d, 'top');
  if (d.shape === 'plant') {
    const green = d.tint ? DEFAULT_GRASS : [0.35, 0.62, 0.3];
    if (d.id === B.TALL_GRASS) {
      R(10, 20, 4, 24, green, 0.85); R(18, 10, 4, 34, green, 1); R(26, 16, 4, 28, green, 0.9); R(34, 24, 4, 20, green, 1.05);
    } else if (d.id === B.DEAD_BUSH) {
      R(22, 14, 4, 30, d.color, 0.8); R(12, 20, 4, 18, d.color, 1); R(32, 18, 4, 20, d.color, 0.9); R(12, 34, 24, 4, d.color, 0.8);
    } else {
      R(22, 22, 4, 22, green, 0.9); R(26, 30, 8, 4, green, 1.05);
      R(14, 6, 20, 20, d.color, 1); R(14, 22, 20, 4, d.color, 0.8); R(20, 12, 8, 8, [1, 0.9, 0.45], 1);
    }
    return;
  }
  if (d.id === B.LANTERN) {
    R(14, 6, 20, 6, [0.25, 0.26, 0.3], 1); R(12, 12, 24, 26, d.color, 1); R(18, 18, 12, 14, [1, 0.97, 0.8], 1);
    R(12, 12, 3, 26, [0.25, 0.26, 0.3], 1); R(33, 12, 3, 26, [0.25, 0.26, 0.3], 1); R(10, 38, 28, 5, [0.25, 0.26, 0.3], 1);
    return;
  }
  if (d.id === B.BED) {
    R(4, 30, 40, 10, BLOCKS[B.PLANKS].color, 0.85); R(4, 18, 40, 12, d.color, 1); R(4, 18, 12, 12, [0.96, 0.95, 0.92], 1);
    R(4, 40, 5, 5, BLOCKS[B.PLANKS].color, 0.6); R(39, 40, 5, 5, BLOCKS[B.PLANKS].color, 0.6);
    return;
  }
  const x0 = 4, y0 = 4, w = 34, topH = 9, h = 40, sw = 6;
  R(x0, y0, w, topH, top, 1.08);
  R(x0, y0 + topH, w, h - topH, side, 0.94);
  R(x0 + w, y0, sw, h, side, 0.68);
  const fy = y0 + topH, fh = h - topH;
  const dark = (x, y, ww, hh, m) => R(x, y, ww, hh, side, m === undefined ? 0.74 : m);
  switch (d.pat) {
    case PAT.GRASS_SIDE: R(x0, fy, w, 5, top, 0.95); R(x0 + 6, fy + 5, 6, 3, top, 0.95); R(x0 + 22, fy + 5, 7, 3, top, 0.95); break;
    case PAT.BRICK: case PAT.SHINGLE:
      for (let r = 0; r < 4; r++) { dark(x0, fy + r * 8 + 6, w, 2); for (let c = 0; c < 3; c++) dark(x0 + ((c * 14 + (r % 2) * 7) % w), fy + r * 8, 2, 6); }
      break;
    case PAT.PLANK: for (let r = 1; r < 4; r++) dark(x0, fy + r * 8 - 1, w, 2); dark(x0 + 10, fy, 2, 7); dark(x0 + 24, fy + 8, 2, 7); dark(x0 + 14, fy + 16, 2, 7); break;
    case PAT.BARK: for (let c = 0; c < 5; c++) dark(x0 + 3 + c * 7, fy, 2, fh, 0.82); R(x0 + 6, y0 + 2, w - 12, topH - 4, top, 0.9); break;
    case PAT.ORE_COAL: case PAT.ORE_IRON: case PAT.ORE_PRISM: {
      const ac = d.pat === PAT.ORE_COAL ? [0.14, 0.15, 0.17] : d.pat === PAT.ORE_IRON ? [0.86, 0.62, 0.46] : [0.37, 0.89, 0.82];
      [[6, 4], [20, 8], [10, 16], [24, 20], [16, 24]].forEach(([dx, dy]) => R(x0 + dx, fy + dy, 6, 5, ac, 1));
      R(x0 + 12, y0 + 3, 6, 3, ac, 1);
      break;
    }
    case PAT.TABLE_SIDE:
      R(x0, fy, w, 4, top, 0.8); dark(x0 + 3, fy + 8, 4, fh - 8, 0.8); dark(x0 + w - 7, fy + 8, 4, fh - 8, 0.8);
      for (let i = 1; i < 3; i++) { R(x0 + i * w / 3 - 1, y0, 2, topH, top, 0.7); }
      R(x0, y0 + 4, w, 1.5, top, 0.7);
      break;
    case PAT.CHEST: dark(x0, fy + 8, w, 3, 0.7); R(x0 + w / 2 - 3, fy + 6, 6, 8, [0.93, 0.8, 0.4], 1); break;
    case PAT.GLASS: g.clearRect(x0 + 4, fy + 4, w - 8, fh - 8); R(x0 + 4, fy + 4, w - 8, fh - 8, side, 1.1); R(x0 + 8, fy + 7, 4, 10, [1, 1, 1], 1); break;
    case PAT.METAL: R(x0 + 5, fy + 5, w - 10, fh - 10, side, 1.1); R(x0 + 8, fy + 8, 8, 3, [1, 1, 1], 1); break;
    case PAT.HAY: dark(x0, fy + 8, w, 3, 0.8); dark(x0, fy + 20, w, 3, 0.8); break;
    case PAT.STRATA: dark(x0, fy + 9, w, 3, 0.86); dark(x0, fy + 21, w, 2, 0.9); break;
    case PAT.RIBS: for (let c = 0; c < 4; c++) dark(x0 + 4 + c * 9, fy, 2, fh, 0.8); break;
    case PAT.LEAF: R(x0 + 4, fy + 4, 7, 7, side, 1.1); R(x0 + 20, fy + 10, 8, 8, side, 0.8); R(x0 + 8, fy + 18, 7, 7, side, 0.85); R(x0 + 24, fy + 22, 6, 6, side, 1.1); break;
    case PAT.FURROW: for (let r = 0; r < 3; r++) R(x0, y0 + 1 + r * 3, w, 1.5, top, 0.75); break;
    default: break;
  }
}

/* ---------- loot tables for structure chests ---------- */
const LOOT = {
  town: { rolls: [4, 7], items: [
    ['BREAD', 1, 4, 10], ['SEEDS_WHEAT', 2, 6, 8], ['SEEDS_CARROT', 2, 5, 7], ['SEEDS_BEET', 2, 5, 7], ['SEEDS_PUMPKIN', 1, 3, 6],
    ['WHEAT', 2, 6, 6], ['CARROT', 1, 4, 5], ['STICK', 2, 8, 6], ['#PLANKS', 4, 12, 6], ['COAL', 1, 5, 6], ['HIDE', 1, 3, 4],
    ['#LANTERN', 1, 3, 4], ['ARROW', 3, 8, 4], ['TILLER_S', 1, 1, 3], ['SPADE_S', 1, 1, 3], ['PICK_S', 1, 1, 3], ['AXE_S', 1, 1, 2],
    ['#WOOL', 1, 4, 3], ['APPLE', 1, 4, 5], ['IRON_INGOT', 1, 2, 2], ['BOOTS_H', 1, 1, 1], ['HELM_H', 1, 1, 1]] },
  workshop: { rolls: [5, 8], items: [
    ['IRON_INGOT', 1, 4, 8], ['COAL', 2, 8, 8], ['STICK', 4, 10, 6], ['PICK_S', 1, 1, 5], ['SWORD_S', 1, 1, 5], ['TILLER_S', 1, 1, 4],
    ['SPADE_I', 1, 1, 2], ['PICK_I', 1, 1, 2], ['#GLASS', 2, 8, 4], ['#STONE_BRICK', 6, 16, 5], ['#LANTERN', 2, 4, 4], ['CHEST_H', 1, 1, 2], ['LEGS_H', 1, 1, 2]] },
  fortress: { rolls: [5, 8], items: [
    ['IRON_INGOT', 2, 6, 10], ['RAW_IRON', 2, 5, 6], ['COAL', 3, 8, 6], ['ARROW', 6, 16, 8], ['BOW', 1, 1, 3], ['BREAD', 2, 4, 5],
    ['SWORD_I', 1, 1, 3], ['PICK_I', 1, 1, 3], ['AXE_I', 1, 1, 2], ['HELM_I', 1, 1, 2], ['BOOTS_I', 1, 1, 2], ['LEGS_I', 1, 1, 1],
    ['CHEST_I', 1, 1, 1], ['PRISM', 1, 2, 2], ['ROAST', 1, 3, 4], ['#LANTERN', 2, 4, 3], ['#IRON_BLOCK', 1, 1, 1]] },
  castle: { rolls: [6, 9], items: [
    ['PRISM', 1, 4, 9], ['IRON_INGOT', 3, 8, 8], ['#GOLD_BLOCK', 1, 3, 5], ['ARROW', 8, 20, 6], ['ROAST', 2, 5, 6],
    ['SWORD_I', 1, 1, 4], ['CHEST_I', 1, 1, 3], ['LEGS_I', 1, 1, 3], ['HELM_I', 1, 1, 3], ['BOOTS_I', 1, 1, 3],
    ['PICK_P', 1, 1, 2], ['SPADE_P', 1, 1, 2], ['TILLER_P', 1, 1, 2], ['AXE_P', 1, 1, 2], ['BOW', 1, 1, 3], ['#IRON_BLOCK', 1, 2, 3]] },
  vault: { rolls: [5, 7], fixed: [['SWORD_P', 1], ['CHEST_P', 1], ['PRISM', 8], ['#GOLD_BLOCK', 6], ['#PRISM_BLOCK', 1]], items: [
    ['PRISM', 2, 5, 8], ['HELM_P', 1, 1, 4], ['LEGS_P', 1, 1, 4], ['BOOTS_P', 1, 1, 4], ['PICK_P', 1, 1, 4], ['ROAST', 3, 6, 4], ['#GOLD_BLOCK', 2, 4, 4]] },
};
function lootId(name) { return name[0] === '#' ? B[name.slice(1)] : I[name]; }
function rollLoot(table, rng) {
  const t = LOOT[table] || LOOT.town;
  const slots = new Array(27).fill(null);
  const free = [];
  for (let i = 0; i < 27; i++) free.push(i);
  const put = (id, n) => {
    if (!free.length) return;
    const k = Math.floor(rng() * free.length);
    slots[free.splice(k, 1)[0]] = { id, n };
  };
  if (t.fixed) for (const [name, n] of t.fixed) put(lootId(name), n);
  const total = t.items.reduce((s, e) => s + e[3], 0);
  const rolls = t.rolls[0] + Math.floor(rng() * (t.rolls[1] - t.rolls[0] + 1));
  for (let r = 0; r < rolls; r++) {
    let pick = rng() * total;
    for (const e of t.items) {
      pick -= e[3];
      if (pick <= 0) { put(lootId(e[0]), e[1] + Math.floor(rng() * (e[2] - e[1] + 1))); break; }
    }
  }
  return slots;
}
