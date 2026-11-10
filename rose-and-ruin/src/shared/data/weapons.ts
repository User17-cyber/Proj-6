// Weapons and their attacks. Every attack is described by three key poses of the weapon in
// body space (the cocked windup pose, the middle and the end of the release). The simulation
// interpolates the blade along these keys for hit detection and the client animator uses the
// very same curve, so what you see is what hits.
//
// PoseKey = [gripX, gripY, gripForward, bladeYawDeg, bladePitchDeg, torsoTwistDeg, torsoLeanDeg]
//   grip   : main-hand position, metres; x right, y up, forward positive
//   yaw    : blade azimuth, 0 = straight ahead, +90 = to the knight's left, -90 = right
//   pitch  : blade elevation, +90 = straight up (values > 90 point back over the head)
//   twist  : torso rotation about the spine, + turns the chest to the left
//   lean   : forward lean of the upper body (degrees)

export type PoseKey = readonly [number, number, number, number, number, number, number];
export type DmgType = 0 | 1 | 2; // cut, blunt, pierce
export const DMG_CUT = 0, DMG_BLUNT = 1, DMG_PIERCE = 2;
export const DMG_NAMES = ['cut', 'blunt', 'pierce'] as const;

type BaseWeaponId = 'arming_sword' | 'greatsword' | 'halberd' | 'poleaxe' | 'longbow' | 'falchion' | 'spear' | 'mace';
export type WeaponId = BaseWeaponId | 'bill' | 'bastard' | 'greataxe';

export interface AttackDef {
  name: string;
  kind: 'slash' | 'overhead' | 'thrust';
  windup: number;
  release: number;
  recover: number;
  damage: number;
  dtype: DmgType;
  stamina: number;
  wind: PoseKey;
  mid: PoseKey;
  end: PoseKey;
  maxTargets: number;
  /** movement multiplier while winding up / releasing */
  moveMult: number;
  /** forward speed added while releasing (steps into the blow) */
  lunge: number;
  /** override of the damaging part of the weapon (distance along the blade from the grip) */
  hitStart?: number;
  hitEnd?: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  blurb: string;
  twoHanded: boolean;
  /** distance along the blade direction from the main grip to the start/end of the damaging part */
  hitStart: number;
  hitEnd: number;
  /** off-hand grip offset along the blade (two-handed weapons) */
  offhand: number | null;
  idle: PoseKey;
  carry: PoseKey;
  block: PoseKey;
  /** [slash from right, slash from left, heavy, thrust] */
  attacks: readonly [AttackDef, AttackDef, AttackDef, AttackDef];
  heavyChargeMax: number;
  blockArc: number; // degrees, full arc
  blockStamina: number; // multiplier on stamina lost when blocking
  parryWindow: number; // seconds after raising the guard that count as a parry
  /** visual weapon kind for the renderer */
  visual: 'sword' | 'greatsword' | 'halberd' | 'poleaxe' | 'bow' | 'falchion' | 'spear' | 'mace' | 'bill' | 'bastard' | 'greataxe';
}

const A = (o: Omit<AttackDef, 'maxTargets' | 'moveMult' | 'lunge'> & Partial<AttackDef>): AttackDef => ({
  maxTargets: 1,
  moveMult: 0.7,
  lunge: 0,
  ...o,
});

