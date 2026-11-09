import type { MapDef } from '../mapgen';
import { village, fields, woodlandRing, ground } from './common';

// Conwy: Edward I's long fortress on a ridge of rock where the River Conwy meets the sea.
// Eight great round towers in a line, two wards split by a cross wall, a barbican at either
// end, and the walled town climbing away to the west.
export const conwy: MapDef = {
  id: 'conwy',
  name: 'Conwy Castle',
  location: 'Caernarfonshire, North Wales',
  year: 'Spring, 1461',
  blurb: 'Eight towers on a rock above the estuary. Break the west barbican, cross the ward, and take the king\'s apartments.',
  history: 'Built for Edward I between 1283 and 1287, Conwy was held for the crown through the wars in Wales. In the 1460s, as Lancastrian rebels held out in Harlech, it was a Yorkist stronghold on the coast road into Snowdonia.',
  atmosphere: {
    sky: 'overcast', sunAzimuth: 210, sunElevation: 34, sunIntensity: 3.6, envIntensity: 0.85, exposure: 1.05,
    fogColor: [0.7, 0.74, 0.78], fogDensity: 0.0022, fogHeight: 30, haze: 0.6, wind: 0.6,
    grassTint: [0.94, 1.02, 0.92], ambientSound: 'coast', dust: 0.1,
  },
  card: { sky: ['#8f9aa6', '#cfd6dc'], ground: '#4f5f3a', silhouette: '#2b2a29' },
  build(b) {
    const n = b.noise;
    const TOP = 18;
    b.base((x, z) => 6 + 2.6 * n.fbm(x / 130, z / 130, 4) + 0.3 * n.fbm(x / 8, z / 8, 2) - Math.max(0, x - 70) * 0.09 - Math.max(0, z - 50) * 0.06 + Math.max(0, -x - 60) * 0.03);
    // the estuary to the east and the river to the south
    b.carve({ kind: 'rect', x: 210, z: 0, hx: 110, hz: 300 }, -2, 30);
    b.carve({ kind: 'rect', x: 0, z: 210, hx: 300, hz: 110 }, -2, 30);
    b.water(1.2, 118, 320, -320, 320, 'sea');
    b.water(1.2, -320, 320, 112, 320, 'river');
    // the rock: long and narrow, steep to the water
    b.plateau({ kind: 'poly', pts: [[-78, -30], [72, -32], [88, -16], [88, 18], [70, 32], [-78, 30], [-90, 0]] }, TOP, 9, 3);
    b.flatten({ kind: 'rect', x: 0, z: 0, hx: 66, hz: 21 }, TOP, 3);
    // the town rises to the west; an earth ramp climbs to the west barbican
    b.earthRamp(-80, 0, -130, 0, 12, TOP, 9);
    b.flatten({ kind: 'rect', x: -150, z: 0, hx: 26, hz: 40 }, 9, 14);

    // ---- curtain, eight drum towers, cross wall
    const WT = TOP + 11, TT = TOP + 19;
    const towers: [number, number][] = [[-56, -20], [-20, -22], [16, -22], [52, -20], [52, 20], [16, 22], [-20, 22], [-56, 20]];
    b.wall(-56, -20, -20, -22, WT); b.wall(-20, -22, 16, -22, WT); b.wall(16, -22, 52, -20, WT);
    b.wall(52, -20, 62, -8, WT); b.wall(62, 8, 52, 20, WT);
    b.wall(52, 20, 16, 22, WT); b.wall(16, 22, -20, 22, WT, { brokenB: true }); b.wall(-28, 22, -56, 20, WT, { brokenA: true });
    b.wall(-56, 20, -64, 7, WT); b.wall(-64, -7, -56, -20, WT);
    towers.forEach(([x, z], i) => b.tower(x, z, { r: 6.4, top: TT, shape: 'round', roof: 'flat', turret: i === 3 || i === 4 || i === 2 || i === 5 }));
    b.rubble(-24, 23, 6, 2.4);
    // west gate and barbican; east water gate
    b.gatehouse(-66, 0, Math.PI / 2, { w: 14, d: 8, top: TOP + 14, passW: 4.2, passH: 4.8, towers: 'none', floor: TOP });
    b.wall(-70, -7, -80, -7, TOP + 6, { thick: 1.6 }); b.wall(-70, 7, -80, 7, TOP + 6, { thick: 1.6 });
    b.gatehouse(-82, 0, Math.PI / 2, { w: 14, d: 4, top: TOP + 8, passW: 4.2, passH: 4.4, towers: 'round', towerR: 2.4, floor: TOP });
    b.gatehouse(64, 0, -Math.PI / 2, { w: 14, d: 6, top: TOP + 12, passW: 3.4, passH: 4.2, towers: 'none', floor: TOP });
    // the cross wall between the outer and inner wards, with its gate
    b.wall(20, -21, 20, -4, TOP + 9); b.wall(20, 4, 20, 21, TOP + 9);
    b.prop('torch', 18, -3.5, 0, 1); b.prop('torch', 18, 3.5, 0, 1);

    // outer ward: the great hall along the south curtain, the kitchen on the north
    b.building(-18, 13, 0, 46, 9, { style: 'stone', roof: 'lead', floors: 2, flatten: false });
    b.building(-30, -14, 0, 18, 8, { style: 'stone', roof: 'slate', flatten: false });
    b.paint({ kind: 'rect', x: -20, z: 0, hx: 34, hz: 7 }, 1, 0.75, 2, 0.5);
    b.prop('well', -4, -4, 0, 1);
    b.prop('cart', -40, 2, 0.4, 1); b.prop('hay', -44, 5, 0.2, 1);
    b.prop('barrel', 6, -14, 0, 1); b.prop('barrel', 6.8, -14.8, 0, 1); b.prop('crate', 5, -13, 0.3, 1);
    b.prop('brazier', -50, -4, 0, 1); b.prop('brazier', -50, 4, 0, 1);
    // inner ward: the king's apartments and chapel
    b.building(36, 13, 0, 24, 8, { style: 'stone', roof: 'lead', floors: 2, flatten: false });
    b.building(36, -13, 0, 24, 8, { style: 'stone', roof: 'lead', floors: 2, flatten: false });
    b.paint({ kind: 'rect', x: 36, z: 0, hx: 12, hz: 5 }, 1, 0.85, 2, 0.4);
    b.prop('banner', 40, 0, 0, 1.4, { team: 0 });

    // ---- the walled town (Lancaster's approach) and the shore
    village(b, -150, -60, 12, 26);
    village(b, -160, 60, 10, 22, false);
    b.wall(-110, -30, -110, -110, 15, { thick: 1.8, style: 'rubble' });
    b.wall(-110, 30, -110, 100, 13, { thick: 1.8, style: 'rubble' });
    for (const z of [-60, -95, 60, 92] as const) b.tower(-110, z, { r: 3.4, top: z < 0 ? 18 : 16, shape: 'round', roof: 'none', style: 'rubble' });
    b.camp(-180, 0, -Math.PI / 2, 1, 2, 4);
    b.prop('cannon', -120, -14, -Math.PI / 2, 1.1); b.prop('cannon', -122, 14, -Math.PI / 2, 1.1);
    for (const z of [-20, -8, 8, 20]) b.prop('mantlet', -104, z, -Math.PI / 2, 1);
    for (let i = 0; i < 5; i++) b.prop('boat', 112 + b.rng.range(-2, 2), -60 + i * 22, Math.PI / 2 + b.rng.range(-0.3, 0.3), 1);
    b.path([[-130, 0], [-200, 0]], 5);
    b.path([[-150, -60], [-150, -140]], 4);

    b.spawn(0, 36, 0, -Math.PI / 2, 14, 8, 'The inner ward');
    b.spawn(0, -24, 0, -Math.PI / 2, 22, 8, 'The outer ward');
    b.spawn(1, -180, -20, -Math.PI / 2, 30, 12, 'The town camp');
    b.spawn(1, -150, 90, -2.2, 24, 10, 'The river gate');

    b.objective('The West Barbican', 'A', -76, 0, 8);
    b.objective('The Great Hall', 'B', -18, 0, 10);
    b.objective('The King\'s Apartments', 'C', 36, 0, 9, 0);
    b.front([-76, 0], [-18, 0], [36, 0], [-110, -10], [-24, 30]);

    b.avoid({ kind: 'rect', x: 0, z: 0, hx: 92, hz: 36 });
    ground(b, 'meadow', -140, -150, 24);
    ground(b, 'hillfort', -60, -165, 20);
    ground(b, 'chapel', 20, -110, 18);
    ground(b, 'crossroads', -60, -90, 18);
    fields(b, -210, -130, -150, 140, 34, 0.5);
    b.forest({ kind: 'rect', x: 40, z: -160, hx: 60, hz: 22 }, 60, { minSpacing: 6 });
    b.forest({ kind: 'rect', x: -236, z: 0, hx: 14, hz: 240 }, 80, { minSpacing: 6 });
    b.forest({ kind: 'rect', x: -60, z: -236, hx: 180, hz: 14 }, 70, { minSpacing: 6 });
    woodlandRing(b, { kind: 'rect', x: -60, z: -20, hx: 180, hz: 170 }, 255, 20);

    b.spawn(0, 20, -110, 0.18, 12, 8, 'The chapel', true);
    b.spawn(1, -140, -150, -0.75, 12, 8, 'The north meadow', true);
    b.spawn(1, -60, -165, -0.35, 12, 8, 'The hill fort', true);
    b.bounds(-228, 116, -200, 110);
    b.cinematic(100, 24, -70, 0, 28, 0);
    b.cinematic(-140, 22, 50, -40, 26, 0);
    b.cinematic(30, 50, 60, -10, 24, 0);
    b.cinematic(-60, 14, -60, 0, 26, -10);
  },
};
