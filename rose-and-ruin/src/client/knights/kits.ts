// Harness for each class: the pieces, their materials and the bone each is strapped to.

import * as THREE from 'three';
import type { ClassId } from '../../shared/data/classes';
import { B, BODY } from './skeleton';
import * as A from './armorGeo';

export type MatKey = 'steel' | 'steelBright' | 'steelDark' | 'brass' | 'mail' | 'leather' | 'leatherDark' | 'cloth' | 'clothDark' | 'quilt' | 'wood' | 'grip' | 'void' | 'tabard' | 'shieldFace' | 'shieldBack' | 'plume' | 'brig';
/** where a piece is attached */
export type Mount = number | 'weapon' | 'offhand' | 'dagger' | 'bow';

export interface PieceDef {
  key: string;          // geometry cache key
  geo: () => THREE.BufferGeometry;
  mat: MatKey;
  mount: Mount;
  /** per-team material variant (heraldry / team cloth) */
  team?: boolean;
  /** skip when the knight is far away */
  detail?: boolean;
  /** hidden in first person (helmet) */
  head?: boolean;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
export function pieceGeometry(p: PieceDef): THREE.BufferGeometry {
  let g = geoCache.get(p.key);
  if (!g) { g = p.geo(); g.computeBoundingSphere(); geoCache.set(p.key, g); }
  return g;
}

/** Cylindrical UVs so heraldry sits on the chest: u = 0.5 at the front, v up the piece. */
function cylUV(g: THREE.BufferGeometry, y0: number, y1: number) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    uv[i * 2] = Math.atan2(x, -z) / (Math.PI * 2) + 0.5;
    uv[i * 2 + 1] = (y - y0) / (y1 - y0);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

const UA = BODY.upperArm, FA = BODY.forearm, TH = BODY.thigh, SH = BODY.shin;

// ---------------------------------------------------------------- shared layers
// The man himself (torso, limbs, neck and head) is a skinned body; see body.ts.
function base(): PieceDef[] {
  return [
    { key: 'pelvisCloth', geo: () => A.skirtRound(0.16, 0.95), mat: 'clothDark', mount: B.pelvis },
  ];
}
const mailNeck = (): PieceDef => ({ key: 'neck', geo: () => A.neckTube(), mat: 'mail', mount: B.neck });

function fullArms(steel: MatKey, size = 1): PieceDef[] {
  return [
    { key: 'pauldronL' + size, geo: () => A.pauldron(-1, size), mat: steel, mount: B.upperArmL },
    { key: 'pauldronR' + size, geo: () => A.pauldron(1, size), mat: steel, mount: B.upperArmR },
    { key: 'rerebrace', geo: () => A.armTube(-0.06, -UA + 0.03, 0.058, 0.05), mat: steel, mount: B.upperArmL },
    { key: 'rerebrace', geo: () => A.armTube(-0.06, -UA + 0.03, 0.058, 0.05), mat: steel, mount: B.upperArmR },
    { key: 'couter', geo: () => A.couter(-UA), mat: steel, mount: B.upperArmL },
    { key: 'couter', geo: () => A.couter(-UA), mat: steel, mount: B.upperArmR },
    { key: 'vambrace', geo: () => A.armTube(-0.03, -FA + 0.01, 0.05, 0.041), mat: steel, mount: B.forearmL },
    { key: 'vambrace', geo: () => A.armTube(-0.03, -FA + 0.01, 0.05, 0.041), mat: steel, mount: B.forearmR },
    { key: 'gauntlet', geo: () => A.gauntlet(), mat: steel, mount: B.handL },
    { key: 'gauntlet', geo: () => A.gauntlet(), mat: steel, mount: B.handR },
  ];
}
function fullLegs(steel: MatKey, pointed = 0.04): PieceDef[] {
  return [
    { key: 'cuisse', geo: () => A.legTube(-0.06, -TH + 0.05, 0.092, 0.07, 0, true), mat: steel, mount: B.thighL },
    { key: 'cuisse', geo: () => A.legTube(-0.06, -TH + 0.05, 0.092, 0.07, 0, true), mat: steel, mount: B.thighR },
    { key: 'poleyn', geo: () => A.poleyn(-TH), mat: steel, mount: B.thighL },
    { key: 'poleyn', geo: () => A.poleyn(-TH), mat: steel, mount: B.thighR },
    { key: 'greave', geo: () => A.legTube(-0.04, -SH + 0.03, 0.064, 0.048, 0.022), mat: steel, mount: B.shinL },
    { key: 'greave', geo: () => A.legTube(-0.04, -SH + 0.03, 0.064, 0.048, 0.022), mat: steel, mount: B.shinR },
    { key: 'sabaton' + pointed, geo: () => A.sabaton(pointed), mat: steel, mount: B.footL },
    { key: 'sabaton' + pointed, geo: () => A.sabaton(pointed), mat: steel, mount: B.footR },
  ];
}
function lightLegs(knees = true): PieceDef[] {
  const l: PieceDef[] = [
    { key: 'boot', geo: () => A.sabaton(0.0, false), mat: 'leather', mount: B.footL },
    { key: 'boot', geo: () => A.sabaton(0.0, false), mat: 'leather', mount: B.footR },
    { key: 'bootShaft', geo: () => A.legTube(-SH * 0.45, -SH + 0.01, 0.06, 0.048, 0.01), mat: 'leather', mount: B.shinL },
    { key: 'bootShaft', geo: () => A.legTube(-SH * 0.45, -SH + 0.01, 0.06, 0.048, 0.01), mat: 'leather', mount: B.shinR },
  ];
  if (knees) l.push(
    { key: 'poleyn', geo: () => A.poleyn(-TH), mat: 'steel', mount: B.thighL },
    { key: 'poleyn', geo: () => A.poleyn(-TH), mat: 'steel', mount: B.thighR },
  );
  return l;
}
function mailSleeves(): PieceDef[] {
  return [
    { key: 'mailU', geo: () => A.armTube(0.03, -UA + 0.02, 0.06, 0.052), mat: 'mail', mount: B.upperArmL },
    { key: 'mailU', geo: () => A.armTube(0.03, -UA + 0.02, 0.06, 0.052), mat: 'mail', mount: B.upperArmR },
    { key: 'mailF', geo: () => A.armTube(0.01, -FA * 0.6, 0.052, 0.046), mat: 'mail', mount: B.forearmL },
    { key: 'mailF', geo: () => A.armTube(0.01, -FA * 0.6, 0.052, 0.046), mat: 'mail', mount: B.forearmR },
  ];
}

// ---------------------------------------------------------------- weapons & shields
const W: Record<string, PieceDef[]> = {
  sword: [
    { key: 'swordSteel', geo: () => A.armingSword().steel!, mat: 'steelBright', mount: 'weapon' },
    { key: 'swordGrip', geo: () => A.armingSword().grip!, mat: 'grip', mount: 'weapon' },
    { key: 'scabbard', geo: () => A.xf(new THREE.CylinderGeometry(0.022, 0.016, 0.8, 8), 0.2, -0.38, 0.06, 0.25, 0, 0.12), mat: 'leatherDark', mount: B.pelvis, detail: true },
  ],
  greatsword: [
    { key: 'gsSteel', geo: () => A.greatsword().steel!, mat: 'steelBright', mount: 'weapon' },
    { key: 'gsGrip', geo: () => A.greatsword().grip!, mat: 'grip', mount: 'weapon' },
  ],
  halberd: [
    { key: 'halSteel', geo: () => A.halberd().steel!, mat: 'steel', mount: 'weapon' },
    { key: 'halWood', geo: () => A.halberd().wood!, mat: 'wood', mount: 'weapon' },
  ],
  poleaxe: [
    { key: 'paSteel', geo: () => A.poleaxe().steel!, mat: 'steel', mount: 'weapon' },
    { key: 'paWood', geo: () => A.poleaxe().wood!, mat: 'wood', mount: 'weapon' },
  ],
  falchion: [
    { key: 'falSteel', geo: () => A.falchion().steel!, mat: 'steelBright', mount: 'weapon' },
    { key: 'falGrip', geo: () => A.falchion().grip!, mat: 'grip', mount: 'weapon' },
  ],
  spear: [
    { key: 'spearWood', geo: () => A.spear().wood!, mat: 'wood', mount: 'weapon' },
    { key: 'spearSteel', geo: () => A.spear().steel!, mat: 'steel', mount: 'weapon' },
    { key: 'spearGrip', geo: () => A.spear().grip!, mat: 'grip', mount: 'weapon' },
  ],
  mace: [
    { key: 'maceSteel', geo: () => A.mace().steel!, mat: 'steelBright', mount: 'weapon' },
    { key: 'maceGrip', geo: () => A.mace().grip!, mat: 'grip', mount: 'weapon' },
  ],
  bow: [
    { key: 'bowStave', geo: () => A.longbow().wood!, mat: 'wood', mount: 'bow' },
    { key: 'bowGrip', geo: () => A.longbow().grip!, mat: 'grip', mount: 'bow' },
    { key: 'daggerSteel', geo: () => A.dagger().steel!, mat: 'steelBright', mount: 'dagger' },
    { key: 'daggerGrip', geo: () => A.dagger().grip!, mat: 'grip', mount: 'dagger' },
    { key: 'quiverBody', geo: () => A.xf(A.quiver().leather, 0.17, -0.14, 0.14, 0.35, 0, -0.15), mat: 'leather', mount: B.pelvis },
    { key: 'quiverShafts', geo: () => A.xf(A.quiver().wood, 0.17, -0.14, 0.14, 0.35, 0, -0.15), mat: 'wood', mount: B.pelvis, detail: true },
    { key: 'quiverFletch', geo: () => A.xf(A.quiver().cloth, 0.17, -0.14, 0.14, 0.35, 0, -0.15), mat: 'cloth', mount: B.pelvis, detail: true },
  ],
};
const heater = (): PieceDef[] => {
  const s = A.heaterShield();
  return [
    { key: 'heaterFace', geo: () => s.face, mat: 'shieldFace', mount: 'offhand', team: true },
    { key: 'heaterBack', geo: () => s.back, mat: 'shieldBack', mount: 'offhand' },
    { key: 'heaterRim', geo: () => s.rim, mat: 'steelDark', mount: 'offhand' },
  ];
};
const pavise = (): PieceDef[] => {
  const s = A.paviseShield();
  return [
    { key: 'paviseFace', geo: () => s.face, mat: 'shieldFace', mount: 'offhand', team: true },
    { key: 'paviseBack', geo: () => s.back, mat: 'shieldBack', mount: 'offhand' },
    { key: 'paviseRim', geo: () => s.rim, mat: 'leatherDark', mount: 'offhand' },
  ];
};

// ---------------------------------------------------------------- kits
export const KITS: Record<ClassId, PieceDef[]> = {
  manatarms: [
    ...base(),
    { key: 'bascinetOpen', geo: () => A.bascinetOpen(), mat: 'steel', mount: B.head, head: true },
    { key: 'aventail', geo: () => A.aventail(0.16), mat: 'mail', mount: B.head, head: true },
    { key: 'cuirass', geo: () => A.cuirass(), mat: 'steel', mount: B.chest },
    { key: 'tabard', geo: () => cylUV(A.tabardTop(0.3), -0.3, 0.215), mat: 'tabard', mount: B.chest, team: true },
    { key: 'tabardSkirt', geo: () => cylUV(A.skirtPanels(0.36, 1, 0.95), -0.36, 0.08), mat: 'tabard', mount: B.pelvis, team: true },
    { key: 'mailSkirt', geo: () => A.skirtRound(0.24), mat: 'mail', mount: B.pelvis },
    { key: 'belt', geo: () => A.belt(), mat: 'leather', mount: B.pelvis, detail: true },
    ...fullArms('steel'),
    ...fullLegs('steel', 0.03),
    ...W.sword,
    ...heater(),
  ],
  vanguard: [
    ...base(),
    mailNeck(),
    { key: 'greatHelm', geo: () => A.greatHelm(), mat: 'steel', mount: B.head, head: true },
    { key: 'greatHelmTrim', geo: () => A.greatHelmTrim(), mat: 'brass', mount: B.head, head: true, detail: true },
    { key: 'greatHelmSlits', geo: () => A.greatHelmSlits(), mat: 'void', mount: B.head, head: true, detail: true },
    { key: 'cuirassV', geo: () => A.cuirass({ bulge: 1.05 }), mat: 'steel', mount: B.chest },
    { key: 'surcoat', geo: () => cylUV(A.tabardTop(0.32), -0.32, 0.215), mat: 'tabard', mount: B.chest, team: true },
    { key: 'surcoatSkirt', geo: () => cylUV(A.skirtPanels(0.56, 1.3, 1.05), -0.56, 0.08), mat: 'tabard', mount: B.pelvis, team: true },
    { key: 'fauld3', geo: () => A.fauld(3), mat: 'steel', mount: B.pelvis },
    { key: 'belt', geo: () => A.belt(), mat: 'leather', mount: B.pelvis, detail: true },
    ...fullArms('steel', 1.08),
    ...fullLegs('steel', 0.05),
    ...W.greatsword,
  ],
  halberdier: [
    ...base(),
    mailNeck(),
    { key: 'salletOpen', geo: () => A.salletOpen(), mat: 'steel', mount: B.head, head: true },
    { key: 'bevorLow', geo: () => A.bevorLow(), mat: 'steel', mount: B.head, head: true },
    { key: 'brigandine', geo: () => cylUV(A.tabardTop(0.26), -0.26, 0.215), mat: 'brig', mount: B.chest, team: true },
    { key: 'mailSkirtL', geo: () => A.skirtRound(0.34), mat: 'mail', mount: B.pelvis },
    { key: 'belt', geo: () => A.belt(), mat: 'leather', mount: B.pelvis, detail: true },
    { key: 'spaudlerL', geo: () => A.pauldron(-1, 0.85), mat: 'steel', mount: B.upperArmL },
    { key: 'spaudlerR', geo: () => A.pauldron(1, 0.85), mat: 'steel', mount: B.upperArmR },
    ...mailSleeves(),
    { key: 'vambrace', geo: () => A.armTube(-0.03, -FA + 0.01, 0.05, 0.041), mat: 'steel', mount: B.forearmL },
    { key: 'vambrace', geo: () => A.armTube(-0.03, -FA + 0.01, 0.05, 0.041), mat: 'steel', mount: B.forearmR },
    { key: 'glove', geo: () => A.gauntlet(true), mat: 'leather', mount: B.handL },
    { key: 'glove', geo: () => A.gauntlet(true), mat: 'leather', mount: B.handR },
    ...lightLegs(true),
    { key: 'cuisse', geo: () => A.legTube(-0.06, -TH + 0.05, 0.092, 0.07, 0, true), mat: 'steel', mount: B.thighL },
    { key: 'cuisse', geo: () => A.legTube(-0.06, -TH + 0.05, 0.092, 0.07, 0, true), mat: 'steel', mount: B.thighR },
    ...W.halberd,
  ],
  banneret: [
    ...base(),
    mailNeck(),
    { key: 'armet', geo: () => A.armet(), mat: 'steelBright', mount: B.head, head: true },
    { key: 'armetSlit', geo: () => A.slit(0.09, -0.17, 0.15), mat: 'void', mount: B.head, head: true, detail: true },
    { key: 'plume', geo: () => A.plume(), mat: 'plume', mount: B.head, head: true, team: true },
    { key: 'cuirassB', geo: () => A.cuirass({ bulge: 1.12, ridge: 1.6 }), mat: 'steelBright', mount: B.chest },
    { key: 'fauld4', geo: () => A.fauld(4), mat: 'steelBright', mount: B.pelvis },
    { key: 'tasset', geo: () => A.tasset(), mat: 'steelBright', mount: B.thighL },
    { key: 'tasset', geo: () => A.tasset(), mat: 'steelBright', mount: B.thighR },
    { key: 'cape', geo: () => A.cape(1.05), mat: 'cloth', mount: B.chest, team: true },
    { key: 'belt', geo: () => A.belt(), mat: 'leather', mount: B.pelvis, detail: true },
    ...fullArms('steelBright', 1.22),
    ...fullLegs('steelBright', 0.06),
    ...W.poleaxe,
  ],
  longbowman: [
    ...base(),
    { key: 'kettle', geo: () => A.kettleHat(), mat: 'steelDark', mount: B.head, head: true },
    { key: 'coif', geo: () => A.coif(), mat: 'quilt', mount: B.head, head: true },
    { key: 'scarf', geo: () => A.scarf(), mat: 'cloth', mount: B.head, head: true, team: true },
    { key: 'gambeson', geo: () => A.tabardTop(0.3), mat: 'quilt', mount: B.chest },
    { key: 'livery', geo: () => cylUV(A.xf(A.tabardTop(0.2), 0, 0, 0, 0, 0, 0, 1.03, 1, 1.04), -0.2, 0.215), mat: 'tabard', mount: B.chest, team: true },
    { key: 'gambesonSkirt', geo: () => A.skirtRound(0.38, 1.05), mat: 'quilt', mount: B.pelvis },
    { key: 'quiltU', geo: () => A.armTube(0.03, -UA + 0.02, 0.064, 0.055), mat: 'quilt', mount: B.upperArmL },
    { key: 'quiltU', geo: () => A.armTube(0.03, -UA + 0.02, 0.064, 0.055), mat: 'quilt', mount: B.upperArmR },
    { key: 'bracer', geo: () => A.armTube(-0.08, -FA + 0.03, 0.05, 0.042), mat: 'leather', mount: B.forearmL },
    { key: 'glove', geo: () => A.gauntlet(true), mat: 'leather', mount: B.handL },
    { key: 'glove', geo: () => A.gauntlet(true), mat: 'leather', mount: B.handR },
    { key: 'belt', geo: () => A.belt(), mat: 'leather', mount: B.pelvis, detail: true },
    ...lightLegs(false),
    ...W.bow,
  ],
  errant: [
    ...base(),
    { key: 'barbute', geo: () => A.barbute(), mat: 'steel', mount: B.head, head: true },
    { key: 'brigandineE', geo: () => cylUV(A.tabardTop(0.28), -0.28, 0.215), mat: 'brig', mount: B.chest, team: true },
    { key: 'mailSkirtE', geo: () => A.skirtRound(0.3), mat: 'mail', mount: B.pelvis },
    { key: 'belt', geo: () => A.belt(), mat: 'leather', mount: B.pelvis, detail: true },
    ...mailSleeves(),
    { key: 'couter', geo: () => A.couter(-UA), mat: 'steel', mount: B.upperArmL },
    { key: 'couter', geo: () => A.couter(-UA), mat: 'steel', mount: B.upperArmR },
    { key: 'gauntlet', geo: () => A.gauntlet(), mat: 'steel', mount: B.handL },
    { key: 'gauntlet', geo: () => A.gauntlet(), mat: 'steel', mount: B.handR },
    ...lightLegs(true),
    { key: 'greave', geo: () => A.legTube(-0.04, -SH + 0.03, 0.064, 0.048, 0.022), mat: 'steel', mount: B.shinL },
    { key: 'greave', geo: () => A.legTube(-0.04, -SH + 0.03, 0.064, 0.048, 0.022), mat: 'steel', mount: B.shinR },
    ...W.falchion,
    { key: 'buckler', geo: () => A.buckler(), mat: 'steel', mount: 'offhand' },
  ],
  pavisier: [
    ...base(),
    { key: 'kettleP', geo: () => A.kettleHat(), mat: 'steel', mount: B.head, head: true },
    { key: 'coifMail', geo: () => A.coif(), mat: 'mail', mount: B.head, head: true },
    { key: 'brigandineP', geo: () => cylUV(A.tabardTop(0.3), -0.3, 0.215), mat: 'brig', mount: B.chest, team: true },
    { key: 'mailSkirtP', geo: () => A.skirtRound(0.32), mat: 'mail', mount: B.pelvis },
    { key: 'belt', geo: () => A.belt(), mat: 'leather', mount: B.pelvis, detail: true },
    { key: 'spaudlerL', geo: () => A.pauldron(-1, 0.85), mat: 'steel', mount: B.upperArmL },
    { key: 'spaudlerR', geo: () => A.pauldron(1, 0.85), mat: 'steel', mount: B.upperArmR },
    ...mailSleeves(),
    { key: 'vambrace', geo: () => A.armTube(-0.03, -FA + 0.01, 0.05, 0.041), mat: 'steel', mount: B.forearmL },
    { key: 'vambrace', geo: () => A.armTube(-0.03, -FA + 0.01, 0.05, 0.041), mat: 'steel', mount: B.forearmR },
    { key: 'glove', geo: () => A.gauntlet(true), mat: 'leather', mount: B.handL },
    { key: 'glove', geo: () => A.gauntlet(true), mat: 'leather', mount: B.handR },
    ...lightLegs(true),
    { key: 'greave', geo: () => A.legTube(-0.04, -SH + 0.03, 0.064, 0.048, 0.022), mat: 'steel', mount: B.shinL },
    { key: 'greave', geo: () => A.legTube(-0.04, -SH + 0.03, 0.064, 0.048, 0.022), mat: 'steel', mount: B.shinR },
    ...W.spear,
    ...pavise(),
  ],
  bachelor: [
    ...base(),
    { key: 'bascinetV', geo: () => A.bascinet().steel, mat: 'steel', mount: B.head, head: true },
    { key: 'bascinetVDetail', geo: () => A.bascinetDetail(), mat: 'void', mount: B.head, head: true, detail: true },
    { key: 'aventail', geo: () => A.aventail(0.16), mat: 'mail', mount: B.head, head: true },
    { key: 'cuirassK', geo: () => A.cuirass({ bulge: 1.04, ridge: 1.3 }), mat: 'steel', mount: B.chest },
    { key: 'surcoatK', geo: () => cylUV(A.tabardTop(0.3), -0.3, 0.215), mat: 'tabard', mount: B.chest, team: true },
    { key: 'surcoatKSkirt', geo: () => cylUV(A.skirtPanels(0.42, 1.15, 1.0), -0.42, 0.08), mat: 'tabard', mount: B.pelvis, team: true },
    { key: 'fauld3', geo: () => A.fauld(3), mat: 'steel', mount: B.pelvis },
    { key: 'belt', geo: () => A.belt(), mat: 'leather', mount: B.pelvis, detail: true },
    ...fullArms('steel'),
    ...fullLegs('steel', 0.04),
    ...W.mace,
    ...heater(),
  ],
};
