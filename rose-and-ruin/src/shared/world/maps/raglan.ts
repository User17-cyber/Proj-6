import type { MapDef } from '../mapgen';
import { village, fields, woodlandRing, ground, toward } from './common';

// Raglan: William Herbert's palace-fortress in Gwent. Many-sided machicolated towers ring two
// courts, the Pitched Stone Court behind the great gatehouse and the Fountain Court beyond the
// hall; outside the west wall the hexagonal Great Tower, the Yellow Tower of Gwent, stands on an
// island in its own moat, reached by a single bridge.
export const raglan: MapDef = {
  id: 'raglan',
  name: 'Raglan Castle',
  location: 'Monmouthshire, the Welsh March',
  year: 'Summer, 1468',
  blurb: 'Herbert\'s palace-fortress. Break the great gatehouse into the Pitched Stone Court, fight through to the Fountain Court, and hold the bridge to the Yellow Tower on its moat.',
  history: 'Raglan was raised in its last and grandest form by Sir William Herbert, Edward IV\'s chief man in Wales, with many-sided towers and a great hexagonal keep on its own moat. In 1468 Herbert took Harlech for the king, and at Raglan he kept as his ward the boy Henry Tudor, who would end the wars at Bosworth.',
  atmosphere: {
    sky: 'golden', sunAzimuth: 300, sunElevation: 22, sunIntensity: 5.8, envIntensity: 0.78, exposure: 1.0,
    fogColor: [0.9, 0.82, 0.66], fogDensity: 0.0019, fogHeight: 22, haze: 0.45, wind: 0.3,
    grassTint: [1.0, 1.0, 0.82], ambientSound: 'meadow', dust: 0.18,
  },
  card: { sky: ['#f0c27a', '#88a0b8'], ground: '#5e6230', silhouette: '#4a3e2c' },
  build(b) {
    const n = b.noise;
    const C = 14;
    b.base((x, z) => 12 + 2.2 * n.fbm(x / 150, z / 150, 4) + 0.3 * n.fbm(x / 8, z / 8, 2));
    b.plateau({ kind: 'poly', pts: [[-74, -42], [52, -44], [64, -6], [60, 40], [-74, 40]] }, C, 9, 0.4);
    b.flatten({ kind: 'poly', pts: [[-70, -38], [48, -40], [58, -6], [54, 36], [-70, 36]] }, C, 3);
    // the Great Tower's moat and island
    b.carve({ kind: 'circle', x: -46, z: 4, r: 21 }, C - 4.5, 3);
    b.plateau({ kind: 'circle', x: -46, z: 4, r: 13 }, C, 2);
    b.water(C - 2.4, -70, -22, -20, 28, 'moat');

    // ---- the curtain and its many-sided towers
    const WT = C + 11, TT = C + 17;
    const T = (x: number, z: number, r = 4.6, top = TT) => b.tower(x, z, { r, top, shape: 'poly', sides: 6, roof: 'flat' });
    b.wall(-24, -32, 6, -32, WT); b.wall(26, -32, 40, -32, WT);
    b.gatehouse(16, -32, 0, { w: 16, d: 12, top: C + 19, passW: 4.4, passH: 5, towers: 'none', floor: C });
    T(6, -35, 4.4, C + 22); T(26, -35, 4.4, C + 22);
    b.wall(40, -32, 52, -4, WT);
    b.wall(52, -4, 48, 28, WT);
    b.wall(48, 28, 36, 30, WT, { brokenB: true }); b.wall(24, 32, 10, 34, WT, { brokenA: true });
    b.rubble(30, 31, 6, 2.2);
    b.wall(10, 34, -24, 30, WT);
    b.wall(-24, 30, -24, 13, WT); b.wall(-24, -5, -24, -32, WT);
    b.gatehouse(-24, 4, Math.PI / 2, { w: 18, d: 6, top: C + 14, passW: 4, passH: 4.6, towers: 'none', floor: C });
    T(40, -32); T(52, -4, 5.4, TT + 2); T(48, 28); T(-24, 30); T(-24, -32); T(10, 34, 4);
    // the Great Tower on its island, and its bridge
    b.tower(-46, 4, { r: 8, top: C + 30, shape: 'poly', sides: 6, roof: 'flat', turret: true });
    b.bridge(-34, 4, -27, 4, 4, C, { style: 'wood' });

    // ---- the hall between the courts, the kitchen, the chapel and long gallery
    b.building(0, 8, Math.PI / 2, 24, 10, { style: 'stone', roof: 'lead', floors: 2, flatten: false });
    b.building(40, 12, Math.PI / 2, 16, 8, { style: 'stone', roof: 'slate', flatten: false });
    b.building(-12, 24, 0, 18, 7, { style: 'stone', roof: 'lead', flatten: false });
    b.paint({ kind: 'rect', x: 24, z: -6, hx: 16, hz: 18 }, 1, 0.9, 2, 0.4); // the pitched stones
    b.paint({ kind: 'rect', x: -12, z: 2, hx: 10, hz: 12 }, 1, 0.6, 2, 0.5);
    b.prop('well', -13, 4, 0, 1); // the fountain
    b.prop('banner', -16, -10, 0, 1.4, { team: 1 });
    b.prop('brazier', 10, -24, 0, 1); b.prop('brazier', 22, -24, 0, 1); b.prop('brazier', -19, -7, 0, 1); b.prop('brazier', -19, 15, 0, 1);
    b.prop('barrel', 36, -18, 0, 1); b.prop('barrel', 36.8, -17, 0, 1); b.prop('crate', 35, -16, 0.4, 1);
    b.prop('cart', 30, 22, 0.5, 1); b.prop('hay', 26, 24, 0.2, 1);
    // the outer garden terraces and the bowling green
    b.paint({ kind: 'rect', x: -10, z: 54, hx: 40, hz: 10 }, 0, 0.3, 4, 0.6);
    b.hedge([[-50, 48], [30, 48]], 1.4);
    b.hedge([[-50, 62], [30, 62]], 1.4);

    // ---- Raglan village and the Welsh host on the Monmouth road and in the deer park
    village(b, -40, -140, 13, 28);
    b.camp(50, -168, 0, 0, 2, 4);
    b.camp(176, 40, Math.PI / 2, 0, 2, 3);
    b.prop('trebuchet', 80, -90, 0.6, 1);
    b.prop('cannon', 36, 60, Math.PI, 1.1); b.prop('cannon', 20, 64, Math.PI, 1.1);
    for (const x of [6, 16, 26]) b.prop('mantlet', x, -52, Math.PI, 1);
    b.path([[16, -32], [16, -80], [50, -168]], 5);
    b.path([[52, -4], [110, 10], [176, 40]], 4);
    b.path([[30, 36], [40, 70], [110, 10]], 3);

    b.spawn(1, 22, -10, toward(22, -10, 50, -168), 18, 10, 'The Pitched Stone Court');
    b.spawn(1, -13, -18, toward(-13, -18, 50, -168), 12, 8, 'The Fountain Court');
    b.spawn(0, 50, -168, toward(50, -168, 16, -32), 30, 12, 'The Monmouth road');
    b.spawn(0, 176, 40, toward(176, 40, 52, -4), 24, 12, 'The deer park');

    b.objective('The Great Gatehouse', 'A', 16, -46, 8);
    b.objective('The Kitchen Breach', 'B', 30, 40, 8);
    b.objective('The Great Tower Bridge', 'C', -17, 4, 7, 1);
    b.front([16, -46], [30, 40], [-17, 4], [80, 10], [16, -80]);

    b.avoid({ kind: 'rect', x: -8, z: 0, hx: 74, hz: 50 });
    ground(b, 'meadow', 130, -90, 26);
    ground(b, 'hillfort', -130, -100, 20);
    ground(b, 'chapel', -120, 120, 18);
    ground(b, 'crossroads', 130, 140, 18);
    fields(b, -80, 90, 90, 220, 34, 0.5);
    b.forest({ kind: 'rect', x: 190, z: -40, hx: 26, hz: 160 }, 60, { minSpacing: 6 });
    b.forest({ kind: 'rect', x: -190, z: 20, hx: 26, hz: 200 }, 70, { minSpacing: 6 });
    woodlandRing(b, { kind: 'rect', x: 0, z: 0, hx: 200, hz: 210 }, 255, 20);

    b.spawn(0, 130, -90, toward(130, -90, 0, 0), 12, 8, 'The east meadow', true);
    b.spawn(0, 130, 140, toward(130, 140, 0, 0), 12, 8, 'The crossroads', true);
    b.spawn(1, -130, -100, toward(-130, -100, 0, 0), 12, 8, 'The hill fort', true);
    b.spawn(1, -109, 109, toward(-109, 109, 0, 0), 12, 8, 'The ruined chapel', true);
    b.bounds(-205, 215, -215, 215);
    b.cinematic(-100, 30, 40, -30, 28, 0);
    b.cinematic(80, 28, -80, 10, 24, 0);
    b.cinematic(-60, 22, -40, -46, 34, 4);
    b.cinematic(70, 24, 60, 0, 22, 0);
  },
};
