'use strict';
/* Block registry. Every block is a box (or a few boxes); there are no textures,
   only colours plus a rectangular pattern drawn by the terrain shader. */

const CHUNK = 16;
const WORLD_H = 96;
const SEA = 40;

/* Pattern ids understood by the terrain shader (see render.js). */
const PAT = {
  PLAIN: 0, DAPPLE: 1, BRICK: 2, PLANK: 3, BARK: 4, RINGS: 5, ORE_COAL: 6, ORE_IRON: 7, ORE_PRISM: 8,
  GRASS_SIDE: 9, TABLE_TOP: 10, TABLE_SIDE: 11, CHEST: 12, FURROW: 13, GLASS: 14, WATER: 15,
  SNOW_SIDE: 16, BED_TOP: 17, GLOW: 18, SHINGLE: 19, PEBBLE: 20, HAY: 21, WOOL: 22, METAL: 23,
  RIBS: 24, STRATA: 25, LEAF: 26, ICE: 27,
};

const B = {};
const BLOCKS = [];

function defBlock(key, name, color, props) {
  const id = BLOCKS.length;
  const d = Object.assign({
    id, key, name,
    color: hexRGB(color), top: null, bottom: null,
    pat: PAT.PLAIN, patTop: null, patBottom: null,
    solid: true,        // blocks movement
    opaque: true,       // hides neighbouring faces and blocks sky light
    alpha: false,       // drawn in the transparent pass
    shape: 'cube',      // cube | plant | crop | box
    height: 1,          // collision height
    hard: 1,            // seconds to break by hand
    tool: null,         // tool type that speeds up breaking
    tier: 0,            // minimum tool tier needed to get a drop
    light: 0,           // light emitted, 0..1
    tint: null,         // 'grass' | 'leaf' : coloured by climate
    replace: false,     // can be overwritten when placing blocks
    needsSoil: false,   // pops off if the block below is removed
    drop: undefined,    // undefined = itself; null = nothing; function(rng) => [[id, n], ...]
  }, props || {});
  if (d.top !== null && typeof d.top === 'number') d.top = hexRGB(d.top);
  if (d.bottom !== null && typeof d.bottom === 'number') d.bottom = hexRGB(d.bottom);
  B[key] = id;
  BLOCKS.push(d);
  return id;
}

const PLANT = { solid: false, opaque: false, shape: 'plant', hard: 0.05, replace: true, needsSoil: true };

