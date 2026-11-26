import type { WeaponId } from './weapons';

export type ClassId = 'manatarms' | 'vanguard' | 'halberdier' | 'banneret' | 'longbowman' | 'errant' | 'pavisier' | 'bachelor' | 'master' | 'brigand' | 'chaplain' | 'pikeman' | 'gallowglass' | 'yeoman' | 'marshal' | 'champion' | 'bearer' | 'sapper' | 'kern' | 'hammerer' | 'garter' | 'warlord' | 'colossus' | 'cutthroat' | 'goliath';
/** at most 128: snapshots pack the class index into 7 bits. Listed from least to most renown. */
export const CLASS_IDS: readonly ClassId[] = ['manatarms', 'vanguard', 'halberdier', 'banneret', 'longbowman', 'errant', 'pavisier', 'bachelor', 'master', 'brigand', 'chaplain', 'pikeman', 'gallowglass', 'bearer', 'sapper', 'kern', 'hammerer', 'cutthroat', 'yeoman', 'marshal', 'garter', 'goliath', 'champion', 'warlord', 'colossus'];
/** the orders won by renown, in the order they are unlocked */
export const UNLOCK_ORDER: readonly ClassId[] = ['yeoman', 'marshal', 'garter', 'goliath', 'champion', 'warlord', 'colossus'];