const BASE: Record<BaseWeaponId, WeaponDef> = {
  arming_sword: {
    id: 'arming_sword',
    name: 'Arming Sword',
    blurb: 'A cruciform knightly sword, quick in the hand and true in the thrust.',
    twoHanded: false,
    hitStart: 0.14,
    hitEnd: 0.92,
    offhand: null,
    idle: [0.24, 1.04, 0.24, 6, 52, 0, 0],
    carry: [0.26, 1.0, 0.14, -8, 68, 0, 0],
    block: [0.27, 1.22, 0.1, -18, 74, 0, 0],
    attacks: [
      A({ name: 'Forehand Cut', kind: 'slash', windup: 0.42, release: 0.2, recover: 0.32, damage: 50, dtype: 0, stamina: 9,
        wind: [0.38, 1.5, -0.05, -120, 34, -40, 0], mid: [0.1, 1.32, 0.42, 0, 5, 0, 4], end: [-0.25, 1.15, 0.3, 85, -15, 40, 6], lunge: 0.8 }),
      A({ name: 'Backhand Cut', kind: 'slash', windup: 0.42, release: 0.2, recover: 0.32, damage: 50, dtype: 0, stamina: 9,
        wind: [-0.15, 1.45, 0.1, 110, 40, 35, 0], mid: [0.15, 1.3, 0.42, 0, 5, 0, 4], end: [0.42, 1.1, 0.12, -95, -15, -35, 6], lunge: 0.8 }),
      A({ name: 'Overhead Cleave', kind: 'overhead', windup: 0.55, release: 0.22, recover: 0.45, damage: 72, dtype: 0, stamina: 15,
        wind: [0.18, 1.75, 0.0, 0, 140, -15, -8], mid: [0.1, 1.5, 0.45, 0, 20, 0, 10], end: [0.08, 0.98, 0.4, 0, -45, 5, 22], lunge: 1.4, moveMult: 0.6 }),
      A({ name: 'Thrust', kind: 'thrust', windup: 0.36, release: 0.18, recover: 0.32, damage: 42, dtype: 2, stamina: 8,
        wind: [0.25, 1.25, -0.1, 0, 0, -25, 0], mid: [0.12, 1.3, 0.45, 0, 0, 5, 8], end: [0.08, 1.3, 0.58, 0, -2, 12, 12], lunge: 1.6 }),
    ],
    heavyChargeMax: 0.8,
    blockArc: 130,
    blockStamina: 0.95,
    parryWindow: 0.2,
    visual: 'sword',
  },

  greatsword: {
    id: 'greatsword',
    name: 'Greatsword',
    blurb: 'A two-handed war sword as tall as a man. Its wide arcs cleave through ranks.',
    twoHanded: true,
    hitStart: 0.16,
    hitEnd: 1.36,
    offhand: -0.17,
    idle: [0.12, 1.08, 0.3, 5, 50, -10, 0],
    carry: [0.13, 1.03, 0.22, -5, 62, -12, 0],
    block: [0.06, 1.42, 0.36, 62, 34, 0, 0],
    attacks: [
      A({ name: 'Sweeping Cut', kind: 'slash', windup: 0.5, release: 0.26, recover: 0.4, damage: 60, dtype: 0, stamina: 11,
        wind: [0.32, 1.5, -0.1, -135, 40, -55, 0], mid: [0.08, 1.28, 0.45, 0, 0, 0, 6], end: [-0.3, 1.1, 0.25, 95, -20, 55, 8], maxTargets: 3, lunge: 0.9, moveMult: 0.62 }),
      A({ name: 'Rising Cut', kind: 'slash', windup: 0.5, release: 0.26, recover: 0.4, damage: 60, dtype: 0, stamina: 11,
        wind: [-0.2, 1.48, 0.0, 125, 45, 50, 0], mid: [0.1, 1.28, 0.45, 0, 0, 0, 6], end: [0.38, 1.05, 0.1, -100, -20, -50, 8], maxTargets: 3, lunge: 0.9, moveMult: 0.62 }),
      A({ name: 'Zornhau', kind: 'overhead', windup: 0.7, release: 0.26, recover: 0.55, damage: 88, dtype: 0, stamina: 16,
        wind: [0.12, 1.78, -0.05, 0, 150, -10, -10], mid: [0.06, 1.45, 0.45, 0, 15, 0, 10], end: [0.04, 0.98, 0.42, 0, -50, 0, 25], maxTargets: 2, lunge: 1.5, moveMult: 0.55 }),
      A({ name: 'Plunge', kind: 'thrust', windup: 0.42, release: 0.2, recover: 0.38, damage: 52, dtype: 2, stamina: 9,
        wind: [0.2, 1.2, -0.05, 0, 2, -25, 0], mid: [0.08, 1.28, 0.42, 0, 0, 5, 8], end: [0.05, 1.28, 0.6, 0, -3, 10, 12], lunge: 1.8 }),
    ],
    heavyChargeMax: 0.9,
    blockArc: 140,
    blockStamina: 0.9,
    parryWindow: 0.18,
    visual: 'greatsword',
  },

  halberd: {
    id: 'halberd',
    name: 'Halberd',
    blurb: 'Axe, spike and hook on a two-metre haft. Keeps the foe at bay.',
    twoHanded: true,
    hitStart: 1.35,
    hitEnd: 1.86,
    offhand: 0.42,
    idle: [0.22, 1.0, -0.06, 0, 32, -22, 0],
    carry: [0.22, 1.0, -0.08, 0, 55, -22, 0],
    block: [0.05, 1.2, 0.18, 70, 22, 0, 0],
    attacks: [
      A({ name: 'Axe Sweep', kind: 'slash', windup: 0.52, release: 0.28, recover: 0.42, damage: 56, dtype: 0, stamina: 11,
        wind: [-0.05, 1.2, -0.05, -110, 25, -50, 0], mid: [0.18, 1.12, -0.12, 0, 12, 0, 6], end: [0.3, 1.12, 0.0, 95, 0, 45, 8], maxTargets: 2, moveMult: 0.6, lunge: 0.6 }),
      A({ name: 'Back Sweep', kind: 'slash', windup: 0.52, release: 0.28, recover: 0.42, damage: 56, dtype: 0, stamina: 11,
        wind: [0.32, 1.15, 0.0, 105, 30, 45, 0], mid: [0.18, 1.12, -0.12, 0, 12, 0, 6], end: [-0.15, 1.15, 0.0, -100, 0, -40, 8], maxTargets: 2, moveMult: 0.6, lunge: 0.6 }),
      A({ name: 'Crushing Chop', kind: 'overhead', windup: 0.74, release: 0.26, recover: 0.6, damage: 92, dtype: 0, stamina: 16,
        wind: [0.15, 1.2, 0.1, 0, 125, -15, -10], mid: [0.12, 1.2, -0.1, 0, 30, 0, 5], end: [0.1, 1.12, -0.05, 0, -15, 0, 20], maxTargets: 2, moveMult: 0.5, lunge: 1.0 }),
      A({ name: 'Spike Thrust', kind: 'thrust', windup: 0.38, release: 0.2, recover: 0.36, damage: 48, dtype: 2, stamina: 9,
        wind: [0.22, 1.05, -0.3, 0, 8, -25, 0], mid: [0.15, 1.12, -0.05, 0, 5, -20, 6], end: [0.12, 1.12, 0.1, 0, 3, -15, 12], lunge: 1.4, hitStart: 1.45, hitEnd: 1.96 }),
    ],
    heavyChargeMax: 0.9,
    blockArc: 140,
    blockStamina: 1.0,
    parryWindow: 0.18,
    visual: 'halberd',
  },

  poleaxe: {
    id: 'poleaxe',
    name: 'Poleaxe',
    blurb: 'The lord-knight\'s weapon of choice: a war hammer and spike that punch through plate.',
    twoHanded: true,
    hitStart: 1.05,
    hitEnd: 1.46,
    offhand: 0.4,
    idle: [0.2, 1.0, -0.04, 0, 38, -22, 0],
    carry: [0.2, 1.0, -0.06, 0, 58, -22, 0],
    block: [0.05, 1.22, 0.2, 68, 26, 0, 0],
    attacks: [
      A({ name: 'Hammer Swing', kind: 'slash', windup: 0.54, release: 0.26, recover: 0.44, damage: 52, dtype: 1, stamina: 12,
        wind: [-0.05, 1.22, -0.05, -110, 30, -50, 0], mid: [0.18, 1.14, -0.12, 0, 12, 0, 6], end: [0.3, 1.14, 0.0, 95, 0, 45, 8], maxTargets: 1, moveMult: 0.6, lunge: 0.7 }),
      A({ name: 'Back Hammer', kind: 'slash', windup: 0.54, release: 0.26, recover: 0.44, damage: 52, dtype: 1, stamina: 12,
        wind: [0.32, 1.18, 0.0, 105, 32, 45, 0], mid: [0.18, 1.14, -0.12, 0, 12, 0, 6], end: [-0.15, 1.17, 0.0, -100, 0, -40, 8], maxTargets: 1, moveMult: 0.6, lunge: 0.7 }),
      A({ name: 'Skullsplitter', kind: 'overhead', windup: 0.8, release: 0.24, recover: 0.62, damage: 95, dtype: 1, stamina: 17,
        wind: [0.15, 1.22, 0.1, 0, 128, -15, -10], mid: [0.12, 1.22, -0.1, 0, 30, 0, 6], end: [0.1, 1.14, -0.05, 0, -18, 0, 22], maxTargets: 1, moveMult: 0.5, lunge: 1.0 }),
      A({ name: 'Top Spike', kind: 'thrust', windup: 0.4, release: 0.2, recover: 0.38, damage: 44, dtype: 2, stamina: 9,
        wind: [0.22, 1.08, -0.28, 0, 8, -25, 0], mid: [0.15, 1.14, -0.05, 0, 5, -20, 6], end: [0.12, 1.14, 0.1, 0, 3, -15, 12], lunge: 1.3, hitStart: 1.25, hitEnd: 1.62 }),
    ],
    heavyChargeMax: 1.0,
    blockArc: 140,
    blockStamina: 0.95,
    parryWindow: 0.18,
    visual: 'poleaxe',
  },

  falchion: {
    id: 'falchion',
    name: 'Falchion',
    blurb: 'A broad single-edged chopping blade and a fist buckler. Fast, vicious, hard to pin down.',
    twoHanded: false,
    hitStart: 0.12,
    hitEnd: 0.84,
    offhand: null,
    idle: [0.24, 1.06, 0.26, 8, 48, 0, 0],
    carry: [0.26, 1.0, 0.14, -8, 66, 0, 0],
    block: [0.22, 1.3, 0.22, 30, 60, 0, 0],
    attacks: [
      A({ name: 'Snap Cut', kind: 'slash', windup: 0.36, release: 0.18, recover: 0.28, damage: 42, dtype: 0, stamina: 8,
        wind: [0.38, 1.48, -0.04, -118, 34, -38, 0], mid: [0.1, 1.32, 0.42, 0, 5, 0, 4], end: [-0.24, 1.15, 0.3, 85, -15, 38, 6], lunge: 1.0 }),
      A({ name: 'Return Cut', kind: 'slash', windup: 0.36, release: 0.18, recover: 0.28, damage: 42, dtype: 0, stamina: 8,
        wind: [-0.14, 1.45, 0.1, 108, 40, 34, 0], mid: [0.15, 1.3, 0.42, 0, 5, 0, 4], end: [0.42, 1.1, 0.12, -95, -15, -34, 6], lunge: 1.0 }),
      A({ name: 'Hewing Blow', kind: 'overhead', windup: 0.5, release: 0.2, recover: 0.4, damage: 64, dtype: 0, stamina: 13,
        wind: [0.18, 1.74, 0.0, 0, 138, -15, -8], mid: [0.1, 1.5, 0.45, 0, 20, 0, 10], end: [0.08, 0.98, 0.4, 0, -45, 5, 22], lunge: 1.6, moveMult: 0.65 }),
      A({ name: 'Point Thrust', kind: 'thrust', windup: 0.32, release: 0.16, recover: 0.28, damage: 36, dtype: 2, stamina: 7,
        wind: [0.25, 1.25, -0.1, 0, 0, -25, 0], mid: [0.12, 1.3, 0.45, 0, 0, 5, 8], end: [0.08, 1.3, 0.58, 0, -2, 12, 12], lunge: 2.0 }),
    ],
    heavyChargeMax: 0.7,
    blockArc: 110,
    blockStamina: 0.95,
    parryWindow: 0.28,
    visual: 'falchion',
  },

  spear: {
    id: 'spear',
    name: 'War Spear',
    blurb: 'An ash-hafted spear with a leaf blade, held one-handed over the pavise. Every blow is a thrust, and it outreaches a sword.',
    twoHanded: false,
    hitStart: 1.3,
    hitEnd: 1.84,
    offhand: null,
    idle: [0.26, 1.12, 0.12, 0, 8, 0, 0],
    carry: [0.26, 1.0, 0.12, -6, 78, 0, 0],
    block: [0.28, 1.18, 0.04, -8, 58, 0, 0],
    attacks: [
      A({ name: 'Low Thrust', kind: 'thrust', windup: 0.38, release: 0.18, recover: 0.32, damage: 44, dtype: 2, stamina: 8,
        wind: [0.3, 1.04, -0.2, 0, 6, -22, 0], mid: [0.18, 1.1, 0.3, 0, 3, 4, 6], end: [0.12, 1.12, 0.5, 0, 1, 12, 10], lunge: 1.4 }),
      A({ name: 'High Thrust', kind: 'thrust', windup: 0.42, release: 0.18, recover: 0.34, damage: 48, dtype: 2, stamina: 9,
        wind: [0.32, 1.52, -0.14, 0, -4, -24, 0], mid: [0.2, 1.48, 0.3, 0, -7, 4, 6], end: [0.14, 1.44, 0.5, 0, -10, 12, 10], lunge: 1.4 }),
      A({ name: 'Driving Thrust', kind: 'thrust', windup: 0.56, release: 0.2, recover: 0.44, damage: 68, dtype: 2, stamina: 14,
        wind: [0.32, 1.3, -0.26, 0, 0, -32, 0], mid: [0.16, 1.3, 0.34, 0, 0, 6, 10], end: [0.1, 1.3, 0.56, 0, -2, 14, 16], lunge: 2.2, moveMult: 0.6 }),
      A({ name: 'Quick Jab', kind: 'thrust', windup: 0.28, release: 0.14, recover: 0.26, damage: 34, dtype: 2, stamina: 6,
        wind: [0.28, 1.2, -0.08, 0, 0, -16, 0], mid: [0.16, 1.24, 0.3, 0, 0, 4, 6], end: [0.12, 1.25, 0.46, 0, 0, 10, 8], lunge: 1.2 }),
    ],
    heavyChargeMax: 0.8,
    blockArc: 120,
    blockStamina: 0.9,
    parryWindow: 0.18,
    visual: 'spear',
  },

  mace: {
    id: 'mace',
    name: 'Flanged Mace',
    blurb: 'A steel-hafted mace with seven flanges. It does not cut plate: it dents it, and the man inside.',
    twoHanded: false,
    hitStart: 0.42,
    hitEnd: 0.66,
    offhand: null,
    idle: [0.24, 1.04, 0.24, 6, 54, 0, 0],
    carry: [0.26, 1.0, 0.14, -8, 70, 0, 0],
    block: [0.27, 1.22, 0.1, -18, 74, 0, 0],
    attacks: [
      A({ name: 'Forehand Smash', kind: 'slash', windup: 0.46, release: 0.2, recover: 0.34, damage: 46, dtype: 1, stamina: 10,
        wind: [0.38, 1.52, -0.05, -120, 40, -40, 0], mid: [0.1, 1.34, 0.42, 0, 8, 0, 4], end: [-0.25, 1.15, 0.3, 85, -15, 40, 6], lunge: 0.8 }),
      A({ name: 'Backhand Smash', kind: 'slash', windup: 0.46, release: 0.2, recover: 0.34, damage: 46, dtype: 1, stamina: 10,
        wind: [-0.15, 1.47, 0.1, 110, 44, 35, 0], mid: [0.15, 1.32, 0.42, 0, 8, 0, 4], end: [0.42, 1.1, 0.12, -95, -15, -35, 6], lunge: 0.8 }),
      A({ name: 'Helm Breaker', kind: 'overhead', windup: 0.6, release: 0.22, recover: 0.48, damage: 70, dtype: 1, stamina: 16,
        wind: [0.18, 1.76, 0.0, 0, 145, -15, -8], mid: [0.1, 1.52, 0.45, 0, 25, 0, 10], end: [0.08, 1.0, 0.4, 0, -40, 5, 22], lunge: 1.3, moveMult: 0.6 }),
      A({ name: 'Pommel Jab', kind: 'thrust', windup: 0.3, release: 0.16, recover: 0.3, damage: 30, dtype: 1, stamina: 7,
        wind: [0.25, 1.25, -0.1, 0, 0, -25, 0], mid: [0.12, 1.3, 0.45, 0, 0, 5, 8], end: [0.08, 1.3, 0.56, 0, -2, 12, 12], lunge: 1.4 }),
    ],
    heavyChargeMax: 0.8,
    blockArc: 120,
    blockStamina: 0.9,
    parryWindow: 0.2,
    visual: 'mace',
  },

  longbow: {
    id: 'longbow',
    name: 'English Longbow',
    blurb: 'A six-foot yew bow drawn to the ear. At full draw it can drop a knight at a hundred paces.',
    twoHanded: true,
    hitStart: 0.06,
    hitEnd: 0.34,
    offhand: null,
    idle: [0.22, 1.0, 0.18, 0, -60, 0, 0],
    carry: [0.22, 1.0, 0.1, 0, -60, 0, 0],
    block: [0.22, 1.0, 0.18, 0, -60, 0, 0],
    attacks: [
      // the bow uses Draw/Loose states; slot 3 is the rondel dagger stab used for close quarters
      A({ name: 'Loose', kind: 'thrust', windup: 0.1, release: 0.1, recover: 0.1, damage: 0, dtype: 2, stamina: 0, wind: [0, 1.3, 0.3, 0, 0, 0, 0], mid: [0, 1.3, 0.4, 0, 0, 0, 0], end: [0, 1.3, 0.4, 0, 0, 0, 0] }),
      A({ name: 'Loose', kind: 'thrust', windup: 0.1, release: 0.1, recover: 0.1, damage: 0, dtype: 2, stamina: 0, wind: [0, 1.3, 0.3, 0, 0, 0, 0], mid: [0, 1.3, 0.4, 0, 0, 0, 0], end: [0, 1.3, 0.4, 0, 0, 0, 0] }),
      A({ name: 'Loose', kind: 'thrust', windup: 0.1, release: 0.1, recover: 0.1, damage: 0, dtype: 2, stamina: 0, wind: [0, 1.3, 0.3, 0, 0, 0, 0], mid: [0, 1.3, 0.4, 0, 0, 0, 0], end: [0, 1.3, 0.4, 0, 0, 0, 0] }),
      A({ name: 'Rondel Stab', kind: 'thrust', windup: 0.22, release: 0.14, recover: 0.3, damage: 38, dtype: 2, stamina: 7,
        wind: [0.3, 1.2, -0.05, 0, -5, -30, 0], mid: [0.14, 1.32, 0.38, 0, 0, 5, 8], end: [0.1, 1.34, 0.5, 0, 2, 12, 12], lunge: 2.2, hitStart: 0.05, hitEnd: 0.33 }),
    ],
    heavyChargeMax: 0,
    blockArc: 0,
    blockStamina: 1,
    parryWindow: 0,
    visual: 'bow',
  },
};

