import type { MapDef, MapBuilder } from '../mapgen';
import type { ArenaShape } from '../../sim/arena';
import { village, fields, woodlandRing } from './common';

// The single-combat arenas: lists and pits raised for trial by combat and the tourney, each a
// walled ring of its own size and shape on open ground. They are offered only for single combat.

function arenaGround(b: MapBuilder, sh: ArenaShape, o: { town?: boolean; tents?: number; trees?: number }) {
  const n = b.noise;
  const big = sh.kind === 'ellipse' ? Math.max(sh.rx, sh.rz) : sh.r / Math.cos(Math.PI / sh.sides);
  b.base((x, z) => 10 + 1.6 * n.fbm(x / 120, z / 120, 4) * Math.min(1, Math.max(0, Math.hypot(x, z) - big - 14) / 30) + 0.2 * n.fbm(x / 8, z / 8, 2));
  b.flatten({ kind: 'circle', x: 0, z: 0, r: big + 10 }, b.h(0, 0), 10, 1);
  b.duelSpot = { x: 0, z: 0 };
  b.avoid({ kind: 'circle', x: 0, z: 0, r: big + 14 });
  // the pavilions of the knights and the heralds' stands about the lists
  const tents = o.tents ?? 6;
  for (let i = 0; i < tents; i++) {
    const a = (i / tents) * Math.PI * 2 + 0.3, d = big + 18 + (i % 2) * 6;
    b.prop(i % 3 === 0 ? 'pavilion' : 'tent', Math.cos(a) * d, Math.sin(a) * d, -a + Math.PI / 2, 1);
    b.prop('banner', Math.cos(a + 0.12) * (d - 4), Math.sin(a + 0.12) * (d - 4), 0, 1.3, { team: i % 2 });
  }
  b.prop('stall', big + 26, -8, 0.4, 1); b.prop('stall', -big - 24, 10, 2.6, 1);
  b.prop('cart', big + 30, 6, 1.2, 1); b.prop('hay', big + 31, 9, 0.2, 1);
  b.prop('rack', -big - 20, -10, 0.8, 1); b.prop('brazier', 0, big + 16, 0, 1); b.prop('brazier', 0, -big - 16, 0, 1);
  if (o.town) village(b, 0, -(big + 70), 12, 28);
  fields(b, 60, 200, 40, 200, 34, 0.5);
  woodlandRing(b, { kind: 'circle', x: 0, z: 0, r: big + 70 }, 220, o.trees ?? 18);
  b.spawn(0, 0, big + 20, Math.PI, 10, 6, 'The north pavilions');
  b.spawn(1, 0, -big - 20, 0, 10, 6, 'The south pavilions');
  b.front([0, 0]);
  b.bounds(-150, 150, -150, 150);
  b.cinematic(big + 22, 14, big + 14, 0, 2, 0);
  b.cinematic(-big - 18, 12, 4, 0, 2, 0);
  b.cinematic(6, 26, -big - 26, 0, 1, 0);
  b.cinematic(0, 5, big * 0.6, 0, 2, -big);
}

const mk = (id: string, name: string, location: string, year: string, blurb: string, history: string, arena: ArenaShape,
  atmosphere: MapDef['atmosphere'], card: MapDef['card'], o: { town?: boolean; tents?: number; trees?: number } = {}): MapDef => ({
  id, name, location, year, blurb, history, arena, atmosphere, card,
  build(b) { arenaGround(b, arena, o); },
});

