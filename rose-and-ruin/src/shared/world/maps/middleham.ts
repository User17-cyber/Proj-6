import type { MapDef } from '../mapgen';
import { village, fields, woodlandRing, ground, boulders, toward } from './common';

// Middleham: the Nevilles' northern stronghold in Wensleydale. One of the greatest Norman keeps
// in England fills the middle of a tight square of curtain walls, leaving only a narrow ward to
// fight in; the town lies below to the north and the old ringwork, William's Hill, to the south-west.
export const middleham: MapDef = {
  id: 'middleham',
  name: 'Middleham Castle',
  location: 'Wensleydale, North Yorkshire',
  year: 'August, 1469',
  blurb: 'Warwick holds the king captive behind Middleham\'s walls. Take William\'s Hill, storm the north gate or the broken south range, and fight round the great keep through the narrow ward.',
  history: 'Middleham was the great northern seat of the Nevilles. In the summer of 1469 Warwick the Kingmaker, risen against Edward IV, held the captured king here, until the North would not be ruled in his name and Edward went free. The young Richard of Gloucester had learned the arts of war within these walls.',
  atmosphere: {
    sky: 'noon', sunAzimuth: 300, sunElevation: 40, sunIntensity: 5.4, envIntensity: 0.8, exposure: 1.0,
    fogColor: [0.74, 0.78, 0.82], fogDensity: 0.0018, fogHeight: 26, haze: 0.4, wind: 0.85,
    grassTint: [0.98, 0.96, 0.84], ambientSound: 'wind', dust: 0.12,
  },
  card: { sky: ['#9fb4cc', '#dfe6ec'], ground: '#59603a', silhouette: '#33302c' },
  build(b) {
    const n = b.noise;
    const C = 18;
    // the dale falls away to the north; the moor climbs to the south
    b.base((x, z) => 16 + 2.4 * n.fbm(x / 130, z / 130, 4) + 0.3 * n.fbm(x / 8, z / 8, 2) + Math.max(0, z - 60) * 0.045 - Math.max(0, -z - 60) * 0.03);
    b.plateau({ kind: 'rect', x: 0, z: 0, hx: 46, hz: 54 }, C, 9, 0.4);
    b.flatten({ kind: 'rect', x: 0, z: 0, hx: 40, hz: 48 }, C, 3);

    // ---- the curtain: a tight square round the keep, the gatehouse at the north-east
    const WT = C + 10, TT = C + 15;
    b.wall(-32, -40, 12, -40, WT); b.wall(28, -40, 32, -40, WT);
    b.gatehouse(20, -40, 0, { w: 16, d: 10, top: C + 17, passW: 4.2, passH: 4.8, towers: 'square', towerR: 2.8, style: 'rubble', floor: C });
    b.wall(32, -40, 32, 40, WT, { style: 'rubble' });
    b.wall(32, 40, 7, 40, WT, { style: 'rubble', brokenB: true }); b.wall(-7, 40, -32, 40, WT, { style: 'rubble', brokenA: true });
    b.wall(-32, 40, -32, -40, WT, { style: 'rubble' });
    b.rubble(0, 41, 6, 2.4, 'rubble');
    for (const [x, z] of [[-32, -40], [32, -40], [32, 40]] as const) b.tower(x, z, { r: 4.4, top: TT, shape: 'square', roof: 'flat', style: 'rubble' });
    b.tower(-32, 40, { r: 5.6, top: TT + 4, shape: 'round', roof: 'flat', style: 'rubble', turret: true }); // the Prince's Tower
    b.tower(-32, 0, { r: 3.6, top: TT, shape: 'square', roof: 'flat', style: 'rubble' });
    // the great keep
    b.keep(0, 0, 0, 28, 38, C + 24, 'square', 'rubble');
    // the ranges along the east curtain, the chapel on the keep's east face
    b.building(26, 6, Math.PI / 2, 30, 6, { style: 'stone', roof: 'slate', floors: 2, flatten: false });
    b.building(-26, -24, Math.PI / 2, 14, 6, { style: 'stone', roof: 'slate', flatten: false });
    b.paint({ kind: 'rect', x: 0, z: -30, hx: 30, hz: 8 }, 1, 0.7, 2, 0.5);
    b.paint({ kind: 'rect', x: 0, z: 30, hx: 30, hz: 8 }, 1, 0.6, 2, 0.5);
    b.prop('well', -19, -34, 0, 1);
    b.prop('banner', 8, -33, 0, 1.4, { team: 0 });
    b.prop('brazier', 14, -34, 0, 1); b.prop('brazier', 26, -34, 0, 1);
    b.prop('cart', -24, 33, 0.4, 1); b.prop('hay', -21, 36, 0.2, 1);
    b.prop('barrel', 22, 30, 0, 1); b.prop('barrel', 22.8, 31, 0, 1); b.prop('crate', 21, 32, 0.3, 1);

    // ---- William's Hill: the first castle, an earthen ringwork on the rise to the south-west
    b.mound(-80, 96, 9, 32, C + 10);
    b.flatten({ kind: 'circle', x: -80, z: 96, r: 8.5 }, C + 10, 2);
    b.palisade([[-86, 89], [-89, 96], [-86, 103]], 2.6);
    b.palisade([[-74, 89], [-71, 96], [-74, 103]], 2.6);
    b.prop('banner', -80, 96, 0, 1.4, { team: 0 });
    b.prop('brazier', -76, 100, 0, 1);

    // ---- the town below the castle, the king's men on the road and on the moor
    village(b, 0, -118, 14, 30);
    b.camp(40, -168, 0, 1, 2, 4);
    b.camp(70, 170, Math.PI, 1, 2, 3);
    b.prop('trebuchet', 70, -80, 0.3, 1);
    b.prop('cannon', 10, 76, 0, 1.1); b.prop('cannon', -12, 78, 0, 1.1);
    for (const x of [6, 14, 26, 34]) b.prop('mantlet', x, -56, Math.PI, 1);
    b.path([[20, -40], [20, -80], [0, -118], [40, -168]], 5);
    b.path([[0, 46], [20, 100], [70, 170]], 4);
    b.path([[-20, 46], [-60, 80], [-80, 96]], 3);

    b.spawn(0, -6, -30, toward(-6, -30, 40, -168), 18, 7, 'The north ward');
    b.spawn(0, -4, 28, toward(-4, 28, 70, 170), 18, 7, 'The south ward');
    b.spawn(1, 40, -168, toward(40, -168, 20, -40), 30, 12, 'The market road');
    b.spawn(1, 70, 170, toward(70, 170, 0, 40), 26, 12, 'The moor');

    b.objective('William\'s Hill', 'A', -80, 96, 8);
    b.objective('The North Gate', 'B', 20, -50, 8);
    b.objective('The Great Keep', 'C', 0, -28, 9, 0);
    b.front([-80, 96], [20, -50], [0, -28], [0, 50], [-40, 60]);

    b.avoid({ kind: 'rect', x: 0, z: 0, hx: 52, hz: 60 });
    b.avoid({ kind: 'circle', x: -80, z: 96, r: 36 });
    ground(b, 'meadow', -130, -60, 26);
    ground(b, 'hillfort', 150, 70, 20);
    ground(b, 'chapel', -140, 160, 18);
    ground(b, 'crossroads', 140, -100, 18);
    fields(b, -220, -60, -230, -120, 34, 0.45);
    fields(b, 60, 220, -230, -150, 34, 0.45);
    boulders(b, { kind: 'rect', x: 40, z: 140, hx: 180, hz: 70 }, 50);
    b.forest({ kind: 'rect', x: -200, z: 40, hx: 30, hz: 120 }, 50, { minSpacing: 7 });
    woodlandRing(b, { kind: 'rect', x: 0, z: 0, hx: 200, hz: 210 }, 255, 14);

    b.spawn(0, 150, 70, toward(150, 70, 0, 0), 12, 8, 'The hill fort', true);
    b.spawn(0, -130, 149, toward(-130, 149, 0, 0), 12, 8, 'The moorland chapel', true);
    b.spawn(1, -130, -60, toward(-130, -60, 0, 0), 12, 8, 'The west meadow', true);
    b.spawn(1, 140, -100, toward(140, -100, 0, 0), 12, 8, 'The crossroads', true);
    b.bounds(-210, 210, -215, 215);
    b.cinematic(90, 34, -90, 0, 30, 0);
    b.cinematic(-70, 36, 60, 0, 30, 0);
    b.cinematic(60, 30, 70, -80, 30, 96);
    b.cinematic(0, 26, -80, 0, 30, -20);
  },
};
