import type { MapDef } from '../mapgen';
import { village, fields, woodlandRing, ground, toward } from './common';

// Caister: Sir John Fastolf's moated brick castle in the Norfolk marshes, inherited (and fought
// over) by the Pastons. A square of brick on its moated island, a tall slender round tower at
// the north-west corner, and a moated base court to the west.
export const caister: MapDef = {
  id: 'caister',
  name: 'Caister Castle',
  location: 'Norfolk, by the sea',
  year: 'September, 1469',
  blurb: 'The Pastons\' moated brick castle under the Duke of Norfolk\'s siege. Cross the east bridge or the base court, and take the great round tower.',
  history: 'Built by Sir John Fastolf of brick in the 1430s, Caister passed to the Paston family on his death, and the Duke of Norfolk claimed it. In 1469 he besieged it with some three thousand men and guns for five weeks, as the Paston letters tell, until the small garrison yielded.',
  atmosphere: {
    sky: 'sunset', sunAzimuth: 290, sunElevation: 10, sunIntensity: 4.4, envIntensity: 0.7, exposure: 1.02,
    fogColor: [0.9, 0.72, 0.6], fogDensity: 0.0024, fogHeight: 16, haze: 0.6, wind: 0.4,
    grassTint: [0.96, 1.0, 0.82], ambientSound: 'meadow', dust: 0.1,
  },
  card: { sky: ['#f09a66', '#5b6b8f'], ground: '#55602f', silhouette: '#45281e' },
  build(b) {
    const n = b.noise;
    const C = 6.2;
    b.base((x, z) => 5.8 + 0.9 * n.fbm(x / 160, z / 160, 4) + 0.15 * n.fbm(x / 8, z / 8, 2));
    // the moat round the inner court, and round the base court
    b.carve({ kind: 'rect', x: 0, z: 0, hx: 42, hz: 42 }, 2, 2);
    b.carve({ kind: 'rect', x: -82, z: 0, hx: 32, hz: 34 }, 2, 2);
    b.plateau({ kind: 'rect', x: 0, z: 0, hx: 30, hz: 30 }, C, 1.5);
    b.plateau({ kind: 'rect', x: -82, z: 0, hx: 22, hz: 24 }, C, 1.5);
    b.water(4.4, -116, 44, -44, 44, 'moat');
    b.bridge(30, 0, 44, 0, 5, C, { style: 'wood' });
    b.bridge(-60, 0, -30, 0, 5, C, { style: 'wood' });
    b.bridge(-82, 24, -82, 36, 5, C, { style: 'wood' });
    b.flatten({ kind: 'rect', x: 48, z: 0, hx: 4, hz: 4 }, C, 4);
    b.flatten({ kind: 'rect', x: -82, z: 40, hx: 4, hz: 4 }, C, 4);

    // ---- the brick curtain of the inner court, the gate to the east, the great tower
    const WT = C + 10, TT = C + 14, brick = { style: 'red' as const };
    b.wall(-28, -28, 28, -28, WT, brick); b.wall(28, -28, 28, -8, WT, brick); b.wall(28, 8, 28, 28, WT, brick);
    b.wall(28, 28, 8, 28, WT, { ...brick, brokenB: true }); b.wall(-6, 28, -28, 28, WT, { ...brick, brokenA: true });
    b.rubble(1, 29, 5, 2, 'red');
    b.wall(-28, 28, -28, 6, WT, brick); b.wall(-28, -6, -28, -28, WT, brick);
    b.gatehouse(28, 0, Math.PI / 2, { w: 16, d: 8, top: C + 14, passW: 4.2, passH: 4.6, towers: 'square', towerR: 2.6, style: 'red', floor: C });
    b.gatehouse(-28, 0, Math.PI / 2, { w: 12, d: 5, top: C + 11, passW: 3.6, passH: 4.2, towers: 'none', style: 'red', floor: C });
    for (const [x, z] of [[28, -28], [28, 28], [-28, 28]] as const) b.tower(x, z, { r: 3.6, top: TT, shape: 'round', roof: 'cone', style: 'red' });
    b.tower(-28, -28, { r: 5.2, top: C + 31, shape: 'round', roof: 'flat', style: 'red', turret: true }); // the great tower
    // the hall range and the court
    b.building(0, -18, 0, 36, 9, { style: 'stone', roof: 'tile', floors: 2, flatten: false });
    b.building(-16, 16, 0, 16, 7, { style: 'timber', roof: 'tile', flatten: false });
    b.paint({ kind: 'rect', x: 4, z: 4, hx: 18, hz: 9 }, 1, 0.75, 2, 0.4);
    b.prop('well', 6, 6, 0, 1);
    b.prop('banner', -14, -6, 0, 1.4, { team: 1 });
    b.prop('brazier', 22, -5, 0, 1); b.prop('brazier', 22, 5, 0, 1);

    // ---- the base court: stables, barns and a palisade
    b.palisade([[-104, -22], [-60, -22]], 3); b.palisade([[-104, 22], [-88, 22]], 3); b.palisade([[-76, 22], [-60, 22]], 3);
    b.palisade([[-104, -22], [-104, 22]], 3);
    b.building(-90, -12, 0, 18, 7, { style: 'timber', roof: 'thatch', flatten: false });
    b.prop('hay', -74, 10, 0.3, 1); b.prop('hay', -71, 13, 1.2, 1); b.prop('cart', -76, -6, 0.5, 1);

    // ---- the marsh, the village and Norfolk's host
    village(b, -70, 140, 12, 28);
    b.camp(170, 0, Math.PI / 2, 0, 2, 4);
    b.camp(40, 170, Math.PI, 0, 2, 3);
    b.prop('cannon', 80, -10, Math.PI / 2, 1.1); b.prop('cannon', 80, 10, Math.PI / 2, 1.1); b.prop('cannon', 20, 70, Math.PI, 1.1);
    for (const z of [-14, 0, 14]) b.prop('mantlet', 64, z, Math.PI / 2, 1);
    b.path([[44, 0], [110, 0], [170, 0]], 5);
    b.path([[-82, 40], [-80, 100], [-70, 140], [40, 170]], 4);

    b.spawn(1, 4, 6, toward(4, 6, 170, 0), 18, 8, 'The inner court');
    b.spawn(1, -82, 6, toward(-82, 6, 40, 170), 18, 10, 'The base court');
    b.spawn(0, 170, 0, toward(170, 0, 44, 0), 30, 12, 'The Duke\'s camp');
    b.spawn(0, 40, 170, toward(40, 170, -82, 40), 24, 12, 'The marsh road');

    b.objective('The East Bridge', 'A', 52, 0, 8);
    b.objective('The Base Court', 'B', -80, 6, 9);
    b.objective('The Great Tower', 'C', -16, -6, 8, 1);
    b.front([52, 0], [-80, 6], [-16, -6], [0, 44], [80, 60]);

    b.avoid({ kind: 'rect', x: -36, z: 0, hx: 84, hz: 50 });
    ground(b, 'meadow', 120, -120, 26);
    ground(b, 'hillfort', -160, -120, 20);
    ground(b, 'chapel', 150, 130, 18);
    ground(b, 'crossroads', -170, 60, 16);
    fields(b, -60, 100, -220, -120, 34, 0.5);
    fields(b, 60, 200, 60, 200, 34, 0.5);
    woodlandRing(b, { kind: 'rect', x: 0, z: 0, hx: 200, hz: 200 }, 255, 12);

    b.spawn(0, 120, -120, toward(120, -120, 0, 0), 12, 8, 'The north meadow', true);
    b.spawn(0, 140, 118, toward(140, 118, 0, 0), 12, 8, 'The chapel', true);
    b.spawn(1, -160, -120, toward(-160, -120, 0, 0), 12, 8, 'The hill fort', true);
    b.spawn(1, -170, 60, toward(-170, 60, 0, 0), 12, 8, 'The crossroads', true);
    b.bounds(-215, 215, -215, 215);
    b.cinematic(90, 22, 70, 0, 14, 0);
    b.cinematic(-60, 24, -80, -28, 22, -28);
    b.cinematic(60, 18, -60, -10, 14, 0);
    b.cinematic(-140, 20, 60, -80, 10, 0);
  },
};
