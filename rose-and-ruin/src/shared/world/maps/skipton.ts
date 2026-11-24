import type { MapDef } from '../mapgen';
import { village, fields, woodlandRing, ground, toward } from './common';

// Skipton: the Cliffords' castle at the head of the town, its back to a cliff over the Eller
// Beck. Six great drum towers ring the inner ward; the outer gatehouse with its four round towers
// faces the High Street.
export const skipton: MapDef = {
  id: 'skipton',
  name: 'Skipton Castle',
  location: 'Craven, Yorkshire',
  year: 'Winter, 1461',
  blurb: 'The Cliffords\' stronghold above the beck. Break the four-towered gatehouse from the town, cross the outer ward, and take the ring of drum towers.',
  history: 'Skipton was the seat of the Cliffords, Lancastrians to the last. John, Lord Clifford, "the Butcher" of Wakefield, fell the day before Towton in 1461; his castle held out for three years before the Yorkists took it, and the Cliffords did not have it back until Henry Tudor won the crown.',
  atmosphere: {
    sky: 'overcast', sunAzimuth: 190, sunElevation: 16, sunIntensity: 3.0, envIntensity: 0.86, exposure: 1.06,
    fogColor: [0.74, 0.76, 0.8], fogDensity: 0.0026, fogHeight: 22, haze: 0.7, wind: 0.7,
    grassTint: [0.88, 0.94, 0.86], ambientSound: 'wind', dust: 0.05,
  },
  card: { sky: ['#828c96', '#c5ccd2'], ground: '#4a5838', silhouette: '#292725' },
  build(b) {
    const n = b.noise;
    const C = 20;
    b.base((x, z) => 15 + 2 * n.fbm(x / 140, z / 140, 4) + 0.3 * n.fbm(x / 8, z / 8, 2));
    // the cliff over the beck to the north
    b.carve({ kind: 'line', pts: [[-270, -70], [-60, -62], [60, -66], [270, -74]], w: 20 }, 6, 6);
    b.water(9, -270, 270, -270, 270, 'river');
    b.plateau({ kind: 'rect', x: 0, z: 0, hx: 70, hz: 52 }, C, 8, 0.5);
    b.flatten({ kind: 'rect', x: 0, z: 0, hx: 66, hz: 48 }, C, 3);

    // ---- the inner ward: a ring of six drum towers on the cliff edge
    const ring: [number, number][] = [[-30, -40], [0, -44], [30, -40], [36, -18], [-36, -18], [-36, -40]];
    b.wall(-30, -40, 0, -44, C + 12); b.wall(0, -44, 30, -40, C + 12); b.wall(30, -40, 36, -18, C + 12);
    b.wall(36, -18, 8, -12, C + 12); b.wall(-8, -12, -36, -18, C + 12); b.wall(-36, -18, -36, -40, C + 12); b.wall(-36, -40, -30, -40, C + 12);
    ring.forEach(([x, z]) => b.tower(x, z, { r: 5.4, top: C + 20, shape: 'round', roof: 'flat' }));
    b.gatehouse(0, -14, 0.1, { w: 16, d: 8, top: C + 18, passW: 4, passH: 4.8, towers: 'round', towerR: 3.4, floor: C });
    b.building(0, -30, 0, 30, 9, { style: 'stone', roof: 'lead', floors: 2, flatten: false });
    b.prop('banner', 14, -22, 0, 1.4, { team: 0 });
    // ---- the outer ward and its four-towered gatehouse toward the town
    const WT = C + 9;
    b.wall(-36, -18, -64, -10, WT); b.wall(-64, -10, -60, 44, WT); b.wall(-60, 44, -10, 46, WT);
    b.wall(10, 46, 60, 44, WT); b.wall(60, 44, 64, -10, WT, { brokenB: true }); b.wall(64, -10, 36, -18, WT);
    b.rubble(63, 10, 5, 2.2);
    b.gatehouse(0, 46, 0, { w: 20, d: 12, top: C + 17, passW: 4.4, passH: 5, towers: 'round', towerR: 4, floor: C });
    for (const [x, z] of [[-64, -10], [-60, 44], [60, 44], [64, -10]] as const) b.tower(x, z, { r: 4, top: C + 14, shape: 'round', roof: 'flat' });
    b.building(-40, 24, 0.1, 22, 8, { style: 'timber', roof: 'tile', flatten: false });
    b.building(40, 20, -0.1, 18, 7, { style: 'stone', roof: 'slate', flatten: false });
    b.prop('cart', 20, 30, 0.6, 1); b.prop('hay', 24, 33, 0.2, 1); b.prop('well', -16, 10, 0, 1);
    b.prop('brazier', 6, 36, 0, 1); b.prop('brazier', -6, 36, 0, 1);

    // ---- the town down the High Street
    village(b, 0, 130, 16, 34);
    b.camp(150, 110, Math.PI / 2, 1, 2, 4);
    b.camp(-150, 80, -Math.PI / 2, 1, 2, 3);
    b.prop('cannon', 20, 90, Math.PI, 1.1); b.prop('cannon', 100, 20, Math.PI / 2, 1.1);
    for (const x of [-12, 0, 12]) b.prop('mantlet', x, 64, 0, 1);
    b.path([[0, 46], [0, 130], [150, 110]], 5);
    b.path([[0, 100], [-150, 80]], 4);

    b.spawn(0, 22, -24, toward(22, -24, 150, 110), 8, 6, 'The inner ward');
    b.spawn(0, 0, 18, toward(0, 18, 150, 110), 26, 12, 'The outer ward');
    b.spawn(1, 150, 110, toward(150, 110, 0, 46), 28, 12, 'The High Street camp');
    b.spawn(1, -150, 80, toward(-150, 80, -60, 30), 24, 12, 'The western road');

    b.objective('The Outer Gatehouse', 'A', 0, 58, 8);
    b.objective('The East Breach', 'B', 54, 10, 8);
    b.objective('The Drum Towers', 'C', 0, -6, 7, 0);
    b.front([0, 58], [54, 10], [0, -6], [-80, 20], [80, 70]);

    b.avoid({ kind: 'rect', x: 0, z: 0, hx: 76, hz: 58 });
    ground(b, 'meadow', 150, -26, 22);
    ground(b, 'hillfort', -150, -24, 18);
    ground(b, 'chapel', 170, 60, 18);
    ground(b, 'crossroads', -160, 170, 16);
    fields(b, 60, 220, 140, 220, 34, 0.5);
    b.forest({ kind: 'rect', x: 0, z: -170, hx: 220, hz: 45 }, 120, { minSpacing: 6 });
    woodlandRing(b, { kind: 'rect', x: 0, z: 0, hx: 210, hz: 210 }, 255, 16);

    b.spawn(1, 150, -26, toward(150, -26, 0, 0), 12, 8, 'The east meadow', true);
    b.spawn(0, -150, -24, toward(-150, -24, 0, 0), 12, 8, 'The hill fort', true);
    b.spawn(1, 156, 54, toward(156, 54, 0, 0), 12, 8, 'The chapel', true);
    b.bounds(-215, 215, -215, 215);
    b.cinematic(90, 42, 110, 0, 26, 0);
    b.cinematic(-90, 40, -90, 0, 30, -20);
    b.cinematic(30, 30, 90, 0, 32, 30);
    b.cinematic(90, 34, -40, 0, 34, -24);
  },
};