/** A weapon built on the moves of another, retimed and rebalanced. */
function derive(base: WeaponDef, o: Partial<WeaponDef> & { id: WeaponId; time: number; dmg: number; dtype?: DmgType }): WeaponDef {
  const { time, dmg, dtype, ...rest } = o;
  return {
    ...base,
    attacks: base.attacks.map((a) => ({ ...a, windup: a.windup * time, release: a.release * time, recover: a.recover * time, damage: Math.round(a.damage * dmg), dtype: a.kind === 'thrust' ? a.dtype : (dtype ?? a.dtype) })) as unknown as WeaponDef['attacks'],
    ...rest,
  };
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  ...BASE,
  // the English bill: a hooked chopping blade and spike, quicker in the hand than the halberd
  bill: derive(BASE.halberd, {
    id: 'bill', name: 'English Bill', visual: 'bill', time: 0.9, dmg: 1.08,
    blurb: 'The yeoman\'s bill: a hooked chopping blade with a spike and a back-hook, on a haft of ash. Quick, long, and made for pulling men down.',
    hitEnd: 1.92, parryWindow: 0.22, blockStamina: 0.85,
  }),
  // a hand-and-a-half sword: the greatsword's moves, shorter, faster, and a sharper point
  bastard: derive(BASE.greatsword, {
    id: 'bastard', name: 'Hand-and-a-Half Sword', visual: 'bastard', time: 0.86, dmg: 0.98,
    blurb: 'A long sword for one hand or two. Fast as an arming sword, long as a greatsword\'s reach, and deadly at the half-sword against plate.',
    hitStart: 0.14, hitEnd: 1.2, blockArc: 150, blockStamina: 0.75, parryWindow: 0.24,
  }),
  // a great axe: the poleaxe's moves with a broad bearded blade that cleaves
  greataxe: derive(BASE.poleaxe, {
    id: 'greataxe', name: 'Great Axe', visual: 'greataxe', time: 1.0, dmg: 1.18, dtype: 0,
    blurb: 'A broad bearded axe on a long haft, gilded for a champion. Each blow can end a man.',
    hitStart: 1.0, hitEnd: 1.52,
  }),
};

