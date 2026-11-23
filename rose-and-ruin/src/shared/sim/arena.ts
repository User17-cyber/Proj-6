// Single combat is fought inside an arena that no fighter can leave: whatever carries him toward
// the wall (running, a sidestep, a charge, a shove) stops at it. Arenas are round, oval or
// many-sided; `r`/`rx`/`rz` is the inside face of the wall.

import { ARENA_R } from '../types';
import type { StaticWorld } from '../world/world';
import type { Knight } from './knight';

export type ArenaShape =
  | { kind: 'ellipse'; rx: number; rz: number }
  | { kind: 'poly'; sides: number; r: number; rot: number };

export const DEFAULT_ARENA: ArenaShape = { kind: 'ellipse', rx: ARENA_R, rz: ARENA_R };

/** Pull (x, z) back inside the arena, `margin` metres clear of the wall. Returns the outward normal if moved. */
export function clampToArena(p: { x: number; z: number }, cx: number, cz: number, s: ArenaShape, margin: number): { nx: number; nz: number } | null {
  let dx = p.x - cx, dz = p.z - cz;
  let moved: { nx: number; nz: number } | null = null;
  if (s.kind === 'ellipse') {
    const rx = s.rx - margin, rz = s.rz - margin, q = Math.hypot(dx / rx, dz / rz);
    if (q <= 1) return null;
    dx /= q; dz /= q;
    const nx = dx / (rx * rx), nz = dz / (rz * rz), l = Math.hypot(nx, nz) || 1;
    moved = { nx: nx / l, nz: nz / l };
  } else {
    const ap = s.r - margin;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < s.sides; i++) {
      const a = s.rot + (i / s.sides) * Math.PI * 2, nx = Math.cos(a), nz = Math.sin(a);
      const d = dx * nx + dz * nz;
      if (d > ap) { dx -= nx * (d - ap); dz -= nz * (d - ap); moved = { nx, nz }; }
    }
    if (!moved) return null;
  }
  p.x = cx + dx; p.z = cz + dz;
  return moved;
}

/** The smallest distance from the middle to the wall. */
export function arenaInner(s: ArenaShape) { return s.kind === 'ellipse' ? Math.min(s.rx, s.rz) : s.r; }

export function holdInRing(k: Knight, cx: number, cz: number, world: StaticWorld, shape: ArenaShape = DEFAULT_ARENA) {
  const n = clampToArena(k, cx, cz, shape, k.radius + 0.15);
  if (!n) return;
  const { nx, nz } = n;
  const out = k.vx * nx + k.vz * nz;
  if (out > 0) { k.vx -= nx * out; k.vz -= nz * out; }
  const po = k.pushX * nx + k.pushZ * nz;
  if (po > 0) { k.pushX -= nx * po; k.pushZ -= nz * po; }
  if (k.ovActive) { const oo = k.ovx * nx + k.ovz * nz; if (oo > 0) { k.ovx -= nx * oo; k.ovz -= nz * oo; } }
  k.y = Math.max(k.y, world.groundAt(k.x, k.z, k.y + 0.6));
}
