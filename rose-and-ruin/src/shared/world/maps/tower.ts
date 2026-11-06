import type { MapDef } from '../mapgen';
import { village } from './common';

// The Tower of London: the White Tower ringed by two curtains and a broad moat on the Thames.
// Fauconberg's Lancastrians force the Byward gate and fight through the wards.
export const tower: MapDef = {
  id: 'tower',
  name: 'The Tower of London',
  location: 'City of London',
  year: 'Evening, 14 May 1471',
  blurb: 'Fight through the wards beneath the White Tower as the sun sets red over the Thames.',
  history: 'In May 1471 Thomas Neville, the Bastard of Fauconberg, led Kentish men and sailors against London for Lancaster. The Yorkist garrison of the Tower sallied out and broke them. Within the week Henry VI died in the Tower.',
  atmosphere: {
    sky: 'sunset', sunAzimuth: 200, sunIntensity: 4.7, envIntensity: 0.65, exposure: 1.05,
    fogColor: [0.8, 0.6, 0.45], fogDensity: 0.0016, fogHeight: 30, haze: 0.55, wind: 0.25,
    grassTint: [1.0, 0.92, 0.8], ambientSound: 'city', dust: 0.2,
  },
  card: { sky: ['#f2a65a', '#5e6f8c'], ground: '#4a4632', silhouette: '#2b2420' },
  build(b) {
    const n = b.noise;
    const G = 10;
    b.base((x, z) => G + 0.4 * n.fbm(x / 60, z / 60, 3) + 0.15 * n.fbm(x / 7, z / 7, 2));
    // moat around the outer curtain, the Thames to the south
    b.carve({ kind: 'rect', x: 0, z: -2, hx: 112, hz: 106 }, 4, 6);
    b.flatten({ kind: 'rect', x: 1, z: -2, hx: 83, hz: 78 }, G, 2);
    b.water(7.4, -118, 118, -112, 108, 'moat');
    b.carve({ kind: 'rect', x: 0, z: 200, hx: 300, hz: 80 }, 1, 20);
    b.water(6, -300, 300, 122, 300, 'river');
    // land west of the moat for the attackers
    b.flatten({ kind: 'rect', x: -140, z: 40, hx: 22, hz: 60 }, G, 10);

    // ---- White Tower
    b.keep(0, 0, 0, 36, 32, G + 27, 'mixed', 'white');
    b.paint({ kind: 'rect', x: 0, z: 0, hx: 24, hz: 22 }, 1, 0.9, 2, 0.4);

    // ---- inner curtain
    const IW = G + 11, IT = G + 16;
    b.wall(-56, -52, 40, -56, IW);
    b.wall(40, -56, 60, -40, IW);
    b.wall(60, -40, 60, 52, IW);
    b.wall(60, 52, 21, 52, IW);
    b.gatehouse(14, 52, Math.PI, { w: 14, d: 10, top: G + 17, passW: 4, passH: 5, towers: 'square', towerR: 3, floor: G });
    b.wall(7, 52, -56, 52, IW);
    b.wall(-56, 52, -56, 30, IW, { brokenB: true });
    b.wall(-56, 14, -56, -52, IW, { brokenA: true });
    for (const [x, z, sq] of [[-56, -52, 0], [40, -56, 1], [60, -40, 0], [60, 52, 1], [-56, 52, 0], [-56, -12, 1], [10, -54, 1], [60, 6, 0], [-25, 52, 1]] as const) {
      b.tower(x, z, { r: sq ? 4 : 4.5, top: IT, shape: sq ? 'square' : 'round', roof: 'flat' });
    }
    b.tower(30, 52, { r: 6, top: IT + 1, shape: 'round', roof: 'flat' }); // Wakefield Tower
    b.rubble(-56.5, 22, 7, 2.6);

    // ---- outer curtain and the Byward gate
    const OW = G + 8, OT = G + 11;
    b.wall(-78, -72, 60, -76, OW);
    b.wall(60, -76, 80, -58, OW);
    b.wall(80, -58, 80, 72, OW);
    b.wall(80, 72, -78, 72, OW);
    b.wall(-78, 72, -78, 66, OW);
    b.gatehouse(-78, 60, Math.PI / 2, { w: 12, d: 9, top: G + 13, passW: 4, passH: 5, towers: 'round', towerR: 3.2, floor: G });
    b.wall(-78, 54, -78, -72, OW);
    for (const [x, z] of [[-78, -72], [60, -76], [80, -58], [80, 72], [-78, 72], [10, -74], [80, 8], [0, 72], [-78, -10]] as const) b.tower(x, z, { r: 3.6, top: OT, shape: 'round', roof: 'flat' });
    // causeway over the moat to the Middle Tower
    b.bridge(-82.6, 60, -113, 60, 6.5, G, { style: 'stone' });
    b.gatehouse(-117, 60, Math.PI / 2, { w: 13, d: 8, top: G + 12, passW: 4.5, passH: 5, towers: 'round', towerR: 3.4, floor: G });
    b.flatten({ kind: 'rect', x: -121, z: 60, hx: 6, hz: 10 }, G, 4);

    // ---- inner ward buildings
    b.building(-38, -38, 0, 10, 20, { style: 'stone', roof: 'slate', wallH: 7, flatten: false }); // St Peter ad Vincula
    b.building(34, 30, 0, 22, 10, { style: 'stone', roof: 'lead', wallH: 8, flatten: false });    // Great Hall
    b.building(-48, 2, Math.PI / 2, 16, 6, { style: 'timber', roof: 'tile', floors: 2, flatten: false });
    b.building(42, -30, 0, 18, 8, { style: 'stone', roof: 'tile', floors: 2, flatten: false });
    b.building(-22, -46, 0, 18, 6, { style: 'timber', roof: 'tile', floors: 2, flatten: false });
    b.paint({ kind: 'rect', x: -30, z: -24, hx: 16, hz: 14 }, 0, 0, 0, 0);
    b.paint({ kind: 'line', pts: [[14, 60], [14, 40], [0, 24]], w: 6 }, 1, 0.9, 1.5, 0.3);
    b.paint({ kind: 'rect', x: 0, z: 62, hx: 78, hz: 8 }, 1, 0.8, 2, 0.5);
    b.paint({ kind: 'rect', x: -67, z: 0, hx: 9, hz: 70 }, 0, 0.7, 2, 0.7);
    // the arsenal: guns, stalls, stores
    b.prop('cannon', 30, -12, Math.PI / 2, 1); b.prop('cannon', 30, -18, Math.PI / 2, 1);
    b.prop('stall', -10, 30, 0.1, 1); b.prop('stall', 22, 22, -0.2, 1);
    b.prop('rack', 40, -18, Math.PI / 2, 1); b.prop('rack', 44, -18, Math.PI / 2, 1);
    for (const [x, z] of [[24, 36], [25, 37], [-36, 30], [-64, 40], [-63, 41.2], [50, 64], [-30, 64], [-31, 65]] as const) b.prop('barrel', x, z, 0, 1);
    b.prop('crate', 23, 38, 0.2, 1); b.prop('crate', -66, 38, 0.6, 1); b.prop('crate', 52, 63, 0.1, 1);
    b.prop('cart', -64, 20, 0.1, 1); b.prop('cart', 30, 63, 1.5, 1);
    for (const [x, z] of [[8, 46], [20, 46], [-72, 58], [-72, 64], [-30, -20], [-18, 22], [22, -22], [8, 66], [40, 66]] as const) b.prop('brazier', x, z, 0, 1);
    b.prop('torch', -86, 56, 0, 1); b.prop('torch', -86, 64, 0, 1);
    b.prop('banner', -26, -26, 0, 1.4, { team: 1 });
    b.prop('well', -14, -26, 0, 1);

    // the City beyond the moat
    village(b, -170, -60, 18, 40, true);
    village(b, -40, -170, 18, 46, true);
    village(b, 160, -60, 16, 40, true);

    b.spawn(0, -140, 60, -Math.PI / 2, 24, 14);
    b.spawn(0, -140, 20, -Math.PI / 2, 24, 14);
    b.spawn(1, -26, -28, Math.PI, 22, 10);
    b.spawn(1, 34, -42, Math.PI, 18, 8);

    b.objective('The Byward Gate', 'A', -68, 62, 8);
    b.objective('The Bloody Tower', 'B', 14, 42, 8);
    b.objective('Tower Green', 'C', -30, -22, 10, 1);
    b.front([-68, 62], [14, 62], [14, 42], [-48, 22], [-30, -22], [-100, 60]);

    b.bounds(-156, 86, -82, 78);
    b.cinematic(-130, 22, 90, -40, 14, 30);
    b.cinematic(70, 30, 66, 0, 18, 0);
    b.cinematic(-60, 14, 40, 14, 12, 50);
    b.cinematic(-20, 34, -70, 0, 20, 0);
  },
};
