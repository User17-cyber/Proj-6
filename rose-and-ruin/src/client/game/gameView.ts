// Presentation of a session: knight animators, ragdoll corpses, blood and mud, effects,
// sounds, and the feed of hit/kill information for the HUD.

import * as THREE from 'three';
import type { SessionView, KnightState } from './session';
import type { WorldView } from '../render/world';
import type { Renderer } from '../render/renderer';
import { KnightAnimator } from '../knights/animator';
import { KnightRenderer, type KnightDrawable } from '../knights/knightRenderer';
import { Ragdoll } from '../knights/ragdoll';
import { B } from '../knights/skeleton';
import { Particles } from '../fx/particles';
import { Decals } from '../fx/decals';
import { Arrows, type BodyArrow } from '../fx/arrows';
import type { AudioEngine } from '../audio/audio';
import type { SimEvent } from '../../shared/types';
import { Act } from '../../shared/types';
import { CLASSES, ABILITY_IDS, type ClassId } from '../../shared/data/classes';

export interface HudSink {
  hitMarker(killed: boolean, head: boolean, blocked: boolean): void;
  damageNumber(x: number, y: number, z: number, dmg: number, head: boolean, killed: boolean): void;
  damageFrom(x: number, z: number, amount: number): void;
  killFeed(e: Extract<SimEvent, { t: 'kill' }>): void;
  killBanner(victim: KnightState, head: boolean, streak: number): void;
  notify(text: string, team: number, big?: boolean): void;
  combatText(text: string, kind: 'parry' | 'block' | 'broke' | 'stun'): void;
  localDied(killer: KnightState | null): void;
  ended(winner: number): void;
}

interface KView { anim: KnightAnimator; blood: number; mud: number; arrows: BodyArrow[]; wasAlive: boolean; stepPhase: number; lastStepX: number; lastStepZ: number }
interface Corpse { stat: number; rag: Ragdoll; cls: ClassId; team: number; blood: number; mud: number; arrows: BodyArrow[]; age: number; pooled: boolean; id: number }

const MAX_CORPSES = 450;
const HEAVY = new Set<ClassId>(['manatarms', 'vanguard', 'banneret']);

export class GameView {
  readonly kr: KnightRenderer;
  readonly particles: Particles;
  readonly decals: Decals;
  readonly arrows: Arrows;
  private views: KView[] = [];
  private corpses: Corpse[] = [];
  private time = 0;
  private frame = 0;
  showBlood = true;
  firstPerson = false;
  combatNear = 0;
  private ground: (x: number, z: number, y: number) => number;
  private ground2: (x: number, z: number) => number;
  private lastBodyArrowFor = new Map<number, THREE.Vector3>();

  constructor(private r: Renderer, private world: WorldView, private s: SessionView, private audio: AudioEngine, private hud: HudSink | null) {
    // room for the largest battle (64 a side) plus the fallen
    const cap = Math.max(240, s.knights.length + 100);
    // the fallen stay for the whole battle: settled corpses are posed once and kept
    this.kr = new KnightRenderer(world.baker, cap, MAX_CORPSES);
    this.particles = new Particles(r.settings.quality >= 2 ? 5000 : 2500);
    this.particles.quality = r.settings.quality;
    this.decals = new Decals(r.settings.quality >= 2 ? 1400 : 800);
    this.arrows = new Arrows(world.baker);
    this.particles.group.userData.noReflect = true;
    this.decals.mesh.userData.noReflect = true;
    world.root.add(this.kr.group, this.particles.group, this.decals.mesh, this.arrows.group);
    const W = world.map.world;
    this.ground = (x, z, y) => W.groundAt(x, z, y);
    this.ground2 = (x, z) => W.groundAt(x, z, 999);
    this.particles.ambient = Math.min(1, 0.35 + world.sky.envIntensity * 0.5);
  }

  /** Start presenting a new session on the same world (keeps GPU buffers). */
  reset(s: SessionView, hud: HudSink | null) {
    this.s = s;
    this.hud = hud;
    this.views = [];
    this.corpses = [];
    this.kr.clearStatic();
    this.arrows.clear();
    this.decals.clear();
    this.particles.clear();
    this.combatNear = 0;
  }