// the jab (every weapon's fourth attack) is the quick blow: shorter windup, snappier strike
for (const w of Object.values(WEAPONS)) {
  const t = w.attacks[3] as AttackDef;
  if (t.kind !== 'thrust' || t.damage <= 0) continue;
  t.windup *= 0.7; t.release *= 0.85; t.recover *= 0.8;
}

export const ARROW = {
  drawTime: 0.85,
  minSpeed: 28,
  maxSpeed: 62,
  minDamage: 20,
  maxDamage: 50,
  gravity: 9.81,
  /** max time the bow can be held at full draw before the arm tires and accuracy drops */
  holdTime: 3.0,
};

/** Evaluate a key pose triple at release fraction u (0..1), Catmull-Rom style through wind-mid-end. */
export function samplePose(out: number[], a: PoseKey, b: PoseKey, c: PoseKey, u: number) {
  // piecewise: [0, 0.5] a->b, [0.5, 1] b->c with smooth tangents
  for (let i = 0; i < 7; i++) {
    const p0 = a[i], p1 = b[i], p2 = c[i];
    if (u < 0.5) {
      const t = u * 2;
      const m0 = (p1 - p0) * 0.5;            // tangent at a (one sided)
      const m1 = (p2 - p0) * 0.5;            // tangent at b
      out[i] = hermite(p0, p1, m0, m1, t);
    } else {
      const t = (u - 0.5) * 2;
      const m0 = (p2 - p0) * 0.5;
      const m1 = (p2 - p1) * 0.5;
      out[i] = hermite(p1, p2, m0, m1, t);
    }
  }
  return out;
}

function hermite(p0: number, p1: number, m0: number, m1: number, t: number) {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
}

/** Linear blend of two poses. */
export function blendPose(out: number[], a: ArrayLike<number>, b: ArrayLike<number>, t: number) {
  for (let i = 0; i < 7; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}
