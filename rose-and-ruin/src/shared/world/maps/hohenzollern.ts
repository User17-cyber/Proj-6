import type { MapDef } from '../mapgen';
import { village, ground, toward } from './common';

// Hohenzollern: the counts' fortress rebuilt on a vast scale after its razing in 1423, raised
// here as a white palace of the Swabian Alb: a narrow ridge crowned with pale limestone, a tall
// palace under a steep slate roof, slender towers with needle spires, and a red gatehouse at the
// foot of the ridge, the wooded slopes falling away into a sea of cloud with the snow-capped
// mountains beyond.
export const hohenzollern: MapDef = {
  id: 'hohenzollern',
  name: 'Burg Hohenzollern',
  location: 'Swabia, the Holy Roman Empire',
  year: 'Autumn, 1461',
  blurb: 'A white palace of slender towers and needle spires on a ridge above the clouds, the Alps white on the horizon. Storm the red gatehouse, force the inner gate and take the palace.',
  history: 'Razed by the Swabian cities in 1423, the Zollern counts\' castle was raised again from 1454, larger and finer than before. German men-at-arms and hand-gunners from these hills sold their swords across Europe; within a generation Martin Schwartz would lead two thousand of them to fight for the Yorkist pretender at Stoke.',
  atmosphere: {
    sky: 'overcast', sunAzimuth: 220, sunElevation: 34, sunIntensity: 2.6, envIntensity: 0.8, exposure: 1.1,
    fogColor: [0.66, 0.7, 0.75], fogDensity: 0.0028, fogHeight: 40, haze: 0.7, wind: 0.85,
    grassTint: [0.86, 0.94, 0.86], ambientSound: 'wind', dust: 0.03, rain: 0.6,
    alps: 900, cloudSea: 42,
  },
  card: { sky: ['#7a8794', '#b9c3cc'], ground: '#2f3e2c', silhouette: '#e6e2d8' },
  build(b) {
    const n = b.noise;
    const C = 84;
    // a long narrow ridge running east and west, its flanks falling steeply into the valleys
    b.base((x, z) => {
      const d = Math.hypot(x * 0.62, z * 1.15);
      const t = Math.min(1, Math.max(0, (d - 48) / 170));
      const s = t * t * (3 - 2 * t);
      return 10 + 74 * (1 - s) + 4 * n.fbm(x / 90, z / 90, 4) * s + 0.3 * n.fbm(x / 8, z / 8, 2);
    });
    b.flatten({ kind: 'ellipse', x: 0, z: 0, rx: 80, rz: 40 }, C, 8);

    const L = { style: 'limestone' as const };
    // ---- the curtain along the edge of the ridge, with slender spired towers at each angle
    const ring: [number, number][] = [];
    for (let i = 0; i < 12; i++) { const a = ((i + 0.5) / 12) * Math.PI * 2; ring.push([Math.cos(a) * 72, Math.sin(a) * 34]); }
    const WT = C + 12;
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % 12];
      if (i === 11) {
        // the red gatehouse closes the east end of the ridge
        b.gatehouse((p[0] + q[0]) / 2 + 1, (p[1] + q[1]) / 2, -Math.PI / 2, { w: 20, d: 10, top: C + 16, passW: 4.8, passH: 5.4, towers: 'round', towerR: 2.8, style: 'red', floor: C });
        return;
      }
      if (i === 3) {
        // a stretch of the north curtain fallen into the valley: a second way in
        const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
        b.wall(p[0], p[1], p[0] + (mx - p[0]) * 0.45, p[1] + (mz - p[1]) * 0.45, WT, { ...L, brokenB: true });
        b.wall(q[0] + (mx - q[0]) * 0.45, q[1] + (mz - q[1]) * 0.45, q[0], q[1], WT, { ...L, brokenA: true });
        b.rubble(mx, mz + 1.5, 4, 1.6, 'limestone');
        return;
      }
      b.wall(p[0], p[1], q[0], q[1], WT, L);
    });
    ring.forEach(([x, z], i) => {
      if (i === 0 || i === 11) return; // the gatehouse stands between these
      b.tower(x, z, { r: 3.2, top: C + 20 + (i % 3) * 4, shape: 'round', roof: 'cone', style: 'limestone', spire: 1.9 });
    });

    // ---- the inner gate: a wall across the ridge between the lower and the upper court
    const IT = C + 15;
    b.wall(-26, -31.4, -26, -9.5, IT, L);
    b.wall(-26, 9.5, -26, 31.4, IT, L);
    b.gatehouse(-26, 0, -Math.PI / 2, { w: 19, d: 8, top: C + 26, passW: 4.4, passH: 5.4, towers: 'round', towerR: 2.8, style: 'limestone', floor: C });

    // ---- the upper court: the palace, its tall stair tower and the great round tower
    b.building(-50, 0, 0, 15, 30, { style: 'palace', roof: 'slate', floors: 8, flatten: false });
    b.tower(-40, -16.5, { r: 2.8, top: C + 46, shape: 'round', roof: 'cone', style: 'limestone', spire: 2.6 });
    b.tower(-41, 16.5, { r: 3.3, top: C + 38, shape: 'round', roof: 'cone', style: 'limestone', spire: 2.1 });
    b.tower(-18, -19, { r: 5.4, top: C + 40, shape: 'round', roof: 'cone', style: 'limestone', spire: 1.6, turret: true });
    b.tower(-60, -17, { r: 2.2, top: C + 34, shape: 'poly', sides: 8, roof: 'cone', style: 'limestone', spire: 2.4 });

    // ---- the lower court: the knights' house and the bower, the stables against the curtain
    b.building(10, -19, 0, 28, 10, { style: 'palace', roof: 'slate', floors: 3, flatten: false });
    b.building(12, 19, 0, 24, 9, { style: 'palace', roof: 'slate', floors: 3, flatten: false });
    b.tower(28, 19, { r: 2.4, top: C + 30, shape: 'round', roof: 'cone', style: 'limestone', spire: 2.2 });
    b.building(46, -18, -0.3, 14, 7, { style: 'timber', roof: 'tile', flatten: false });
    b.paint({ kind: 'rect', x: 12, z: 0, hx: 34, hz: 8 }, 1, 0.8, 2, 0.4);
    b.paint({ kind: 'rect', x: -36, z: 0, hx: 10, hz: 12 }, 1, 0.8, 2, 0.4);
    b.prop('well', 4, 2, 0, 1);
    b.prop('banner', -32, 6, 0, 1.6, { team: 1 });
    b.prop('banner', 2, -10, 0, 1.4, { team: 1 });
    b.prop('brazier', -20, 6, 0, 1); b.prop('brazier', -20, -6, 0, 1);
    b.prop('brazier', 58, 6, 0, 1);
    b.prop('cart', 44, 9, 0.6, 1); b.prop('hay', 47, 12, 0.2, 1);

    // ---- the road up the ridge from the east, the village below, the besiegers' camps
    b.path([[80, 0], [104, 10], [128, -8], [150, 6], [190, 30], [215, 60]], 5);
    b.path([[-8, 31], [-12, 70], [-40, 110]], 3);
    village(b, 205, 70, 10, 24);
    b.camp(150, 52, Math.PI, 0, 2, 3);
    b.camp(-30, 120, Math.PI / 2, 0, 2, 3);
    b.prop('cannon', 110, 14, -Math.PI / 2, 1.1); b.prop('cannon', 100, -16, -Math.PI / 2, 1.1);

    b.spawn(1, -34, 13, toward(-34, 13, 80, 0), 8, 6, 'The palace court');
    b.spawn(1, -6, 4, toward(-6, 4, 80, 0), 10, 8, 'The knights\' house');
    b.spawn(0, 150, 6, toward(150, 6, 80, 0), 24, 12, 'The valley road');
    b.spawn(0, -12, 74, toward(-12, 74, -8, 31), 20, 10, 'The northern slope');

    b.objective('The Red Gatehouse', 'A', 86, 0, 8);
    b.objective('The Inner Gate', 'B', -15, 0, 8);
    b.objective('The Palace', 'C', -34, -4, 7, 1);
    b.front([86, 0], [-15, 0], [-34, -4], [-8, 31], [110, 4]);

    b.avoid({ kind: 'ellipse', x: 0, z: 0, rx: 86, rz: 46 });
    ground(b, 'meadow', 130, -70, 20);
    ground(b, 'chapel', -110, -60, 16);
    b.forest({ kind: 'ellipse', x: 0, z: 0, rx: 230, rz: 200 }, 640, { minSpacing: 5, kinds: [0, 0, 2, 1] });
    b.bounds(-215, 215, -215, 215);
    b.cinematic(140, 96, 90, -30, 104, 0);
    b.cinematic(-110, 70, -100, -30, 110, 0);
    b.cinematic(40, 92, -60, -30, 112, 0);
    b.cinematic(30, 90, 10, -40, 100, 0);
    b.cinematic(-6, 66, -118, -46, 108, 0);
  },
};
