import type { MapDef } from '../mapgen';
import { village, fields, woodlandRing, ground } from './common';

// Bodiam: a quadrangular castle rising from a broad moat. Two bridges and a siege
// causeway lead in; the armies camp on the north and south banks.
export const bodiam: MapDef = {
  id: 'bodiam',
  name: 'Bodiam Castle',
  location: 'Rother Valley, East Sussex',
  year: 'Autumn, 1483',
  blurb: 'A moated jewel of a castle, its towers mirrored in still water. Hold the bridges, storm the breach.',
  history: 'Built in 1385 by Sir Edward Dalyngrigge, Bodiam was held in 1483 by Sir Thomas Lewknor for Buckingham\'s rebellion. King Richard III sent the Earl of Surrey to besiege it.',
  atmosphere: {
    sky: 'golden', sunAzimuth: 150, sunIntensity: 6.1, envIntensity: 0.68, exposure: 0.95,
    fogColor: [0.78, 0.74, 0.66], fogDensity: 0.0012, fogHeight: 25, haze: 0.35, wind: 0.35,
    grassTint: [1.0, 0.98, 0.86], ambientSound: 'meadow', dust: 0.25,
  },
  card: { sky: ['#f3c97c', '#7aa3c9'], ground: '#4c5b2a', silhouette: '#2d2a26' },
  build(b) {
    const n = b.noise;
    const COURT = 4.4;
    const WATER = 1.8;
    b.base((x, z) => 5.2 + 3.2 * n.fbm(x / 170, z / 170, 4) + 0.35 * n.fbm(x / 9, z / 9, 3) - z * 0.012 + Math.max(0, Math.abs(x) - 120) * 0.05);

    // moat and the castle island
    b.carve({ kind: 'rect', x: 0, z: -6, hx: 74, hz: 60 }, -1.4, 7);
    b.water(WATER, -84, 84, -74, 62, 'moat');
    b.plateau({ kind: 'rect', x: 0, z: 0, hx: 27.5, hz: 25.5 }, COURT, 2.5);
    b.flatten({ kind: 'rect', x: 0, z: 0, hx: 24, hz: 22 }, COURT, 0);
    // barbican island on the north approach
    b.plateau({ kind: 'circle', x: 0, z: -52, r: 7.5 }, COURT - 0.2, 3, 0.2);
    b.flatten({ kind: 'circle', x: 0, z: -52, r: 6.5 }, COURT, 1.5);
    // siege causeway of earth and fascines across the east moat to the breach
    b.plateau({ kind: 'line', pts: [[29, -10], [80, -10]], w: 9 }, COURT - 0.3, 4, 0.3);
    b.flatten({ kind: 'line', pts: [[29, -10], [74, -10]], w: 7 }, COURT - 0.2, 2, 0.8);
    // bridge landings on the banks
    b.flatten({ kind: 'rect', x: 0, z: -78, hx: 6, hz: 8 }, COURT, 12);
    b.flatten({ kind: 'rect', x: 0, z: 66, hx: 6, hz: 8 }, COURT, 12);

    // ---- the castle
    const WT = COURT + 12, TT = COURT + 17;
    b.gatehouse(0, -24, 0, { w: 16, d: 10, top: COURT + 18, passW: 4.4, passH: 5, towers: 'square', towerR: 3.1, floor: COURT });
    b.gatehouse(0, 24.5, Math.PI, { w: 11, d: 8, top: COURT + 15, passW: 3.6, passH: 4.3, towers: 'none', floor: COURT });
    b.wall(-25, -23, -8.2, -23, WT);
    b.wall(8.2, -23, 25, -23, WT);
    b.wall(25, -23, 25, -14.5, WT, { brokenB: true });
    b.wall(25, -5.5, 25, 0, WT, { brokenA: true });
    b.wall(25, 0, 25, 23, WT);
    b.wall(25, 23, 5.6, 23, WT);
    b.wall(-5.6, 23, -25, 23, WT);
    b.wall(-25, 23, -25, -23, WT);
    for (const [x, z] of [[-25, -23], [25, -23], [25, 23], [-25, 23]] as const) b.tower(x, z, { r: 5.2, top: TT, shape: 'round', roof: 'flat' });
    b.tower(25.6, 0, { r: 3.6, top: TT - 1, shape: 'square', roof: 'flat' });
    b.tower(-25.6, 0, { r: 3.6, top: TT - 1, shape: 'square', roof: 'flat' });
    b.rubble(26.5, -10, 6.5, 2.6);

    // inner ranges
    // south range split by the screens passage that leads to the postern
    b.building(-10.5, 15.5, 0, 16, 7, { style: 'stone', roof: 'lead', floors: 2, flatten: false });
    b.building(10.5, 15.5, 0, 16, 7, { style: 'stone', roof: 'lead', floors: 2, flatten: false });
    b.building(-18.5, -1, Math.PI / 2, 26, 7, { style: 'stone', roof: 'slate', floors: 2, flatten: false });
    b.building(18.5, 6, Math.PI / 2, 14, 7, { style: 'stone', roof: 'slate', floors: 2, flatten: false });
    b.paint({ kind: 'rect', x: 0, z: -2, hx: 15, hz: 13 }, 1, 0.75, 2, 0.6);
    b.paint({ kind: 'rect', x: 0, z: -2, hx: 13, hz: 11 }, 0, 0.6, 4, 0.9);
    b.prop('well', -3, -4, 0, 1);
    b.prop('cart', 7, -7, 0.5, 1);
    b.prop('hay', 9.5, -4, 0.2, 1); b.prop('hay', 10, -2.6, 1.4, 0.9);
    b.prop('barrel', -12, -12, 0, 1); b.prop('barrel', -11.3, -12.8, 0, 1); b.prop('crate', -12.4, -10.8, 0.3, 1);
    b.prop('brazier', 4.5, -16, 0, 1); b.prop('brazier', -4.5, -16, 0, 1);
    b.prop('rack', -10, 8.5, 0, 1);
    b.prop('banner', 0, 9.5, 0, 1.3, { team: 0 });

    // bridges
    b.bridge(0, -29, 0, -45, 6, COURT, { style: 'wood' });
    b.bridge(0, -59, 0, -72, 6, COURT, { style: 'stone' });
    b.bridge(0, 28.5, 0, 59, 5.5, COURT, { style: 'wood' });
    b.prop('torch', 3.4, -46, 0, 1); b.prop('torch', -3.4, -46, 0, 1);
    b.prop('banner', 4, -56, 0, 1.1, { team: 0 });

    // causeway debris
    for (let x = 34; x < 74; x += 6) b.prop('logs', x + b.rng.range(-1, 1), -10 + b.rng.range(-3.2, 3.2), b.rng.range(-0.4, 0.4), 0.9);
    b.prop('ladder', 33, -14, 1.5, 1);

    // ---- siege lines (York, north) and the relief camp (Lancaster, south)
    b.path([[0, -132], [0, -100], [0, -80]], 5);
    b.path([[0, 70], [0, 100], [0, 132]], 5);
    b.path([[-8, -96], [-60, -98], [-118, -70], [-130, -20]], 4);
    b.path([[80, -10], [96, -30], [92, -80]], 4);
    b.camp(-46, -120, Math.PI, 1, 2, 4);
    b.camp(48, 120, 0, 0, 2, 4);
    b.prop('trebuchet', 38, -100, Math.PI, 1);
    for (const x of [-24, -12, 12, 24]) b.prop('mantlet', x, -82 - Math.abs(x) * 0.05, Math.PI, 1);
    b.prop('cannon', -34, -86, Math.PI - 0.15, 1);
    b.prop('cannon', 30, -88, Math.PI + 0.2, 1);
    b.prop('stakes', -16, 84, 0, 1); b.prop('stakes', 16, 84, 0, 1); b.prop('stakes', 30, 86, 0.2, 1);
    b.prop('mantlet', -28, 82, 0, 1); b.prop('mantlet', 28, 80, 0, 1);

    b.spawn(1, 0, -120, Math.PI, 36, 10, 'The siege lines');
    b.spawn(0, 0, 120, 0, 36, 10, 'The relief camp');

    b.objective('The North Barbican', 'A', 0, -52, 8);
    b.objective('Inner Court', 'B', 0, -3, 10);
    b.objective('Postern Bridge', 'C', 0, 65, 9);
    b.front([0, -52], [0, -2], [0, 64], [55, -10]);

    // ---- countryside
    village(b, -150, 10, 10, 22);
    b.front([-150, 10]);
    ground(b, 'meadow', 158, 40, 26);
    ground(b, 'hillfort', -150, -128, 20);
    ground(b, 'chapel', 146, -140, 18);
    ground(b, 'crossroads', -138, 146, 20);
    ground(b, 'meadow', 10, 168, 22);
    b.avoid({ kind: 'rect', x: 0, z: -6, hx: 82, hz: 70 });
    fields(b, -125, -90, -130, 130, 40, 0.45);
    fields(b, 95, 125, -130, 130, 40, 0.5);
    // copses inside the field of battle, and the wildwood beyond it
    b.forest({ kind: 'rect', x: 165, z: -60, hx: 22, hz: 30 }, 40, { minSpacing: 6 });
    b.forest({ kind: 'rect', x: -170, z: 80, hx: 18, hz: 24 }, 30, { minSpacing: 6 });
    b.forest({ kind: 'rect', x: 230, z: 0, hx: 24, hz: 250 }, 160, { minSpacing: 5 });
    b.forest({ kind: 'rect', x: -230, z: 0, hx: 24, hz: 250 }, 140, { minSpacing: 6 });
    b.forest({ kind: 'rect', x: 0, z: -228, hx: 250, hz: 24 }, 140, { minSpacing: 6 });
    b.forest({ kind: 'rect', x: 0, z: 228, hx: 250, hz: 24 }, 120, { minSpacing: 6 });
    woodlandRing(b, { kind: 'rect', x: 0, z: 0, hx: 202, hz: 202 }, 255, 40);
    for (const [x, z] of [[-70, -95], [64, -104], [-90, 95], [86, 88], [-100, -40], [104, 40], [-58, 100], [70, -120]] as const) b.tree(x, z, b.rng.range(1.1, 1.5), 0);

    // further mustering places a player may choose to return at
    b.spawn(1, -150, -120, -2.246, 12, 8, 'The hill fort', true);
    b.spawn(1, 134, -140, 2.378, 12, 8, 'The ruined chapel', true);
    b.spawn(0, -126, 146, -0.712, 12, 8, 'The crossroads', true);
    b.spawn(0, 10, 168, 0.059, 12, 8, 'The south meadow', true);
    b.spawn(0, -150, 10, -1.504, 12, 8, 'The village', true);
    b.bounds(-200, 200, -198, 198);
    b.cinematic(-70, 26, -90, 0, 10, -5);
    b.cinematic(85, 14, 40, 0, 8, 0);
    b.cinematic(-40, 9, 70, 0, 8, -10);
    b.cinematic(30, 30, -150, 0, 6, -40);
  },
};