  private view(id: number): KView {
    let v = this.views[id];
    if (!v) { v = { anim: new KnightAnimator(), blood: 0, mud: 0.3 + Math.random() * 0.3, arrows: [], wasAlive: false, stepPhase: 0, lastStepX: 0, lastStepZ: 0 }; this.views[id] = v; }
    return v;
  }

  private drawable(k: KnightState, a: KnightAnimator): KnightDrawable {
    const ranged = CLASSES[k.cls].ranged;
    return { bones: a.bones, weapon: ranged && !a.daggerOut ? null : a.weapon, offhand: a.offhand, daggerOut: a.daggerOut, bowBend: a.bowBend, nock: a.nock, arrowNocked: a.arrowNocked, aimYaw: k.yaw, aimPitch: k.pitch };
  }

  /** Head position of a knight (first-person camera). */
  headOf(id: number, out: THREE.Vector3): THREE.Vector3 | null {
    const v = this.views[id];
    if (!v || !v.anim.hasFirstFrame) return null;
    return out.setFromMatrixPosition(v.anim.bones[B.head]).add(_tmp.set(0, 0.11, 0));
  }
  /** Position of the corpse of a knight's most recent death. */
  corpseOf(id: number, out: THREE.Vector3): THREE.Vector3 | null {
    for (let i = this.corpses.length - 1; i >= 0; i--) if (this.corpses[i].id === id) return out.copy(this.corpses[i].rag.joints.chest);
    return null;
  }