export type ShieldId = 'heater' | 'buckler' | 'pavise' | 'tower';

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
  tower: { id: 'tower', name: 'great tower shield', hp: 950, blockArc: 230, blockStamina: 0.3, arrows: true, cover: 0.85 },
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
  | 'hamstring' | 'shieldbreaker'
  | 'standard' | 'callarms'
  | 'caltrops' | 'firepot'
  | 'javelin' | 'skirmish'
  | 'hookguard' | 'ringhelm'
  | 'counterstroke' | 'inspire'
  | 'command' | 'cleave'
  | 'realm' | 'shieldslam'
  | 'flurry';

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
  halfsword: { id: 'halfsword', name: 'Half-Sword', icon: 'halfsword', cooldown: 16, duration: 0.5, stamina: 6,
    description: 'Grip the blade and fight at the half-sword: for 8 seconds your thrusts ignore most armour, strike 30% harder and come 25% faster.' },
  warcry: { id: 'warcry', name: 'War Cry', icon: 'cry', cooldown: 22, duration: 0.8, stamina: 0,
    description: 'A shout that breaks nerve: enemies within 7 metres reel, dropping their guard, and allies within 10 metres move 20% faster for 6 seconds.' },
  execute: { id: 'execute', name: 'Executioner', icon: 'axe', cooldown: 26, duration: 0.5, stamina: 0,
    description: 'For 10 seconds, any blow of yours that leaves a foe below a third of his vigour slays him outright, and each slaying restores 25 of yours.' },
  juggernaut: { id: 'juggernaut', name: 'Juggernaut', icon: 'jugger', cooldown: 26, duration: 0.5, stamina: 0,
    description: 'For 8 seconds nothing stops you: you move 25% faster, cannot be staggered, stunned or thrown down, and any foe you walk into is bowled off his feet.' },
  murderstroke: { id: 'murderstroke', name: 'Murder Stroke', icon: 'mord', cooldown: 15, duration: 0.5, stamina: 6,
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
  shieldbreaker: { id: 'shieldbreaker', name: 'Shield-Breaker', icon: 'shatter', cooldown: 15, duration: 0.5, stamina: 6,
    description: 'Your next blow within 6 seconds against a raised guard smashes through it: it breaks the guard outright and does four times the harm to a shield.' },
  standard: { id: 'standard', name: 'Plant the Standard', icon: 'standard', cooldown: 30, duration: 0.8, stamina: 0,
    description: 'Drive the banner into the ground. For 12 seconds every comrade within 9 metres of it takes 15% less harm and gets his wind back faster.' },
  callarms: { id: 'callarms', name: 'Call to Arms', icon: 'callarms', cooldown: 20, duration: 0.6, stamina: 0,
    description: 'Wave the banner forward: you and every comrade within 15 metres move a fifth faster for 5 seconds.' },
  caltrops: { id: 'caltrops', name: 'Caltrops', icon: 'caltrops', cooldown: 18, duration: 0.6, stamina: 6,
    description: 'Scatter iron caltrops across the ground before you. For 15 seconds any foe who treads on them is lamed for 4 seconds and bleeds.' },
  firepot: { id: 'firepot', name: 'Fire Pot', icon: 'firepot', cooldown: 22, duration: 0.7, stamina: 8,
    description: 'Hurl a clay pot of burning pitch up to 14 metres. It bursts into a fire that burns any foe in it for 6 seconds.' },
  javelin: { id: 'javelin', name: 'Throw Javelin', icon: 'javelin', cooldown: 6, duration: 0.55, stamina: 10,
    description: 'Cast a javelin where you aim. It strikes hard enough to stagger a man, though a shield will catch it.' },
  skirmish: { id: 'skirmish', name: 'Skirmish', icon: 'skirmish', cooldown: 10, duration: 0.35, stamina: 14,
    description: 'Spring back out of reach, then run light-footed: a fifth faster for 4 seconds.' },
  hookguard: { id: 'hookguard', name: 'Hook the Guard', icon: 'hookguard', cooldown: 12, duration: 0.6, stamina: 10,
    description: 'Catch the foe\'s shield or blade with the beak and wrench it aside: his guard is broken and he reels. One who was not guarding is tripped instead.' },
  ringhelm: { id: 'ringhelm', name: 'Ring the Helm', icon: 'ringhelm', cooldown: 16, duration: 0.5, stamina: 6,
    description: 'Your next blow within 6 seconds lands with the hammer face: the foe is stunned for a second and a half and dazed, slowed for 3 seconds after.' },
  counterstroke: { id: 'counterstroke', name: 'Counterstroke', icon: 'counter', cooldown: 12, duration: 0.4, stamina: 6,
    description: 'Set yourself to answer: for 4 seconds the next blow you turn on your shield leaves its striker stunned for a second.' },
  inspire: { id: 'inspire', name: 'For Saint George!', icon: 'inspire', cooldown: 24, duration: 0.8, stamina: 0,
    description: 'Raise the cry of the Order. You and every comrade within 12 metres strike 15% harder for 8 seconds.' },
  command: { id: 'command', name: 'Lord\'s Command', icon: 'command', cooldown: 28, duration: 0.9, stamina: 0,
    description: 'The lord gives the word. You and every comrade within 15 metres recover 25 vigour, move faster and strike harder for 6 seconds.' },
  cleave: { id: 'cleave', name: 'Cleave', icon: 'cleave', cooldown: 14, duration: 0.85, stamina: 18,
    description: 'A great sweeping blow across everyone before you: every foe within 3 metres takes heavy harm and reels.' },
  realm: { id: 'realm', name: 'Bulwark of the Realm', icon: 'realm', cooldown: 26, duration: 0.7, stamina: 0,
    description: 'Plant the great shield and draw your comrades behind it: you and every comrade within 7 metres take 30% less harm for 6 seconds.' },
  shieldslam: { id: 'shieldslam', name: 'Shield Slam', icon: 'slam2', cooldown: 12, duration: 0.7, stamina: 16,
    description: 'Drive the great shield into the press before you: every foe within 3.5 metres is battered back and stunned for a second.' },
  flurry: { id: 'flurry', name: 'Flurry', icon: 'flurry', cooldown: 6, duration: 0.7, stamina: 12,
    description: 'Three quick stabs at the man before you, each finding the gaps in his harness.' },
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
  /** never knocked off his feet, whatever strikes him */
  immovable?: boolean;
  /** multiplies every stamina cost (blows, guards, abilities, sprinting); 1 when absent */
  staminaDrain?: number;
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
  bearer: {
    id: 'bearer', name: 'Standard-Bearer', title: 'Banner Pole',
    description: 'He carries the house banner, and men fight hardest where they can see it. Plant the Standard steadies everyone around it; Call to Arms sends the line forward at a run.',
    hp: 138, stamina: 115, speed: 4.8, sprint: 7.0, mass: 1.05, size: { height: 1.02, girth: 1.02 },
    armor: [0.34, 0.13, 0.3], weapon: 'standard', shield: null, ranged: false,
    abilities: ['standard', 'callarms'], hyperArmor: false, attackSpeed: 1.0,
    ratings: { attack: 2, defence: 3, speed: 3, reach: 4, difficulty: 2 },
    armourDesc: 'Sallet and bevor, a brigandine under the house colours',
    botWeight: 6,
  },
  sapper: {
    id: 'sapper', name: 'Sapper', title: 'Maul',
    description: 'A miner and engineer of the siege train, who knows how to make ground deadly. Caltrops lame whoever crosses them; the Fire Pot sets the ground itself alight.',
    hp: 120, stamina: 110, speed: 4.6, sprint: 6.8, mass: 1.1, size: { height: 0.98, girth: 1.1 },
    armor: [0.26, 0.12, 0.24], weapon: 'maul', shield: null, ranged: false,
    abilities: ['caltrops', 'firepot'], hyperArmor: false, attackSpeed: 1.06,
    ratings: { attack: 3, defence: 2, speed: 2, reach: 2, difficulty: 3 },
    armourDesc: 'Kettle hat, a leather jack and stout boots',
    botWeight: 6,
  },
  kern: {
    id: 'kern', name: 'Kern', title: 'Casting Spear & Buckler',
    description: 'A lightly armed Irish skirmisher, the kind brought over for the Yorkist cause at Stoke. He wears little and moves fast: Throw Javelin strikes from afar; Skirmish springs him clear of a counterstroke.',
    hp: 116, stamina: 125, speed: 5.4, sprint: 7.8, mass: 0.9, size: { height: 0.96, girth: 0.92 },
    armor: [0.14, 0.07, 0.12], weapon: 'javelin', shield: 'buckler', ranged: false,
    abilities: ['javelin', 'skirmish'], hyperArmor: false, attackSpeed: 0.86,
    ratings: { attack: 3, defence: 1, speed: 5, reach: 3, difficulty: 4 },
    armourDesc: 'Bare-headed, a saffron shirt and a quilted coat',
    botWeight: 7,
  },
  hammerer: {
    id: 'hammerer', name: 'Hammerer', title: 'Bec de Corbin',
    description: 'A knight in full harness who trusts a hammer over an edge against men in plate. Hook the Guard tears a defence open; Ring the Helm leaves the next foe he strikes reeling.',
    hp: 150, stamina: 100, speed: 4.4, sprint: 6.5, mass: 1.25, size: { height: 1.04, girth: 1.08 },
    armor: [0.46, 0.18, 0.42], weapon: 'beccorbin', shield: null, ranged: false,
    abilities: ['hookguard', 'ringhelm'], hyperArmor: false, attackSpeed: 1.06,
    ratings: { attack: 4, defence: 4, speed: 2, reach: 3, difficulty: 3 },
    armourDesc: 'Great bascinet and full white harness',
    botWeight: 7,
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
    hp: 205, stamina: 130, speed: 4.75, sprint: 7.0, mass: 1.6, size: { height: 1.1, girth: 1.14 },
    armor: [0.55, 0.26, 0.64], weapon: 'greataxe', shield: null, ranged: false,
    abilities: ['execute', 'juggernaut'], hyperArmor: true, attackSpeed: 1.1,
    ratings: { attack: 5, defence: 5, speed: 2, reach: 4, difficulty: 3 },
    armourDesc: 'Crested great bascinet and gilded full harness',
    botWeight: 5, unlock: 8000,
  },
  garter: {
    id: 'garter', name: 'Knight of the Garter', title: 'Arming Sword & Heater Shield',
    description: 'A companion of the most noble Order of the Garter, the finest of the king\'s household knights. Counterstroke makes his shield a trap; For Saint George! lifts every sword around him.',
    hp: 160, stamina: 125, speed: 4.9, sprint: 7.1, mass: 1.15, size: { height: 1.05, girth: 1.06 },
    armor: [0.48, 0.2, 0.44], weapon: 'arming_sword', shield: 'heater', ranged: false,
    abilities: ['counterstroke', 'inspire'], hyperArmor: false, attackSpeed: 1.1,
    ratings: { attack: 4, defence: 5, speed: 4, reach: 2, difficulty: 3 },
    armourDesc: 'Visored bascinet, full harness and the blue garter at the knee',
    botWeight: 5, unlock: 6000,
  },
  warlord: {
    id: 'warlord', name: 'Warlord', title: 'War Poleaxe',
    description: 'A great lord who leads his own affinity into battle. Lord\'s Command heals, hastens and hardens every man of his host nearby; Cleave sweeps the press before him.',
    hp: 185, stamina: 125, speed: 4.6, sprint: 6.8, mass: 1.5, size: { height: 1.12, girth: 1.14 },
    armor: [0.52, 0.22, 0.56], weapon: 'lordaxe', shield: null, ranged: false,
    abilities: ['command', 'cleave'], hyperArmor: true, attackSpeed: 1.0,
    ratings: { attack: 5, defence: 5, speed: 2, reach: 4, difficulty: 4 },
    armourDesc: 'Plumed armet, fluted full harness and his own livery cloak',
    botWeight: 4, unlock: 10000,
  },
  colossus: {
    id: 'colossus', name: 'Colossus', title: 'Great Spear & Tower Shield',
    description: 'A giant of a man in a giant\'s harness, behind a shield like a castle door. Nothing knocks him down. Bulwark of the Realm shelters everyone near him; Shield Slam batters a whole rank back. He is slow and tires quickly; nothing else about him is weak.',
    hp: 330, stamina: 200, speed: 2.8, sprint: 3.5, mass: 2.4, size: { height: 1.38, girth: 1.42 },
    armor: [0.62, 0.3, 0.62], weapon: 'greatspear', shield: 'tower', ranged: false,
    abilities: ['realm', 'shieldslam'], hyperArmor: true, immovable: true, staminaDrain: 1.8, attackSpeed: 1.15,
    ratings: { attack: 5, defence: 5, speed: 1, reach: 5, difficulty: 5 },
    armourDesc: 'A great helm, a giant\'s full harness, and a tower shield of oak and iron',
    botWeight: 3, unlock: 12000,
  },
  goliath: {
    id: 'goliath', name: 'Goliath', title: 'Giant\'s Broadsword',
    description: 'A lesser giant, a head shorter than the Colossus and nothing like so hard to fell, who carries a broadsword fit for a giant. Every blow is slow to come and ruinous when it lands; Earthshaker throws the ranks off their feet and Whirlwind turns the great blade in a full circle.',
    hp: 200, stamina: 200, speed: 3.1, sprint: 3.9, mass: 2.0, size: { height: 1.28, girth: 1.3 },
    armor: [0.38, 0.16, 0.38], weapon: 'giantsword', shield: null, ranged: false,
    abilities: ['earthshaker', 'whirlwind'], hyperArmor: false, staminaDrain: 1.8, attackSpeed: 0.85,
    ratings: { attack: 5, defence: 3, speed: 1, reach: 4, difficulty: 4 },
    armourDesc: 'A great bascinet, a giant\'s harness of blackened plate and mail',
    botWeight: 3, unlock: 7000,
  },
  cutthroat: {
    id: 'cutthroat', name: 'Cutthroat', title: 'Long Rondel Dagger',
    description: 'A quick, unarmoured knife-fighter from the back streets, faster on his feet and with his hands than any man on the field. Each stab does little, but Flurry puts in three at once and Sidestep takes him out of reach of the answer.',
    hp: 96, stamina: 130, speed: 6.2, sprint: 8.8, mass: 0.82, size: { height: 0.95, girth: 0.88 },
    armor: [0.03, 0.02, 0.03], weapon: 'rondel', shield: null, ranged: false,
    abilities: ['flurry', 'dash'], hyperArmor: false, attackSpeed: 1.15,
    ratings: { attack: 1, defence: 1, speed: 5, reach: 3, difficulty: 4 },
    armourDesc: 'A hood and a leather jerkin: no harness at all',
    botWeight: 6,
  },
};

export const classIndex = (id: ClassId) => CLASS_IDS.indexOf(id);
export const abilityIndex = (id: AbilityId) => ABILITY_IDS.indexOf(id);
