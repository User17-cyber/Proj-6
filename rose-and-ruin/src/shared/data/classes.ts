import type { WeaponId } from './weapons';

export type ClassId = 'manatarms' | 'vanguard' | 'halberdier' | 'banneret' | 'longbowman' | 'errant' | 'pavisier' | 'bachelor' | 'master' | 'brigand' | 'chaplain' | 'pikeman' | 'gallowglass' | 'yeoman' | 'marshal' | 'champion';
/** at most 16: snapshots pack the class index into 4 bits */
export const CLASS_IDS: readonly ClassId[] = ['manatarms', 'vanguard', 'halberdier', 'banneret', 'longbowman', 'errant', 'pavisier', 'bachelor', 'master', 'brigand', 'chaplain', 'pikeman', 'gallowglass', 'yeoman', 'marshal', 'champion'];
/** the orders won by renown, in the order they are unlocked */
export const UNLOCK_ORDER: readonly ClassId[] = ['yeoman', 'marshal', 'champion'];

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
  | 'dash' | 'bloodletting'
  | 'billhook' | 'holdline'
  | 'halfsword' | 'warcry'
  | 'execute' | 'juggernaut'
  | 'murderstroke' | 'disarm'
  | 'throw' | 'misericorde'
  | 'bindwounds' | 'benediction'
  | 'brace' | 'pushofpike'
  | 'hamstring' | 'shieldbreaker';

