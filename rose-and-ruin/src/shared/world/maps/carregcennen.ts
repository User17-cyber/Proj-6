import type { MapDef } from '../mapgen';
import { village, fields, woodlandRing, ground, toward } from './common';

// Carreg Cennen: a fortress on a sheer limestone crag above the Cennen valley. The cliff guards
// the south; from the north a long walled ramp climbs past the barbican to the inner ward.
export const carregcennen: MapDef = {
  id: 'carregcennen',
  name: 'Carreg Cennen Castle',
  location: 'Carmarthenshire, South Wales',
  year: 'Summer, 1462',
  blurb: 'A crag-top fortress above a sheer cliff. Fight up the walled ramp from the north, through the barbican, and into the inner ward on the brink.',
  history: 'Held for Lancaster by the Thomas brothers after Towton, Carreg Cennen was besieged by the Yorkist Herberts in 1462. When it fell, five hundred men were paid to pull it down with picks and crowbars, so that it could never again shelter rebels.',
  atmosphere: {
    sky: 'golden', sunAzimuth: 280, sunElevation: 20, sunIntensity: 5.2, envIntensity: 0.76, exposure: 1.0,
    fogColor: [0.86, 0.8, 0.68], fogDensity: 0.0022, fogHeight: 30, haze: 0.5, wind: 0.6,
    grassTint: [0.96, 1.02, 0.84], ambientSound: 'wind', dust: 0.08,
  },
  card: { sky: ['#ecb878', '#7b91a8'], ground: '#55602f', silhouette: '#3a3228' },
  build(b) {
    const n = b.noise;
    const C = 44;
    // the crag: a high ridge with a sheer face to the south and a gentler slope to the north
    b.base((x, z) => {
      const crest = 44 - Math.max(0, -z - 40) * 0.24 - Math.abs(x) * 0.02;
      const south = z > 30 ? (z - 30) * 1.6 : 0;
      return Math.max(14, crest - south) + 1.8 * n.fbm(x / 120, z / 120, 4) + 0.25 * n.fbm(x / 8, z / 8, 2);
    });
    b.flatten({ kind: 'rect', x: 0, z: 0, hx: 40, hz: 30 }, C, 4);

    const WT = C + 10, TT = C + 15;
    b.wall(-34, -26, -8, -28, WT); b.wall(8, -28, 34, -26, WT);
    b.wall(34, -26, 36, 26, WT); b.wall(36, 26, -34, 26, WT, { brokenA: true }); b.wall(-34, 26, -34, -26, WT);
    b.gatehouse(0, -28, 0, { w: 16, d: 10, top: C + 16, passW: 4.2, passH: 4.8, towers: 'round', towerR: 3.8, floor: C });
    for (const [x, z] of [[-34, -26], [34, -26], [36, 26], [-34, 26]] as const) b.tower(x, z, { r: 4.6, top: TT, shape: x < 0 && z < 0 ? 'round' : 'square', roof: 'flat' });
    // the barbican ramp from the outer ward
    b.wall(-6, -36, -6, -60, C + 6, { thick: 1.6 }); b.wall(6, -36, 6, -60, C + 6, { thick: 1.6 });
    b.gatehouse(0, -62, 0, { w: 14, d: 4, top: C + 9, passW: 4.2, passH: 4.4, towers: 'none', floor: C - 7 });
    b.earthRamp(0, -36, 0, -66, 10, C, C - 8);
    b.building(-12, 14, 0, 26, 8, { style: 'stone', roof: 'slate', floors: 2, flatten: false });
    b.building(20, 4, Math.PI / 2, 16, 7, { style: 'stone', roof: 'slate', flatten: false });
    b.prop('well', -4, 0, 0, 1); b.prop('banner', 6, -8, 0, 1.4, { team: 0 });
    b.prop('brazier', -6, -18, 0, 1); b.prop('brazier', 6, -18, 0, 1);

    village(b, -30, -150, 12, 26);
    b.camp(40, -180, 0, 1, 2, 4);
    b.camp(-150, -70, -Math.PI / 2, 1, 2, 3);
    b.prop('cannon', 20, -100, 0, 1.1); b.prop('trebuchet', -50, -110, 0.3, 1);
    b.path([[0, -66], [10, -110], [40, -180]], 5);
    b.path([[-34, -40], [-90, -60], [-150, -70]], 4);

    b.spawn(0, -6, 2, toward(-6, 2, 40, -180), 18, 10, 'The inner ward');
    b.spawn(0, 18, -12, toward(18, -12, 40, -180), 10, 8, 'The east range');
    b.spawn(1, 40, -180, toward(40, -180, 0, -66), 28, 12, 'The valley camp');
    b.spawn(1, -150, -70, toward(-150, -70, -34, -30), 24, 12, 'The western track');

    b.objective('The Barbican', 'A', 0, -74, 8);
    b.objective('The Gatehouse', 'B', 0, -40, 7);
    b.objective('The Inner Ward', 'C', 0, -4, 9, 0);
    b.front([0, -74], [0, -40], [0, -4], [-60, -50], [30, -120]);

    b.avoid({ kind: 'rect', x: 0, z: -10, hx: 46, hz: 60 });
    ground(b, 'meadow', 110, -110, 24);
    ground(b, 'hillfort', -120, -170, 20);
    ground(b, 'chapel', 130, -20, 18);
    ground(b, 'crossroads', -140, 10, 16);
    fields(b, -220, -80, -230, -170, 34, 0.5);
    b.forest({ kind: 'rect', x: 0, z: 150, hx: 220, hz: 60 }, 140, { minSpacing: 6 });
    woodlandRing(b, { kind: 'rect', x: 0, z: -40, hx: 200, hz: 190 }, 255, 16);

    b.spawn(1, 110, -110, toward(110, -110, 0, 0), 12, 8, 'The east meadow', true);
    b.spawn(0, -140, 10, toward(-140, 10, 0, 0), 12, 8, 'The crossroads', true);
    b.spawn(0, 120, -12, toward(120, -12, 0, 0), 12, 8, 'The chapel', true);
    b.bounds(-215, 215, -230, 90);
    b.cinematic(90, 70, 80, 0, 50, 0);
    b.cinematic(-80, 60, -90, 0, 48, -20);
    b.cinematic(20, 52, -110, 0, 50, -30);
    b.cinematic(0, 60, 70, 0, 50, 0);
  },
};
