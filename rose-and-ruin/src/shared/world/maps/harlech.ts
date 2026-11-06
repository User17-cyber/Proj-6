import type { MapDef } from '../mapgen';
import { village, fields, woodlandRing, boulders } from './common';

// Harlech: Edward I's concentric fortress on a crag above the marshes of Cardigan Bay.
// The Yorkists storm up the east road and through a breach in the outer curtain.
export const harlech: MapDef = {
  id: 'harlech',
  name: 'Harlech Castle',
  location: 'Gwynedd, Wales',
  year: 'Summer, 1468',
  blurb: 'A concentric fortress on a wind-scoured crag. Seven years under siege; tonight it falls or holds.',
  history: 'Harlech held out for Lancaster from 1461 to 1468, the longest siege in British history and the inspiration for "Men of Harlech". It finally yielded to William Herbert, Earl of Pembroke.',
  atmosphere: {
    sky: 'overcast', sunAzimuth: 210, sunIntensity: 2.2, envIntensity: 1.15, exposure: 1.0,
    fogColor: [0.62, 0.66, 0.7], fogDensity: 0.0038, fogHeight: 45, haze: 0.5, wind: 0.85,
    grassTint: [0.92, 1.0, 0.9], ambientSound: 'wind', dust: 0.1,
  },
  card: { sky: ['#8b98a6', '#d7dde2'], ground: '#46523a', silhouette: '#26282b' },
  build(b) {
    const n = b.noise;
    const TOP = 30;
    // lowland: marsh to the west, rising town ground to the east
    b.base((x, z) => 6 + 2.2 * n.fbm(x / 120, z / 120, 4) + 0.3 * n.fbm(x / 8, z / 8, 2) + Math.max(0, x - 40) * 0.075 + Math.max(0, -x - 120) * -0.04);
    // the crag: cliffs to the north and west, steep south face, gentle east
    b.plateau({ kind: 'poly', pts: [[-52, -46], [34, -50], [56, -36], [60, 40], [30, 50], [-46, 47], [-58, 8]] }, TOP, 7, 3.2);
    b.plateau({ kind: 'poly', pts: [[-30, 40], [40, 42], [44, 80], [-20, 78]] }, TOP - 6, 28, 1.5);
    b.flatten({ kind: 'rect', x: 0, z: 0, hx: 40, hz: 36 }, TOP, 3);
    b.earthRamp(40, 0, 118, 0, 11, TOP, 14.5);
    b.earthRamp(7, 36, 10, 92, 12, TOP, 15);
    b.flatten({ kind: 'rect', x: 140, z: 0, hx: 30, hz: 40 }, 14.5, 12);
    b.paint({ kind: 'line', pts: [[40, 0], [118, 0], [160, 2]], w: 6 }, 0, 0.9, 2, 0.6);

    // ---- inner ward
    const IW = TOP + 13, IT = TOP + 21;
    b.gatehouse(22, 0, -Math.PI / 2, { w: 22, d: 16, top: TOP + 20, passW: 4, passH: 5, towers: 'round', towerR: 6, floor: TOP });
    b.wall(-24, -21, 24, -21, IW, { thick: 3.4 });
    b.wall(24, -21, 24, -11, IW, { thick: 3.4 });
    b.wall(24, 11, 24, 21, IW, { thick: 3.4 });
    b.wall(24, 21, -24, 21, IW, { thick: 3.4 });
    b.wall(-24, 21, -24, -21, IW, { thick: 3.4 });
    for (const [x, z] of [[-24, -21], [24, -21], [24, 21], [-24, 21]] as const) b.tower(x, z, { r: 6.5, top: IT, shape: 'round', roof: 'flat', turret: true });
    b.building(-17, 0, Math.PI / 2, 22, 7, { style: 'stone', roof: 'slate', floors: 2, flatten: false });
    b.building(2, -16.5, 0, 14, 6, { style: 'stone', roof: 'slate', flatten: false });
    b.building(2, 16.5, 0, 14, 6, { style: 'stone', roof: 'slate', flatten: false });
    b.paint({ kind: 'rect', x: 0, z: 0, hx: 14, hz: 13 }, 1, 0.8, 2, 0.5);
    b.prop('well', -5, 6, 0, 1);
    b.prop('cart', 6, -6, 0.6, 1);
    b.prop('brazier', 13, 4, 0, 1); b.prop('brazier', 13, -4, 0, 1);
    b.prop('barrel', -10, -10, 0, 1); b.prop('barrel', -9.2, -10.8, 0, 1); b.prop('crate', -10.5, -8.8, 0.4, 1);
    b.prop('banner', -8, 0, 0, 1.4, { team: 0 });

    // ---- outer curtain with its gate and a breach on the south
    const OW = TOP + 6, OT = TOP + 8.5;
    b.gatehouse(38, 0, -Math.PI / 2, { w: 12, d: 6, top: TOP + 9, passW: 3.8, passH: 4.5, towers: 'round', towerR: 2.6, floor: TOP });
    b.wall(-36, -33, 38, -33, OW, { thick: 1.8 });
    b.wall(38, -33, 38, -6, OW, { thick: 1.8 });
    b.wall(38, 6, 38, 33, OW, { thick: 1.8 });
    b.wall(38, 33, 12, 33, OW, { thick: 1.8, brokenB: true });
    b.wall(2, 33, -36, 33, OW, { thick: 1.8, brokenA: true });
    b.wall(-36, 33, -36, -33, OW, { thick: 1.8 });
    for (const [x, z] of [[-36, -33], [38, -33], [38, 33], [-36, 33]] as const) b.tower(x, z, { r: 3, top: OT, shape: 'round', roof: 'flat' });
    b.rubble(7, 34, 6, 2.4);
    b.paint({ kind: 'rect', x: 0, z: 0, hx: 38, hz: 33 }, 0, 0.35, 3, 0.9);

    // ---- York siege works on the east road
    village(b, 150, -45, 9, 18);
    b.camp(132, 32, Math.PI / 2, 1, 2, 4);
    b.prop('cannon', 96, 8, Math.PI / 2 + 0.1, 1); b.prop('cannon', 98, -9, Math.PI / 2 - 0.1, 1);
    for (const z of [-14, -5, 5, 14]) b.prop('mantlet', 86, z, Math.PI / 2, 1);
    b.prop('trebuchet', 112, -28, Math.PI / 2, 1);
    b.prop('ladder', 33, 36, 0.4, 1); b.prop('ladder', 18, 37, -0.3, 1);
    b.prop('stakes', 24, 60, 0.1, 1); b.prop('stakes', -6, 62, -0.2, 1);

    b.spawn(0, -3, 0, -Math.PI / 2, 16, 10);
    b.spawn(1, 138, 0, Math.PI / 2, 28, 12);
    b.spawn(1, 18, 108, 0, 30, 10);

    b.objective('The Outer Gate', 'A', 47, 0, 9);
    b.objective('South Breach', 'B', 7, 28, 8);
    b.objective('Inner Ward', 'C', 2, 0, 10, 0);
    b.front([47, 0], [7, 28], [2, 0], [82, 0], [10, 60]);

    // ---- landscape
    b.water(0.2, -300, -150, -300, 300, 'sea');
    b.carve({ kind: 'rect', x: -230, z: 0, hx: 80, hz: 300 }, -2, 30);
    b.paint({ kind: 'rect', x: -130, z: 0, hx: 40, hz: 260 }, 2, 1, 14, 0.8);
    b.avoid({ kind: 'rect', x: 0, z: 0, hx: 62, hz: 54 });
    boulders(b, { kind: 'rect', x: -10, z: 60, hx: 50, hz: 20 }, 14);
    fields(b, 70, 160, 60, 125, 32, 0.5);
    b.forest({ kind: 'rect', x: 120, z: -110, hx: 70, hz: 40 }, 90, { minSpacing: 6, kinds: [0, 2, 2] });
    b.forest({ kind: 'rect', x: 210, z: 40, hx: 40, hz: 200 }, 160, { minSpacing: 6, kinds: [0, 2] });
    woodlandRing(b, { kind: 'rect', x: 50, z: 30, hx: 120, hz: 110 }, 240, 50);

    b.bounds(-62, 168, -72, 132);
    b.cinematic(120, 30, -50, 20, 32, 0);
    b.cinematic(60, 22, 80, 10, 32, 10);
    b.cinematic(-20, 48, 0, 30, 30, 0);
    b.cinematic(150, 22, 20, 40, 30, 0);
  },
};
