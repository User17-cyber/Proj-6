import type { MapDef } from '../mapgen';
import { village, fields, woodlandRing, ground, toward } from './common';

// Hedingham: the de Veres' great Norman keep, four storeys of ashlar on its mound above the
// Colne valley, ringed by the inner bailey and an outer bailey across a deep dry ditch.
export const hedingham: MapDef = {
  id: 'hedingham',
  name: 'Hedingham Castle',
  location: 'Essex, the Colne valley',
  year: 'Spring, 1471',
  blurb: 'The Earl of Oxford\'s great keep on its mound. Cross the bridge over the dry ditch, take the outer bailey, and storm the keep.',
  history: 'Hedingham was the seat of the de Vere Earls of Oxford, Lancastrians who paid dearly for it: the twelfth earl and his heir were beheaded by Edward IV in 1462. In 1471 the thirteenth earl fought for Lancaster at Barnet, and his lands were forfeit until he led Henry Tudor\'s vanguard at Bosworth.',
  atmosphere: {
    sky: 'noon', sunAzimuth: 160, sunElevation: 48, sunIntensity: 5.6, envIntensity: 0.82, exposure: 1.0,
    fogColor: [0.78, 0.82, 0.86], fogDensity: 0.0016, fogHeight: 24, haze: 0.38, wind: 0.3,
    grassTint: [1.0, 1.04, 0.86], ambientSound: 'meadow', dust: 0.12,
  },
  card: { sky: ['#a6bad0', '#e3e9ef'], ground: '#5c6638', silhouette: '#33302b' },
  build(b) {
    const n = b.noise;
    const C = 18;
    b.base((x, z) => 12 + 2 * n.fbm(x / 140, z / 140, 4) + 0.3 * n.fbm(x / 8, z / 8, 2));
    b.plateau({ kind: 'circle', x: 0, z: 0, r: 44 }, C, 8, 0.4);
    b.flatten({ kind: 'circle', x: 0, z: 0, r: 40 }, C, 3);
    // the dry ditch between the baileys, and the brick bridge over it
    b.carve({ kind: 'line', pts: [[-60, 42], [0, 46], [60, 42]], w: 8 }, C - 6, 3);
    b.bridge(0, 40, 0, 52, 5, C, { style: 'stone' });
    b.flatten({ kind: 'rect', x: 0, z: 75, hx: 50, hz: 22 }, C, 8);

    const WT = C + 9, TT = C + 13;
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 10; pts.push([Math.cos(a) * 38, Math.sin(a) * 36]); }
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % 10];
      if (i === 1) { b.wall(p[0], p[1], 8, 37, WT); return; }       // up to the gate
      if (i === 2) { b.wall(-8, 37, q[0], q[1], WT); return; }      // on from the gate
      if (i === 6) {
        // the breach: a gap blown in the curtain, choked with rubble
        const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2, dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz);
        b.wall(p[0], p[1], mx - (dx / l) * 3.5, mz - (dz / l) * 3.5, WT, { brokenB: true });
        b.wall(mx + (dx / l) * 3.5, mz + (dz / l) * 3.5, q[0], q[1], WT, { brokenA: true });
        b.rubble(mx, mz, 5, 2.2);
        return;
      }
      b.wall(p[0], p[1], q[0], q[1], WT);
    });
    pts.forEach(([x, z], i) => { if (i % 2 === 0 && i !== 2) b.tower(x, z, { r: 3.8, top: TT, shape: 'round', roof: 'flat' }); });
    b.gatehouse(0, 37, 0, { w: 16, d: 8, top: C + 14, passW: 4, passH: 4.6, towers: 'none', floor: C });
    // the great keep on its mound
    b.mound(-4, -6, 14, 26, C + 3);
    b.keep(-4, -6, 0, 20, 22, C + 3 + 34, 'square', 'ashlar');
    b.building(22, 8, Math.PI / 2, 20, 8, { style: 'stone', roof: 'tile', floors: 2, flatten: false });
    b.prop('banner', 14, 20, 0, 1.4, { team: 0 });
    b.prop('well', 18, -16, 0, 1);
    // the outer bailey: barns and the household's lodgings
    b.building(-28, 78, 0, 22, 8, { style: 'timber', roof: 'thatch' });
    b.building(28, 80, 0, 18, 7, { style: 'timber', roof: 'tile' });
    b.palisade([[-50, 96], [50, 96]], 3);
    b.prop('cart', 10, 70, 0.5, 1); b.prop('hay', 14, 74, 0.2, 1);

    village(b, 0, 160, 14, 30);
    b.camp(150, 120, Math.PI / 2, 1, 2, 4);
    b.camp(-150, 120, -Math.PI / 2, 1, 2, 3);
    b.prop('cannon', 60, 110, 2.4, 1.1); b.prop('cannon', -60, 110, -2.4, 1.1);
    b.path([[0, 52], [0, 100], [0, 160]], 5);
    b.path([[0, 130], [150, 120]], 4); b.path([[0, 130], [-150, 120]], 4);

    b.spawn(0, 16, 0, toward(16, 0, 150, 120), 14, 10, 'The inner bailey');
    b.spawn(0, 0, 72, toward(0, 72, 150, 120), 24, 10, 'The outer bailey');
    b.spawn(1, 150, 120, toward(150, 120, 0, 52), 28, 12, 'The eastern camp');
    b.spawn(1, -150, 120, toward(-150, 120, 0, 52), 24, 12, 'The western camp');

    b.objective('The Outer Bailey', 'A', 0, 80, 10);
    b.objective('The Ditch Bridge', 'B', 0, 56, 7);
    b.objective('The Great Keep', 'C', 14, 6, 9, 0);
    b.front([0, 80], [0, 56], [14, 6], [-30, -30], [80, 110]);

    b.avoid({ kind: 'circle', x: 0, z: 20, r: 90 });
    ground(b, 'meadow', 140, -100, 24);
    ground(b, 'hillfort', -150, -90, 20);
    ground(b, 'chapel', 160, 20, 18);
    ground(b, 'crossroads', -160, 20, 16);
    fields(b, -220, 220, -230, -150, 34, 0.5);
    woodlandRing(b, { kind: 'rect', x: 0, z: 0, hx: 210, hz: 210 }, 255, 18);

    b.spawn(1, 140, -100, toward(140, -100, 0, 0), 12, 8, 'The east meadow', true);
    b.spawn(0, -150, -90, toward(-150, -90, 0, 0), 12, 8, 'The hill fort', true);
    b.spawn(1, -160, 20, toward(-160, 20, 0, 0), 12, 8, 'The crossroads', true);
    b.bounds(-215, 215, -215, 215);
    b.cinematic(90, 40, 110, 0, 34, 0);
    b.cinematic(-90, 36, -80, 0, 36, 0);
    b.cinematic(30, 28, 90, 0, 24, 40);
    b.cinematic(80, 30, -30, -4, 40, -6);
  },
};
