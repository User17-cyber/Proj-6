#!/usr/bin/env node
/* Logic checks that need no browser: sprites, recipes, world generation, structure rarity, meshing.
   Run with: node tessera/tools/check.js */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const dir = path.join(__dirname, '..', 'src');
let src = '';
for (const f of ['util', 'blocks', 'items', 'structures', 'worldgen', 'world', 'mesher']) src += fs.readFileSync(path.join(dir, f + '.js'), 'utf8').replace("'use strict';", '') + '\n';
src += ';globalThis.T = { B, I, ITEMS, BLOCKS, RECIPES, matchRecipe, recipeLayout, WorldGen, World, meshChunk, BIOME_INFO, SPAWN_BIOMES, STRUCT_TYPES, SPR, rollLoot, mulberry32 };';
vm.runInThisContext(src);
const { B, I, ITEMS, RECIPES, matchRecipe, recipeLayout, WorldGen, World, meshChunk, BIOME_INFO, SPAWN_BIOMES, STRUCT_TYPES, SPR, rollLoot, mulberry32 } = T;

let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.log('FAIL  ' + msg); } }

/* every sprite is a 16 x 16 grid */
for (const k in SPR) ok(SPR[k].length === 16 && SPR[k].every((r) => r.length === 16), 'sprite ' + k + ' is 16 x 16');

/* every recipe resolves to itself, wherever it sits on the 3 x 3 grid */
for (const r of RECIPES) ok(matchRecipe(recipeLayout(r).map((o) => (o ? o[0] : 0))) === r, 'recipe for ' + ITEMS[r.out].name);
ok(matchRecipe([0, 0, B.STONE, 0, 0, I.STICK, 0, 0, I.STICK]).out === I.SPADE_S, 'spade in the right-hand column');
ok(matchRecipe([B.STONE, B.STONE, 0, I.STICK, B.STONE, 0, I.STICK, 0, 0]).out === I.AXE_S, 'mirrored axe');
ok(matchRecipe([B.PLANKS, 0, 0, 0, 0, 0, 0, 0, I.STICK]) === null, 'nonsense makes nothing');
for (const need of ['PICK_S', 'SPADE_S', 'TILLER_S', 'SWORD_S', 'HELM_I', 'CHEST_I', 'LEGS_I', 'BOOTS_I']) ok(RECIPES.some((r) => r.out === I[need]), 'recipe exists for ' + need);
for (const seed of ['SEEDS_WHEAT', 'SEEDS_CARROT', 'SEEDS_BEET', 'SEEDS_PUMPKIN']) ok(ITEMS[I[seed]].kind === 'seed', seed + ' is plantable');

/* world generation */
for (const seed of [1, 12345, 987654]) {
  const g = new WorldGen(seed);
  for (const b of SPAWN_BIOMES) ok(g.findSpawn(b).biome === b, 'seed ' + seed + ': spawn found in ' + BIOME_INFO[b].name);
  /* places: the more valuable, the rarer */
  const density = STRUCT_TYPES.map((t, ti) => {
    let n = 0;
    for (let rx = -6; rx < 6; rx++) for (let rz = -6; rz < 6; rz++) if (g.structureFor(ti, rx, rz)) n++;
    return n / (144 * t.region * t.region);
  });
  ok(density[0] > density[1] && density[1] > density[2], 'seed ' + seed + ': town > fortress > castle in frequency');
  console.log('seed ' + seed + ': one ' + STRUCT_TYPES.map((t, i) => t.type + ' per ' + Math.round(1 / density[i]) + ' chunks').join(', one '));
}

/* a town generates identically chunk by chunk, and meshes */
const w = new World(12345);
const town = w.gen.nearestStructure(0, 0, 0, 3).s;
const cx = town.x >> 4, cz = town.z >> 4;
let t0 = Date.now();
for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) w.ensureChunk(cx + dx, cz + dz);
const genMs = (Date.now() - t0) / 81;
t0 = Date.now();
let verts = 0;
for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) { const m = meshChunk(w, w.getChunk(cx + dx, cz + dz)); ok(!!m, 'chunk meshes'); verts += m.o.n + m.t.n; }
console.log('chunk: generate ' + genMs.toFixed(1) + ' ms, mesh ' + ((Date.now() - t0) / 49).toFixed(1) + ' ms, ' + Math.round(verts / 49) + ' vertices on average');
ok(town.spawns && town.spawns.length > 0, 'town has townsfolk');
ok(w.chestLoot.size > 0, 'town has stocked chests');
ok(w.getBlock(town.x, town.y, town.z) === B.WATER, 'town well is at the centre');
const w2 = new World(12345);
const a = w.getChunk(cx, cz).data, b2 = w2.ensureChunk(cx, cz).data;
ok(a.every((v, i) => v === b2[i]), 'chunks are deterministic');
ok(rollLoot('vault', mulberry32(5)).some((s) => s && s.id === I.SWORD_P), 'castle vault holds a prism sword');

console.log(failed ? failed + ' check(s) failed' : 'all checks passed');
process.exit(failed ? 1 : 0);
