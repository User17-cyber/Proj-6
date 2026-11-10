// Hand-drawn SVG silhouettes for classes, abilities, menus and the kill feed (64x64 grid).
// Front shapes carry a dark outline so overlapping pieces stay legible in a single tint.

const O = 'stroke="#0b0806" stroke-opacity=".75" stroke-width="2.6" paint-order="stroke" stroke-linejoin="round"';
const D = 'fill="#000" fill-opacity=".34"';

function ringSeg(cx: number, cy: number, ri: number, ro: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${p(ro, a0)} A${ro} ${ro} 0 ${large} ${sweep} ${p(ro, a1)} L${p(ri, a1)} A${ri} ${ri} 0 ${large} ${1 - sweep} ${p(ri, a0)} Z`;
}
function arrowHead(cx: number, cy: number, r: number, a: number, dir: number, size: number): string {
  const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
  const tx = -Math.sin(a) * dir, ty = Math.cos(a) * dir; // tangent
  const nx = Math.cos(a), ny = Math.sin(a);
  const f = (v: number) => v.toFixed(2);
  return `M${f(x + nx * size * 0.9)} ${f(y + ny * size * 0.9)} L${f(x + tx * size * 1.3)} ${f(y + ty * size * 1.3)} L${f(x - nx * size * 0.9)} ${f(y - ny * size * 0.9)} Z`;
}

const sword = (tr: string, o = '') => `<g transform="${tr}" ${o}><path d="M32 3 L35 10 V43 H29 V10 Z"/><path d="M19.5 43 H44.5 Q46.2 45 44.5 47 H19.5 Q17.8 45 19.5 43 Z"/><rect x="30" y="47" width="4" height="9.5" rx="1"/><circle cx="32" cy="59.5" r="3.6"/></g>`;
const greatsword = (tr: string) => `<g transform="${tr}"><path d="M32 0 L35.6 7 V39 H28.4 V7 Z"/><path d="M15 39 H49 Q51.5 42 49 45 H15 Q12.5 42 15 39 Z"/><path d="M28.4 45 h7.2 l-1.2 3 h-4.8z"/><rect x="30.1" y="47" width="3.8" height="12" rx="1"/><circle cx="32" cy="61.2" r="2.8"/></g>`;
const heater = (tr: string) => `<g transform="${tr}"><path ${O} d="M10 20 H38 V32 C38 44 31 51 24 57 C17 51 10 44 10 32 Z"/><path ${D} d="M22.2 22 h3.6 v32 h-3.6z M12 31.5 h24 v3.6 h-24z"/></g>`;
const halberd = (tr: string) => `<g transform="${tr}"><rect x="30.4" y="8" width="3.2" height="55" rx="1.2"/><path d="M32 0 L34.8 11 H29.2 Z"/><path d="M33.6 12 C45 9.5 51.5 15.5 53.5 25 C47 27.5 40.5 28.5 33.6 28.5 Z"/><path d="M30.4 15.5 L16.5 20.5 L30.4 24.5 Z"/><rect x="29.6" y="28.5" width="4.8" height="3" rx="1"/></g>`;
const poleaxe = (tr: string) => `<g transform="${tr}"><rect x="30.4" y="10" width="3.2" height="53" rx="1.2"/><path d="M32 0 L34.8 12.5 H29.2 Z"/><path d="M33.6 13.5 H44 V24.5 H33.6 Z"/><path d="M44 13.5 h3.6 v3.6 h-3.6z M44 20.9 h3.6 v3.6 h-3.6z"/><path d="M30.4 14.5 L15 21 L30.4 22.5 Z"/><circle cx="32" cy="31" r="3.4"/></g>`;
const falchion = (tr: string) => `<g transform="${tr}"><path d="M29 44 V13 C29 9 31.5 5.5 34.5 4 C39.5 10.5 41.5 21 38 31 C36.6 36 35.4 40 35.2 44 Z"/><path d="M22.5 44 H41.5 Q43 45.8 41.5 47.5 H22.5 Q21 45.8 22.5 44 Z"/><rect x="30" y="47.5" width="4" height="8.5" rx="1"/><circle cx="32" cy="59" r="3.2"/></g>`;
const bow = (tr: string) => `<g transform="${tr}"><path d="M20 3 Q52.5 32 20 61 L17.6 59.5 Q46 32 17.6 4.5 Z"/><path d="M18.6 4.5 h1.1 v55 h-1.1z"/><path d="M9 31 H53 V33 H9 Z"/><path d="M52 27.5 L62 32 L52 36.5 Z"/><path d="M5 27.5 L14 31 V33 L5 36.5 L8.2 32 Z"/></g>`;
const spear = (tr: string) => `<g transform="${tr}"><rect x="30.6" y="12" width="2.8" height="52" rx="1.1"/><path d="M32 0 C35.5 5 36.2 9 35.2 12.5 L32 15 L28.8 12.5 C27.8 9 28.5 5 32 0 Z"/></g>`;
const mace = (tr: string) => `<g transform="${tr}"><rect x="30.2" y="18" width="3.6" height="34" rx="1.2"/><path d="M32 2 L39 7 L41 14 L39 21 L32 24 L25 21 L23 14 L25 7 Z"/><path ${D} d="M31 4 h2 v18 h-2z M25.5 13 h13 v2 h-13z"/><rect x="29.2" y="52" width="5.6" height="2.6" rx="1"/><rect x="30.3" y="54.6" width="3.4" height="6" rx="1"/><circle cx="32" cy="61.5" r="2.4"/></g>`;
const pavise = (tr: string) => `<g transform="${tr}"><path ${O} d="M13 9 Q13 6 16 6 H38 Q41 6 41 9 L39.5 58 H14.5 Z"/><path ${D} d="M25 8 h4 v49 h-4z"/></g>`;
const billIcon = (tr: string) => `<g transform="${tr}"><rect x="30.4" y="10" width="3.2" height="53" rx="1.2"/><path d="M32 0 L34.6 9 H29.4 Z"/><path d="M33.6 9 C42 10 47 16 46 25 C42 22 38 23 33.6 26 Z"/><path d="M30.4 13 L20 16 L30.4 20 Z"/></g>`;
const longSword = (tr: string) => `<g transform="${tr}"><path d="M32 0 L35 7 V38 H29 V7 Z"/><path d="M18 38 H46 Q48 40.5 46 43 H18 Q16 40.5 18 43 Z"/><rect x="30" y="43" width="4" height="15" rx="1"/><ellipse cx="32" cy="61" rx="3.2" ry="3.6"/></g>`;
const greatAxeIcon = (tr: string) => `<g transform="${tr}"><rect x="30.4" y="12" width="3.2" height="51" rx="1.2"/><path d="M33.6 10 C40 8 47 4 52 6 C55 15 54 26 50 34 C46 29 40 26 33.6 25 Z"/><path d="M30.4 15 L21 19 L30.4 22 Z"/><path d="M32 2 L34.2 11 H29.8 Z"/></g>`;
const shieldPath = 'M12 10 H52 V28 C52 43 43 52 32 59 C21 52 12 43 12 28 Z';
const drop = (x: number, y: number, s: number) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -16 C6 -6 12 1 12 8 A12 12 0 0 1 -12 8 C-12 1 -6 -6 0 -16 Z"/>`;
const arrowDown = (tr: string) => `<g transform="${tr}"><path d="M31 6 H33 V46 H31 Z"/><path d="M27.5 45 L32 56 L36.5 45 Z"/><path d="M28 2 L31 8 H33 L36 2 L32 5 Z"/></g>`;

export const ICONS: Record<string, string> = {
  // ---- classes ----
  manatarms: sword('rotate(38 32 32) translate(5 -1)') + heater('translate(-1 4)'),
  vanguard: greatsword('rotate(38 32 32)'),
  halberdier: halberd('rotate(30 32 32)'),
  banneret: poleaxe('rotate(30 32 32)'),
  longbowman: bow('rotate(-30 32 32)'),
  pavisier: spear('rotate(24 32 32) translate(9 0)') + pavise('translate(-4 1)'),
  bachelor: mace('rotate(36 32 32) translate(6 -2)') + heater('translate(-1 4)'),
  yeoman: billIcon('rotate(26 32 32)'),
  master: longSword('rotate(38 32 32)') + longSword('rotate(-38 32 32)'),
  brigand: greatAxeIcon('translate(6 6) scale(.8) rotate(30 32 32)') + `<path d="M8 40 L22 54 L19 57 L5 43 Z"/>`,
  chaplain: mace('rotate(34 32 32) translate(4 -2)') + `<path ${D} d="M10 14 h4 v-6 h4 v6 h4 v4 h-4 v12 h-4 v-12 h-4 z"/>`,
  pikeman: spear('rotate(14 32 32) translate(2 0)') + spear('rotate(-14 32 32) translate(-2 0)'),
  gallowglass: greatAxeIcon('rotate(-28 32 32)'),
  marshal: longSword('rotate(38 32 32)'),
  champion: greatAxeIcon('rotate(28 32 32)') + `<path ${D} d="M8 54 l4 -8 l4 6 l4 -9 l4 9 l4 -6 l4 8 z"/>`,
  errant: falchion('rotate(34 32 32) translate(5 -3)') + `<g ${O}><circle cx="20" cy="44" r="13"/></g><circle ${D} cx="20" cy="44" r="4.6"/><circle fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1.6" cx="20" cy="44" r="10"/>`,

  // ---- abilities ----
  bash: `<path ${O} transform="translate(-4 4) scale(.85)" d="${shieldPath}"/><path d="M44 8 L52 2 L49 12 Z M50 18 L62 16 L52 24 Z M40 4 L41 -2 L44 6 Z" transform="translate(0 4)"/>`,
  rally: `<rect x="13" y="6" width="3.6" height="56" rx="1.2"/><circle cx="14.8" cy="5" r="3.2"/><path d="M16.6 9 H53 L45 19.5 L53 30 H16.6 Z"/><path ${D} d="M26 13 l3 5 l5 1 l-4 3.4 l1 5.3 l-5 -2.8 l-5 2.8 l1 -5.3 l-4 -3.4 l5 -1 z"/>`,
  whirl: `<path d="${ringSeg(32, 32, 17, 23, -2.6, 0.55)}"/><path d="${arrowHead(32, 32, 20, 0.55, 1, 6)}"/><path d="${ringSeg(32, 32, 17, 23, 0.55 + 0.6, 0.55 + 0.6 + 3.15 - 0.6)}"/><path d="${arrowHead(32, 32, 20, 0.55 + 3.15, 1, 6)}"/><circle cx="32" cy="32" r="6"/>`,
  charge: `<path d="M24 10 L48 32 L24 54 L17 47 L34 32 L17 17 Z"/><path d="M38 10 L60 32 L38 54 L33 49 L49 32 L33 15 Z" opacity=".55"/><path d="M2 26 h13 v3 h-13z M5 35 h11 v3 h-11z M0 44 h12 v3 h-12z"/>`,
  lunge: `<path d="M4 30.4 H44 V33.6 H4 Z"/><path d="M44 27 L63 32 L44 37 Z"/><path d="M41 25 h3 v14 h-3z"/><path d="M6 20 h22 v2.4 h-22z M2 42 h20 v2.4 h-20z M12 13 h14 v2 h-14z" opacity=".6"/>`,
  sweep: `<path d="${ringSeg(32, 26, 21, 27, 0.25, 2.95)}"/><path d="${arrowHead(32, 26, 24, 2.95, 1, 6.5)}"/>` + halberd('translate(18 -8) scale(.6) rotate(-35 32 32)'),
  slam: poleaxe('translate(12 -4) scale(.62) rotate(150 32 32)') + `<path d="M4 54 H60 V58 H4 Z"/><path d="M32 53 L26 40 L33 47 L36 36 L37 49 L44 42 L38 53 Z"/><path d="M10 50 L4 44 L14 49 Z M54 50 L60 44 L50 49 Z" opacity=".7"/>`,
  bulwark: `<path fill-rule="evenodd" d="M6 22 H14 V13 H23 V22 H27.5 V13 H36.5 V22 H41 V13 H50 V22 H58 V60 H6 Z M24 60 V45 C24 39.5 27.5 36 32 36 C36.5 36 40 39.5 40 45 V60 Z"/><path ${D} d="M6 30 H58 V32 H6 Z M6 40 H22 V42 H6 Z M42 40 H58 V42 H42 Z"/>`,
  volley: arrowDown('rotate(-28 32 32) translate(-14 0)') + arrowDown('rotate(-28 32 32)') + arrowDown('rotate(-28 32 32) translate(14 0)'),
  bodkin: `<path d="M2 30.6 H34 V33.4 H2 Z"/><path d="M34 28.5 L62 32 L34 35.5 Z"/><path d="M0 26 L8 30.6 V33.4 L0 38 L3 32 Z"/><path fill-rule="evenodd" ${O} d="M40 10 C47 18 49 25 49 32 C49 39 47 46 40 54 L44 54 C51 46 53 39 53 32 C53 25 51 18 44 10 Z"/>`,
  dash: `<path d="M30 10 L52 32 L30 54 L23 47 L38 32 L23 17 Z"/><path d="M16 14 h4 v36 h-4z" opacity=".65"/><path d="M8 18 h3 v28 h-3z" opacity=".4"/><path d="M1 22 h2 v20 h-2z" opacity=".22"/>`,
  hook: billIcon('translate(10 -2) scale(.7) rotate(-20 32 32)') + `<path d="M6 46 C14 40 22 40 30 44" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M4 40 L10 52 L1 51 Z"/>`,
  line: `<path ${O} d="M4 18 h14 v40 h-14z M25 14 h14 v44 h-14z M46 18 h14 v40 h-14z"/><path ${D} d="M4 30 h56 v3 h-56z"/>`,
  halfsword: longSword('rotate(90 32 32)') + `<path d="M40 22 C44 22 46 26 46 30 C46 34 44 38 40 38 Z"/><path d="M18 24 C14 24 12 28 12 32 C12 36 14 40 18 40 Z"/>`,
  cry: `<path d="M8 24 h10 l14 -12 v40 l-14 -12 h-10 z"/><path d="M40 18 C48 24 48 40 40 46" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M47 10 C60 20 60 44 47 54" fill="none" stroke="currentColor" stroke-width="3.5"/>`,
  axe: greatAxeIcon('translate(4 0) scale(.9)') + `<path d="M6 8 L22 24 M22 8 L6 24" stroke="currentColor" stroke-width="3.5"/>`,
  jugger: `<path d="M8 50 C8 30 20 18 32 18 C44 18 56 30 56 50 Z"/><path ${D} d="M20 34 h8 v6 h-8z M36 34 h8 v6 h-8z"/><path d="M14 22 L6 8 L20 16 Z M50 22 L58 8 L44 16 Z"/>`,
  mord: longSword('rotate(200 32 32)') + `<path d="M8 52 l10 -6 l-4 10 z M52 52 l-10 -6 l4 10 z"/>`,
  disarm: longSword('rotate(60 32 32) translate(6 -6)') + `<path d="M10 50 C20 40 30 42 36 48" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M36 42 L42 52 L32 52 Z"/>`,
  throw: `<circle cx="22" cy="14" r="6"/><path d="M18 22 h8 l8 14 l14 -6 l2 5 l-18 9 l-6 -8 v18 h-6 z"/><path d="M40 54 C48 56 56 50 58 42" fill="none" stroke="currentColor" stroke-width="3"/>`,
  dagger: `<path d="M32 2 L35 10 V40 H29 V10 Z"/><path d="M24 40 H40 V44 H24 Z"/><rect x="30" y="44" width="4" height="12" rx="1"/><circle cx="32" cy="59" r="3"/>`,
  bandage: `<path ${O} d="M8 24 h48 v16 h-48 z"/><path ${D} d="M28 20 h8 v24 h-8 z M20 28 h24 v8 h-24 z"/>`,
  bless: `<path d="M28 4 h8 v14 h14 v8 h-14 v34 h-8 v-34 h-14 v-8 h14 z"/>`,
  brace: spear('rotate(50 32 32)') + `<path d="M4 58 H60 V62 H4 Z"/>`,
  push: spear('rotate(90 32 32)') + `<path d="M4 20 L14 32 L4 44 Z" opacity=".6"/>`,
  hamstring: `<path d="M24 6 C30 18 30 30 26 42 L22 58 H30 L34 42 C38 30 38 18 32 6 Z"/><path d="M40 30 L56 46 M56 30 L40 46" stroke="currentColor" stroke-width="3.5"/>`,
  shatter: `<path ${O} transform="translate(-2 2) scale(.9)" d="${shieldPath}"/><path d="M30 8 L26 26 L34 30 L28 52" fill="none" stroke="#000" stroke-width="3"/>`,
  bleed: drop(30, 30, 1.45) + drop(50, 46, 0.62) + drop(12, 50, 0.5),

  // ---- menu ----
  battle: sword('rotate(40 32 32) translate(0 1)') + sword('rotate(-40 32 32) translate(0 1)', O),
  spectate: `<path fill-rule="evenodd" d="M2 32 C12 16 22 10 32 10 C42 10 52 16 62 32 C52 48 42 54 32 54 C22 54 12 48 2 32 Z M32 20 A12 12 0 1 0 32.01 20 Z"/><circle cx="32" cy="32" r="6.5"/>`,
  multiplayer: `<path d="M4 60 V24 H8 V18 H12 V24 H16 V18 H20 V24 H24 V60 Z M40 60 V24 H44 V18 H48 V24 H52 V18 H56 V24 H60 V60 Z"/><path fill-rule="evenodd" d="M22 60 V30 H42 V60 Z M28 60 V50 C28 47 30 45 32 45 C34 45 36 47 36 50 V60 Z"/><path d="M13 18 V4 H14.6 V6 L22 9 L14.6 12 V18 Z M49 18 V4 H50.6 V6 L58 9 L50.6 12 V18 Z"/>`,
  armoury: `<path fill-rule="evenodd" d="M14 54 V26 C14 14 22 6 32 6 C42 6 50 14 50 26 V54 C44 58 38 59 32 59 C26 59 20 58 14 54 Z M18 30 H46 V34 H34 V44 H30 V34 H18 Z"/><path ${D} d="M30.5 7 h3 v19 h-3z"/>`,
  codex: `<path d="M14 8 H50 C54 8 56 10.5 56 13 C56 15.5 54 18 50 18 H48 V52 C48 56 45 58 42 58 H12 C8 58 6 55.5 6 53 C6 50.5 8 48 12 48 H16 V14 C16 11 15 8 14 8 Z"/><path ${D} d="M22 22 h20 v2.4 h-20z M22 29 h20 v2.4 h-20z M22 36 h16 v2.4 h-16z"/>`,
  settings: `<path fill-rule="evenodd" d="${ringSeg(32, 32, 21, 27, 0, 6.2831)}"/><path d="M30 6 h4 v52 h-4z M6 30 h52 v4 h-52z" /><path transform="rotate(45 32 32)" d="M30 6 h4 v52 h-4z M6 30 h52 v4 h-52z"/><circle cx="32" cy="32" r="7"/><path ${D} d="M28 32 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0"/>`,
  exit: `<path fill-rule="evenodd" d="M12 60 V24 C12 13 21 4 32 4 C43 4 52 13 52 24 V60 Z M18 60 V25 C18 17 24.5 10 32 10 C39.5 10 46 17 46 25 V60 Z"/><path d="M19 60 V25.5 C19 18.5 24 12.5 30.5 11.3 V60 Z" opacity=".55"/><circle cx="26" cy="38" r="2"/>`,

  // ---- misc ----
  skull: `<path fill-rule="evenodd" d="M32 4 C45 4 54 13 54 26 C54 33 51 38 46 41 V48 C46 50 44 51 42 51 V56 H38 V51 H34 V56 H30 V51 H26 V56 H22 V51 C20 51 18 50 18 48 V41 C13 38 10 33 10 26 C10 13 19 4 32 4 Z M22 23 C18 23 16 26 16 30 C16 34 19 36 23 36 C27 36 29 33 29 29 C29 25 26 23 22 23 Z M42 23 C38 23 35 25 35 29 C35 33 37 36 41 36 C45 36 48 34 48 30 C48 26 46 23 42 23 Z M32 37 L28 44 H36 Z"/>`,
  crown: `<path d="M6 46 L10 18 L22 32 L32 12 L42 32 L54 18 L58 46 Z"/><path d="M6 50 H58 V57 H6 Z"/><circle cx="10" cy="15" r="3.5"/><circle cx="32" cy="9" r="3.5"/><circle cx="54" cy="15" r="3.5"/>`,
  arrow: `<g transform="rotate(-20 32 32)"><path d="M9 31 H53 V33 H9 Z"/><path d="M52 27.5 L62 32 L52 36.5 Z"/><path d="M4 27 L14 31 V33 L4 37 L7.5 32 Z"/></g>`,
  kick: `<path d="M22 4 H36 V36 L54 42 C59 43.5 61 47 61 51 V56 H22 Z"/><path ${D} d="M22 46 H61 V48 H22 Z"/><path d="M8 40 h10 v3 h-10z M4 48 h14 v3 h-14z" opacity=".6"/>`,
  shield: `<path d="${shieldPath}"/>`,
  flag: `<rect x="14" y="6" width="3.6" height="54" rx="1.2"/><path d="M17.6 8 H52 L45 18 L52 28 H17.6 Z"/>`,
  horn: `<path d="M6 40 C20 40 34 34 46 20 L52 14 C55 11 60 13 58 18 C54 30 40 50 10 50 C7 50 6 47 6 45 Z"/><path ${D} d="M44 22 l6 4 l-2 3 l-6 -4z M34 31 l6 4 l-2 3 l-6 -4z"/>`,
  bleedKill: drop(32, 34, 1.4),
};

export function icon(name: string, cls = ''): string {
  return `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
}

/** Heater shield in the house colours, for the HUD crest and scoreboard. */
export function crestSvg(fill: string, rim: string): string {
  return `<svg class="shield" viewBox="0 0 64 74" aria-hidden="true">
    <defs><linearGradient id="cg${fill.slice(1)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fill}" stop-opacity="1"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient></defs>
    <path d="M4 4 H60 V30 C60 50 47 62 32 70 C17 62 4 50 4 30 Z" fill="${fill}" stroke="${rim}" stroke-width="3"/>
    <path d="M4 4 H60 V30 C60 50 47 62 32 70 C17 62 4 50 4 30 Z" fill="url(#cg${fill.slice(1)})" opacity=".55"/>
    <path d="M9 8 H55 V30 C55 46 45 56 32 63 C19 56 9 46 9 30 Z" fill="none" stroke="rgba(255,235,190,.35)" stroke-width="1.2"/>
  </svg>`;
}

/** Objective marker: a small pennant shield in the owner's colour with a letter. */
export function objectiveSvg(fill: string, progress: number, ring: string): string {
  const c = 2 * Math.PI * 15;
  return `<svg viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="15" fill="rgba(10,8,6,.78)" stroke="rgba(0,0,0,.8)" stroke-width="2"/><circle cx="17" cy="17" r="15" fill="none" stroke="${ring}" stroke-width="3" stroke-dasharray="${(c * Math.abs(progress)).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 17 17)"/><circle cx="17" cy="17" r="11" fill="${fill}"/></svg>`;
}
