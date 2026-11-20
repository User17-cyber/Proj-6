import type { MapDef } from '../mapgen';
import { village, fields, woodlandRing, ground, toward } from './common';

// Alnwick: the Percys' great border castle above the River Aln. Two baileys ring a central shell
// keep, a circle of half-round towers on the old motte; the barbican faces the town to the south.
export const alnwick: MapDef = {
  id: 'alnwick',
  name: 'Alnwick Castle',
  location: 'Northumberland, the Border',
  year: 'Winter, 1462',
  blurb: 'The Percy stronghold above the Aln, held for King Henry. Storm the barbican or the battered east wall, then break into the shell keep at its heart.',
  history: 'Alnwick was the seat of the Percy earls of Northumberland, Lancastrian to the bone. In the winter of 1462 it held out for Henry VI against Warwick\'s siege, and changed hands again and again in the Northumbrian war of 1461 to 1464 before falling to the Yorkists for good.',
  atmosphere: {
    sky: 'overcast', sunAzimuth: 200, sunElevation: 22, sunIntensity: 3.4, envIntensity: 0.88, exposure: 1.05,
    fogColor: [0.74, 0.77, 0.8], fogDensity: 0.0026, fogHeight: 26, haze: 0.65, wind: 0.75,
    grassTint: [0.9, 0.95, 0.86], ambientSound: 'wind', dust: 0.08,
  },
  card: { sky: ['#8c96a2', '#c9d0d6'], ground: '#4c5a3a', silhouette: '#2c2a28' },
  build(b) {
    const n = b.noise;
    const C = 18;
    b.base((x, z) => 14 + 2.2 * n.fbm(x / 140, z / 140, 4) + 0.3 * n.fbm(x / 8, z / 8, 2) + Math.max(0, z - 80) * 0.02);
    // the Aln runs below the castle to the north
    b.carve({ kind: 'line', pts: [[-270, -112], [-120, -100], [0, -96], [120, -104], [270, -118]], w: 24 }, 5, 10);
    b.water(9.5, -270, 270, -270, 270, 'river');
    b.plateau({ kind: 'poly', pts: [[-86, -62], [66, -66], [84, 0], [66, 60], [-68, 64], [-92, 0]] }, C, 9, 0.4);
    b.flatten({ kind: 'poly', pts: [[-80, -56], [60, -60], [78, 0], [60, 54], [-62, 58], [-86, 0]] }, C, 3);

    // ---- the curtain of the two baileys
    const WT = C + 10, TT = C + 15;
    b.wall(-70, -50, 60, -55, WT); b.wall(60, -55, 75, -10, WT);
    b.wall(75, 10, 60, 50, WT, { brokenA: true }); b.rubble(76, 0, 6, 2.4);
    b.wall(60, 50, 9, 52, WT); b.wall(-9, 52, -60, 55, WT);
    b.wall(-60, 55, -80, 0, WT); b.wall(-80, 0, -70, -50, WT);
    for (const [x, z] of [[-70, -50], [60, -55], [75, -10], [60, 50], [-60, 55], [-80, 0], [0, -53]] as const) b.tower(x, z, { r: 4.6, top: TT, shape: 'round', roof: 'flat' });
    // the barbican and gatehouse toward the town
    b.gatehouse(0, 52, 0, { w: 18, d: 10, top: C + 16, passW: 4.4, passH: 4.8, towers: 'round', towerR: 3.6, floor: C });
    b.wall(-6, 58, -6, 68, C + 7, { thick: 1.6 }); b.wall(6, 58, 6, 68, C + 7, { thick: 1.6 });
    b.gatehouse(0, 70, 0, { w: 14, d: 4, top: C + 10, passW: 4.2, passH: 4.4, towers: 'square', towerR: 2.4, floor: C });
    // the middle wall between the baileys, with its gate
    b.wall(20, -54, 22, -12, C + 9); b.wall(22, 2, 24, 51, C + 9);
    b.prop('torch', 18, -9, 0, 1); b.prop('torch', 18, -1, 0, 1);

    // ---- the shell keep: a ring of half-round towers on the old motte, its gate to the south-east
    const KX = -22, KZ = -6, R = 17;
    const pts: [number, number][] = [];
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + 0.4; pts.push([KX + Math.cos(a) * R, KZ + Math.sin(a) * R]); }
    b.circuit(pts, C + 12, C + 17, { towerR: 3.6, skip: [0], roof: 'flat' });
    b.building(KX - 4, KZ - 5, 0.3, 14, 7, { style: 'stone', roof: 'lead', floors: 2, flatten: false });
    b.prop('well', KX + 4, KZ + 4, 0, 1);
    b.prop('banner', KX + 1, KZ + 1, 0, 1.5, { team: 0 });

    // ---- the outer bailey
    b.building(45, -38, 0, 22, 7, { style: 'stone', roof: 'slate', flatten: false });
    b.building(-45, 38, 0.1, 22, 7, { style: 'timber', roof: 'thatch', flatten: false });
    b.paint({ kind: 'line', pts: [[0, 52], [10, 20], [20, -5], [-5, 5]], w: 5 }, 1, 0.75, 2, 0.5);
    b.prop('cart', 40, 30, 0.6, 1); b.prop('hay', 44, 33, 0.3, 1);
    b.prop('barrel', 50, -20, 0, 1); b.prop('barrel', 50.8, -19, 0, 1); b.prop('crate', 49, -18, 0.3, 1);
    b.prop('brazier', 6, 40, 0, 1); b.prop('brazier', -6, 40, 0, 1);

    // ---- the town to the south and the besiegers
    village(b, -10, 150, 14, 30);
    b.camp(60, 170, Math.PI, 1, 2, 4);
    b.camp(190, 20, Math.PI / 2, 1, 2, 3);
    b.prop('trebuchet', 110, 60, 2.0, 1);
    b.prop('cannon', 100, 0, Math.PI / 2, 1.1); b.prop('cannon', 102, 14, Math.PI / 2, 1.1);
    for (const x of [-12, 0, 12]) b.prop('mantlet', x, 88, 0, 1);
    b.path([[0, 70], [0, 110], [-10, 150]], 5);
    b.path([[75, 0], [130, 10], [190, 20]], 4);

    b.spawn(0, KX, KZ, toward(KX, KZ, 60, 170), 12, 8, 'The shell keep');
    b.spawn(0, 40, 15, toward(40, 15, 190, 20), 22, 10, 'The outer bailey');
    b.spawn(1, 60, 170, toward(60, 170, 0, 70), 30, 12, 'The town camp');
    b.spawn(1, 190, 20, toward(190, 20, 75, 0), 24, 12, 'The east road');

    b.objective('The Barbican', 'A', 0, 80, 8);
    b.objective('The East Breach', 'B', 66, 2, 8);
    b.objective('The Shell Keep', 'C', KX, KZ + 2, 8, 0);
    b.front([0, 80], [66, 2], [KX, KZ], [100, 30], [30, 110]);

    b.avoid({ kind: 'rect', x: -5, z: 0, hx: 92, hz: 76 });
    ground(b, 'meadow', 150, 110, 26);
    ground(b, 'hillfort', -150, 60, 20);
    ground(b, 'chapel', -120, 170, 18);
    ground(b, 'crossroads', 140, -60, 18);
    fields(b, -220, -60, 90, 220, 34, 0.5);
    b.forest({ kind: 'rect', x: 0, z: -180, hx: 220, hz: 50 }, 90, { minSpacing: 6 });
    woodlandRing(b, { kind: 'rect', x: 0, z: 20, hx: 210, hz: 200 }, 255, 18);

    b.spawn(1, 150, 110, toward(150, 110, 0, 0), 12, 8, 'The south meadow', true);
    b.spawn(1, 140, -60, toward(140, -60, 0, 0), 12, 8, 'The crossroads', true);
    b.spawn(0, -150, 60, toward(-150, 60, 0, 0), 12, 8, 'The hill fort', true);
    b.spawn(0, -112, 156, toward(-112, 156, 0, 0), 12, 8, 'The chapel', true);
    b.bounds(-210, 215, -130, 215);
    b.cinematic(90, 34, 110, 0, 24, 0);
    b.cinematic(-90, 30, -110, -20, 26, 0);
    b.cinematic(0, 30, 120, -22, 28, -6);
    b.cinematic(120, 26, -20, 20, 22, 0);
  },
};
