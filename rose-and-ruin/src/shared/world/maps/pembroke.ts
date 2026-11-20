import type { MapDef } from '../mapgen';
import { village, fields, woodlandRing, ground, toward } from './common';

// Pembroke: the Earls of Pembroke's fortress on a ridge of limestone between the Pembroke River
// and Monkton Pill. The great round keep, five storeys high, stands in the inner ward at the tip
// of the ridge; the outer ward and its great gatehouse face the town to the east.
export const pembroke: MapDef = {
  id: 'pembroke',
  name: 'Pembroke Castle',
  location: 'Pembrokeshire, West Wales',
  year: 'Autumn, 1461',
  blurb: 'Jasper Tudor\'s fortress between two rivers, where Henry Tudor was born. Force the great gatehouse, cross the outer ward, and take the inner ward beneath the great round keep.',
  history: 'Pembroke was Jasper Tudor\'s castle, and in 1457 his widowed sister-in-law Margaret Beaufort gave birth there to Henry Tudor. In 1461 Sir William Herbert came for it with a Yorkist army, and its garrison yielded; the boy Henry passed into Herbert\'s keeping.',
  atmosphere: {
    sky: 'golden', sunAzimuth: 230, sunElevation: 18, sunIntensity: 5.4, envIntensity: 0.74, exposure: 1.0,
    fogColor: [0.88, 0.8, 0.66], fogDensity: 0.0022, fogHeight: 22, haze: 0.55, wind: 0.45,
    grassTint: [1.0, 1.0, 0.86], ambientSound: 'coast', dust: 0.12,
  },
  card: { sky: ['#efb877', '#7d93ad'], ground: '#556032', silhouette: '#3b3226' },
  build(b) {
    const n = b.noise;
    const C = 17;
    b.base((x, z) => 12 + 2.0 * n.fbm(x / 140, z / 140, 4) + 0.3 * n.fbm(x / 8, z / 8, 2));
    // the two tidal rivers that make the ridge a promontory
    b.carve({ kind: 'line', pts: [[-270, -78], [-90, -76], [40, -86], [86, -140], [96, -240]], w: 30 }, 3, 10);
    b.carve({ kind: 'line', pts: [[-270, 76], [-90, 72], [30, 84], [76, 140], [86, 240]], w: 26 }, 3, 10);
    b.carve({ kind: 'rect', x: -180, z: 0, hx: 70, hz: 100 }, 3, 16);
    b.water(7.5, -270, 270, -270, 270, 'river');
    b.plateau({ kind: 'poly', pts: [[-92, -46], [60, -52], [74, 0], [60, 50], [-92, 44], [-104, 0]] }, C, 9, 0.6);
    b.flatten({ kind: 'poly', pts: [[-86, -40], [56, -46], [68, 0], [56, 44], [-86, 38], [-98, 0]] }, C, 3);

    // ---- the outer ward curtain and the great gatehouse facing the town
    const WT = C + 10, TT = C + 15;
    b.wall(-20, -42, 20, -46, WT); b.wall(20, -46, 56, -40, WT); b.wall(56, -40, 62, -9, WT);
    b.wall(62, 9, 56, 40, WT); b.wall(56, 40, 32, 42, WT, { brokenB: true }); b.wall(16, 42, -20, 40, WT, { brokenA: true });
    b.rubble(24, 42, 6, 2.2);
    b.gatehouse(62, 0, Math.PI / 2, { w: 18, d: 12, top: C + 17, passW: 4.4, passH: 5, towers: 'round', towerR: 4, floor: C });
    b.wall(68, -7, 82, -7, C + 7, { thick: 1.6 }); b.wall(68, 7, 82, 7, C + 7, { thick: 1.6 });
    b.gatehouse(84, 0, Math.PI / 2, { w: 14, d: 4, top: C + 10, passW: 4.2, passH: 4.4, towers: 'round', towerR: 2.4, floor: C });
    for (const [x, z] of [[20, -46], [56, -40], [56, 40], [-20, -42], [-20, 40]] as const) b.tower(x, z, { r: 5, top: TT, shape: 'round', roof: 'cone' });
    // ---- the inner ward: its own wall with the horseshoe gate, and the great round keep
    b.wall(-20, -42, -20, -8, C + 11); b.wall(-20, 8, -20, 40, C + 11);
    b.gatehouse(-20, 0, Math.PI / 2, { w: 16, d: 7, top: C + 15, passW: 4, passH: 4.6, towers: 'none', floor: C });
    b.wall(-20, -42, -70, -38, C + 11); b.wall(-70, -38, -92, 0, C + 11); b.wall(-92, 0, -70, 36, C + 11); b.wall(-70, 36, -20, 40, C + 11);
    b.tower(-60, 4, { r: 9.5, top: C + 36, shape: 'round', roof: 'cone' });
    b.building(-48, -28, 0.05, 22, 8, { style: 'stone', roof: 'lead', floors: 2, flatten: false });
    b.building(-46, 28, -0.05, 18, 7, { style: 'stone', roof: 'slate', flatten: false });
    b.paint({ kind: 'rect', x: -38, z: 4, hx: 14, hz: 10 }, 1, 0.7, 2, 0.5);
    b.prop('banner', -38, 4, 0, 1.4, { team: 0 });

    // ---- the outer ward
    b.building(30, -30, 0, 22, 7, { style: 'timber', roof: 'tile', flatten: false });
    b.paint({ kind: 'line', pts: [[84, 0], [40, 0], [-20, 0]], w: 5 }, 1, 0.8, 2, 0.4);
    b.prop('cart', 30, 26, 0.5, 1); b.prop('hay', 34, 30, 0.2, 1);
    b.prop('well', 10, 14, 0, 1);
    b.prop('brazier', 50, -6, 0, 1); b.prop('brazier', 50, 6, 0, 1);

    // ---- the town to the east and Herbert's army
    village(b, 150, 0, 16, 34);
    b.camp(200, -60, Math.PI / 2, 1, 2, 4);
    b.camp(190, 80, Math.PI / 2, 1, 2, 3);
    b.prop('cannon', 110, -12, Math.PI / 2, 1.1); b.prop('cannon', 110, 12, Math.PI / 2, 1.1);
    for (const z of [-14, 0, 14]) b.prop('mantlet', 100, z, Math.PI / 2, 1);
    b.path([[84, 0], [150, 0], [200, -60]], 5);
    b.path([[150, 0], [190, 80]], 4);

    b.spawn(0, -40, 4, toward(-40, 4, 200, -60), 14, 10, 'The inner ward');
    b.spawn(0, 20, 0, toward(20, 0, 200, -60), 24, 12, 'The outer ward');
    b.spawn(1, 200, -60, toward(200, -60, 84, 0), 30, 12, 'The town camp');
    b.spawn(1, 190, 80, toward(190, 80, 84, 0), 24, 12, 'The Monkton road');

    b.objective('The Great Gatehouse', 'A', 94, 0, 8);
    b.objective('The Outer Ward', 'B', 26, 10, 10);
    b.objective('The Great Keep', 'C', -42, 6, 9, 0);
    b.front([94, 0], [26, 10], [-42, 6], [24, 54], [130, 30]);

    b.avoid({ kind: 'rect', x: -10, z: 0, hx: 110, hz: 58 });
    ground(b, 'meadow', 120, -150, 26);
    ground(b, 'hillfort', 120, 170, 20);
    ground(b, 'chapel', 200, 150, 18);
    ground(b, 'crossroads', 200, -150, 16);
    fields(b, 60, 220, -230, -170, 34, 0.5);
    b.forest({ kind: 'rect', x: -120, z: -180, hx: 120, hz: 50 }, 60, { minSpacing: 6 });
    b.forest({ kind: 'rect', x: -120, z: 180, hx: 120, hz: 50 }, 60, { minSpacing: 6 });
    woodlandRing(b, { kind: 'rect', x: 40, z: 0, hx: 190, hz: 210 }, 255, 16);

    b.spawn(1, 120, -150, toward(120, -150, 0, 0), 12, 8, 'The north meadow', true);
    b.spawn(0, 120, 170, toward(120, 170, 0, 0), 12, 8, 'The hill fort', true);
    b.spawn(1, 200, -150, toward(200, -150, 0, 0), 12, 8, 'The crossroads', true);
    b.bounds(-112, 225, -215, 215);
    b.cinematic(140, 32, 60, 0, 24, 0);
    b.cinematic(-20, 36, -110, -40, 30, 0);
    b.cinematic(60, 30, 110, -40, 28, 0);
    b.cinematic(130, 24, -30, 40, 24, 0);
  },
};