  processEvents(events: SimEvent[], localId: number) {
    const K = this.s.knights;
    const A = this.audio;
    for (const e of events) {
      switch (e.t) {
        case 'hit': {
          const v = K[e.v];
          if (!v) break;
          const vv = this.view(e.v);
          vv.anim.flinch(e.dx, e.dz, e.dmg / 40);
          const amount = Math.min(1, e.dmg / 45);
          if (e.kind !== 4 && this.showBlood) {
            this.particles.blood(e.x, e.y, e.z, e.dx, e.dy, e.dz, Math.min(1.6, amount * (e.killed ? 2 : 1.4)));
            if (Math.random() < 0.9) {
              const gx = e.x + e.dx * 0.6 + (Math.random() - 0.5) * 0.6, gz = e.z + e.dz * 0.6 + (Math.random() - 0.5) * 0.6;
              const gy = this.ground2(gx, gz);
              if (Math.abs(gy - v.y) < 1.5) this.decals.add(gx, gy, gz, this.world.map.world.terrain.normal(gx, gz, _n), 0.45 + amount * 0.9);
            }
          }
          vv.blood = Math.min(1, vv.blood + e.dmg / 75);
          // the striker is splashed too
          if (e.a >= 0) this.view(e.a).blood = Math.min(1, this.view(e.a).blood + 0.05);
          const plate = CLASSES[v.cls].armor[0] >= 0.3;
          if (e.kind === 4) break; // bleeding: no impact sound
          if (e.dtype === 1 && plate) A.play('plate', { pos: e, vol: 0.9 });
          else { A.play('flesh', { pos: e, vol: 0.85 }); if (plate) A.play('plate', { pos: e, vol: 0.35, rate: 1.2 }); }
          if (!e.killed && Math.random() < 0.45) A.play('pain', { pos: e, bus: 'voice', vol: 0.55, rate: v.cls === 'longbowman' ? 1.08 : 1 });
          if ((e.kind === 1 || e.kind === 5) && !e.killed) this.attachArrow(e.v, e.x, e.y, e.z, e.dx, e.dy, e.dz);
          if (e.a === localId && localId >= 0) {
            this.hud?.hitMarker(e.killed, e.zone === 0, false);
            this.hud?.damageNumber(e.x, e.y, e.z, e.dmg, e.zone === 0, e.killed);
            A.play('hit', { bus: 'ui', vol: 0.5, rateVar: 0 });
          }
          if (e.v === localId) {
            const att = e.a >= 0 ? K[e.a] : null;
            this.hud?.damageFrom(att ? att.x : e.x - e.dx * 3, att ? att.z : e.z - e.dz * 3, e.dmg);
          }
          break;
        }
        case 'block': {
          if (e.shield) { A.play('shield', { pos: e, vol: 0.9 }); this.particles.dust(e.x, e.y - 0.1, e.z, 0.15, [0.45, 0.33, 0.2]); }
          if (!e.shield || e.parry || e.broke) A.play(e.parry ? 'parry' : 'clang', { pos: e, vol: e.parry ? 1 : 0.85, rate: e.parry ? 1.25 : 1 });
          const att = this.s.knights[e.a];
          const nx = att ? att.x - e.x : 0, nz = att ? att.z - e.z : 0;
          const l = Math.hypot(nx, nz) || 1;
          if (!e.shield || e.parry) this.particles.sparks(e.x, e.y, e.z, nx / l * 0.6, 0.4, nz / l * 0.6, e.parry || e.broke);
          if (e.v === localId || e.a === localId) {
            if (e.parry) this.hud?.combatText(e.v === localId ? 'Parried!' : 'Parried', 'parry');
            else if (e.broke) this.hud?.combatText(e.v === localId ? 'Guard broken' : 'Guard broken!', 'broke');
            else if (e.a === localId) { this.hud?.combatText('Blocked', 'block'); this.hud?.hitMarker(false, false, true); }
          }
          break;
        }
        case 'swing': {
          const k = K[e.k];
          if (!k) break;
          A.play(e.heavy ? 'whooshHeavy' : 'whoosh', { pos: k, vol: 0.55, rate: CLASSES[k.cls].weapon === 'greatsword' || CLASSES[k.cls].weapon === 'poleaxe' ? 0.85 : 1 });
          if (Math.random() < (e.heavy ? 0.5 : 0.2)) A.play('grunt', { pos: k, bus: 'voice', vol: 0.45 });
          break;
        }
        case 'kill': {
          const v = K[e.victim];
          if (!v) break;
          this.makeCorpse(e.victim, e.dx, e.dy, e.dz, e.force * 2.6, e.head ? 0 : 1);
          A.play('death', { pos: v, bus: 'voice', vol: 0.8, rate: v.cls === 'longbowman' ? 1.07 : 1 });
          this.hud?.killFeed(e);
          if (e.killer === localId && localId >= 0) {
            const killer = K[e.killer];
            this.hud?.killBanner(v, e.head, killer ? killer.kills : 0);
            A.play('killSting', { bus: 'ui', vol: 0.55, rateVar: 0 });
          }
          if (e.victim === localId) this.hud?.localDied(e.killer >= 0 ? K[e.killer] : null);
          break;
        }
        case 'spawn': {
          const vv = this.view(e.k);
          vv.blood = 0; vv.mud = 0.28 + Math.random() * 0.25; vv.arrows.length = 0;
          vv.anim = new KnightAnimator();
          vv.wasAlive = true;
          break;
        }
        case 'ability': {
          const k = K[e.k];
          if (!k) break;
          const id = ABILITY_IDS[e.ab];
          if (id === 'rally') {
            A.play('hornShort', { pos: k, vol: 0.7, rateVar: 0.02 });
            A.play('shout', { pos: k, bus: 'voice', vol: 0.7 });
            for (let i = 0; i < 30; i++) this.particles.spawn(5, k.x + (Math.random() - 0.5) * 2, k.y + Math.random() * 2, k.z + (Math.random() - 0.5) * 2, 0, 1 + Math.random(), 0, 0.8 + Math.random() * 0.6, 0.05, [2.5, 1.9, 0.6, 0.7]);
          } else if (id === 'earthshaker') {
            this.particles.dust(e.x, e.y, e.z, 1.8);
            A.play('drum', { pos: e, vol: 1, rate: 0.7 });
            A.play('plate', { pos: e, vol: 0.8, rate: 0.7 });
          } else if (id === 'charge') {
            A.play('shout', { pos: k, bus: 'voice', vol: 0.8 });
          } else if (id === 'whirlwind') {
            for (let i = 0; i < 3; i++) A.play('whooshHeavy', { pos: k, vol: 0.6, delay: i * 0.35 });
          } else if (id === 'shield_bash') {
            A.play('grunt', { pos: k, bus: 'voice', vol: 0.6 });
          } else if (id === 'bulwark') {
            A.play('plate', { pos: k, vol: 0.6, rate: 0.8 });
          } else if (id === 'dash') {
            A.play('whoosh', { pos: k, vol: 0.5, rate: 1.4 });
            this.particles.dust(k.x, k.y, k.z, 0.4);
          } else if (id === 'bloodletting') {
            A.play('whoosh', { pos: k, vol: 0.5, rate: 1.6 });
          } else if (id === 'lunge' || id === 'sweep') {
            A.play('grunt', { pos: k, bus: 'voice', vol: 0.6 });
          } else if (id === 'bodkin' && e.k === localId) {
            this.hud?.combatText('Bodkin nocked', 'block');
          }
          break;
        }
        case 'kick': {
          const a = K[e.a];
          if (e.hit && e.v >= 0) { const v = K[e.v]; if (v) A.play('kick', { pos: v, vol: 0.9 }); }
          if (a && !e.hit) A.play('whoosh', { pos: a, vol: 0.3, rate: 1.5 });
          if (e.broke && e.v === localId) this.hud?.combatText('Guard broken', 'broke');
          if (e.broke && e.a === localId) this.hud?.combatText('Guard broken!', 'broke');
          break;
        }
        case 'arrow': {
          this.arrows.launch(e.id, e.x, e.y, e.z, e.vx, e.vy, e.vz);
          const k = K[e.k];
          if (k && Math.hypot(e.vx, e.vz) > Math.abs(e.vy) * 0.6) A.play('bow', { pos: k, vol: 0.65 });
          break;
        }
        case 'arrowHit': {
          const dir = this.arrows.land(e.id, e.x, e.y, e.z, e.v < 0 && e.stuck);
          if (e.v < 0) {
            A.play('thunk', { pos: e, vol: 0.5 });
            if (dir && e.ny > 0.5) this.particles.dust(e.x, e.y, e.z, 0.08);
          } else if (e.shield) {
            A.play('shield', { pos: e, vol: 0.5, rate: 1.4 });
          }
          break;
        }
        case 'volley': {
          A.play('hornShort', { pos: { x: e.x, y: e.y + 10, z: e.z }, vol: 0.6, maxDist: 200 });
          const me = localId >= 0 ? K[localId] : null;
          if (me && me.alive && Math.hypot(me.x - e.x, me.z - e.z) < 12 && me.team !== e.team) this.hud?.notify('Arrows incoming!', e.team);
          break;
        }
        case 'capture': {
          const o = this.s.objectives[e.obj];
          if (o) this.hud?.notify(e.team >= 0 ? `${o.def.name} taken by ${e.team === 0 ? 'Lancaster' : 'York'}` : `${o.def.name} has been lost`, e.team);
          A.play('hornShort', { bus: 'ui', vol: 0.45, rate: e.team === 0 ? 1 : 0.9, rateVar: 0 });
          break;
        }
        case 'round': {
          const me = localId >= 0 ? K[localId] : null;
          const won = e.winner >= 0 ? K.find((k) => k.team === e.winner) : null;
          if (e.winner >= 0 && won) {
            const mine = me && me.team === e.winner;
            this.hud?.notify(`${mine ? 'You take' : `${won.name} takes`} the round · ${e.score0}–${e.score1}`, e.winner, true);
          }
          this.hud?.notify(`Round ${e.n} · fight!`, -1, true);
          A.play('hornShort', { bus: 'ui', vol: 0.5, rateVar: 0 });
          break;
        }
        case 'shieldBreak': {
          const att = e.by >= 0 ? K[e.by] : null;
          const nx = att ? e.x - att.x : 0, nz = att ? e.z - att.z : 0, l = Math.hypot(nx, nz) || 1;
          this.particles.splinters(e.x, e.y, e.z, nx / l, nz / l);
          A.play('splinter', { pos: e, vol: 1 });
          if (e.k === localId) { this.hud?.combatText('Shield shattered!', 'broke'); this.hud?.notify('Your shield is broken: you fight on without it', -1); }
          else if (e.by === localId) this.hud?.combatText('Shield broken!', 'broke');
          break;
        }
        case 'knockdown': {
          const k = K[e.k];
          if (k) { this.particles.dust(k.x, k.y, k.z, 0.7); A.play('plate', { pos: k, vol: 0.7, rate: 0.75 }); }
          if (e.k === localId) this.hud?.combatText('Knocked down', 'stun');
          break;
        }
        case 'stun':
          if (e.k === localId) this.hud?.combatText('Stunned', 'stun');
          break;
        case 'heal': {
          const k = K[e.k];
          if (k) for (let i = 0; i < 8; i++) this.particles.spawn(5, k.x + (Math.random() - 0.5) * 0.8, k.y + 0.5 + Math.random() * 1.2, k.z + (Math.random() - 0.5) * 0.8, 0, 0.6, 0, 0.8, 0.04, [2.2, 1.8, 0.7, 0.6]);
          break;
        }
        case 'horn':
          if (e.kind === 0) { A.play('horn', { bus: 'ui', vol: 0.75, rateVar: 0 }); this.hud?.notify('To arms! The battle is joined', -1, true); }
          break;
        case 'streak': {
          if (e.k === localId) {
            const label = e.n >= 100 ? (e.n - 100 >= 10 ? 'Ten foes slain without falling!' : 'Five foes slain without falling!') : e.n === 2 ? 'Double Kill' : e.n === 3 ? 'Triple Kill' : e.n === 4 ? 'Massacre' : 'Legendary';
            this.hud?.notify(label, -2, true);
          }
          break;
        }
        case 'end':
          this.hud?.ended(e.winner);
          break;
        default: break;
      }
    }
  }

