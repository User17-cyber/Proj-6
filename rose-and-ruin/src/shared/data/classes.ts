import type { WeaponId } from './weapons';

export type ClassId = 'manatarms' | 'vanguard' | 'halberdier' | 'banneret' | 'longbowman' | 'errant' | 'pavisier' | 'bachelor';
/** at most 8: snapshots pack the class index into 3 bits */
export const CLASS_IDS: readonly ClassId[] = ['manatarms', 'vanguard', 'halberdier', 'banneret', 'longbowman', 'errant', 'pavisier', 'bachelor'];

export type ShieldId = 'heater' | 'buckler' | 'pavise';

export interface ShieldDef {
  id: ShieldId;
  name: string;
  /** durability: the damage the shield can turn before it splinters */
  hp: number;
  /** guard arc (degrees, full) and stamina multiplier while the shield is whole */
  blockArc: number;
  blockStamina: number;
  /** stops arrows */
  arrows: boolean;
  /** chance an arrow from the front strikes the shield when not guarding */
  cover: number;
}

export const SHIELDS: Record<ShieldId, ShieldDef> = {
  heater: { id: 'heater', name: 'heater shield', hp: 260, blockArc: 170, blockStamina: 0.55, arrows: true, cover: 0.35 },
  buckler: { id: 'buckler', name: 'buckler', hp: 160, blockArc: 130, blockStamina: 0.7, arrows: false, cover: 0 },
  pavise: { id: 'pavise', name: 'hand pavise', hp: 440, blockArc: 210, blockStamina: 0.4, arrows: true, cover: 0.7 },
};

export type AbilityId =
  | 'shield_bash' | 'rally'
  | 'whirlwind' | 'charge'
  | 'lunge' | 'sweep'
  | 'earthshaker' | 'bulwark'
  | 'volley' | 'bodkin'
  | 'dash' | 'bloodletting';

export const ABILITY_IDS: readonly AbilityId[] = [
  'shield_bash', 'rally', 'whirlwind', 'charge', 'lunge', 'sweep',
  'earthshaker', 'bulwark', 'volley', 'bodkin', 'dash', 'bloodletting',
];

export interface AbilityDef {
  id: AbilityId;
  name: string;
  description: string;
  cooldown: number;
  /** how long the caster is busy performing it */
  duration: number;
  stamina: number;
  icon: string; // icon key for the UI
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  shield_bash: { id: 'shield_bash', name: 'Shield Bash', icon: 'bash', cooldown: 9, duration: 0.55, stamina: 12,
    description: 'Drive your shield into the foe before you, breaking his guard and stunning him for a moment.' },
  rally: { id: 'rally', name: 'Rally to the Banner', icon: 'rally', cooldown: 32, duration: 0.9, stamina: 0,
    description: 'A war cry that restores 35 health to you and every ally within 12 metres and sharpens their blows (+15% damage) for 8 seconds.' },
  whirlwind: { id: 'whirlwind', name: 'Whirlwind', icon: 'whirl', cooldown: 18, duration: 1.3, stamina: 18,
    description: 'Spin with the greatsword twice around, cutting every enemy within reach.' },
  charge: { id: 'charge', name: 'Battle Charge', icon: 'charge', cooldown: 16, duration: 2.0, stamina: 15,
    description: 'Charge headlong. Nothing staggers you, and the first foe you strike is thrown to the ground.' },
  lunge: { id: 'lunge', name: 'Impaling Lunge', icon: 'lunge', cooldown: 10, duration: 0.85, stamina: 12,
    description: 'A long lunging thrust that punches through armour and pins the victim in place.' },
  sweep: { id: 'sweep', name: 'Hook & Sweep', icon: 'sweep', cooldown: 15, duration: 0.9, stamina: 14,
    description: 'Hook the legs of every enemy in a wide arc before you and drag them down.' },
  earthshaker: { id: 'earthshaker', name: 'Earthshaker', icon: 'slam', cooldown: 18, duration: 1.1, stamina: 18,
    description: 'Leap and bring the poleaxe down on the earth. Enemies nearby are battered and knocked flat.' },
  bulwark: { id: 'bulwark', name: 'Iron Bulwark', icon: 'bulwark', cooldown: 25, duration: 0.6, stamina: 0,
    description: 'For 6 seconds take half damage and cannot be staggered, stunned or thrown down.' },
  volley: { id: 'volley', name: 'Arrow Storm', icon: 'volley', cooldown: 20, duration: 0.8, stamina: 0,
    description: 'Signal the archers: a storm of arrows falls on the place you aim at.' },
  bodkin: { id: 'bodkin', name: 'Bodkin Point', icon: 'bodkin', cooldown: 9, duration: 0.2, stamina: 0,
    description: 'Nock a needle-pointed bodkin. Your next arrow ignores armour and shields and passes through its first victim.' },
  dash: { id: 'dash', name: 'Sidestep', icon: 'dash', cooldown: 5, duration: 0.3, stamina: 15,
    description: 'A lightning sidestep in the direction you are moving. Blows that land mid-step miss.' },
  bloodletting: { id: 'bloodletting', name: 'Bloodletting', icon: 'bleed', cooldown: 18, duration: 0.5, stamina: 0,
    description: 'For 8 seconds every cut opens a wound that bleeds the victim (stacks three times).' },
};