export const ARENAS: MapDef[] = [
  mk('smithfield', 'The Lists at Smithfield', 'London, outside the walls', 'June, 1467',
    'The long oval lists where the great tourneys of the age were run. Room to circle, room to charge.',
    'In June 1467 Anthony Woodville, Lord Scales, met the Bastard of Burgundy in the lists at Smithfield before Edward IV, the most famous combat of the reign: on horse and then on foot with poleaxes, until the king threw down his staff.',
    { kind: 'ellipse', rx: 17, rz: 10 },
    { sky: 'golden', sunAzimuth: 210, sunElevation: 26, sunIntensity: 5.6, envIntensity: 0.8, exposure: 1.0, fogColor: [0.9, 0.84, 0.72], fogDensity: 0.0018, fogHeight: 20, haze: 0.45, wind: 0.3, grassTint: [1.0, 1.0, 0.86], ambientSound: 'city', dust: 0.2 },
    { sky: ['#f0c27a', '#8aa0b8'], ground: '#a68c5a', silhouette: '#4a3a28' }, { town: true, tents: 8 }),
  mk('bearpit', 'The Bear Pit at Southwark', 'Southwark, over the bridge', 'Winter, 1471',
    'A cramped round pit of a ring across the river from the City. Nowhere to go but forward.',
    'Across London Bridge the Bankside had its bear gardens and baiting rings long before the theatres. In the uneasy winter after Barnet and Tewkesbury, men settled scores there with blades instead of dogs.',
    { kind: 'ellipse', rx: 8.5, rz: 8.5 },
    { sky: 'overcast', sunAzimuth: 200, sunElevation: 20, sunIntensity: 3.2, envIntensity: 0.88, exposure: 1.05, fogColor: [0.7, 0.72, 0.74], fogDensity: 0.003, fogHeight: 18, haze: 0.7, wind: 0.5, grassTint: [0.9, 0.94, 0.86], ambientSound: 'city', dust: 0.1 },
    { sky: ['#848d97', '#c0c7cd'], ground: '#6b5a3e', silhouette: '#2a2522' }, { town: true, tents: 4 }),
  mk('westminster', 'The Great Ring at Westminster', 'Westminster, by the palace', 'Coronation, 1483',
    'A great round arena raised for the coronation tourney. Wide enough for every trick in the fight-books.',
    'Coronations were kept with feasts and jousts. A great ring was raised by Westminster for the crowning of Richard III in July 1483, and the king\'s champion rode into the hall in full harness to challenge any who denied him.',
    { kind: 'ellipse', rx: 15, rz: 15 },
    { sky: 'noon', sunAzimuth: 150, sunElevation: 52, sunIntensity: 5.8, envIntensity: 0.82, exposure: 1.0, fogColor: [0.78, 0.82, 0.86], fogDensity: 0.0015, fogHeight: 24, haze: 0.35, wind: 0.25, grassTint: [1.0, 1.02, 0.88], ambientSound: 'city', dust: 0.15 },
    { sky: ['#a7bcd2', '#e4eaf0'], ground: '#8f7d55', silhouette: '#3a332a' }, { tents: 10 }),
  mk('pleasance', 'The Octagon of the Pleasance', 'Kenilworth, beyond the mere', 'Autumn, 1459',
    'An eight-sided yard of the Lancastrian pleasure-garden, walled for the duel. Its corners are a trap.',
    'Henry V built a moated banqueting house, the Pleasance in the Marsh, across the mere from Kenilworth. The court of Henry VI and Margaret of Anjou kept it as a retreat, and its walled yards made a fitting ground for a quarrel of honour.',
    { kind: 'poly', sides: 8, r: 11, rot: Math.PI / 8 },
    { sky: 'sunset', sunAzimuth: 250, sunElevation: 12, sunIntensity: 4.6, envIntensity: 0.72, exposure: 1.0, fogColor: [0.88, 0.7, 0.58], fogDensity: 0.002, fogHeight: 20, haze: 0.5, wind: 0.3, grassTint: [1.04, 0.98, 0.84], ambientSound: 'meadow', dust: 0.12 },
    { sky: ['#f2a46a', '#5f6f92'], ground: '#7a6a44', silhouette: '#3a2420' }, { tents: 6, trees: 24 }),
  mk('tiltyard', 'The Square Yard of the Tower', 'The Tower of London, the inmost ward', 'Spring, 1471',
    'A square walled yard by the White Tower: no curve to circle, four corners to pin a man in.',
    'Trial by combat survived in the law of arms. The Court of Chivalry could order a duel to settle a charge of treason, and such fights were fought in the king\'s presence within a set field, from which no combatant could withdraw without being held to have lost.',
    { kind: 'poly', sides: 4, r: 10, rot: 0 },
    { sky: 'dawn', sunAzimuth: 95, sunElevation: 14, sunIntensity: 3.6, envIntensity: 0.8, exposure: 1.05, fogColor: [0.84, 0.8, 0.76], fogDensity: 0.0024, fogHeight: 20, haze: 0.6, wind: 0.35, grassTint: [0.96, 1.0, 0.88], ambientSound: 'city', dust: 0.1 },
    { sky: ['#e7b48c', '#7f93a8'], ground: '#6e6450', silhouette: '#2c2926' }, { town: true, tents: 4 }),
  mk('bruges', 'The Hexagon of the Golden Tree', 'Bruges, Flanders', 'July, 1468',
    'A broad six-sided ring raised in the market square for the Burgundian wedding feast. Plenty of room, six corners.',
    'When Margaret of York married Charles the Bold in 1468, Bruges held the Tournament of the Golden Tree, ten days of jousts and combats on foot before the Burgundian court, the most splendid tourney of the age.',
    { kind: 'poly', sides: 6, r: 13.5, rot: Math.PI / 2 },
    { sky: 'golden', sunAzimuth: 240, sunElevation: 22, sunIntensity: 5.6, envIntensity: 0.8, exposure: 1.0, fogColor: [0.92, 0.84, 0.7], fogDensity: 0.0018, fogHeight: 20, haze: 0.45, wind: 0.25, grassTint: [1.0, 1.0, 0.86], ambientSound: 'city', dust: 0.18 },
    { sky: ['#f2c27a', '#8aa0b8'], ground: '#9a8456', silhouette: '#4a3a28' }, { town: true, tents: 10 }),
  mk('calais', 'The Wedge at Calais', 'The Pale of Calais', 'Spring, 1460',
    'A small three-cornered yard in the town\'s defences. Its sharp corners close on a retreating man.',
    'Calais was England\'s last foothold in France and Warwick\'s base. In 1460 the Yorkist earls sailed from there to win the battle of Northampton, and its garrison of seasoned soldiers settled their quarrels within the walls.',
    { kind: 'poly', sides: 3, r: 10, rot: Math.PI / 2 },
    { sky: 'overcast', sunAzimuth: 200, sunElevation: 22, sunIntensity: 3.4, envIntensity: 0.86, exposure: 1.05, fogColor: [0.72, 0.76, 0.8], fogDensity: 0.0026, fogHeight: 20, haze: 0.65, wind: 0.75, grassTint: [0.9, 0.96, 0.86], ambientSound: 'coast', dust: 0.06 },
    { sky: ['#868f99', '#c3cad0'], ground: '#6a5f48', silhouette: '#2a2622' }, { tents: 4 }),
  mk('eltham', 'The Narrow Lists at Eltham', 'Eltham Palace, Kent', 'Christmas, 1480',
    'A long, narrow lane of a ring, forty metres from end to end and only thirteen across. Fight forward or be driven down it.',
    'Edward IV rebuilt Eltham Palace and kept his Christmas there in splendour, with two thousand guests at table. Its long tiltyard ran beside the great hall he built in the 1470s.',
    { kind: 'ellipse', rx: 6.5, rz: 20 },
    { sky: 'sunset', sunAzimuth: 255, sunElevation: 8, sunIntensity: 4.2, envIntensity: 0.7, exposure: 1.02, fogColor: [0.9, 0.72, 0.6], fogDensity: 0.0022, fogHeight: 18, haze: 0.55, wind: 0.2, grassTint: [1.02, 0.98, 0.84], ambientSound: 'meadow', dust: 0.1 },
    { sky: ['#f09a66', '#5b6b8f'], ground: '#7a6640', silhouette: '#45281e' }, { tents: 8, trees: 24 }),
  mk('norwich', 'The Five-Sided Yard at Norwich', 'Norwich, by the cathedral close', 'Autumn, 1469',
    'A five-sided yard of flint and stone. Neither round nor square: learn where its walls will trap you.',
    'Norwich was the second city of the realm, and the Paston letters tell of its quarrels. In 1469 the Duke of Norfolk\'s men and the Pastons\' fought over Caister down the road, and old scores were settled in the city.',
    { kind: 'poly', sides: 5, r: 12, rot: -Math.PI / 2 },
    { sky: 'dawn', sunAzimuth: 100, sunElevation: 16, sunIntensity: 3.8, envIntensity: 0.8, exposure: 1.05, fogColor: [0.86, 0.8, 0.74], fogDensity: 0.0022, fogHeight: 20, haze: 0.55, wind: 0.3, grassTint: [0.96, 1.0, 0.86], ambientSound: 'city', dust: 0.1 },
    { sky: ['#e7b48c', '#7f93a8'], ground: '#6e6450', silhouette: '#2c2926' }, { town: true, tents: 6 }),
  mk('coventry', 'The Colossal Ring of Coventry', 'Coventry, the queen\'s city', 'Summer, 1459',
    'The greatest arena of all, forty-two metres across. Room to run, to circle, to wear a heavier man down.',
    'Margaret of Anjou made Coventry the seat of the Lancastrian court in the late 1450s. In 1459 the Parliament of Devils met there to attaint the Yorkist lords, and the city put on pageants and shows to honour the queen.',
    { kind: 'ellipse', rx: 21, rz: 21 },
    { sky: 'noon', sunAzimuth: 140, sunElevation: 54, sunIntensity: 5.8, envIntensity: 0.82, exposure: 1.0, fogColor: [0.78, 0.82, 0.86], fogDensity: 0.0014, fogHeight: 24, haze: 0.35, wind: 0.25, grassTint: [1.0, 1.02, 0.88], ambientSound: 'meadow', dust: 0.15 },
    { sky: ['#a7bcd2', '#e4eaf0'], ground: '#8f7d55', silhouette: '#3a332a' }, { tents: 12 }),
];