  private attachArrow(id: number, x: number, y: number, z: number, dx: number, dy: number, dz: number) {
    const v = this.view(id);
    if (!v.anim.hasFirstFrame || v.arrows.length > 6) return;
    // nearest of a few bones
    let best: number = B.chest, bd = Infinity;
    for (const b of [B.chest, B.spine, B.pelvis, B.head, B.upperArmL, B.upperArmR, B.thighL, B.thighR]) {
      _p.setFromMatrixPosition(v.anim.bones[b]);
      const d = _p.distanceToSquared(_q.set(x, y, z));
      if (d < bd) { bd = d; best = b; }
    }
    v.arrows.push(Arrows.bodyArrow(v.anim.bones[best], best, x, y, z, _d.set(dx, dy, dz).normalize()));
  }

  private makeCorpse(id: number, dx: number, dy: number, dz: number, force: number, zone: number) {
    const k = this.s.knights[id];
    const v = this.views[id];
    if (!k || !v || !v.anim.hasFirstFrame) return;
    // one corpse per death (the kill event and the state change can both report it)
    if (!v.wasAlive) return;
    const ranged = CLASSES[k.cls].ranged;
    const rag = new Ragdoll(v.anim.joints, v.anim.prevJoints, 1 / 60, ranged ? null : v.anim.weapon, { dx, dy: Math.max(dy, 0.05), dz, force, zone });
    rag.noOffhand = k.shieldBroken;
    rag.height = CLASSES[k.cls].size.height; rag.girth = CLASSES[k.cls].size.girth;
    // arrows ride along on the ragdoll's bones
    this.corpses.push({ stat: -1, rag, cls: k.cls, team: k.team, blood: Math.min(1, v.blood + 0.35), mud: v.mud, arrows: v.arrows.slice(), age: 0, pooled: false, id });
    v.arrows.length = 0;
    v.wasAlive = false;
    // only beyond the static pool's size (more deaths than any normal battle) do the oldest go
    if (this.corpses.length > MAX_CORPSES + 40) this.corpses.shift();
  }

