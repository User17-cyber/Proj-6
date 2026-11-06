// Shared enums and plain data types for the simulation, renderer and network protocol.

export type Team = 0 | 1;
export const TEAM_NAMES = ['Lancaster', 'York'] as const;
export const TEAM_HOUSE = ['House of Lancaster', 'House of York'] as const;
export const TEAM_MOTTO = ['Souvent me souvient', 'Loyaulte me lie'] as const;

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const GRAVITY = 19.6;

/** Knight action state (one value; animation reads it together with actT). */
export const Act = {
  Idle: 0,
  Windup: 1,
  Charge: 2,
  Release: 3,
  Recover: 4,
  Block: 5,
  Kick: 6,
  Ability: 7,
  Stagger: 8,
  Stun: 9,
  Knockdown: 10,
  Parried: 11,
  Draw: 12,
  Loose: 13,
  Deflect: 14,
  Dead: 15,
  Feint: 16,
} as const;
export type Act = (typeof Act)[keyof typeof Act];

export const Btn = {
  Attack: 1,
  Block: 2,
  Sprint: 4,
  Jump: 8,
  Kick: 16,
  Ability1: 32,
  Ability2: 64,
  Thrust: 128,
  Zoom: 256,
} as const;

export interface InputFrame {
  seq: number;
  /** strafe (-1 left .. 1 right) */
  mx: number;
  /** forward (-1 back .. 1 forward) */
  mz: number;
  yaw: number;
  pitch: number;
  buttons: number;
  /** world-space aim point for abilities like the arrow volley (optional) */
  aimX?: number; aimY?: number; aimZ?: number;
}

export function emptyInput(): InputFrame {
  return { seq: 0, mx: 0, mz: 0, yaw: 0, pitch: 0, buttons: 0 };
}

export type GameMode = 'battle' | 'conquest' | 'laststand';
export type Difficulty = 0 | 1 | 2 | 3;
export const DIFFICULTY_NAMES = ['Recruit', 'Veteran', 'Champion', 'Legend'] as const;

export interface MatchSettings {
  mapId: string;
  mode: GameMode;
  teamSize: number;
  difficulty: Difficulty;
  friendlyFire: boolean;
  timeLimit: number; // seconds
  seed: number;
  /** ticket multiplier for battle/conquest (tickets = teamSize * this) */
  ticketScale: number;
}

export const DEFAULT_SETTINGS: MatchSettings = {
  mapId: 'bodiam',
  mode: 'battle',
  teamSize: 24,
  difficulty: 1,
  friendlyFire: false,
  timeLimit: 15 * 60,
  seed: 1,
  ticketScale: 5,
};

export type HitZone = 0 | 1 | 2; // head, torso, legs
export const ZONE_NAMES = ['head', 'torso', 'legs'] as const;

/** Events emitted by the simulation for presentation (effects, sounds, HUD). */
export type SimEvent =
  | { t: 'hit'; a: number; v: number; dmg: number; zone: HitZone; x: number; y: number; z: number; dx: number; dy: number; dz: number; kind: number; heavy: boolean; killed: boolean; dtype: number }
  | { t: 'block'; a: number; v: number; x: number; y: number; z: number; parry: boolean; shield: boolean; broke: boolean }
  | { t: 'swing'; k: number; atk: number; heavy: boolean }
  | { t: 'kill'; killer: number; victim: number; assist: number; weapon: number; head: boolean; dx: number; dy: number; dz: number; force: number }
  | { t: 'spawn'; k: number }
  | { t: 'ability'; k: number; ab: number; x: number; y: number; z: number }
  | { t: 'kick'; a: number; v: number; hit: boolean; broke: boolean }
  | { t: 'arrow'; id: number; k: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; bodkin: boolean }
  | { t: 'arrowHit'; id: number; v: number; x: number; y: number; z: number; nx: number; ny: number; nz: number; stuck: boolean; shield: boolean }
  | { t: 'volley'; k: number; team: Team; x: number; y: number; z: number; delay: number }
  | { t: 'capture'; obj: number; team: number }
  | { t: 'knockdown'; k: number; by: number }
  | { t: 'stun'; k: number }
  | { t: 'shieldBreak'; k: number; by: number; x: number; y: number; z: number }
  | { t: 'jump'; k: number }
  | { t: 'heal'; k: number; amt: number }
  | { t: 'horn'; team: number; kind: number }
  | { t: 'streak'; k: number; n: number }
  | { t: 'end'; winner: number };
