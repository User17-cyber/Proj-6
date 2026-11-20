import type { MapDef } from '../mapgen';
import { village, fields, woodlandRing, ground, toward } from './common';

// Pontefract: the great royal castle on its rock above the town, "the key to the north". An oval
// curtain with seven towers, and on its old motte at the south-west the round keep of clustered
// drum towers; the barbican faces east.
export const pontefract: MapDef = {
  id: 'pontefract',
  name: 'Pontefract Castle',
  location: 'West Riding of Yorkshire',
  year: 'Summer, 1483',
  blurb: 'The key to the north, on its rock above the town. Break the east barbican or the north wall, and take the round keep on its mound.',
  history: 'Pontefract was a royal fortress of the Duchy of Lancaster where Richard II died in 1400. In the Wars of the Roses it was a Yorkist stronghold; Richard of Gloucester held it, and in June 1483 Earl Rivers and Sir Richard Grey were beheaded there on his orders.',
  atmosphere: {
    sky: 'noon', sunAzimuth: 120, sunElevation: 50, sunIntensity: 5.6, envIntensity: 0.82, exposure: 1.0,
    fogColor: [0.78, 0.8, 0.84], fogDensity: 0.0017, fogHeight: 26, haze: 0.4, wind: 0.35,
    grassTint: [1.0, 1.0, 0.88], ambientSound: 'city', dust: 0.14,
  },
  card: { sky: ['#a3b8d0', '#e2e8ee'], ground: '#5b6438', silhouette: '#302c27' },
  build(b) {
    const n = b.noise;
    const C = 19;
    b.base((x, z) => 13 + 2.2 * n.fbm(x / 140, z / 140, 4) + 0.3 * n.fbm(x / 8, z / 8, 2) - Math.max(0, -x - 60) * 0.02);
    // the rock
    b.plateau({ kind: 'ellipse', x: 0, z: 0, rx: 82, rz: 58 }, C, 10, 1.4);
    b.flatten({ kind: 'ellipse', x: 0, z: 0, rx: 74, rz: 50 }, C, 3);
    b.earthRamp(80, 0, 120, 0, 12, C, 13.5);

    // ---- the oval curtain and its towers
    const WT = C + 10, TT = C + 16;
    const pts: [number, number][] = [];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; pts.push([Math.cos(a) * 70, Math.sin(a) * 47]); }
    // segment 0 runs from the east point: the gatehouse stands there; segment 5 is breached
    for (let i = 0; i < 8; i++) {
      const a = pts[i], c = pts[(i + 1) % 8];
      if (i === 0) { b.wall(70, 9, c[0], c[1], WT); continue; }
      if (i === 7) { b.wall(a[0], a[1], 70, -9, WT); continue; }
      if (i === 5) {
        const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
        b.wall(a[0], a[1], (a[0] + mx) / 2 + (mx - a[0]) * 0.3, (a[1] + mz) / 2 + (mz - a[1]) * 0.3, WT, { brokenB: true });
        b.wall((c[0] + mx) / 2 + (mx - c[0]) * 0.3, (c[1] + mz) / 2 + (mz - c[1]) * 0.3, c[0], c[1], WT, { brokenA: true });
        b.rubble(mx, mz, 6, 2.4);
        continue;
      }
      b.wall(a[0], a[1], c[0], c[1], WT);
    }
    pts.forEach(([x, z], i) => { if (i !== 0) b.tower(x, z, { r: 5.2, top: TT, shape: i % 2 ? 'round' : 'poly', sides: 8, roof: 'flat' }); });
    b.gatehouse(70, 0, Math.PI / 2, { w: 18, d: 12, top: C + 17, passW: 4.4, passH: 5, towers: 'round', towerR: 3.8, floor: C });
    b.wall(76, -7, 90, -7, C + 7, { thick: 1.6 }); b.wall(76, 7, 90, 7, C + 7, { thick: 1.6 });
    b.gatehouse(92, 0, Math.PI / 2, { w: 14, d: 4, top: C + 10, passW: 4.2, passH: 4.4, towers: 'square', towerR: 2.4, floor: C });

    // ---- the round keep on its motte: four drum towers clustered as a quatrefoil
    const KX = -42, KZ = 18;
    b.mound(KX, KZ, 9, 20, C + 5);
    for (const [dx, dz] of [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]] as const) b.tower(KX + dx, KZ + dz, { r: 4.8, top: C + 26, shape: 'round', roof: 'flat' });
    b.prop('banner', KX + 10, KZ - 8, 0, 1.4, { team: 1 });

    // ---- the ward: the great hall, the chapel, the kitchens
    b.building(10, -30, 0, 34, 9, { style: 'stone', roof: 'lead', floors: 2, flatten: false });
    b.building(26, 26, 0.2, 16, 7, { style: 'stone', roof: 'slate', flatten: false });
    b.building(-10, 34, -0.1, 14, 7, { style: 'timber', roof: 'tile', flatten: false });
    b.paint({ kind: 'line', pts: [[92, 0], [40, 0], [0, 0], [-28, 12]], w: 5 }, 1, 0.8, 2, 0.4);
    b.prop('well', 14, 6, 0, 1);
    b.prop('brazier', 58, -6, 0, 1); b.prop('brazier', 58, 6, 0, 1);
    b.prop('cart', -14, -14, 0.4, 1); b.prop('hay', -10, -18, 0.2, 1);

    // ---- the town below and the besiegers
    village(b, 160, 40, 16, 34);
    b.camp(190, -60, Math.PI / 2, 0, 2, 4);
    b.camp(-40, -170, 0, 0, 2, 3);
    b.prop('trebuchet', 130, -40, 1.4, 1);
    b.prop('cannon', -10, -90, 0, 1.1); b.prop('cannon', 10, -92, 0, 1.1);
    for (const z of [-14, 0, 14]) b.prop('mantlet', 110, z, Math.PI / 2, 1);
    b.path([[92, 0], [120, 0], [160, 40], [190, -60]], 5);
    b.path([[-24, -46], [-30, -110], [-40, -170]], 4);

    b.spawn(1, -20, 2, toward(-20, 2, 190, -60), 22, 10, 'The great ward');
    b.spawn(1, 32, 6, toward(32, 6, 190, -60), 18, 10, 'The gate ward');
    b.spawn(0, 190, -60, toward(190, -60, 92, 0), 30, 12, 'The town camp');
    b.spawn(0, -40, -170, toward(-40, -170, -26, -44), 24, 12, 'The north road');

    b.objective('The Barbican', 'A', 102, 0, 8);
    b.objective('The North Breach', 'B', -26, -50, 8);
    b.objective('The Round Keep', 'C', KX + 12, KZ - 4, 8, 1);
    b.front([102, 0], [-26, -50], [KX + 12, KZ - 4], [120, -40], [-30, -100]);

    b.avoid({ kind: 'ellipse', x: 0, z: 0, rx: 96, rz: 70 });
    ground(b, 'meadow', 100, 150, 26);
    ground(b, 'hillfort', -150, 100, 20);
    ground(b, 'chapel', -160, -60, 18);
    ground(b, 'crossroads', 120, -150, 16);
    fields(b, -220, -60, 140, 220, 34, 0.5);
    fields(b, 40, 220, -230, -160, 34, 0.5);
    woodlandRing(b, { kind: 'rect', x: 0, z: 0, hx: 210, hz: 210 }, 255, 16);

    b.spawn(0, 100, 150, toward(100, 150, 0, 0), 12, 8, 'The south meadow', true);
    b.spawn(0, 120, -150, toward(120, -150, 0, 0), 12, 8, 'The crossroads', true);
    b.spawn(1, -150, 100, toward(-150, 100, 0, 0), 12, 8, 'The hill fort', true);
    b.spawn(1, -146, -54, toward(-146, -54, 0, 0), 12, 8, 'The chapel', true);
    b.bounds(-215, 215, -215, 215);
    b.cinematic(130, 36, 60, 0, 26, 0);
    b.cinematic(-100, 34, -80, -30, 30, 10);
    b.cinematic(0, 46, 110, -40, 30, 18);
    b.cinematic(110, 28, -40, 60, 28, 0);
  },
};