  update(dt: number, localId: number, cam: THREE.Camera) {
    this.time += dt;
    this.frame++;
    const K = this.s.knights;
    this.kr.begin();
    this.arrows.begin(dt);
    let near = 0;
    const camPos = cam.position;
    for (const k of K) {
      const v = this.view(k.id);
      if (!k.alive) {
        // died without a kill event (network): make a corpse anyway
        if (v.wasAlive && v.anim.hasFirstFrame) this.makeCorpse(k.id, 0, 0, 1, 2, 1);
        v.wasAlive = false;
        continue;
      }
      v.wasAlive = true;
      const d = Math.hypot(k.x - camPos.x, k.z - camPos.z);
      // far knights animate at a lower rate
      const skip = d > 160 ? 3 : d > 80 ? 2 : 1;
      if (skip === 1 || (this.frame + k.id) % skip === 0 || !v.anim.hasFirstFrame) v.anim.update(k as unknown as Parameters<KnightAnimator['update']>[0], dt * skip, this.ground, this.time);
      const lod = d < 12 ? 0 : d < 40 ? 1 : 2;
      this.kr.draw(k.cls, k.team, this.drawable(k, v.anim), this.showBlood ? v.blood : 0, v.mud, lod, this.firstPerson && k.id === localId, k.id * 7 + k.team, d < 70);
      for (const a of v.arrows) this.arrows.body(v.anim.bones[a.bone], a);
      if (d < 12 && (k.act === Act.Release || k.act === Act.Block)) near++;
      // footsteps
      const sp = Math.hypot(k.vx, k.vz);
      if (d < 22 && sp > 1.2 && k.onGround) {
        const moved = Math.hypot(k.x - v.lastStepX, k.z - v.lastStepZ);
        if (moved > (sp > 5 ? 1.3 : 0.9)) {
          v.lastStepX = k.x; v.lastStepZ = k.z;
          this.audio.play(HEAVY.has(k.cls) ? 'stepArmour' : 'step', { pos: k, vol: k.id === localId ? 0.35 : 0.5, maxDist: 25 });
          if (sp > 5 && Math.random() < 0.12) this.particles.dust(k.x, k.y, k.z, 0.06);
        }
      }
    }
    this.combatNear = this.combatNear * 0.97 + near * 0.03;
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.age += dt;
      c.rag.step(Math.min(dt, 1 / 30), this.ground, this.world.map.world);
      if (!c.pooled && c.rag.frozen && this.showBlood) {
        c.pooled = true;
        const j = c.rag.joints.chest;
        const gy = this.ground2(j.x, j.z);
        this.decals.add(j.x, gy, j.z, this.world.map.world.terrain.normal(j.x, j.z, _n), 1.6 + Math.random() * 1.1, true);
      }
      const d = Math.hypot(c.rag.joints.chest.x - camPos.x, c.rag.joints.chest.z - camPos.z);
      const lod = d < 10 ? 0 : d < 30 ? 1 : 2;
      const pose = { bones: c.rag.bones, weapon: c.rag.hasWeapon ? c.rag.weapon : null, offhand: c.rag.offhand, daggerOut: false, bowBend: 0, nock: _p, arrowNocked: false, aimYaw: 0, aimPitch: 0 };
      // once a body has settled it is posed into the static pool and costs almost nothing
      if (c.stat < 0 && c.rag.frozen) c.stat = this.kr.addStatic(c.cls, c.team, pose, this.showBlood ? c.blood : 0, c.mud, c.id * 7 + c.team);
      if (c.stat >= 0) this.kr.drawStatic(c.stat, lod, d < 45);
      else this.kr.draw(c.cls, c.team, pose, this.showBlood ? c.blood : 0, c.mud, lod, false, c.id * 7 + c.team, d < 45);
      for (const a of c.arrows) this.arrows.body(c.rag.bones[a.bone], a);
    }
    this.kr.end();
    this.arrows.end();
    // fires near the camera
    for (const f of this.world.fires) {
      const d2 = (f.x - camPos.x) ** 2 + (f.z - camPos.z) ** 2;
      if (d2 < 90 * 90) this.particles.fire(f.x, f.y - 0.15, f.z, f.intensity > 12 ? 1.6 : 1, dt);
    }
    this.particles.update(dt, cam, this.ground2);
    this.decals.update(dt);
  }

  dispose() {
    this.world.root.remove(this.kr.group, this.particles.group, this.decals.mesh, this.arrows.group);
  }
}

const _n = { x: 0, y: 1, z: 0 };
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _d = new THREE.Vector3(), _tmp = new THREE.Vector3();
