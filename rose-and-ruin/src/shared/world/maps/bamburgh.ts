import type { MapDef } from '../mapgen';
import { village, fields, woodlandRing, ground } from './common';

// Bamburgh: a long fortress on a basalt crag above the North Sea. Warwick's guns have
// smashed a breach in the west wall; the Yorkists also force the gate road from the south.
export const bamburgh: MapDef = {
  id: 'bamburgh',
  name: 'Bamburgh Castle',
  location: 'Northumberland coast',
  year: 'Dawn, 25 June 1464',
  blurb: 'A basalt crag over the North Sea, its west wall broken open by the King\'s great guns.',
  history: 'Bamburgh was the last Lancastrian stronghold in the north. In 1464 the Earl of Warwick turned the royal bombards "Newcastle" and "London" on its walls: the first English castle to fall to gunpowder.',
  atmosphere: {
    sky: 'dawn', sunAzimuth: 95, sunIntensity: 3.4, envIntensity: 0.75, exposure: 1.15,
    fogColor: [0.74, 0.64, 0.66], fogDensity: 0.0027, fogHeight: 18, haze: 0.7, wind: 0.55,
    grassTint: [0.95, 0.92, 0.88], ambientSound: 'coast', dust: 0.05,
  },
  card: { sky: ['#e8a7a0', '#6f6a93'], ground: '#4a4a35', silhouette: '#241f24' },
  build(b) {
    const n = b.noise;
    const TOP = 26;
    b.base((x, z) => 6.5 + 2.4 * n.fbm(x / 140, z / 140, 4) + 0.3 * n.fbm(x / 8, z / 8, 2) - Math.max(0, x - 40) * 0.08);
    // dunes between the crag and the sea
    b.add({ kind: 'rect', x: 72, z: 10, hx: 22, hz: 200 }, 0, 1);
    for (let i = 0; i < 18; i++) {
      const z = -180 + i * 22 + b.rng.range(-6, 6), x = 62 + b.rng.range(-8, 14);
      b.plateau({ kind: 'ellipse', x, z, rx: 9 + b.rng.range(0, 5), rz: 6 + b.rng.range(0, 4), rot: b.rng.range(0, 3) }, 5 + b.rng.range(0, 3), 7, 0.5);
    }
    b.water(0, 92, 260, -260, 260, 'sea');
    b.carve({ kind: 'rect', x: 180, z: 0, hx: 88, hz: 260 }, -3, 26);
    b.paint({ kind: 'rect', x: 72, z: 0, hx: 26, hz: 260 }, 2, 1, 10, 0.9);

    // the crag
    const crag: [number, number][] = [[-30, -142], [18, -152], [33, -110], [35, -40], [31, 30], [27, 96], [7, 120], [-19, 112], [-31, 60], [-37, 0], [-35, -70]];
    b.plateau({ kind: 'poly', pts: crag }, TOP, 9, 3.4);
    b.flatten({ kind: 'poly', pts: [[-24, -132], [12, -140], [24, -106], [26, -40], [22, 30], [18, 90], [4, 106], [-13, 100], [-22, 56], [-28, 0], [-26, -66]] }, TOP, 3);
    // breach ramp and gate road
    b.earthRamp(-80, 16, -30, 16, 15, 7.2, TOP);
    b.earthRamp(16.5, 103.5, 46, 162, 10, TOP, 6.5);
    b.flatten({ kind: 'rect', x: 40, z: 182, hx: 24, hz: 18 }, 6.5, 10);

    // ---- walls following the crag edge
    const WT = TOP + 9, TT = TOP + 12;
    const W: [number, number][] = [[-26, -132], [14, -140], [27, -106], [29, -40], [25, 30], [21, 90]];
    for (let i = 0; i < W.length - 1; i++) b.wall(W[i][0], W[i][1], W[i + 1][0], W[i + 1][1], WT, { thick: 2.4, style: 'red' });
    // gate on the south-east segment
    const gx = 12.5, gz = 100, grot = -2.27;
    b.gatehouse(gx, gz, grot, { w: 14, d: 10, top: TOP + 13, passW: 4.2, passH: 5, towers: 'round', towerR: 3.6, floor: TOP, style: 'red' });
    b.wall(21, 90, 17.0, 94.7, WT, { thick: 2.4, style: 'red' });
    b.wall(8.0, 105.3, 4, 110, WT, { thick: 2.4, style: 'red' });
    b.wall(4, 110, -15, 103, WT, { thick: 2.4, style: 'red' });
    b.wall(-15, 103, -25, 56, WT, { thick: 2.4, style: 'red' });
    b.wall(-25, 56, -28, 25, WT, { thick: 2.4, style: 'red', brokenB: true });
    b.wall(-30, 7, -31, 0, WT, { thick: 2.4, style: 'red', brokenA: true });
    b.wall(-31, 0, -29, -66, WT, { thick: 2.4, style: 'red' });
    b.wall(-29, -66, -26, -132, WT, { thick: 2.4, style: 'red' });
    for (const [x, z] of [[-26, -132], [14, -140], [27, -106], [29, -40], [25, 30], [21, 90], [4, 110], [-15, 103], [-25, 56], [-31, 0], [-29, -66]] as const) {
      b.tower(x, z, { r: 4.2, top: TT, shape: (Math.abs(x * 7 + z) % 3) < 1.5 ? 'square' : 'round', roof: 'flat', style: 'red' });
    }
    b.rubble(-29.5, 16, 7.5, 3.2, 'red');

    // keep and wards
    b.keep(-2, -30, 0.05, 24, 22, TOP + 24, 'square', 'red');
    b.building(4, -82, 0.08, 9, 30, { style: 'stone', roof: 'slate', floors: 2, flatten: false });
    b.building(-10, -112, 0.1, 10, 16, { style: 'ruin', flatten: false });
    b.building(-12, 40, 0.06, 7, 16, { style: 'timber', roof: 'thatch', flatten: false });
    b.building(12, 52, -0.05, 7, 14, { style: 'timber', roof: 'thatch', flatten: false });
    b.building(-14, 78, 0.12, 6, 12, { style: 'timber', roof: 'thatch', flatten: false });
    b.paint({ kind: 'poly', pts: [[-20, -120], [10, -128], [20, -60], [18, 80], [-10, 96], [-20, 40], [-24, -60]] }, 0, 0.5, 4, 0.9);
    b.prop('well', 6, -56, 0, 1);
    b.prop('cart', -8, 22, 0.4, 1); b.prop('hay', -4, 26, 1.2, 1); b.prop('hay', -2.5, 27, 0.2, 1);
    b.prop('brazier', -18, 12, 0, 1); b.prop('brazier', -18, 22, 0, 1);
    b.prop('brazier', 2, 92, 0, 1); b.prop('brazier', 10, 88, 0, 1);
    b.prop('banner', 0, -50, 0, 1.4, { team: 0 });
    b.prop('barrel', 12, -20, 0, 1); b.prop('barrel', 12.8, -19, 0, 1); b.prop('crate', 11.5, -18, 0.3, 1);

    b.spawn(0, 0, -95, Math.PI, 20, 10);
    b.spawn(1, -122, 16, -Math.PI / 2, 30, 12);
    b.spawn(1, 48, 178, 0.42, 30, 10);

    b.objective('The Cannon Breach', 'A', -21, 16, 9);
    b.objective('Constable\'s Gate', 'B', 6, 90, 9);
    b.objective('The Great Keep', 'C', 0, -54, 10, 0);
    b.front([-21, 16], [6, 90], [0, -54], [-52, 16], [30, 140]);

    // ---- the Yorkist siege lines
    b.prop('cannon', -92, 10, -Math.PI / 2 + 0.05, 1.2);
    b.prop('cannon', -94, 24, -Math.PI / 2 - 0.08, 1.2);
    for (const z of [-6, 4, 30, 40]) b.prop('mantlet', -86, z, -Math.PI / 2, 1);
    b.camp(-130, -40, -Math.PI / 2, 1, 2, 4);
    b.camp(-128, 70, -Math.PI / 2, 1, 2, 3);
    village(b, -95, 130, 9, 20);
    b.front([-95, 130]);
    ground(b, 'meadow', -196, -60, 26);
    ground(b, 'hillfort', -190, 156, 20);
    ground(b, 'chapel', -64, -176, 18);
    ground(b, 'crossroads', -128, 210, 20);
    ground(b, 'meadow', -150, -170, 22);
    fields(b, -150, -100, -150, 100, 34, 0.45);


    // boats drawn up on the beach
    for (let i = 0; i < 6; i++) b.prop('boat', 86 + b.rng.range(-3, 3), -60 + i * 24, b.rng.range(-0.4, 0.4) + Math.PI / 2, 1);
    b.avoid({ kind: 'poly', pts: crag });
    b.forest({ kind: 'rect', x: -200, z: 60, hx: 18, hz: 30 }, 30, { minSpacing: 6 });
    b.forest({ kind: 'rect', x: -244, z: 0, hx: 12, hz: 250 }, 90, { minSpacing: 6 });
    b.forest({ kind: 'rect', x: -80, z: -240, hx: 170, hz: 14 }, 70, { minSpacing: 6 });
    b.forest({ kind: 'rect', x: -80, z: 244, hx: 170, hz: 12 }, 60, { minSpacing: 6 });
    woodlandRing(b, { kind: 'rect', x: -70, z: 5, hx: 165, hz: 230 }, 255, 20);

    b.bounds(-232, 80, -228, 234);
    b.cinematic(-110, 18, 30, 0, 30, 10);
    b.cinematic(70, 14, -40, 0, 34, -20);
    b.cinematic(60, 20, 160, 10, 30, 90);
    b.cinematic(-60, 40, -110, 0, 30, -20);
  },
};
