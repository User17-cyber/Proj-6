# Tessera Wilds

An endless voxel sandbox: dig, farm, build and fight across nine biomes. Everything on screen is a rectangle or a square, drawn with smooth colour, soft shading, fog and a gradient sky rather than chunky 8-bit textures. The one deliberate exception is what you hold: every tool, weapon, armour piece and item is a 16 × 16 pixel sprite, extruded into pixel-sized boxes in your hand.

## Play

Open `tessera/index.html` in a desktop browser. No build step or server is needed.

| Key | Action |
| --- | --- |
| W A S D, Space, Shift | Move, jump, sprint |
| Mouse (or arrow keys) | Look |
| Left click | Dig or attack |
| Right click | Place, use, till, plant, eat, talk, shoot |
| 1–9 or wheel | Choose a hotbar slot |
| E | Pack and armour |
| Esc | Pause (view distance, sound, save and quit) |
| F3 | Position, seed, frame rate |

The game saves to the browser automatically; **Continue** on the title screen picks up where you left off.

## How it works

**A different start every time.** Each new game gets a fresh seed and wakes you in a biome different from your last one: Meadow, Deepwood, Blossom Grove, Dune Sea, Amber Steppe, Frost Fields, Mire, Highlands or Redrock Canyons. Open sea and shores lie between them.

**The Maker Table.** Nothing can be crafted by hand. You start with one Maker Table and a set of seeds; place the table and right-click it to use its 3 × 3 grid. The recipe list beside the grid lays a recipe out for you when clicked, and outlines the ones you can afford.

**Tools, weapons and armour**, each in wood, stone, iron and prism:

- **Pick**: the stone digging tool. Stone and ore drop nothing without one, and better ore needs a better pick.
- **Spade**: the dirt digging tool, for dirt, sand, snow, clay and mud. Right-click grass to lay a path.
- **Tiller**: the farming tool. Right-click soil to till it.
- **Axe**, **Sword** and **Bow** (with arrows).
- **Seeds**: wheat, carrot, beet and pumpkin. Plant them on tilled soil; they grow through four stages.
- **Armour**: helm, cuirass, greaves and boots in hide, iron and prism.

**Building blocks** made on the table include planks, stone, clay and dark bricks, sandstone, glass, roof tiles, painted planks in six colours, wool, lanterns, chests and beds.

**Creatures.** Woolbacks, Bristle Boars, Ruffhens, Glade Deer, Dune Striders and Snow Hares live in the biomes that suit them. At night Gloomers, Mire Blobs and Emberlings come out and fade again at sunrise. Sleep in a bed to skip the night.

**Places.** Three kinds of structure are scattered through the world. The more a place helps you, the rarer it is:

| Place | At most one per | What it offers |
| --- | --- | --- |
| Town | 144 chunks | Houses with beds and stocked chests, farms, a Maker Table, friendly townsfolk |
| Fortress | 324 chunks | Iron arms and armour, guarded by Iron Husks and Husk Archers |
| Castle | 784 chunks | Prism gear in the vault, guarded by the Castle Warden |

Not every region has land flat and dry enough for its place, so in practice a town turns up about once per 250 chunks, a fortress per 650 and a castle per 1,600. The compass at the top of the screen points to the nearest of each.

## Files

- `index.html`, `css/style.css`: page and interface styling
- `src/util.js`: seeded random numbers and simplex noise
- `src/blocks.js`, `src/items.js`: blocks, items, pixel sprites, recipes, chest loot
- `src/worldgen.js`, `src/structures.js`: climate, biomes, terrain, caves, ores, trees, towns, fortresses, castles
- `src/world.js`, `src/mesher.js`: chunk storage, physics, ray casting, mesh building with ambient occlusion
- `src/render.js`: terrain shader, sky, clouds, particles, held item
- `src/entities.js`, `src/player.js`: creatures, combat, movement, digging, placing, farming
- `src/ui.js`, `src/main.js`: interface, sound, input, saving, game loop
- `vendor/three.min.js`: three.js r149 (MIT)
- `tools/check.js`: logic checks (`node tessera/tools/check.js`)
- `tools/build.js`: bundles everything into one file, `tessera/dist/tessera-wilds.html`
