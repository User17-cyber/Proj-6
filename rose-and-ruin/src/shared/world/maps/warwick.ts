import type { MapDef } from '../mapgen';
import { village, fields, woodlandRing } from './common';

// Warwick: the Kingmaker's seat above the Avon, with Caesar's and Guy's towers flanking
// the gatehouse and barbican, and the old Saxon mound in the west of the courtyard.
export const warwick: MapDef = {
  id: 'warwick',
  name: 'Warwick Castle',
  location: 'Warwickshire, the Midlands',
  year: 'Midsummer, 1469',
  blurb: 'The Kingmaker\'s fortress above the Avon. Storm the barbican and take the ancient mound.',
  history: 'In 1469 Richard Neville, Earl of Warwick ("the Kingmaker"), turned on Edward IV and held the captive king here. Within a year he had changed sides to Lancaster altogether.',
  atmosphere: {
    sky: 'noon', sunAzimuth: 140, sunElevation: 52, sunIntensity: 3.4, envIntensity: 1.0, exposure: 0.9,
    fogColor: [0.72, 0.78, 0.86], fogDensity: 0.0021, fogHeight: 35, haze: 0.3, wind: 0.4,
    grassTint: [1.0, 1.04, 0.92], ambientSound: 'meadow', dust: 0.15,
  },
  card: { sky: ['#9cc0e3', '#e8f0f6'], ground: '#55692f', silhouette: '#2e2b25' },
  build(b) {
    const n = b.noise;
    const C = 20;
    b.base((x, z) => 17.5 + 2.2 * n.fbm(x / 150, z / 150, 4) + 0.3 * n.fbm(x / 8, z / 8, 2) + Math.max(0, -z - 60) * 0.02);
    // the castle sits on a sandstone bluff above the Avon
    b.plateau({ kind: 'poly', pts: [[-96, -48], [70, -62], [80, 40], [-80, 48]] }, C, 8, 0.5);
    b.flatten({ kind: 'poly', pts: [[-88, -42], [64, -54], [70, 34], [-72, 42]] }, C, 4);
    b.carve({ kind: 'rect', x: 0, z: 120, hx: 300, hz: 64 }, 4, 9);
    b.water(9, -300, 300, 60, 300, 'river');
    // dry moat in front of the barbican
    b.carve({ kind: 'rect', x: 90, z: -10, hx: 5, hz: 46 }, 15.5, 3);
    b.flatten({ kind: 'rect', x: 130, z: -10, hx: 38, hz: 50 }, 19, 14);

    // ---- curtain wall and towers
    const WT = C + 11, TT = C + 15;
    b.wall(55, 30, 57.76, -0.03, WT);
    b.gatehouse(58.5, -8, -1.663, { w: 16, d: 12, top: C + 16, passW: 4.4, passH: 5, towers: 'square', towerR: 3, floor: C });
    b.wall(59.24, -15.97, 62, -46, WT);
    b.wall(62, -46, 40.5, -49.7, WT, { brokenB: true });
    b.wall(31.5, -51.3, 10, -55, WT, { brokenA: true });
    b.wall(10, -55, -20, -56, WT);
    b.wall(-20, -56, -72, -38, WT);
    b.wall(-72, -38, -88, 12, WT);
    b.wall(-88, 12, -62, 40, WT);
    b.wall(-62, 40, 10, 42, WT);
    b.wall(10, 42, 55, 30, WT);
    b.tower(55, 30, { r: 7.5, top: C + 40, shape: 'poly', sides: 12, roof: 'flat', turret: true }); // Caesar's Tower
    b.tower(62, -46, { r: 6.5, top: C + 36, shape: 'poly', sides: 12, roof: 'flat', turret: true }); // Guy's Tower
    for (const [x, z] of [[10, -55], [-20, -56], [-72, -38], [-88, 12], [-62, 40], [10, 42]] as const) b.tower(x, z, { r: 4.6, top: TT, shape: 'round', roof: 'cone' });
    b.rubble(36, -51, 6.5, 2.4);
    // barbican
    b.wall(64.6, -2.2, 80.6, -0.8, C + 8, { thick: 1.8 });
    b.wall(65.6, -14.2, 81.6, -12.8, C + 8, { thick: 1.8 });
    b.gatehouse(84, -6.8, -1.663, { w: 14, d: 5, top: C + 11, passW: 4.2, passH: 4.6, towers: 'round', towerR: 2.6, floor: C });
    b.bridge(86.8, -6.6, 96, -6.0, 5.5, C, { style: 'wood' });
    b.flatten({ kind: 'rect', x: 100, z: -6, hx: 4, hz: 6 }, C, 6);
    b.paint({ kind: 'line', pts: [[50, -8], [100, -6], [150, -8]], w: 6 }, 1, 0.8, 2, 0.4);

    // the mound
    b.mound(-58, 8, 7, 30, C + 14);
    b.paint({ kind: 'circle', x: -58, z: 8, r: 6 }, 0, 0.7, 2, 0.7);
    b.prop('banner', -58, 8, 0, 1.5, { team: 0 });

    // ---- domestic range along the river front
    b.building(2, 35, 0.03, 36, 10, { style: 'stone', roof: 'lead', floors: 2, flatten: false });
    b.building(-34, 35, -0.02, 14, 9, { style: 'stone', roof: 'slate', wallH: 8, flatten: false });
    b.building(34, 30, -0.26, 16, 9, { style: 'stone', roof: 'lead', floors: 2, flatten: false });
    b.paint({ kind: 'line', pts: [[54, -8], [20, -10], [-20, -8], [-45, 4]], w: 5 }, 1, 0.75, 2, 0.5);
    b.prop('well', 12, 4, 0, 1);
    b.prop('cart', -10, -30, 0.5, 1); b.prop('hay', -14, -32, 0.1, 1); b.prop('hay', -13, -33.4, 1.4, 1);
    b.prop('stall', 26, 12, 0.2, 1); b.prop('stall', 30, 4, -0.3, 1);
    for (const [x, z] of [[46, -2], [46, -14], [-30, 20], [20, -40], [0, 20]] as const) b.prop('brazier', x, z, 0, 1);
    b.prop('barrel', 40, 18, 0, 1); b.prop('barrel', 40.8, 19, 0, 1); b.prop('crate', 39.4, 20, 0.2, 1);

    b.spawn(0, -28, -14, -Math.PI / 2, 22, 10);
    b.spawn(1, 142, -8, Math.PI / 2, 30, 12);
    b.spawn(1, 30, -128, Math.PI, 30, 10);

    b.objective('The Barbican', 'A', 74, -7.5, 8);
    b.objective('The Great Lawn', 'B', 5, -6, 11);
    b.objective('Ethelfleda\'s Mound', 'C', -58, 8, 8, 0);
    b.front([74, -7], [36, -48], [5, -6], [-58, 8], [110, -6]);

    // ---- outside: York's siege camp and the town
    b.camp(140, 30, Math.PI / 2, 1, 2, 4);
    b.prop('cannon', 108, -14, Math.PI / 2 + 0.1, 1); b.prop('cannon', 108, 2, Math.PI / 2 - 0.1, 1);
    for (const z of [-24, -14, 2, 12]) b.prop('mantlet', 104, z, Math.PI / 2, 1);
    b.prop('trebuchet', 128, -52, Math.PI / 2 + 0.3, 1);
    village(b, 120, -112, 14, 32);
    fields(b, -90, 80, -150, -75, 36, 0.5);
    b.forest({ kind: 'rect', x: -170, z: -40, hx: 50, hz: 120 }, 140, { minSpacing: 6 });
    b.forest({ kind: 'rect', x: 0, z: -210, hx: 240, hz: 40 }, 160, { minSpacing: 6 });
    woodlandRing(b, { kind: 'rect', x: 40, z: -50, hx: 140, hz: 110 }, 240, 40);


    b.bounds(-100, 176, -152, 50);
    b.cinematic(130, 30, 30, 40, 28, -10);
    b.cinematic(-20, 30, -110, 20, 24, -20);
    b.cinematic(-60, 40, 30, 20, 24, -10);
    b.cinematic(90, 18, -60, 50, 26, -10);
  },
};
