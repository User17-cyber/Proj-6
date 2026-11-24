import type { MapDef } from '../mapgen';
import { village, fields, woodlandRing, ground, toward } from './common';

// Tattershall: Lord Cromwell's great brick tower in the Lincolnshire fens, a palace keep of six
// storeys rising from an inner ward ringed by a wet moat, with a dry outer moat and middle ward.
export const tattershall: MapDef = {
  id: 'tattershall',
  name: 'Tattershall Castle',
  location: 'Lincolnshire, the fens',
  year: 'Summer, 1469',
  blurb: 'A soaring tower of red brick within two moats. Cross the outer and inner moats and take the great tower.',
  history: 'Ralph, Lord Cromwell, Treasurer of England, raised the great brick tower at Tattershall in the 1440s, one of the wonders of its day. After his death it passed through Neville hands, and in the risings of 1469 and 1470 Lincolnshire was a battleground again.',
  atmosphere: {
    sky: 'dawn', sunAzimuth: 80, sunElevation: 10, sunIntensity: 3.8, envIntensity: 0.8, exposure: 1.05,
    fogColor: [0.86, 0.8, 0.74], fogDensity: 0.0028, fogHeight: 14, haze: 0.7, wind: 0.25,
    grassTint: [0.96, 1.02, 0.86], ambientSound: 'meadow', dust: 0.06,
  },
  card: { sky: ['#e7b48c', '#7f93a8'], ground: '#56602f', silhouette: '#4a281e' },
  build(b) {
    const n = b.noise;
    const C = 6.4;
    b.base((x, z) => 6 + 0.7 * n.fbm(x / 160, z / 160, 4) + 0.15 * n.fbm(x / 8, z / 8, 2));
    // the inner moat round the inner ward, and the outer moat round the middle ward
    b.carve({ kind: 'rect', x: 0, z: 0, hx: 40, hz: 36 }, 2.2, 2);
    b.plateau({ kind: 'rect', x: 0, z: 0, hx: 28, hz: 25 }, C, 1.5);
    b.water(4.6, -42, 42, -38, 38, 'moat');
    b.carve({ kind: 'line', pts: [[-80, -70], [80, -70], [80, 70], [-80, 70], [-80, -70]], w: 10 }, 3.5, 2);
    b.bridge(28, 0, 42, 0, 5, C, { style: 'wood' });
    b.bridge(0, 70 - 6, 0, 70 + 6, 5, 6.2, { style: 'wood' });
    b.flatten({ kind: 'rect', x: 46, z: 0, hx: 4, hz: 4 }, C, 4);

    const brick = { style: 'red' as const }, WT = C + 9;
    b.wall(-26, -23, 26, -23, WT, brick); b.wall(26, -23, 26, -7, WT, brick); b.wall(26, 7, 26, 23, WT, brick);
    b.wall(26, 23, -26, 23, WT, { ...brick, brokenA: true }); b.wall(-26, 23, -26, -23, WT, brick);
    b.rubble(20, 24, 4, 2, 'red');
    b.gatehouse(26, 0, Math.PI / 2, { w: 14, d: 7, top: C + 13, passW: 4, passH: 4.6, towers: 'square', towerR: 2.4, style: 'red', floor: C });
    for (const [x, z] of [[-26, -23], [26, -23], [-26, 23]] as const) b.tower(x, z, { r: 3.4, top: C + 13, shape: 'round', roof: 'cone', style: 'red' });
    // the great brick tower: a tall square keep with four corner turrets
    b.keep(-8, -4, 0, 20, 16, C + 34, 'mixed', 'red');
    b.building(10, 14, 0, 22, 8, { style: 'stone', roof: 'tile', floors: 2, flatten: false });
    b.prop('banner', 14, -8, 0, 1.4, { team: 1 });
    b.prop('well', 14, 2, 0, 1);
    // the middle ward: stables and the household's buildings
    b.building(-55, 40, 0, 20, 8, { style: 'timber', roof: 'thatch', flatten: false });
    b.building(55, -45, 0, 18, 7, { style: 'timber', roof: 'tile', flatten: false });
    b.prop('hay', -40, 50, 0.2, 1); b.prop('cart', 50, 40, 0.5, 1);

    village(b, 0, 150, 14, 30);
    b.camp(170, 10, Math.PI / 2, 0, 2, 4);
    b.camp(-40, 175, Math.PI, 0, 2, 3);
    b.prop('cannon', 110, -10, Math.PI / 2, 1.1); b.prop('cannon', 110, 14, Math.PI / 2, 1.1);
    b.path([[46, 0], [120, 0], [170, 10]], 5);
    b.path([[0, 76], [0, 150], [-40, 175]], 4);

    b.spawn(1, 10, 2, toward(10, 2, 170, 10), 12, 8, 'The inner ward');
    b.spawn(1, -50, 0, toward(-50, 0, -40, 175), 14, 24, 'The middle ward');
    b.spawn(0, 170, 10, toward(170, 10, 46, 0), 28, 12, 'The fen road');
    b.spawn(0, -40, 175, toward(-40, 175, 0, 76), 24, 12, 'The village camp');

    b.objective('The East Bridge', 'A', 52, 0, 8);
    b.objective('The South Bridge', 'B', 0, 82, 8);
    b.objective('The Great Tower', 'C', 10, -8, 8, 1);
    b.front([52, 0], [0, 82], [10, -8], [60, 60], [-60, -60]);

    b.avoid({ kind: 'rect', x: 0, z: 0, hx: 90, hz: 80 });
    ground(b, 'meadow', 140, -130, 24);
    ground(b, 'hillfort', -150, -120, 20);
    ground(b, 'chapel', 150, 140, 18);
    ground(b, 'crossroads', -160, 60, 16);
    fields(b, -220, 220, -230, -160, 34, 0.5);
    woodlandRing(b, { kind: 'rect', x: 0, z: 0, hx: 210, hz: 210 }, 255, 12);

    b.spawn(0, 140, -130, toward(140, -130, 0, 0), 12, 8, 'The east meadow', true);
    b.spawn(1, -150, -120, toward(-150, -120, 0, 0), 12, 8, 'The hill fort', true);
    b.spawn(0, 139, 130, toward(139, 130, 0, 0), 12, 8, 'The chapel', true);
    b.bounds(-215, 215, -215, 215);
    b.cinematic(90, 26, 70, -8, 22, -4);
    b.cinematic(-80, 30, -80, -8, 24, 0);
    b.cinematic(60, 14, 20, -8, 30, -4);
    b.cinematic(0, 40, 120, 0, 10, 0);
  },
};
