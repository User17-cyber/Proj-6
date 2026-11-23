// Single combat is fought inside a ring that no fighter can leave: whatever carries him toward
// the wall (running, a sidestep, a charge, a shove) stops at it.

import { ARENA_R } from '../types';
import type { StaticWorld } from '../world/world';
import type { Knight } from './knight';

export function holdInRing(k: Knight, cx: number, cz: number, world: StaticWorld) {
  const dx = k.x - cx, dz = k.z - cz, d = Math.hypot(dx, dz), lim = ARENA_R - k.radius - 0.15;
  if (d <= lim) return;
  const nx = dx / d, nz = dz / d;
  k.x = cx + nx * lim; k.z = cz + nz * lim;
  const out = k.vx * nx + k.vz * nz;
  if (out > 0) { k.vx -= nx * out; k.vz -= nz * out; }
  const po = k.pushX * nx + k.pushZ * nz;
  if (po > 0) { k.pushX -= nx * po; k.pushZ -= nz * po; }
  if (k.ovActive) { const oo = k.ovx * nx + k.ovz * nz; if (oo > 0) { k.ovx -= nx * oo; k.ovz -= nz * oo; } }
  k.y = Math.max(k.y, world.groundAt(k.x, k.z, k.y + 0.6));
}
