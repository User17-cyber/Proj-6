// Armoury preview: a knight of the chosen class standing in the live world, demonstrating
// its strikes, guard and abilities on a loop.

import * as THREE from 'three';
import { Knight } from '../../shared/sim/knight';
import { Act, type Team } from '../../shared/types';
import { ABILITIES, CLASSES, type ClassId } from '../../shared/data/classes';
import { ARROW } from '../../shared/data/weapons';
import { KnightAnimator } from '../knights/animator';
import { KnightRenderer } from '../knights/knightRenderer';
import type { WorldView } from '../render/world';

/** a fixed, well-groomed face for each order in the armoury */
const CLASSES_SEED: Record<ClassId, number> = { manatarms: 11, vanguard: 4, halberdier: 23, banneret: 9, longbowman: 31, errant: 17, pavisier: 26, bachelor: 14, yeoman: 19, marshal: 8, champion: 3 };

interface Step { act: Act; dur: number; atk?: number; heavy?: boolean; slot?: number }

export class ClassPreview {
  private kr: KnightRenderer;
  private k = new Knight(990, 0);
  private anim = new KnightAnimator();
  private steps: Step[] = [];
  private si = 0;
  private st = 0;
  private time = 0;
  readonly pos = new THREE.Vector3();
  yaw = 0;
  visible = false;

  constructor(private world: WorldView) {
    this.kr = new KnightRenderer(world.baker, 4);
    world.root.add(this.kr.group);
    this.kr.group.visible = false;
  }

  set(cls: ClassId, team: Team) {
    if (this.k.cls === cls && this.k.team === team && this.steps.length) return;
    this.k.team = team;
    this.k.setClass(cls);
    this.anim = new KnightAnimator();
    this.steps = this.plan(cls);
    this.si = 0; this.st = 0;
  }

  place(x: number, z: number, yaw: number) {
    const W = this.world.map.world;
    this.pos.set(x, W.groundAt(x, z, 999), z);
    this.yaw = yaw;
  }

  show(on: boolean) { this.visible = on; this.kr.group.visible = on; }

  private plan(cls: ClassId): Step[] {
    const d = CLASSES[cls];
    const w = this.k.weapon;
    const A = (atk: number, heavy = false): Step[] => {
      const a = w.attacks[atk];
      const out: Step[] = [{ act: Act.Windup, dur: a.windup, atk, heavy }];
      if (heavy) out.push({ act: Act.Charge, dur: 0.45, atk, heavy });
      out.push({ act: Act.Release, dur: a.release, atk, heavy }, { act: Act.Recover, dur: a.recover, atk, heavy });
      return out;
    };
    const idle = (t: number): Step => ({ act: Act.Idle, dur: t });
    const ab = (slot: number): Step => ({ act: Act.Ability, dur: ABILITIES[d.abilities[slot]].duration, slot });
    if (d.ranged) {
      const shot: Step[] = [{ act: Act.Draw, dur: ARROW.drawTime + 0.7 }, { act: Act.Loose, dur: 0.34 }];
      return [idle(1.4), ...shot, idle(0.9), ...shot, idle(1.0), ab(0), idle(1.2), ...A(3), idle(1.2), ab(1), idle(0.4), ...shot, idle(1.4)];
    }
    return [idle(1.3), ...A(0), idle(0.2), ...A(1), idle(0.9), { act: Act.Block, dur: 1.4 }, idle(0.6), ...A(2, true), idle(1.1), ab(0), idle(1.0), ...A(3), idle(0.9), { act: Act.Kick, dur: 0.62 }, idle(1.1), ab(1), idle(1.3)];
  }

  update(dt: number) {
    if (!this.visible || !this.steps.length) return;
    this.time += dt;
    const k = this.k;
    this.st += dt;
    let s = this.steps[this.si];
    while (this.st >= s.dur) {
      this.st -= s.dur;
      this.si = (this.si + 1) % this.steps.length;
      s = this.steps[this.si];
    }
    k.x = this.pos.x; k.y = this.pos.y; k.z = this.pos.z; k.yaw = this.yaw; k.pitch = 0;
    k.vx = k.vy = k.vz = 0; k.onGround = true; k.alive = true; k.sprinting = false;
    k.act = s.act; k.actT = this.st; k.actDur = s.dur;
    k.atk = s.atk ?? 0; k.heavy = s.heavy ?? false;
    k.charge = s.act === Act.Charge ? Math.min(1, this.st / s.dur) : s.heavy ? 1 : 0;
    k.abilitySlot = s.slot ?? 0;
    k.draw = s.act === Act.Draw ? Math.min(1, this.st / ARROW.drawTime) : 0;
    k.knockT = 0; k.stunT = 0; k.bulwarkT = 0;
    const W = this.world.map.world;
    this.anim.update(k, dt, (x, z, y) => W.groundAt(x, z, y), this.time);
    const a = this.anim;
    const ranged = CLASSES[k.cls].ranged;
    this.kr.begin();
    this.kr.draw(k.cls, k.team, { bones: a.bones, weapon: ranged && !a.daggerOut ? null : a.weapon, offhand: a.offhand, daggerOut: a.daggerOut, bowBend: a.bowBend, nock: a.nock, arrowNocked: a.arrowNocked, aimYaw: k.yaw, aimPitch: 0 }, 0, 0.08, 0, false, CLASSES_SEED[k.cls]);
    this.kr.end();
  }

  dispose() { this.world.root.remove(this.kr.group); }
}