defBlock('AIR', 'Air', 0x000000, { solid: false, opaque: false, replace: true, shape: 'none', drop: null });
defBlock('GRASS', 'Grass Block', 0x6fbf5a, { tint: 'grass', bottom: 0x8a6244, pat: PAT.GRASS_SIDE, patTop: PAT.DAPPLE, patBottom: PAT.DAPPLE, hard: 0.7, tool: 'spade', drop: () => [[B.DIRT, 1]] });
defBlock('DIRT', 'Dirt', 0x8a6244, { pat: PAT.DAPPLE, hard: 0.6, tool: 'spade' });
defBlock('STONE', 'Stone', 0x8d9199, { pat: PAT.DAPPLE, hard: 3.2, tool: 'pick', tier: 1 });
defBlock('SAND', 'Sand', 0xe8d9a4, { pat: PAT.DAPPLE, hard: 0.55, tool: 'spade' });
defBlock('WATER', 'Water', 0x3f8fd6, { solid: false, opaque: false, alpha: true, pat: PAT.WATER, replace: true, hard: 1e9, drop: null });
defBlock('LOG', 'Oak Log', 0x6e4f33, { top: 0xc9a36b, bottom: 0xc9a36b, pat: PAT.BARK, patTop: PAT.RINGS, patBottom: PAT.RINGS, hard: 1.8, tool: 'axe' });
defBlock('LEAVES', 'Leaves', 0x4fa348, { tint: 'leaf', pat: PAT.LEAF, hard: 0.25, drop: (r) => r() < 0.12 ? [[I.STICK, 1]] : r() < 0.08 ? [[I.APPLE, 1]] : [] });
defBlock('PLANKS', 'Planks', 0xc79a5e, { pat: PAT.PLANK, hard: 1.5, tool: 'axe' });
defBlock('STONE_BRICK', 'Stone Bricks', 0xa0a4ad, { pat: PAT.BRICK, hard: 3.6, tool: 'pick', tier: 1 });
defBlock('COAL_ORE', 'Coal Ore', 0x8d9199, { pat: PAT.ORE_COAL, hard: 3.6, tool: 'pick', tier: 1, drop: (r) => [[I.COAL, 1 + (r() < 0.4 ? 1 : 0)]] });
defBlock('IRON_ORE', 'Iron Ore', 0x8d9199, { pat: PAT.ORE_IRON, hard: 4.2, tool: 'pick', tier: 2, drop: () => [[I.RAW_IRON, 1]] });
defBlock('PRISM_ORE', 'Prism Ore', 0x7c818c, { pat: PAT.ORE_PRISM, hard: 5.0, tool: 'pick', tier: 3, drop: (r) => [[I.PRISM, 1 + (r() < 0.25 ? 1 : 0)]] });
defBlock('SNOW', 'Snow', 0xf2f6fb, { pat: PAT.DAPPLE, hard: 0.5, tool: 'spade' });
defBlock('ICE', 'Ice', 0xa9d4f2, { pat: PAT.ICE, hard: 0.8, tool: 'pick' });
defBlock('CLAY', 'Clay', 0xa8afbd, { pat: PAT.DAPPLE, hard: 0.7, tool: 'spade' });
defBlock('REDROCK', 'Redrock', 0xc0623f, { pat: PAT.STRATA, hard: 2.4, tool: 'pick', tier: 1 });
defBlock('SANDSTONE', 'Sandstone', 0xdcc88e, { pat: PAT.STRATA, hard: 2.2, tool: 'pick', tier: 1 });
defBlock('CACTUS', 'Cactus', 0x5fa35a, { shape: 'box', opaque: false, pat: PAT.RIBS, hard: 0.5, needsSoil: true });
defBlock('TALL_GRASS', 'Tall Grass', 0x6fbf5a, Object.assign({}, PLANT, { tint: 'grass', drop: (r) => r() < 0.22 ? [[I.SEEDS_WHEAT, 1]] : r() < 0.25 ? [[I.FIBER, 1]] : [] }));
defBlock('FLOWER_RED', 'Scarlet Bloom', 0xe5484d, PLANT);
defBlock('FLOWER_YELLOW', 'Sun Bloom', 0xf5c542, PLANT);
defBlock('FLOWER_BLUE', 'Sky Bloom', 0x5b8def, PLANT);
defBlock('FLOWER_WHITE', 'Frost Bloom', 0xf6f4ee, PLANT);
defBlock('FLOWER_PINK', 'Rose Bloom', 0xf08fc0, PLANT);
defBlock('DEAD_BUSH', 'Dry Brush', 0x9a7b4f, Object.assign({}, PLANT, { drop: (r) => [[I.STICK, 1 + (r() < 0.5 ? 1 : 0)]] }));
defBlock('PINE_LOG', 'Pine Log', 0x4f3a2a, { top: 0xb8935f, bottom: 0xb8935f, pat: PAT.BARK, patTop: PAT.RINGS, patBottom: PAT.RINGS, hard: 1.8, tool: 'axe' });
defBlock('PINE_LEAVES', 'Pine Needles', 0x2f6b4f, { pat: PAT.LEAF, hard: 0.25, drop: (r) => r() < 0.15 ? [[I.STICK, 1]] : [] });
defBlock('BLOSSOM_LEAVES', 'Blossom Leaves', 0xf2a7c3, { pat: PAT.LEAF, hard: 0.25, drop: (r) => r() < 0.12 ? [[I.STICK, 1]] : r() < 0.1 ? [[I.APPLE, 1]] : [] });
defBlock('PALE_LOG', 'Pale Log', 0xd8d2c4, { top: 0xe5d6b0, bottom: 0xe5d6b0, pat: PAT.BARK, patTop: PAT.RINGS, patBottom: PAT.RINGS, hard: 1.8, tool: 'axe' });
defBlock('GLASS', 'Glass', 0xcfeaf5, { opaque: false, alpha: true, pat: PAT.GLASS, hard: 0.4 });
defBlock('BRICKS', 'Clay Bricks', 0xb5553f, { pat: PAT.BRICK, hard: 3.4, tool: 'pick', tier: 1 });
defBlock('MAKER_TABLE', 'Maker Table', 0xa97a47, { top: 0xd6ab70, bottom: 0x8a6238, pat: PAT.TABLE_SIDE, patTop: PAT.TABLE_TOP, patBottom: PAT.PLANK, hard: 1.6, tool: 'axe' });
defBlock('CHEST', 'Chest', 0xb98344, { shape: 'box', opaque: false, pat: PAT.CHEST, hard: 1.6, tool: 'axe' });
defBlock('BED', 'Bed', 0xc9453f, { shape: 'box', opaque: false, height: 0.5625, pat: PAT.WOOL, hard: 0.6 });
defBlock('LANTERN', 'Lantern', 0xffd97a, { shape: 'box', solid: false, opaque: false, pat: PAT.GLOW, light: 1, hard: 0.2 });
defBlock('FARMLAND', 'Tilled Soil', 0x6b4a32, { top: 0x5a3c28, patTop: PAT.FURROW, pat: PAT.DAPPLE, hard: 0.6, tool: 'spade', drop: () => [[B.DIRT, 1]] });

