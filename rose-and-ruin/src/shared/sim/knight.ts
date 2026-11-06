import { Act, emptyInput, type InputFrame, type Team } from '../types';
import { CLASSES, SHIELDS, type ClassDef, type ClassId, type ShieldDef } from '../data/classes';
import { WEAPONS, type WeaponDef } from '../data/weapons';
import type { V3 } from '../math';

export const KNIGHT_RADIUS = 0.38;
export const KNIGHT_HEIGHT = 1.85;
export const EYE_HEIGHT = 1.64;

export class Knight {
  readonly id: number;
  name = '';
  team: Team;
  cls: ClassId = 'manatarms';
  def: ClassDef = CLASSES.manatarms;
  weapon: WeaponDef = WEAPONS.arming_sword;
  /** class the knight will take at the next spawn */
  nextCls: ClassId = 'manatarms';
  bot = true;
  playerId = -1;
  /** slot exists in the match (players may vacate slots) */
  active = true;

  alive = false;
  x = 0; y = 0; z = 0;
  vx = 0; vy = 0; vz = 0;
  yaw = 0; pitch = 0;
  onGround = true;
  moveSpeed = 0;
  sprinting = false;

  hp = 100;
  stamina = 100;
  staminaDelay = 0;

  act: Act = Act.Idle;
  actT = 0;
  actDur = 0;
  /** attack slot (0..3) while attacking, ability index while in Ability */
  atk = 0;
  heavy = false;
  charge = 0;
  combo = 0;
  comboTimer = 0;
  lastSlash = 0;
  /** release time already swept by hit detection */
  relPrevT = 0;
  hitList: number[] = [];
  bufferedAttack = 0; // 0 none, 1 slash, 2 thrust
  bufferT = 0;
  feintCd = 0;
  /** faster counter-attack window after a successful parry */
  riposteT = 0;
  abilitySlot = 0;
  cds: [number, number] = [0, 0];
  /** bow: draw fraction 0..1 */
  draw = 0;
  drawHold = 0;

  stunT = 0;
  knockT = 0;
  invulnT = 0;
  spawnProt = 0;
  bulwarkT = 0;
  rallyT = 0;
  bloodletT = 0;
  bleedT = 0;
  bleedStacks = 0;
  bleedBy = -1;
  bleedAcc = 0;
  /** ability-driven movement override (charges, lunges, dashes) */
  ovActive = false; ovx = 0; ovz = 0;
  /** knockback impulse velocity */
  pushX = 0; pushZ = 0;
  hotT = 0;
  hotRate = 0;
  bodkin = false;
  /** shield durability left (0 when the class has none or it has splintered) */
  shieldHp = 0;
  chargeHit = false;
  abilityAim = { x: 0, y: 0, z: 0 };
  abilityHits: number[] = [];

  input: InputFrame = emptyInput();
  prevButtons = 0;

  respawnT = 0;
  /** pitched battle: orders this player has already fought (and fallen) as */
  usedCls = new Set<ClassId>();
  wantSpawn = false;
  deathTime = -999;
  /** sim time of the last damage received (for UI) */
  lastHurt = -999;

  kills = 0; deaths = 0; assists = 0; score = 0; damage = 0; caps = 0;
  streak = 0;
  multiKill = 0;
  lastKillTime = -999;
  dmgBy = new Map<number, { dmg: number; time: number }>();

  constructor(id: number, team: Team) {
    this.id = id;
    this.team = team;
  }

  setClass(c: ClassId) {
    this.cls = c;
    this.def = CLASSES[c];
    this.weapon = WEAPONS[this.def.weapon];
    this.shieldHp = this.def.shield ? SHIELDS[this.def.shield].hp : 0;
  }

  get maxHp() { return this.def.hp; }
  /** the shield still in hand, if any */
  get shield(): ShieldDef | null { return this.def.shield && this.shieldHp > 0 ? SHIELDS[this.def.shield] : null; }
  get shieldBroken() { return this.def.shield !== null && this.shieldHp <= 0; }
  get blockArc() { const s = this.shield; return s ? Math.max(s.blockArc, this.weapon.blockArc) : this.weapon.blockArc; }
  get blockStamina() { const s = this.shield; return s ? s.blockStamina : this.weapon.blockStamina; }
  get maxStamina() { return this.def.stamina; }
  get blocking() { return this.act === Act.Block; }
  get downed() { return this.knockT > 0; }
}

// Hit volumes ---------------------------------------------------------------------------

export interface HitVolumes {
  head: V3; headR: number;
  torsoA: V3; torsoB: V3; torsoR: number;
  legsA: V3; legsB: V3; legsR: number;
}

export function newVolumes(): HitVolumes {
  return {
    head: { x: 0, y: 0, z: 0 }, headR: 0.15,
    torsoA: { x: 0, y: 0, z: 0 }, torsoB: { x: 0, y: 0, z: 0 }, torsoR: 0.26,
    legsA: { x: 0, y: 0, z: 0 }, legsB: { x: 0, y: 0, z: 0 }, legsR: 0.2,
  };
}

/** Fill world-space hit volumes for a knight in its current posture. */
export function hitVolumes(k: Knight, v: HitVolumes): HitVolumes {
  const { x, y, z } = k;
  if (k.knockT > 0) {
    // lying on the back, head away from the facing direction
    const bx = Math.sin(k.yaw), bz = Math.cos(k.yaw); // backward
    v.legsA.x = x - bx * 0.2; v.legsA.y = y + 0.22; v.legsA.z = z - bz * 0.2;
    v.legsB.x = x - bx * 0.9; v.legsB.y = y + 0.18; v.legsB.z = z - bz * 0.9;
    v.torsoA.x = x + bx * 0.1; v.torsoA.y = y + 0.26; v.torsoA.z = z + bz * 0.1;
    v.torsoB.x = x + bx * 0.6; v.torsoB.y = y + 0.26; v.torsoB.z = z + bz * 0.6;
    v.head.x = x + bx * 0.92; v.head.y = y + 0.22; v.head.z = z + bz * 0.92;
    return v;
  }
  // slight forward offset of the head/chest when attacking
  const fx = -Math.sin(k.yaw), fz = -Math.cos(k.yaw);
  const lean = k.act === Act.Release || k.act === Act.Ability ? 0.12 : 0.04;
  v.head.x = x + fx * lean; v.head.y = y + 1.63; v.head.z = z + fz * lean;
  v.torsoA.x = x; v.torsoA.y = y + 0.98; v.torsoA.z = z;
  v.torsoB.x = x + fx * lean * 0.8; v.torsoB.y = y + 1.44; v.torsoB.z = z + fz * lean * 0.8;
  v.legsA.x = x; v.legsA.y = y + 0.12; v.legsA.z = z;
  v.legsB.x = x; v.legsB.y = y + 0.9; v.legsB.z = z;
  return v;
}