export const ABILITY_IDS: readonly AbilityId[] = [
  'shield_bash', 'rally', 'whirlwind', 'charge', 'lunge', 'sweep',
  'earthshaker', 'bulwark', 'volley', 'bodkin', 'dash', 'bloodletting',
  'billhook', 'holdline', 'halfsword', 'warcry', 'execute', 'juggernaut',
  'murderstroke', 'disarm', 'throw', 'misericorde', 'bindwounds', 'benediction', 'brace', 'pushofpike', 'hamstring', 'shieldbreaker',
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
  billhook: { id: 'billhook', name: 'Bill Hook', icon: 'hook', cooldown: 11, duration: 0.7, stamina: 12,
    description: 'Hook the foe before you (up to 4 metres off) and drag him onto your bill: he is pulled to your feet, off balance, and stunned for a moment.' },
  holdline: { id: 'holdline', name: 'Hold the Line', icon: 'line', cooldown: 24, duration: 0.6, stamina: 0,
    description: 'Plant the bill and call the line together: for 8 seconds you and every ally within 9 metres take 30% less damage and cannot be thrown down.' },
  halfsword: { id: 'halfsword', name: 'Half-Sword', icon: 'halfsword', cooldown: 16, duration: 0.35, stamina: 6,
    description: 'Grip the blade and fight at the half-sword: for 8 seconds your thrusts ignore most armour, strike 30% harder and come 25% faster.' },
  warcry: { id: 'warcry', name: 'War Cry', icon: 'cry', cooldown: 22, duration: 0.8, stamina: 0,
    description: 'A shout that breaks nerve: enemies within 7 metres reel, dropping their guard, and allies within 10 metres move 20% faster for 6 seconds.' },
  execute: { id: 'execute', name: 'Executioner', icon: 'axe', cooldown: 26, duration: 0.4, stamina: 0,
    description: 'For 10 seconds, any blow of yours that leaves a foe below a third of his vigour slays him outright, and each slaying restores 25 of yours.' },
  juggernaut: { id: 'juggernaut', name: 'Juggernaut', icon: 'jugger', cooldown: 26, duration: 0.5, stamina: 0,
    description: 'For 8 seconds nothing stops you: you move 25% faster, cannot be staggered, stunned or thrown down, and any foe you walk into is bowled off his feet.' },
  murderstroke: { id: 'murderstroke', name: 'Murder Stroke', icon: 'mord', cooldown: 15, duration: 0.35, stamina: 6,
    description: 'Seize your sword by the blade and strike with the cross and pommel: your next blow within 6 seconds crushes rather than cuts, ignores half of a harness, and stuns (it can take at most half a man\'s vigour).' },
  disarm: { id: 'disarm', name: 'Bind & Disarm', icon: 'disarm', cooldown: 18, duration: 0.55, stamina: 10,
    description: 'Bind the foe\'s blade and wrench it aside: for 2.5 seconds he can neither strike nor guard. It fails against a raised shield.' },
  throw: { id: 'throw', name: 'Wrestling Throw', icon: 'throw', cooldown: 14, duration: 0.6, stamina: 14,
    description: 'Close in, take him by the arm and collar and throw him over your hip. A foe within arm\'s reach is thrown down.' },
  misericorde: { id: 'misericorde', name: 'Misericorde', icon: 'dagger', cooldown: 12, duration: 0.5, stamina: 8,
    description: 'Draw the thin dagger of mercy. A foe who is down or stunned before you is stabbed through the gaps of his helm for half his vigour; any other takes a lesser stab.' },
  bindwounds: { id: 'bindwounds', name: 'Bind Wounds', icon: 'bandage', cooldown: 20, duration: 1.0, stamina: 0,
    description: 'Bandage your hurts and those of the nearest wounded ally beside you: each recovers 45 vigour over 4 seconds and stops bleeding.' },
  benediction: { id: 'benediction', name: 'Benediction', icon: 'bless', cooldown: 26, duration: 0.9, stamina: 0,
    description: 'A blessing over the line: every ally within 10 metres recovers 40 stamina and, steadied, cannot be staggered for 6 seconds.' },
  brace: { id: 'brace', name: 'Brace for the Charge', icon: 'brace', cooldown: 16, duration: 3.5, stamina: 8,
    description: 'Ground the butt of the pike and level the point. For 3.5 seconds any foe who runs or charges onto it is impaled, stopped dead and stunned.' },
  pushofpike: { id: 'pushofpike', name: 'Push of Pike', icon: 'push', cooldown: 12, duration: 0.8, stamina: 14,
    description: 'Drive the pike forward with your whole weight: every foe in its line, up to 3.6 metres off, is struck and shoved back.' },
  hamstring: { id: 'hamstring', name: 'Hamstring', icon: 'hamstring', cooldown: 13, duration: 0.55, stamina: 10,
    description: 'A low cut behind the knee: the foe before you bleeds and is lamed, moving 40% slower for 6 seconds.' },
  shieldbreaker: { id: 'shieldbreaker', name: 'Shield-Breaker', icon: 'shatter', cooldown: 15, duration: 0.3, stamina: 6,
    description: 'Your next blow within 6 seconds against a raised guard smashes through it: it breaks the guard outright and does four times the harm to a shield.' },
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
  /** body size: height (1 = 1.8 m) and girth across the shoulders, belly and limbs */
  size: { height: number; girth: number };
  armor: readonly [number, number, number]; // damage reduction vs cut, blunt, pierce
  weapon: WeaponId;
  shield: ShieldId | null;
  ranged: boolean;
  abilities: readonly [AbilityId, AbilityId];
  /** heavy attacks cannot be interrupted by light hits */
  hyperArmor: boolean;
  /** how fast this order swings: 1 is the norm, higher is quicker (windup, release and recovery are divided by it) */
  attackSpeed: number;
  /** UI ratings 1..5 */
  ratings: { attack: number; defence: number; speed: number; reach: number; difficulty: number };
  armourDesc: string;
  /** weight used when bots pick classes */
  botWeight: number;
  /** renown needed to unlock this order (0 or absent: always open) */
  unlock?: number;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  manatarms: {
    id: 'manatarms', name: 'Man-at-Arms', title: 'Sword & Heater Shield',
    description: 'The backbone of every retinue. A broad shield turns aside blows and arrows alike, and the arming sword answers quickly. Shield Bash breaks stubborn guards; Rally keeps the line standing.',
    hp: 120, stamina: 100, speed: 4.7, sprint: 6.9, mass: 1.0, size: { height: 1.0, girth: 1.0 },
    armor: [0.3, 0.12, 0.22], weapon: 'arming_sword', shield: 'heater', ranged: false,
    abilities: ['shield_bash', 'rally'], hyperArmor: false, attackSpeed: 1.05,
    ratings: { attack: 3, defence: 5, speed: 3, reach: 2, difficulty: 1 },
    armourDesc: 'Open-faced bascinet and aventail, plate harness over mail',
    botWeight: 26,
  },
  vanguard: {
    id: 'vanguard', name: 'Vanguard', title: 'Two-Handed Greatsword',
    description: 'First into the breach. The greatsword\'s great arcs strike several foes at once. Whirlwind punishes those who crowd you; Battle Charge throws an enemy to the mud.',
    hp: 125, stamina: 105, speed: 4.6, sprint: 6.8, mass: 1.1, size: { height: 1.06, girth: 1.06 },
    armor: [0.34, 0.12, 0.26], weapon: 'greatsword', shield: null, ranged: false,
    abilities: ['whirlwind', 'charge'], hyperArmor: true, attackSpeed: 0.9,
    ratings: { attack: 5, defence: 2, speed: 3, reach: 4, difficulty: 3 },
    armourDesc: 'Great helm, full plate with surcoat',
    botWeight: 17,
  },
  halberdier: {
    id: 'halberdier', name: 'Halberdier', title: 'Halberd',
    description: 'Master of distance. The halberd hews, hooks and stabs from beyond a sword\'s reach. The Impaling Lunge pins a foe; Hook & Sweep drags a whole rank off its feet.',
    hp: 115, stamina: 100, speed: 4.5, sprint: 6.7, mass: 1.0, size: { height: 1.04, girth: 0.96 },
    armor: [0.26, 0.1, 0.2], weapon: 'halberd', shield: null, ranged: false,
    abilities: ['lunge', 'sweep'], hyperArmor: false, attackSpeed: 0.95,
    ratings: { attack: 4, defence: 2, speed: 3, reach: 5, difficulty: 2 },
    armourDesc: 'Open sallet and bevor, brigandine over mail',
    botWeight: 17,
  },
  banneret: {
    id: 'banneret', name: 'Banneret', title: 'Poleaxe & Full Plate',
    description: 'A lord-knight encased in Milanese plate. Slow, but the hammer of the poleaxe crushes armour that turns any blade. Earthshaker flattens the crowd; Iron Bulwark makes you a wall.',
    hp: 150, stamina: 95, speed: 4.1, sprint: 6.0, mass: 1.45, size: { height: 1.08, girth: 1.12 },
    armor: [0.45, 0.18, 0.36], weapon: 'poleaxe', shield: null, ranged: false,
    abilities: ['earthshaker', 'bulwark'], hyperArmor: true, attackSpeed: 0.85,
    ratings: { attack: 4, defence: 5, speed: 1, reach: 3, difficulty: 2 },
    armourDesc: 'Armet and full Milanese harness',
    botWeight: 13,
  },
  longbowman: {
    id: 'longbowman', name: 'Longbowman', title: 'English Longbow & Rondel Dagger',
    description: 'The yeoman archer who won Agincourt. Hold to draw, release to loose; a full draw kills the lightly armoured outright. Arrow Storm rains death on a crowd; Bodkin Point pierces any plate.',
    hp: 90, stamina: 100, speed: 5.0, sprint: 7.3, mass: 0.85, size: { height: 0.96, girth: 0.92 },
    armor: [0.12, 0.06, 0.1], weapon: 'longbow', shield: null, ranged: true,
    abilities: ['volley', 'bodkin'], hyperArmor: false, attackSpeed: 1.05,
    ratings: { attack: 4, defence: 1, speed: 4, reach: 5, difficulty: 3 },
    armourDesc: 'Kettle hat, padded jack and mail',
    botWeight: 10,
  },
  errant: {
    id: 'errant', name: 'Knight-Errant', title: 'Falchion & Buckler',
    description: 'A wandering duelist, lightly armoured and terribly quick. The buckler parries on a generous window. Sidestep slips out of harm\'s way; Bloodletting makes every cut bleed.',
    hp: 112, stamina: 115, speed: 5.2, sprint: 7.6, mass: 0.9, size: { height: 0.95, girth: 0.93 },
    armor: [0.24, 0.1, 0.18], weapon: 'falchion', shield: 'buckler', ranged: false,
    abilities: ['dash', 'bloodletting'], hyperArmor: false, attackSpeed: 1.15,
    ratings: { attack: 3, defence: 3, speed: 5, reach: 2, difficulty: 4 },
    armourDesc: 'Barbute, mail hauberk and brigandine',
    botWeight: 12,
  },
  pavisier: {
    id: 'pavisier', name: 'Pavisier', title: 'War Spear & Hand Pavise',
    description: 'A wall of painted timber with a spear behind it. The pavise covers him from shin to brow and turns arrow after arrow, but every blow it takes splinters it further. Shield Bash shoves foes off the line; Iron Bulwark roots him in place.',
    hp: 120, stamina: 105, speed: 4.4, sprint: 6.5, mass: 1.15, size: { height: 1.0, girth: 1.08 },
    armor: [0.28, 0.12, 0.22], weapon: 'spear', shield: 'pavise', ranged: false,
    abilities: ['shield_bash', 'bulwark'], hyperArmor: false, attackSpeed: 1.0,
    ratings: { attack: 3, defence: 5, speed: 2, reach: 4, difficulty: 2 },
    armourDesc: 'Kettle hat over a mail coif, brigandine and splinted limbs',
    botWeight: 12,
  },
  bachelor: {
    id: 'bachelor', name: 'Knight Bachelor', title: 'Flanged Mace & Heater Shield',
    description: 'A young knight with his spurs freshly won. The mace caves in plate that turns a sword, and a heater shield keeps him alive long enough to use it. Shield Bash opens a guard; Battle Charge carries him into the press.',
    hp: 130, stamina: 100, speed: 4.6, sprint: 6.8, mass: 1.1, size: { height: 1.02, girth: 1.03 },
    armor: [0.36, 0.14, 0.28], weapon: 'mace', shield: 'heater', ranged: false,
    abilities: ['shield_bash', 'charge'], hyperArmor: false, attackSpeed: 0.95,
    ratings: { attack: 4, defence: 4, speed: 3, reach: 2, difficulty: 2 },
    armourDesc: 'Visored bascinet, plate harness and surcoat',
    botWeight: 14,
  },
  master: {
    id: 'master', name: 'Master of Defence', title: 'Longsword',
    description: 'A sworn master of the art of fence, trained in the German and Italian schools. Lightly armoured and lethally quick, with a parry like a door slamming. Murder Stroke turns the sword about to crush plate; Bind & Disarm takes the foe\'s weapon out of the fight.',
    hp: 100, stamina: 115, speed: 5.0, sprint: 7.3, mass: 0.95, size: { height: 1.0, girth: 0.96 },
    armor: [0.2, 0.08, 0.16], weapon: 'longsword', shield: null, ranged: false,
    abilities: ['murderstroke', 'disarm'], hyperArmor: false, attackSpeed: 1.04,
    ratings: { attack: 4, defence: 3, speed: 4, reach: 4, difficulty: 5 },
    armourDesc: 'Open-faced bascinet, arming doublet and a brigandine',
    botWeight: 8,
  },
  brigand: {
    id: 'brigand', name: 'Brigand', title: 'War Axe',
    description: 'A free company cut-throat who fights to win, not for honour. Wrestling Throw puts a knight on his back, and the Misericorde drives in while he lies there.',
    hp: 118, stamina: 115, speed: 5.0, sprint: 7.5, mass: 1.0, size: { height: 0.98, girth: 1.04 },
    armor: [0.2, 0.1, 0.16], weapon: 'waraxe', shield: null, ranged: false,
    abilities: ['throw', 'misericorde'], hyperArmor: false, attackSpeed: 1.08,
    ratings: { attack: 4, defence: 2, speed: 4, reach: 2, difficulty: 3 },
    armourDesc: 'Skull cap, padded jack over mail',
    botWeight: 9,
  },
  chaplain: {
    id: 'chaplain', name: 'Battle Chaplain', title: 'Flanged Mace',
    description: 'A priest of a lord\'s household who goes armed among the men, mace in hand. He binds wounds under the blows and blesses the line to hold it together.',
    hp: 140, stamina: 110, speed: 4.7, sprint: 6.9, mass: 1.05, size: { height: 1.0, girth: 1.06 },
    armor: [0.36, 0.14, 0.3], weapon: 'mace', shield: null, ranged: false,
    abilities: ['bindwounds', 'benediction'], hyperArmor: false, attackSpeed: 1.08,
    ratings: { attack: 3, defence: 3, speed: 3, reach: 2, difficulty: 2 },
    armourDesc: 'Mail coif, harness under a white surplice-tabard',
    botWeight: 7,
  },
  pikeman: {
    id: 'pikeman', name: 'Pikeman', title: 'Pike',
    description: 'A mercenary of the hedgehog, trained to keep men and horses off with eighteen feet of ash. Brace for the Charge impales whoever runs at him; Push of Pike shoves a whole rank back.',
    hp: 115, stamina: 105, speed: 4.4, sprint: 6.5, mass: 1.05, size: { height: 1.02, girth: 1.0 },
    armor: [0.26, 0.12, 0.22], weapon: 'pike', shield: null, ranged: false,
    abilities: ['brace', 'pushofpike'], hyperArmor: false, attackSpeed: 1.1,
    ratings: { attack: 3, defence: 2, speed: 2, reach: 5, difficulty: 3 },
    armourDesc: 'Sallet, breastplate over a padded jack',
    botWeight: 8,
  },
  gallowglass: {
    id: 'gallowglass', name: 'Gallowglass', title: 'Sparth Axe',
    description: 'A mail-clad axeman of the Isles, hired from the Irish wars. Hamstring lames the man before him; Shield-Breaker smashes straight through a raised guard.',
    hp: 148, stamina: 110, speed: 4.7, sprint: 6.9, mass: 1.2, size: { height: 1.06, girth: 1.08 },
    armor: [0.32, 0.13, 0.3], weapon: 'sparth', shield: null, ranged: false,
    abilities: ['hamstring', 'shieldbreaker'], hyperArmor: true, attackSpeed: 1.04,
    ratings: { attack: 5, defence: 3, speed: 3, reach: 4, difficulty: 2 },
    armourDesc: 'Conical bascinet, a long mail hauberk to the knees',
    botWeight: 8,
  },
  yeoman: {
    id: 'yeoman', name: 'Yeoman of the Guard', title: 'English Bill',
    description: 'A sworn yeoman of the king\'s guard. The bill is quicker than a halberd and longer than any sword; Bill Hook drags a foe off his feet onto it, and Hold the Line makes a wall of the men around you.',
    hp: 140, stamina: 115, speed: 4.8, sprint: 7.0, mass: 1.05, size: { height: 1.03, girth: 1.02 },
    armor: [0.34, 0.16, 0.36], weapon: 'bill', shield: null, ranged: false,
    abilities: ['billhook', 'holdline'], hyperArmor: false, attackSpeed: 1.12,
    ratings: { attack: 4, defence: 3, speed: 3, reach: 5, difficulty: 2 },
    armourDesc: 'Sallet, brigandine in royal livery, splinted arms and legs',
    botWeight: 7, unlock: 1500,
  },
  marshal: {
    id: 'marshal', name: 'Knight Marshal', title: 'Hand-and-a-Half Sword',
    description: 'A master of the long sword who commands the field. Quick, guarded and lethal: Half-Sword drives the point through plate, and War Cry breaks the enemy\'s nerve while his own men surge forward.',
    hp: 140, stamina: 115, speed: 4.8, sprint: 7.0, mass: 1.1, size: { height: 1.04, girth: 1.04 },
    armor: [0.42, 0.16, 0.32], weapon: 'bastard', shield: null, ranged: false,
    abilities: ['halfsword', 'warcry'], hyperArmor: false, attackSpeed: 1.06,
    ratings: { attack: 5, defence: 4, speed: 4, reach: 4, difficulty: 3 },
    armourDesc: 'Armet, white harness of Milanese plate and a marshal\'s tabard',
    botWeight: 6, unlock: 4000,
  },
  champion: {
    id: 'champion', name: 'Champion', title: 'Great Axe & Gilded Plate',
    description: 'The king\'s own champion in gilded plate. The great axe ends men in one or two blows; Executioner finishes any foe left reeling, and Juggernaut carries him through the press like a ram.',
    hp: 170, stamina: 115, speed: 4.65, sprint: 6.9, mass: 1.5, size: { height: 1.1, girth: 1.14 },
    armor: [0.5, 0.22, 0.62], weapon: 'greataxe', shield: null, ranged: false,
    abilities: ['execute', 'juggernaut'], hyperArmor: true, attackSpeed: 0.95,
    ratings: { attack: 5, defence: 5, speed: 2, reach: 4, difficulty: 3 },
    armourDesc: 'Crested great bascinet and gilded full harness',
    botWeight: 5, unlock: 8000,
  },
};

export const classIndex = (id: ClassId) => CLASS_IDS.indexOf(id);
export const abilityIndex = (id: AbilityId) => ABILITY_IDS.indexOf(id);