/* Crops: four growth stages each. */
function defCrop(key, name, color, seed, produce) {
  for (let s = 0; s < 4; s++) {
    defBlock(key + '_' + s, name, color, {
      solid: false, opaque: false, shape: 'crop', hard: 0.05, needsSoil: true,
      crop: key, stage: s,
      drop: (r) => s < 3 ? [[I[seed], 1]] : [[I[produce], 1 + Math.floor(r() * 3)], [I[seed], 1 + Math.floor(r() * 2)]],
    });
  }
}
defCrop('WHEAT', 'Wheat', 0xd9b84a, 'SEEDS_WHEAT', 'WHEAT');
defCrop('CARROT', 'Carrots', 0xf08a2e, 'SEEDS_CARROT', 'CARROT');
defCrop('BEET', 'Beets', 0xb0345e, 'SEEDS_BEET', 'BEET');
defCrop('PUMPKIN', 'Pumpkin Vine', 0xe8862a, 'SEEDS_PUMPKIN', 'PUMPKIN');

defBlock('PAINT_RED', 'Red Painted Planks', 0xd64545, { pat: PAT.PLANK, hard: 1.5, tool: 'axe' });
defBlock('PAINT_BLUE', 'Blue Painted Planks', 0x4a7fd6, { pat: PAT.PLANK, hard: 1.5, tool: 'axe' });
defBlock('PAINT_YELLOW', 'Yellow Painted Planks', 0xf0c244, { pat: PAT.PLANK, hard: 1.5, tool: 'axe' });
defBlock('PAINT_GREEN', 'Green Painted Planks', 0x58a65a, { pat: PAT.PLANK, hard: 1.5, tool: 'axe' });
defBlock('PAINT_WHITE', 'White Painted Planks', 0xf0ede6, { pat: PAT.PLANK, hard: 1.5, tool: 'axe' });
defBlock('PAINT_PINK', 'Pink Painted Planks', 0xee9cc4, { pat: PAT.PLANK, hard: 1.5, tool: 'axe' });
defBlock('WOOL', 'Wool', 0xf1efe9, { pat: PAT.WOOL, hard: 0.5 });
defBlock('GOLD_BLOCK', 'Gold Block', 0xf2c94c, { pat: PAT.METAL, hard: 3.0, tool: 'pick', tier: 2 });
defBlock('IRON_BLOCK', 'Iron Block', 0xd5dbe4, { pat: PAT.METAL, hard: 4.0, tool: 'pick', tier: 2 });
defBlock('PRISM_BLOCK', 'Prism Block', 0x6fe6d5, { pat: PAT.METAL, hard: 4.5, tool: 'pick', tier: 3, light: 0.5 });
defBlock('MOSSY_STONE', 'Mossy Bricks', 0x86997f, { pat: PAT.BRICK, hard: 3.6, tool: 'pick', tier: 1 });
defBlock('PATH', 'Path', 0xb59b6b, { pat: PAT.PEBBLE, hard: 0.7, tool: 'spade' });
defBlock('HAY', 'Hay Bale', 0xdbb84a, { pat: PAT.HAY, hard: 0.5 });
defBlock('DARK_BRICK', 'Dark Bricks', 0x5b5f6b, { pat: PAT.BRICK, hard: 4.0, tool: 'pick', tier: 1 });
defBlock('ROOF_RED', 'Red Roof Tiles', 0xb5483c, { pat: PAT.SHINGLE, hard: 2.0, tool: 'pick' });
defBlock('ROOF_BLUE', 'Blue Roof Tiles', 0x3f6fb0, { pat: PAT.SHINGLE, hard: 2.0, tool: 'pick' });
defBlock('MUD', 'Mud', 0x5d4a3b, { pat: PAT.DAPPLE, hard: 0.6, tool: 'spade' });
defBlock('BEDROCK', 'Bedrock', 0x3a3d45, { pat: PAT.DAPPLE, hard: 1e9, drop: null });

const BLOCK_COUNT = BLOCKS.length;
/* Flat lookup tables for the hot loops. */
const IS_OPAQUE = new Uint8Array(256);
const IS_SOLID = new Uint8Array(256);
const IS_CUBE = new Uint8Array(256);
const BLOCK_LIGHT = new Float32Array(256);
for (const d of BLOCKS) {
  IS_OPAQUE[d.id] = d.opaque ? 1 : 0;
  IS_SOLID[d.id] = d.solid ? 1 : 0;
  IS_CUBE[d.id] = d.shape === 'cube' ? 1 : 0;
  BLOCK_LIGHT[d.id] = d.light;
}

const SOIL_BLOCKS = new Set([B.GRASS, B.DIRT, B.SAND, B.FARMLAND, B.MUD, B.SNOW, B.PATH, B.CLAY, B.REDROCK]);
const LOG_BLOCKS = [B.LOG, B.PINE_LOG, B.PALE_LOG];
function isCropBlock(id) { return BLOCKS[id] !== undefined && BLOCKS[id].shape === 'crop'; }
