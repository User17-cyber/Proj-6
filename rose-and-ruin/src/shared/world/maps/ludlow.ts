import type { MapDef } from '../mapgen';
import { village, fields, woodlandRing, ground, toward } from './common';

// Ludlow: the Duke of York's fortress on its cliff above the River Teme. The inner bailey with
// its Norman great tower and round chapel sits in the north-west corner of a broad outer bailey;
// the town lies to the east and Ludford Bridge crosses the river to the south.
export const ludlow: MapDef = {
  id: 'ludlow',
  name: 'Ludlow Castle',
  location: 'Shropshire, the Welsh March',
  year: 'October, 1459',
  blurb: 'York\'s fortress above the Teme. Cross Ludford Bridge and climb to the breach, or force the town gate, and take the round chapel in the inner bailey.',
  history: 'Ludlow was the chief seat of Richard, Duke of York, at the heart of the Mortimer lands in the March of Wales. In October 1459 the Yorkist army faced the king\'s host across Ludford Bridge; in the night York\'s lords fled, the Calais garrison went over to the king, and the Lancastrians sacked the town and castle.',
  atmosphere: {
    sky: 'golden', sunAzimuth: 120, sunElevation: 16, sunIntensity: 5.2, envIntensity: 0.75, exposure: 1.0,
    fogColor: [0.86, 0.78, 0.64], fogDensity: 0.0024, fogHeight: 20, haze: 0.6, wind: 0.35,
    grassTint: [1.04, 0.96, 0.8], ambientSound: 'meadow', dust: 0.15,
  },
  card: { sky: ['#e8b878', '#7c8aa0'], ground: '#5b5a30', silhouette: '#3a2e26' },
  build(b) {
    const n = b.noise;
    const C = 15;
    b.base((x, z) => 12 + 2.0 * n.fbm(x / 140, z / 140, 4) + 0.3 * n.fbm(x / 8, z / 8, 2));
    // the Teme, curling round the west and south of the castle rock
    b.carve({ kind: 'line', pts: [[-112, -270], [-104, -120], [-98, -20], [-92, 60], [-62, 102], [0, 112], [100, 110], [270, 118]], w: 26 }, 4, 10);
    b.water(8, -270, 270, -270, 270, 'river');
    // the rock and the castle's level
    b.plateau({ kind: 'poly', pts: [[-70, -60], [72, -60], [76, 52], [-70, 52]] }, C, 8, 0.4);
    b.flatten({ kind: 'rect', x: 2, z: -4, hx: 68, hz: 52 }, C, 3);
    // Ludford Bridge
    b.flatten({ kind: 'rect', x: 70, z: 80, hx: 5, hz: 8 }, 12, 6);
    b.flatten({ kind: 'rect', x: 70, z: 144, hx: 5, hz: 8 }, 12, 6);
    b.bridge(70, 84, 70, 140, 6, 12, { style: 'stone' });

    // ---- outer curtain: town gate on the east, a fresh breach on the south above the river
    const WT = C + 9, TT = C + 14;
    b.wall(-62, -52, 64, -52, WT);
    b.wall(64, -52, 64, -12, WT); b.wall(64, 4, 64, 44, WT);
    b.wall(64, 44, 18, 44, WT, { brokenB: true }); b.wall(2, 44, -62, 44, WT, { brokenA: true });
    b.wall(-62, 44, -62, -52, WT);
    b.rubble(10, 45, 6, 2.2, 'rubble');
    b.gatehouse(64, -4, Math.PI / 2, { w: 16, d: 9, top: C + 14, passW: 4.2, passH: 4.8, towers: 'square', towerR: 3, floor: C });
    for (const [x, z] of [[64, -52], [64, 44], [-62, 44], [34, -52], [34, 44]] as const) b.tower(x, z, { r: 4, top: TT, shape: 'square', roof: 'flat' });
    b.tower(-62, 12, { r: 5, top: TT + 2, shape: 'round', roof: 'flat' }); // Mortimer's Tower
    b.tower(-62, -52, { r: 5, top: C + 20, shape: 'square', roof: 'flat', turret: true }); // Pendover Tower

    // ---- the inner bailey (north-west): its gate, the great tower, the round chapel, the hall
    b.wall(-62, -8, -42, -8, C + 10); b.wall(-26, -8, -6, -8, C + 10);
    b.gatehouse(-34, -8, 0, { w: 16, d: 8, top: C + 14, passW: 4, passH: 4.6, towers: 'none', floor: C });
    b.wall(-6, -8, -6, -26, C + 10, { brokenB: true }); b.wall(-6, -36, -6, -52, C + 10, { brokenA: true });
    b.rubble(-6, -31, 4, 1.8);
    b.keep(-50, -40, 0, 14, 14, C + 24, 'square', 'ashlar');
    b.tower(-18, -24, { r: 4.6, top: C + 8, shape: 'round', roof: 'cone' }); // the round nave of St Mary Magdalene
    b.building(-18, -33, 0, 6, 8, { style: 'stone', roof: 'slate', wallH: 6, flatten: false });
    b.building(-26, -46, 0, 26, 7, { style: 'stone', roof: 'lead', floors: 2, flatten: false });
    b.paint({ kind: 'rect', x: -32, z: -20, hx: 24, hz: 10 }, 1, 0.7, 2, 0.5);
    b.prop('banner', -27, -31, 0, 1.4, { team: 1 });
    b.prop('well', -40, -16, 0, 1);
    b.prop('brazier', -40, -2, 0, 1); b.prop('brazier', -28, -2, 0, 1);
    // the outer bailey: York's household, stables and stores
    b.building(30, -44, 0, 22, 7, { style: 'timber', roof: 'tile', flatten: false });
    b.building(-40, 36, 0, 22, 7, { style: 'timber', roof: 'thatch', flatten: false });
    b.paint({ kind: 'line', pts: [[64, -4], [20, -2], [-20, 8], [10, 40]], w: 5 }, 1, 0.75, 2, 0.5);
    b.prop('cart', 40, 20, 0.6, 1); b.prop('hay', 44, 24, 0.3, 1); b.prop('hay', 42, 27, 1.1, 1);
    b.prop('rack', 20, 30, 0, 1); b.prop('rack', 26, 30, 0, 1);
    b.prop('barrel', 50, -36, 0, 1); b.prop('barrel', 50.8, -35, 0, 1); b.prop('crate', 48.6, -34.2, 0.3, 1);
    b.prop('tent', 10, 22, 0.2, 1); b.prop('tent', -12, 26, -0.2, 1);
    b.prop('brazier', 54, -8, 0, 1); b.prop('brazier', 54, 2, 0, 1);

    // ---- the town to the east, the king's camp across Ludford Bridge
    village(b, 135, -20, 14, 32);
    b.camp(70, 182, 0, 0, 2, 4);
    b.camp(196, 30, Math.PI / 2, 0, 2, 3);
    b.prop('cannon', 40, 74, Math.PI, 1.1); b.prop('cannon', 0, 76, Math.PI, 1.1);
    for (const x of [-8, 8, 24]) b.prop('mantlet', x, 64, 0, 1);
    for (const z of [-16, -4, 8]) b.prop('mantlet', 84, z, Math.PI / 2, 1);
    b.path([[64, -4], [100, -6], [135, -20], [196, 30]], 5);
    b.path([[10, 50], [40, 72], [70, 84]], 4);
    b.path([[70, 140], [70, 230]], 5);

    b.spawn(1, -36, -22, toward(-36, -22, 70, 182), 14, 8, 'The inner bailey');
    b.spawn(1, 20, -10, toward(20, -10, 196, 30), 26, 12, 'The outer bailey');
    b.spawn(0, 70, 182, toward(70, 182, 10, 44), 30, 12, 'Ludford camp');
    b.spawn(0, 196, 30, toward(196, 30, 64, -4), 24, 12, 'The town road');

    b.objective('The Town Gate', 'A', 76, -4, 8);
    b.objective('The South Breach', 'B', 10, 54, 9);
    b.objective('The Round Chapel', 'C', -26, -18, 9, 1);
    b.front([76, -4], [10, 54], [-26, -18], [70, 100], [130, 0]);

    b.avoid({ kind: 'rect', x: 2, z: -4, hx: 76, hz: 60 });
    ground(b, 'meadow', 160, -130, 26);
    ground(b, 'hillfort', -30, -150, 20);
    ground(b, 'chapel', 150, 175, 18);
    ground(b, 'crossroads', 190, -60, 16);
    fields(b, 30, 220, -230, -168, 34, 0.5);
    b.forest({ kind: 'rect', x: -180, z: 0, hx: 40, hz: 240 }, 90, { minSpacing: 6 });
    b.forest({ kind: 'rect', x: -60, z: 190, hx: 90, hz: 30 }, 60, { minSpacing: 6 });
    woodlandRing(b, { kind: 'rect', x: 20, z: 0, hx: 200, hz: 220 }, 255, 20);

    b.spawn(0, 140, 164, toward(140, 164, 0, 0), 12, 8, 'The Ludford chapel', true);
    b.spawn(0, 160, -130, toward(160, -130, 0, 0), 12, 8, 'The north meadow', true);
    b.spawn(1, -30, -150, toward(-30, -150, 0, 0), 12, 8, 'The hill fort', true);
    b.bounds(-140, 225, -225, 225);
    b.cinematic(110, 26, 110, 0, 24, 0);
    b.cinematic(-70, 22, 90, -30, 26, -20);
    b.cinematic(140, 30, -60, 20, 22, 0);
    b.cinematic(30, 18, 60, -20, 28, -20);
  },
};
