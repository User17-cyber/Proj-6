// Painted silhouettes of each castle for map cards and loading screens.

import type { MapDef } from '../../shared/world/mapgen';

function cren(x: number, top: number, w: number, base: number, mh = 2.6): string {
  const n = Math.max(1, Math.round(w / 5));
  const seg = w / (2 * n - 1);
  let d = `M${x.toFixed(1)} ${base} V${top}`;
  for (let i = 0; i < 2 * n - 1; i++) {
    const x1 = x + (i + 1) * seg;
    d += i % 2 === 0 ? ` V${top - mh} H${x1.toFixed(1)} V${top}` : ` H${x1.toFixed(1)}`;
  }
  return d + ` V${base} Z`;
}
const cone = (x: number, top: number, w: number, h: number) => `M${x} ${top} L${x + w / 2} ${top - h} L${x + w} ${top} Z`;
const dome = (x: number, top: number, w: number) => `M${x} ${top} Q${x} ${top - 6} ${x + w / 2} ${top - 9} Q${x + w} ${top - 6} ${x + w} ${top} Z M${x + w / 2 - 0.4} ${top - 9} h0.8 v-4 h-0.8 z`;
const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y} h${w} v${h} h${-w} Z`;
const slit = (x: number, y: number) => `M${x} ${y} h1.2 v4 h-1.2 Z`;

interface Art { castle: string; ground: string; water?: [number, number]; sun: [number, number, number]; trees?: string; reflect?: boolean; waterUnder?: boolean }

const ARTS: Record<string, Art> = {
  bodiam: {
    castle: [cren(40, 58, 120, 88), cren(31, 45, 17, 88), cren(152, 45, 17, 88), cren(70, 52, 10, 88), cren(120, 52, 10, 88),
      cren(87, 40, 11, 88), cren(102, 40, 11, 88), rect(97, 47, 6, 41)].join(' '),
    ground: 'M0 84 C40 82 60 86 100 86 C140 86 170 82 200 84 V118 H0 Z',
    water: [88, 102], sun: [150, 70, 26], reflect: true,
  },
  harlech: {
    castle: [cren(58, 66, 92, 80), cren(70, 50, 72, 72), cren(62, 40, 14, 72), cren(134, 40, 14, 72), cren(66, 32, 6, 40),
      cren(138, 32, 6, 40), cren(91, 34, 11, 72), cren(108, 34, 11, 72), rect(101, 44, 8, 28)].join(' '),
    ground: 'M0 100 C30 98 46 92 56 80 L152 76 C162 82 176 94 200 97 V118 H0 Z',
    sun: [40, 40, 0],
  },
  bamburgh: {
    castle: [cren(42, 66, 118, 80), cren(84, 38, 30, 70), cren(82, 32, 6, 40), cren(110, 32, 6, 40), cren(46, 56, 10, 80), cren(140, 58, 12, 80), cren(60, 62, 14, 80)].join(' '),
    ground: 'M0 104 C18 100 30 90 40 80 L162 76 C168 86 170 98 172 118 H0 Z',
    water: [86, 118], sun: [176, 74, 22], waterUnder: true,
  },
  tower: {
    castle: [cren(20, 72, 160, 92), cren(70, 38, 56, 80), rect(67, 30, 8, 10), rect(121, 30, 8, 10), rect(67, 30, 8, 10), dome(66, 30, 10), dome(120, 30, 10),
      cren(26, 62, 12, 92), cren(160, 62, 12, 92), cren(140, 66, 10, 92), cren(44, 66, 10, 92), slit(84, 48), slit(96, 48), slit(108, 48), slit(84, 60), slit(96, 60), slit(108, 60)].join(' '),
    ground: 'M0 92 C50 90 150 90 200 92 V118 H0 Z',
    water: [100, 118], sun: [40, 78, 24],
  },
  warwick: {
    castle: [cren(62, 66, 104, 92), cren(150, 26, 18, 92, 3), rect(148, 34, 22, 3), cren(70, 34, 16, 92, 3), rect(68, 40, 20, 3), cren(104, 46, 18, 92), cren(96, 56, 8, 92), cren(122, 56, 8, 92), cone(152, 26, 14, 0)].join(' '),
    ground: 'M0 100 C10 92 22 74 40 72 C54 73 60 86 70 94 C120 92 160 92 200 94 V118 H0 Z',
    water: [102, 118], sun: [120, 24, 18],
    trees: 'M24 74 a6 6 0 1 1 12 0 a6 6 0 1 1 -12 0 Z M33 70 a7 7 0 1 1 14 0 a7 7 0 1 1 -14 0 Z M16 80 a5 5 0 1 1 10 0 a5 5 0 1 1 -10 0 Z',
  },
};

let artId = 0;
export function mapArt(def: MapDef, cls = ''): string {
  const a = ARTS[def.id] ?? ARTS.bodiam;
  const [horizon, top] = def.card.sky;
  const id = `ma${artId++}`;
  const water = a.water ? `<rect x="0" y="${a.water[0]}" width="200" height="${a.water[1] - a.water[0]}" fill="url(#${id}w)"/>` : '';
  const reflect = a.reflect && a.water ? `<g transform="translate(0 ${a.water[0] * 2}) scale(1 -1)" opacity=".28" clip-path="url(#${id}c)"><path d="${a.castle}" fill="${def.card.silhouette}"/></g>` : '';
  return `<svg class="${cls}" viewBox="0 0 200 118" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset=".85" stop-color="${horizon}"/></linearGradient>
    <radialGradient id="${id}g" cx="${a.sun[0] / 200}" cy="${a.sun[1] / 118}" r=".5"><stop offset="0" stop-color="#fff6d8" stop-opacity="${a.sun[2] ? 0.95 : 0.25}"/><stop offset=".25" stop-color="${horizon}" stop-opacity=".55"/><stop offset="1" stop-color="${horizon}" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${horizon}" stop-opacity=".65"/><stop offset="1" stop-color="#1d2a33"/></linearGradient>
    <linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${def.card.ground}"/><stop offset="1" stop-color="#0d0c09"/></linearGradient>
    ${a.water ? `<clipPath id="${id}c"><rect x="0" y="${a.water[0]}" width="200" height="40"/></clipPath>` : ''}
  </defs>
  <rect width="200" height="118" fill="url(#${id}s)"/>
  <rect width="200" height="118" fill="url(#${id}g)"/>
  ${a.sun[2] ? `<circle cx="${a.sun[0]}" cy="${a.sun[1]}" r="${(a.sun[2] / 6).toFixed(1)}" fill="#fff7e0" opacity=".9"/>` : ''}
  <path d="M0 80 C30 70 50 76 80 72 C110 68 140 76 170 70 C185 68 195 72 200 72 V100 H0 Z" fill="${def.card.silhouette}" opacity=".28"/>
  ${a.waterUnder ? water : ''}
  <path d="${a.ground}" fill="url(#${id}f)"/>
  ${a.waterUnder ? '' : water}${reflect}
  <path d="${a.castle}" fill="${def.card.silhouette}"/>
  ${a.trees ? `<path d="${a.trees}" fill="${def.card.silhouette}"/>` : ''}
  <rect width="200" height="118" fill="url(#${id}g)" opacity=".25"/>
  </svg>`;
}
