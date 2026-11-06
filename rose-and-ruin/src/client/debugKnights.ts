// Debug parade: one knight of each class in a forced pose, for screenshots.
import * as THREE from 'three';
import { Knight } from '../shared/sim/knight';
import { CLASS_IDS, type ClassId } from '../shared/data/classes';
import { Act, type Team } from '../shared/types';
import { KnightAnimator } from './knights/animator';
import { KnightRenderer } from './knights/knightRenderer';
import { Ragdoll } from './knights/ragdoll';
import type { WorldView } from './render/world';
import type { Renderer } from './render/renderer';

export function setupParade(r: Renderer, world: WorldView, params: URLSearchParams) {
  const kr = new KnightRenderer(world.baker, 64);
  r.scene.add(kr.group);
  const W = world.map.world;
  const ground = (x: number, z: number, y: number) => W.groundAt(x, z, y);
  const cx = Number(params.get('px') ?? -30), cz = Number(params.get('pz') ?? -100);
  const team = Number(params.get('team') ?? 0) as Team;
  const act = params.get('act') ?? 'idle';
  const u = Number(params.get('u') ?? 0.5);
  const classes = (params.get('cls')?.split(',') as ClassId[] | undefined) ?? [...CLASS_IDS];
  const ang = Number(params.get('ang') ?? 0);
  const spacing = Number(params.get('sp') ?? 1.6);
  const ks = classes.map((c, i) => {
    const k = new Knight(i, team);
    k.setClass(c);
    if (params.has('broken')) k.shieldHp = 0;
    k.x = cx + (i - (classes.length - 1) / 2) * spacing * Math.cos(ang);
    k.z = cz + (i - (classes.length - 1) / 2) * spacing * Math.sin(ang);
    k.y = W.groundAt(k.x, k.z, 999);
    k.yaw = Number(params.get('yaw') ?? 0);
    k.alive = true;
    return { k, anim: new KnightAnimator(), rag: null as Ragdoll | null, blood: Number(params.get('blood') ?? 0), mud: Number(params.get('mud') ?? 0.2) };
  });
  const setState = (k: Knight, t: number) => {
    k.act = Act.Idle; k.actT = 0; k.actDur = 1; k.vx = 0; k.vz = 0; k.heavy = false;
    const fx = -Math.sin(k.yaw), fz = -Math.cos(k.yaw);
    switch (act) {
      case 'walk': k.vx = fx * 1.6; k.vz = fz * 1.6; break;
      case 'run': { const v = Number(params.get('spd') ?? 4.7); k.vx = fx * v; k.vz = fz * v; break; }
      case 'block': k.act = Act.Block; k.actT = 0.5; break;
      case 'wind': k.act = Act.Windup; k.atk = Number(params.get('atk') ?? 0); k.actDur = k.weapon.attacks[k.atk].windup; k.actT = k.actDur * u; k.heavy = k.atk === 2; break;
      case 'release': k.act = Act.Release; k.atk = Number(params.get('atk') ?? 0); k.actDur = k.weapon.attacks[k.atk].release; k.actT = k.actDur * u; k.heavy = k.atk === 2; break;
      case 'draw': if (k.def.ranged) { k.act = Act.Draw; k.actT = 0.9; k.draw = u; } else { k.act = Act.Block; k.actT = 0.5; } break;
      case 'kick': k.act = Act.Kick; k.actT = 0.62 * u; k.actDur = 0.62; break;
      case 'ability': k.act = Act.Ability; k.abilitySlot = Number(params.get('slot') ?? 0); k.actDur = 1; k.actT = u; break;
      case 'knock': k.act = Act.Knockdown; k.actDur = 1.5; k.actT = 0.8; k.knockT = 0.7; break;
      default: break;
    }
    void t;
  };
  let time = 0;
  const dieAt = params.has('die') ? Number(params.get('die')) : -1;
  return (dt: number) => {
    time += dt;
    kr.begin();
    for (const e of ks) {
      if (dieAt >= 0 && time > dieAt && !e.rag) {
        e.rag = new Ragdoll(e.anim.joints, e.anim.prevJoints, dt, e.k.def.ranged ? null : e.anim.weapon, { dx: Math.sin(e.k.yaw), dy: 0.1, dz: Math.cos(e.k.yaw), force: 2.5, zone: 1 });
      }
      if (e.rag) {
        e.rag.step(1 / 60, ground, W);
        kr.draw(e.k.cls, e.k.team, { bones: e.rag.bones, weapon: e.rag.hasWeapon ? e.rag.weapon : null, offhand: e.rag.offhand, daggerOut: false, bowBend: 0, nock: e.anim.nock, arrowNocked: false, aimYaw: 0, aimPitch: 0 }, e.blood, e.mud, 0, false, e.k.id * 7);
        continue;
      }
      setState(e.k, time);
      e.anim.update(e.k, dt, ground, time);
      const a = e.anim;
      kr.draw(e.k.cls, e.k.team, { bones: a.bones, weapon: e.k.def.ranged && !a.daggerOut ? null : a.weapon, offhand: a.offhand, daggerOut: a.daggerOut, bowBend: a.bowBend, nock: a.nock, arrowNocked: a.arrowNocked, aimYaw: e.k.yaw, aimPitch: e.k.pitch }, e.blood, e.mud, 0, false, e.k.id * 7);
    }
    kr.end();
  };
}

export function paradeCamera(r: Renderer, params: URLSearchParams, W: WorldView) {
  const cx = Number(params.get('px') ?? -30), cz = Number(params.get('pz') ?? -100);
  const g = W.map.world.groundAt(cx, cz, 999);
  const dist = Number(params.get('dist') ?? 6);
  const ang = Number(params.get('ang') ?? 0);
  r.camera.position.set(cx + Math.sin(ang) * dist, g + Number(params.get('ch') ?? 1.5), cz - Math.cos(ang) * dist);
  r.camera.lookAt(new THREE.Vector3(cx, g + 1.1, cz));
}