export interface ClassDef {
  id: ClassId;
  name: string;
  title: string;
  description: string;
  hp: number;
  stamina: number;
  speed: number;
  sprint: number;
  /** push weight in crowds */
  mass: number;
  armor: readonly [number, number, number]; // damage reduction vs cut, blunt, pierce
  weapon: WeaponId;
  shield: ShieldId | null;
  ranged: boolean;
  abilities: readonly [AbilityId, AbilityId];
  /** heavy attacks cannot be interrupted by light hits */
  hyperArmor: boolean;
  attackSpeed: number;
  /** UI ratings 1..5 */
  ratings: { attack: number; defence: number; speed: number; reach: number; difficulty: number };
  armourDesc: string;
  /** weight used when bots pick classes */
  botWeight: number;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  manatarms: {
    id: 'manatarms', name: 'Man-at-Arms', title: 'Sword & Heater Shield',
    description: 'The backbone of every retinue. A broad shield turns aside blows and arrows alike, and the arming sword answers quickly. Shield Bash breaks stubborn guards; Rally keeps the line standing.',
    hp: 120, stamina: 100, speed: 4.7, sprint: 6.9, mass: 1.0,
    armor: [0.3, 0.12, 0.22], weapon: 'arming_sword', shield: 'heater', ranged: false,
    abilities: ['shield_bash', 'rally'], hyperArmor: false, attackSpeed: 1,
    ratings: { attack: 3, defence: 5, speed: 3, reach: 2, difficulty: 1 },
    armourDesc: 'Open-faced bascinet and aventail, plate harness over mail',
    botWeight: 26,
  },
  vanguard: {
    id: 'vanguard', name: 'Vanguard', title: 'Two-Handed Greatsword',
    description: 'First into the breach. The greatsword\'s great arcs strike several foes at once. Whirlwind punishes those who crowd you; Battle Charge throws an enemy to the mud.',
    hp: 125, stamina: 105, speed: 4.6, sprint: 6.8, mass: 1.1,
    armor: [0.34, 0.12, 0.26], weapon: 'greatsword', shield: null, ranged: false,
    abilities: ['whirlwind', 'charge'], hyperArmor: true, attackSpeed: 1,
    ratings: { attack: 5, defence: 2, speed: 3, reach: 4, difficulty: 3 },
    armourDesc: 'Great helm, full plate with surcoat',
    botWeight: 17,
  },
  halberdier: {
    id: 'halberdier', name: 'Halberdier', title: 'Halberd',
    description: 'Master of distance. The halberd hews, hooks and stabs from beyond a sword\'s reach. The Impaling Lunge pins a foe; Hook & Sweep drags a whole rank off its feet.',
    hp: 115, stamina: 100, speed: 4.5, sprint: 6.7, mass: 1.0,
    armor: [0.26, 0.1, 0.2], weapon: 'halberd', shield: null, ranged: false,
    abilities: ['lunge', 'sweep'], hyperArmor: false, attackSpeed: 1,
    ratings: { attack: 4, defence: 2, speed: 3, reach: 5, difficulty: 2 },
    armourDesc: 'Open sallet and bevor, brigandine over mail',
    botWeight: 17,
  },
  banneret: {
    id: 'banneret', name: 'Banneret', title: 'Poleaxe & Full Plate',
    description: 'A lord-knight encased in Milanese plate. Slow, but the hammer of the poleaxe crushes armour that turns any blade. Earthshaker flattens the crowd; Iron Bulwark makes you a wall.',
    hp: 150, stamina: 95, speed: 4.1, sprint: 6.0, mass: 1.45,
    armor: [0.45, 0.18, 0.36], weapon: 'poleaxe', shield: null, ranged: false,
    abilities: ['earthshaker', 'bulwark'], hyperArmor: true, attackSpeed: 1,
    ratings: { attack: 4, defence: 5, speed: 1, reach: 3, difficulty: 2 },
    armourDesc: 'Armet and full Milanese harness',
    botWeight: 13,
  },
  longbowman: {
    id: 'longbowman', name: 'Longbowman', title: 'English Longbow & Rondel Dagger',
    description: 'The yeoman archer who won Agincourt. Hold to draw, release to loose; a full draw kills the lightly armoured outright. Arrow Storm rains death on a crowd; Bodkin Point pierces any plate.',
    hp: 90, stamina: 100, speed: 5.0, sprint: 7.3, mass: 0.85,
    armor: [0.12, 0.06, 0.1], weapon: 'longbow', shield: null, ranged: true,
    abilities: ['volley', 'bodkin'], hyperArmor: false, attackSpeed: 1,
    ratings: { attack: 4, defence: 1, speed: 4, reach: 5, difficulty: 3 },
    armourDesc: 'Kettle hat, padded jack and mail',
    botWeight: 10,
  },
  errant: {
    id: 'errant', name: 'Knight-Errant', title: 'Falchion & Buckler',
    description: 'A wandering duelist, lightly armoured and terribly quick. The buckler parries on a generous window. Sidestep slips out of harm\'s way; Bloodletting makes every cut bleed.',
    hp: 112, stamina: 115, speed: 5.2, sprint: 7.6, mass: 0.9,
    armor: [0.24, 0.1, 0.18], weapon: 'falchion', shield: 'buckler', ranged: false,
    abilities: ['dash', 'bloodletting'], hyperArmor: false, attackSpeed: 1,
    ratings: { attack: 3, defence: 3, speed: 5, reach: 2, difficulty: 4 },
    armourDesc: 'Barbute, mail hauberk and brigandine',
    botWeight: 12,
  },
  pavisier: {
    id: 'pavisier', name: 'Pavisier', title: 'War Spear & Hand Pavise',
    description: 'A wall of painted timber with a spear behind it. The pavise covers him from shin to brow and turns arrow after arrow, but every blow it takes splinters it further. Shield Bash shoves foes off the line; Iron Bulwark roots him in place.',
    hp: 120, stamina: 105, speed: 4.4, sprint: 6.5, mass: 1.15,
    armor: [0.28, 0.12, 0.22], weapon: 'spear', shield: 'pavise', ranged: false,
    abilities: ['shield_bash', 'bulwark'], hyperArmor: false, attackSpeed: 1,
    ratings: { attack: 3, defence: 5, speed: 2, reach: 4, difficulty: 2 },
    armourDesc: 'Kettle hat over a mail coif, brigandine and splinted limbs',
    botWeight: 12,
  },
  bachelor: {
    id: 'bachelor', name: 'Knight Bachelor', title: 'Flanged Mace & Heater Shield',
    description: 'A young knight with his spurs freshly won. The mace caves in plate that turns a sword, and a heater shield keeps him alive long enough to use it. Shield Bash opens a guard; Battle Charge carries him into the press.',
    hp: 130, stamina: 100, speed: 4.6, sprint: 6.8, mass: 1.1,
    armor: [0.36, 0.14, 0.28], weapon: 'mace', shield: 'heater', ranged: false,
    abilities: ['shield_bash', 'charge'], hyperArmor: false, attackSpeed: 1,
    ratings: { attack: 4, defence: 4, speed: 3, reach: 2, difficulty: 2 },
    armourDesc: 'Visored bascinet, plate harness and surcoat',
    botWeight: 14,
  },
};

export const classIndex = (id: ClassId) => CLASS_IDS.indexOf(id);
export const abilityIndex = (id: AbilityId) => ABILITY_IDS.indexOf(id);
