import type { MapDef } from '../mapgen';
import { village, fields, woodlandRing, ground, toward } from './common';

// Hohenzollern: the counts' fortress on the summit of the Zollerberg in Swabia, rebuilt on a vast
// scale after its razing in 1423. A Gothic crown of tall, steep-roofed towers, curtains and halls
// on a mountain top, the valleys far below lost in rain and cloud.
export const hohenzollern: MapDef = {
  id: 'hohenzollern',
  name: 'Burg Hohenzollern',
  location: 'Swabia, the Holy Roman Empire',
  year: 'Autumn, 1461',
  blurb: 'A Gothic fortress of tremendous size on a mountain top above the clouds. Climb the Zollerberg through the rain, break the lower gate and the Eagle Gate, and take the great keep.',
  history: 'Razed by the Swabian cities in 1423, the Zollern counts\' castle was raised again from 1454, larger and stronger than before. German men-at-arms and hand-gunners from these hills sold their swords across Europe; within a generation Martin Schwartz would lead two thousand of them to fight for the Yorkist pretender at Stoke.',
  atmosphere: {
    sky: 'overcast', sunAzimuth: 220, sunElevation: 30, sunIntensity: 2.2, envIntensity: 0.7, exposure: 1.08,
    fogColor: [0.56, 0.6, 0.64], fogDensity: 0.0042, fogHeight: 60, haze: 0.85, wind: 0.95,
    grassTint: [0.86, 0.94, 0.86], ambientSound: 'wind', dust: 0.04, rain: 0.9,
  },
  card: { sky: ['#6c747c', '#9aa3ab'], ground: '#3c4a34', silhouette: '#22211f' },
  build(b) {
    const n = b.noise;
    const C = 84;
    // the Zollerberg: a great isolated cone rising from wooded hills
    b.base((x, z) => {
      const d = Math.hypot(x * 0.9, z);
      const t = Math.min(1, Math.max(0, (d - 62) / 175));
      const s = t * t * (3 - 2 * t);
      return 10 + 74 * (1 - s) + 3 * n.fbm(x / 90, z / 90, 4) * s + 0.3 * n.fbm(x / 8, z / 8, 2);
    });
    b.flatten({ kind: 'ellipse', x: 0, z: 0, rx: 70, rz: 50 }, C, 8);

    // ---- the outer curtain of the summit, with the lower gate on the south-east
    const WT = C + 13, TT = C + 24, st = { style: 'ashlar' as const };
    const ring: [number, number][] = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ring.push([Math.cos(a) * 62, Math.sin(a) * 43]); }
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % 12];
      if (i === 1) {
        // the lower gate sits in the middle of this stretch of curtain
        const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
        const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
        b.wall(p[0], p[1], mx - ux * 9, mz - uz * 9, WT, st); b.wall(mx + ux * 9, mz + uz * 9, q[0], q[1], WT, st);
        b.gatehouse(mx, mz, -Math.atan2(dz, dx), { w: 18, d: 12, top: C + 22, passW: 4.6, passH: 5.4, towers: 'round', towerR: 4.2, floor: C });
        return;
      }
      if (i === 7) { b.wall(p[0], p[1], q[0], q[1], WT, { ...st, brokenB: true }); return; }
      b.wall(p[0], p[1], q[0], q[1], WT, st);
    });
    ring.forEach(([x, z], i) => b.tower(x, z, { r: 4.8, top: TT + (i % 3 === 0 ? 8 : 0), shape: 'round', roof: 'cone', style: 'ashlar' }));
    b.rubble(-50, -34, 6, 2.6);

    // ---- the inner fortress: a second, higher curtain round the palace, with the Eagle Gate
    const IT = C + 18;
    b.wall(-34, -26, 30, -26, IT, { style: 'white' }); b.wall(30, -26, 36, 0, IT, { style: 'white' });
    b.wall(36, 0, 30, 10, IT, { style: 'white' }); b.wall(30, 22, -34, 24, IT, { style: 'white' });
    b.wall(-34, 24, -40, 0, IT, { style: 'white' }); b.wall(-40, 0, -34, -26, IT, { style: 'white' });
    b.gatehouse(32, 16, Math.PI / 2 - 0.2, { w: 14, d: 8, top: C + 22, passW: 4.2, passH: 5, towers: 'square', towerR: 3, style: 'white', floor: C });
    for (const [x, z] of [[-34, -26], [30, -26], [-34, 24], [-40, 0], [36, 0]] as const) b.tower(x, z, { r: 4.2, top: C + 32, shape: 'round', roof: 'cone', style: 'white', turret: true });
    // the great keep, the counts' hall and the chapel with its spire
    b.keep(-14, -6, 0, 22, 18, C + 44, 'mixed', 'white');
    b.tower(-14, -6, { r: 3, top: C + 58, shape: 'round', roof: 'cone', style: 'white' });
    b.building(14, -16, 0, 26, 10, { style: 'stone', roof: 'slate', floors: 3, flatten: false });
    b.building(10, 14, 0.05, 20, 9, { style: 'stone', roof: 'slate', floors: 2, flatten: false });
    b.tower(22, 14, { r: 2.2, top: C + 30, shape: 'poly', sides: 8, roof: 'cone', style: 'white' });
    b.paint({ kind: 'rect', x: 8, z: 0, hx: 16, hz: 8 }, 1, 0.8, 2, 0.4);
    b.prop('well', 12, 0, 0, 1);
    b.prop('banner', 0, 4, 0, 1.6, { team: 1 });
    b.prop('brazier', 26, 6, 0, 1); b.prop('brazier', 26, 26, 0, 1);
    // the outer ward: stables, barracks and stores against the curtain
    b.building(-48, 12, 1.2, 20, 7, { style: 'stone', roof: 'slate', flatten: false });
    b.building(44, -20, -1.0, 18, 7, { style: 'timber', roof: 'tile', flatten: false });
    b.prop('cart', 48, 10, 0.6, 1); b.prop('hay', 51, 13, 0.2, 1);

    // ---- the road up the mountain, the village at its foot, the besiegers
    b.path([[49, 39], [70, 80], [40, 120], [90, 150], [60, 190], [20, 210]], 5);
    b.path([[-50, -38], [-110, -60], [-170, -30]], 4);
    village(b, 20, 210, 12, 26);
    b.camp(-185, 40, -Math.PI / 2, 0, 2, 4);
    b.camp(90, 200, Math.PI, 0, 2, 3);
    b.prop('cannon', 50, 78, Math.PI, 1.1); b.prop('cannon', -70, -52, -2.2, 1.1);

    b.spawn(1, -6, 14, toward(-6, 14, 90, 200), 14, 8, 'The palace court');
    b.spawn(1, -46, -6, toward(-46, -6, -185, 40), 12, 10, 'The outer ward');
    b.spawn(0, 90, 200, toward(90, 200, 49, 39), 28, 12, 'The valley road');
    b.spawn(0, -185, 40, toward(-185, 40, -50, -34), 28, 12, 'The western camp');

    b.objective('The Lower Gate', 'A', 51, 42, 8);
    b.objective('The Eagle Gate', 'B', 40, 18, 8);
    b.objective('The Great Keep', 'C', 0, 8, 8, 1);
    b.front([51, 42], [40, 18], [0, 8], [-54, -44], [70, 80]);

    b.avoid({ kind: 'ellipse', x: 0, z: 0, rx: 78, rz: 58 });
    ground(b, 'meadow', 150, -120, 24);
    ground(b, 'hillfort', -140, 150, 20);
    ground(b, 'chapel', 170, 60, 18);
    ground(b, 'crossroads', -150, -150, 16);
    fields(b, 120, 220, 120, 220, 30, 0.5);
    b.forest({ kind: 'ellipse', x: 0, z: 0, rx: 220, rz: 220 }, 520, { minSpacing: 6 });
    woodlandRing(b, { kind: 'circle', x: 0, z: 0, r: 225 }, 255, 30);

    b.spawn(0, 150, -120, toward(150, -120, 0, 0), 12, 8, 'The east meadow', true);
    b.spawn(0, 160, 52, toward(160, 52, 0, 0), 12, 8, 'The chapel', true);
    b.spawn(1, -140, 150, toward(-140, 150, 0, 0), 12, 8, 'The hill fort', true);
    b.bounds(-215, 215, -215, 225);
    b.cinematic(150, 70, 150, 0, 100, 0);
    b.cinematic(-110, 120, -90, 0, 95, 0);
    b.cinematic(60, 92, 70, -10, 110, 0);
    b.cinematic(0, 90, 40, -14, 120, -6);
  },
};
