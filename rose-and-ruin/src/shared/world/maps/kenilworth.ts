import type { MapDef } from '../mapgen';
import { village, fields, woodlandRing, ground } from './common';

// Kenilworth: the red sandstone fortress of the Duchy of Lancaster, ringed on two sides by the
// Great Mere. The tiltyard causeway runs over the water to Mortimer's Tower; inside stand
// the massive Norman keep and John of Gaunt's great hall.
export const kenilworth: MapDef = {
  id: 'kenilworth',
  name: 'Kenilworth Castle',
  location: 'Warwickshire, the Midlands',
  year: 'Autumn, 1459',
  blurb: 'A red fortress on its mere. Force the tiltyard causeway to Mortimer\'s Tower, or come down from the north, and storm the great keep.',
  history: 'Kenilworth passed to John of Gaunt in 1361 and became one of the great houses of the Duchy of Lancaster. Margaret of Anjou held court here, and Henry VI kept it as a refuge as the realm slid into war.',
  atmosphere: {
    sky: 'sunset', sunAzimuth: 250, sunElevation: 14, sunIntensity: 4.6, envIntensity: 0.72, exposure: 1.0,
    fogColor: [0.86, 0.7, 0.58], fogDensity: 0.0016, fogHeight: 22, haze: 0.5, wind: 0.3,
    grassTint: [1.04, 0.98, 0.84], ambientSound: 'meadow', dust: 0.2,
  },
  card: { sky: ['#f2a46a', '#5f6f92'], ground: '#5a5a2e', silhouette: '#3a2420' },
  build(b) {
    const n = b.noise;
    const C = 12;
    b.base((x, z) => 10 + 2.0 * n.fbm(x / 140, z / 140, 4) + 0.3 * n.fbm(x / 8, z / 8, 2));
    // the Great Mere to the south and west
    b.carve({ kind: 'poly', pts: [[-260, -40], [-80, -40], [-74, 64], [20, 72], [24, 260], [-260, 260]] }, 3, 14);
    b.water(7.6, -260, 30, -40, 260, 'moat');
    // the rise the castle stands on
    b.plateau({ kind: 'rect', x: 0, z: 0, hx: 66, hz: 60 }, C, 10, 0.6);
    b.flatten({ kind: 'rect', x: 0, z: 0, hx: 62, hz: 56 }, C, 3);
    // the tiltyard: a dam carrying the road over the mere to Mortimer's Tower
    b.plateau({ kind: 'line', pts: [[42, 60], [42, 200]], w: 14 }, C - 0.4, 6, 0.3);
    b.flatten({ kind: 'line', pts: [[42, 62], [42, 196]], w: 11 }, C - 0.3, 3);
    b.flatten({ kind: 'rect', x: 50, z: 214, hx: 40, hz: 22 }, C - 0.6, 14);

    // ---- outer curtain
    const OW = C + 8, OT = C + 11;
    b.wall(-60, -54, -8, -56, OW, { style: 'red' }); b.wall(8, -56, 60, -54, OW, { style: 'red' });
    b.wall(60, -54, 62, 54, OW, { style: 'red', brokenB: true });
    b.wall(62, 54, 50, 56, OW, { style: 'red' }); b.wall(34, 56, -60, 54, OW, { style: 'red' });
    b.wall(-60, 54, -62, -54, OW, { style: 'red' });
    for (const [x, z] of [[-60, -54], [60, -54], [-62, 54], [62, 30], [-61, 0]] as const) b.tower(x, z, { r: 4.4, top: OT, shape: 'square', roof: 'flat', style: 'red' });
    b.rubble(62, 44, 5.5, 2.2, 'red');
    // Leicester's gatehouse to the north and Mortimer's Tower over the tiltyard
    b.gatehouse(0, -56, 0, { w: 16, d: 10, top: C + 16, passW: 4.2, passH: 4.8, towers: 'square', towerR: 3, style: 'red', floor: C });
    b.gatehouse(42, 56, Math.PI, { w: 16, d: 8, top: C + 13, passW: 4.2, passH: 4.6, towers: 'round', towerR: 3.2, style: 'red', floor: C });
    // ---- inner court: the great keep (Caesar's Tower), Gaunt's great hall, the Strong Tower
    b.keep(18, -18, 0, 24, 22, C + 26, 'square', 'red');
    b.building(-20, 2, Math.PI / 2, 30, 12, { style: 'stone', roof: 'lead', floors: 2, flatten: false });
    b.tower(-22, -18, { r: 5, top: C + 20, shape: 'square', roof: 'flat', style: 'red', turret: true });
    b.wall(-34, -30, 34, -32, C + 10, { style: 'red' });
    b.wall(34, -32, 34, -6, C + 10, { style: 'red' }); b.wall(34, 6, 36, 28, C + 10, { style: 'red' });
    b.wall(36, 28, -34, 30, C + 10, { style: 'red' }); b.wall(-34, 30, -34, -30, C + 10, { style: 'red' });
    b.paint({ kind: 'rect', x: 4, z: 6, hx: 24, hz: 18 }, 1, 0.8, 2, 0.5);
    b.prop('well', 6, 10, 0, 1);
    b.prop('brazier', 32, -3, 0, 1); b.prop('brazier', 32, 3, 0, 1);
    b.prop('banner', 2, 0, 0, 1.4, { team: 0 });
    // the outer ward: stables and tents of the household
    b.building(-46, -36, 0, 18, 7, { style: 'timber', roof: 'tile', flatten: false });
    b.building(-46, 40, 0, 18, 7, { style: 'timber', roof: 'tile', flatten: false });
    b.prop('cart', 48, -30, 0.6, 1); b.prop('hay', 50, -34, 0.3, 1); b.prop('hay', 46, -36, 1.2, 1);
    b.prop('rack', 48, 10, Math.PI / 2, 1); b.prop('rack', 48, 16, Math.PI / 2, 1);

    // ---- the besiegers: north road and the far end of the tiltyard
    village(b, 0, -150, 14, 30);
    b.camp(50, 214, Math.PI, 1, 2, 4);
    b.camp(60, -120, 0, 1, 2, 3);
    b.prop('trebuchet', 90, -100, 0.4, 1);
    b.prop('cannon', 30, 160, Math.PI, 1.1);
    for (const x of [-20, -8, 8, 20]) b.prop('mantlet', x, -70, Math.PI, 1);
    b.path([[0, -56], [0, -110], [0, -200]], 5);
    b.path([[42, 60], [42, 200], [80, 230]], 5);

    b.spawn(0, 4, 8, Math.PI, 18, 10, 'The inner court');
    b.spawn(0, -46, 0, 0, 14, 10, 'The outer ward');
    b.spawn(1, 50, 214, Math.PI, 30, 10, 'The tiltyard');
    b.spawn(1, 0, -132, 0, 30, 10, 'The north road');

    b.objective('Mortimer\'s Tower', 'A', 42, 66, 8);
    b.objective('Leicester\'s Gate', 'B', 0, -64, 8);
    b.objective('The Great Keep', 'C', 6, -4, 10, 0);
    b.front([42, 66], [0, -64], [6, -4], [42, 130], [50, -40]);

    b.avoid({ kind: 'rect', x: 0, z: 0, hx: 70, hz: 64 });
    ground(b, 'meadow', 120, -60, 26);
    ground(b, 'hillfort', 130, 120, 20);
    ground(b, 'chapel', -110, -110, 18);
    ground(b, 'crossroads', 100, -160, 18);
    fields(b, 80, 170, -40, 80, 34, 0.5);
    b.forest({ kind: 'rect', x: 180, z: 0, hx: 14, hz: 240 }, 70, { minSpacing: 6 });
    b.forest({ kind: 'rect', x: 0, z: -236, hx: 200, hz: 14 }, 70, { minSpacing: 6 });
    woodlandRing(b, { kind: 'rect', x: 20, z: 10, hx: 170, hz: 230 }, 255, 20);

    b.spawn(1, 120, -60, -2.03, 12, 8, 'The east meadow', true);
    b.spawn(1, 130, 120, -0.83, 12, 8, 'The hill fort', true);
    b.spawn(0, -110, -110, -2.36, 12, 8, 'The ruined chapel', true);
    b.bounds(-140, 190, -210, 236);
    b.cinematic(-90, 20, 90, 0, 22, 0);
    b.cinematic(90, 26, 120, 40, 18, 60);
    b.cinematic(60, 40, -100, 0, 24, -20);
    b.cinematic(-40, 16, -60, 10, 24, 0);
  },
};
