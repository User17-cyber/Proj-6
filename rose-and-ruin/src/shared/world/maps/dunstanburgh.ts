import type { MapDef } from '../mapgen';
import { fields, woodlandRing, ground, village, toward } from './common';

// Dunstanburgh: Thomas of Lancaster's vast castle on a headland of black whinstone above the North
// Sea. A huge ward walled on its landward sides, the great keep-gatehouse at the south-west, the
// Lilburn Tower watching the north; the cliffs and the sea do the rest.
export const dunstanburgh: MapDef = {
  id: 'dunstanburgh',
  name: 'Dunstanburgh Castle',
  location: 'Northumberland, the coast',
  year: 'Summer, 1464',
  blurb: 'A great ward on a headland above the North Sea. Take the keep-gatehouse, break the battered south curtain, and drive the last Lancastrians from the ward.',
  history: 'Built by Thomas, Earl of Lancaster, Dunstanburgh was a Lancastrian refuge in the north. It changed hands again and again in the 1460s, and in 1464 the Yorkist guns that broke Bamburgh battered its walls into the ruin they have been ever since.',
  atmosphere: {
    sky: 'dawn', sunAzimuth: 75, sunElevation: 12, sunIntensity: 3.8, envIntensity: 0.8, exposure: 1.05,
    fogColor: [0.86, 0.8, 0.74], fogDensity: 0.0021, fogHeight: 28, haze: 0.55, wind: 0.7,
    grassTint: [0.95, 1.0, 0.86], ambientSound: 'coast', dust: 0.08,
  },
  card: { sky: ['#e7b48c', '#7f93a8'], ground: '#4e5c38', silhouette: '#26231f' },
  build(b) {
    const n = b.noise;
    const C = 16;
    // the land falls to the sea on the east
    b.base((x, z) => 11 + 2.2 * n.fbm(x / 130, z / 130, 4) + 0.3 * n.fbm(x / 8, z / 8, 2) - Math.max(0, x - 60) * 0.08);
    b.carve({ kind: 'rect', x: 220, z: 0, hx: 104, hz: 300 }, -3, 26);
    b.water(1.0, 116, 320, -320, 320, 'sea');
    // the whinstone headland
    b.plateau({ kind: 'poly', pts: [[-82, -70], [64, -80], [104, -24], [98, 56], [-78, 66]] }, C, 9, 2.2);
    b.flatten({ kind: 'poly', pts: [[-74, -62], [56, -70], [92, -22], [88, 50], [-70, 58]] }, C, 4, 0.8);

    // ---- the curtain on the landward sides, a breach in the south wall from the guns
    const WT = C + 10;
    b.wall(-72, 57, -50, 56.5, WT); b.wall(-30, 56, 24, 53, WT, { brokenB: true });
    b.wall(40, 52, 88, 48, WT, { brokenA: true }); b.rubble(32, 53, 6.5, 2.6);
    b.wall(-72, 57, -72, -60, WT);
    // only a low, broken wall along the cliff tops
    b.wall(-72, -60, 0, -66, C + 4, { brokenB: true }); b.wall(56, -70, 92, -22, C + 4, { brokenA: true });
    for (const [x, z] of [[88, 48], [-72, 0], [62, 51]] as const) b.tower(x, z, { r: 4.2, top: C + 14, shape: 'square', roof: 'flat' });
    // the great keep-gatehouse with its two drum towers, and the Lilburn Tower
    b.gatehouse(-40, 56, 0, { w: 20, d: 16, top: C + 22, passW: 4.4, passH: 5, towers: 'round', towerR: 5.6, floor: C });
    b.tower(-72, -60, { r: 5.8, top: C + 22, shape: 'square', roof: 'flat', turret: true });
    b.tower(90, -4, { r: 3.8, top: C + 12, shape: 'square', roof: 'flat' }); // the Egyncleugh Tower

    // ---- inside: the vast ward, the inner ward behind the gatehouse, a few ruined buildings
    b.wall(-56, 40, -20, 40, C + 8); b.wall(-56, 40, -56, 20, C + 8); b.wall(-20, 40, -20, 28, C + 8);
    b.building(-40, 30, 0, 22, 8, { style: 'stone', roof: 'slate', floors: 2, flatten: false });
    b.building(20, -40, 0.1, 18, 7, { style: 'ruin', roof: 'none', wallH: 4 });
    b.building(-30, -40, -0.1, 14, 7, { style: 'ruin', roof: 'none', wallH: 4 });
    b.rubble(50, 10, 4, 1.4, 'rubble');
    b.paint({ kind: 'line', pts: [[-40, 64], [-40, 20], [0, 0], [40, 10]], w: 5 }, 0, 0.6, 2, 0.6);
    b.prop('banner', 4, 2, 0, 1.4, { team: 0 });
    b.prop('well', -8, 10, 0, 1);
    b.prop('brazier', -46, 46, 0, 1); b.prop('brazier', -34, 46, 0, 1);
    for (let i = 0; i < 6; i++) b.prop('rock', 70 + b.rng.range(-8, 8), -50 + i * 18, b.rng.range(0, 6), b.rng.range(0.8, 1.6));

    // ---- the landward approaches
    village(b, -150, 110, 10, 26);
    b.camp(-160, 0, -Math.PI / 2, 1, 2, 4);
    b.camp(10, 165, Math.PI, 1, 2, 3);
    b.prop('cannon', -100, 30, -Math.PI / 2, 1.1); b.prop('cannon', 30, 90, Math.PI, 1.1); b.prop('cannon', 40, 92, Math.PI, 1.1);
    for (const x of [-52, -40, -28]) b.prop('mantlet', x, 78, 0, 1);
    for (let i = 0; i < 4; i++) b.prop('boat', 120 + b.rng.range(-2, 2), 60 + i * 20, b.rng.range(-0.3, 0.3), 1);
    b.path([[-40, 70], [-40, 110], [-100, 130], [-160, 0]], 5);
    b.path([[-40, 110], [10, 165]], 4);

    b.spawn(0, -38, 22, toward(-38, 22, 10, 165), 14, 6, 'The inner ward');
    b.spawn(0, 10, 0, toward(10, 0, -160, 0), 26, 12, 'The great ward');
    b.spawn(1, -160, 0, toward(-160, 0, -40, 56), 30, 12, 'The western camp');
    b.spawn(1, 10, 165, toward(10, 165, -40, 56), 26, 12, 'The Embleton road');

    b.objective('The Keep-Gatehouse', 'A', -40, 74, 8);
    b.objective('The South Breach', 'B', 32, 62, 8);
    b.objective('The Great Ward', 'C', 10, -10, 10, 0);
    b.front([-40, 74], [32, 62], [10, -10], [-60, -45], [-100, 40]);

    b.avoid({ kind: 'rect', x: 10, z: 0, hx: 100, hz: 76 });
    ground(b, 'meadow', -120, -110, 26);
    ground(b, 'hillfort', -170, 170, 20);
    ground(b, 'chapel', 60, 150, 18);
    ground(b, 'crossroads', -200, -60, 16);
    fields(b, -230, -90, -230, -150, 34, 0.5);
    fields(b, -120, 40, 100, 140, 30, 0.5);
    woodlandRing(b, { kind: 'rect', x: -60, z: 0, hx: 170, hz: 200 }, 255, 14);

    b.spawn(1, -120, -110, toward(-120, -110, 0, 0), 12, 8, 'The north meadow', true);
    b.spawn(1, -170, 170, toward(-170, 170, 0, 0), 12, 8, 'The hill fort', true);
    b.spawn(0, 50, 136, toward(50, 136, 0, 0), 12, 8, 'The chapel', true);
    b.bounds(-225, 112, -215, 215);
    b.cinematic(140, 30, 40, 0, 22, 0);
    b.cinematic(-120, 28, 80, -30, 26, 20);
    b.cinematic(60, 40, -120, 0, 22, 0);
    b.cinematic(-40, 22, 110, -40, 30, 50);
  },
};
