import type { MapBuilder, Shape } from '../mapgen';

/** A cluster of timber-framed cottages around a point, plus a stone church. */
export function village(b: MapBuilder, cx: number, cz: number, count: number, radius: number, church = true) {
  const rng = b.rng;
  const placed: [number, number, number, number][] = [];
  let tries = 0;
  while (placed.length < count && tries < count * 40) {
    tries++;
    const a = rng.range(0, Math.PI * 2), d = rng.range(4, radius);
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const w = rng.range(5.5, 9), dd = rng.range(4.5, 6.5);
    if (b.blocked(x, z, 4)) continue;
    if (placed.some(([px, pz, pw, pd]) => Math.abs(px - x) < (pw + w) / 2 + 3 && Math.abs(pz - z) < (pd + dd) / 2 + 3)) continue;
    placed.push([x, z, w, dd]);
    // face the village centre-ish
    const rot = Math.round(Math.atan2(cx - x, cz - z) / (Math.PI / 2)) * (Math.PI / 2) + rng.range(-0.12, 0.12);
    b.building(x, z, rot, w, dd, { style: 'timber', roof: 'thatch', floors: rng.chance(0.3) ? 2 : 1 });
    if (rng.chance(0.5)) b.prop(rng.pick(['barrel', 'hay', 'logs', 'sacks', 'crate'] as const), x + rng.range(-w, w) * 0.6, z + dd * 0.9, rng.range(0, 6), 1);
  }
  if (church) {
    const x = cx + radius * 0.2, z = cz - radius * 0.2;
    if (!b.blocked(x, z, 6)) {
      b.building(x, z, 0, 9, 18, { style: 'stone', roof: 'slate', wallH: 7 });
      b.tower(x, z - 11, { r: 3.2, top: b.h(x, z) + 18, shape: 'square', roof: 'cone', style: 'rubble' });
      b.prop('cross', x + 7, z + 6, 0, 1);
    }
  }
  b.paint({ kind: 'circle', x: cx, z: cz, r: radius * 0.8 }, 0, 0.55, radius * 0.4, 0.9);
}

/** Hedgerow field boundaries in a rectangle (skipping blocked spots). */
export function fields(b: MapBuilder, x0: number, x1: number, z0: number, z1: number, cell: number, gapChance = 0.35) {
  const rng = b.rng;
  for (let x = x0; x <= x1; x += cell) {
    for (let z = z0; z < z1; z += cell) {
      if (rng.chance(gapChance)) continue;
      const pts: [number, number][] = [];
      for (let t = 0; t <= 4; t++) {
        const px = x + rng.range(-1.2, 1.2), pz = z + (cell * t) / 4;
        if (b.blocked(px, pz, 2)) { if (pts.length > 1) b.hedge(pts.slice()); pts.length = 0; continue; }
        pts.push([px, pz]);
      }
      if (pts.length > 1) b.hedge(pts);
    }
  }
  for (let z = z0; z <= z1; z += cell) {
    for (let x = x0; x < x1; x += cell) {
      if (rng.chance(gapChance + 0.1)) continue;
      const pts: [number, number][] = [];
      for (let t = 0; t <= 4; t++) {
        const px = x + (cell * t) / 4, pz = z + rng.range(-1.2, 1.2);
        if (b.blocked(px, pz, 2)) { if (pts.length > 1) b.hedge(pts.slice()); pts.length = 0; continue; }
        pts.push([px, pz]);
      }
      if (pts.length > 1) b.hedge(pts);
    }
  }
}

/** Ring of woodland outside the playable area, for the horizon. */
export function woodlandRing(b: MapBuilder, inner: Shape, outerR: number, count: number) {
  const rng = b.rng;
  let n = 0, tries = 0;
  while (n < count && tries < count * 10) {
    tries++;
    const a = rng.range(0, Math.PI * 2), d = rng.range(0.2, 1) * outerR;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (b.sdf(inner, x, z) < 4) continue;
    if (Math.abs(x) > b.hf.size / 2 - 6 || Math.abs(z) > b.hf.size / 2 - 6) continue;
    if (b.noise.fbm(x / 60, z / 60, 2) < -0.15) continue;
    if (b.blocked(x, z, 2)) continue;
    const w = b.world.waterAt(x, z);
    if (w && b.h(x, z) < w.level + 0.5) continue;
    b.tree(x, z, rng.range(0.9, 1.5), rng.pick([0, 0, 0, 1, 2]));
    n++;
  }
}

/** Scattered boulders on rough ground. */
export function boulders(b: MapBuilder, s: Shape, count: number) {
  b.scatterProps(s, 'rock', count, [0.6, 1.8]);
}

export type GroundKind = 'meadow' | 'hillfort' | 'chapel' | 'crossroads';

/**
 * An open fighting ground away from the castle: levelled, worn and lightly dressed so a
 * press of knights has room to fight. Registers itself as a battle front so bots go there.
 * Call before forests, fields and hedges so they keep clear of it.
 */
export function ground(b: MapBuilder, kind: GroundKind, x: number, z: number, r = 24) {
  const rng = b.rng;
  const y = b.h(x, z);
  if (kind === 'hillfort') {
    // a low grassy hill ringed by a broken palisade, with gaps for the assault
    const top = y + 5.5;
    b.mound(x, z, r * 0.62, r * 1.45, top);
    b.flatten({ kind: 'circle', x, z, r: r * 0.55 }, top, 2);
    const R = r * 0.58, gaps = 4, a0 = rng.range(0, Math.PI);
    for (let g = 0; g < gaps; g++) {
      const from = a0 + (g / gaps) * Math.PI * 2 + 0.32, to = a0 + ((g + 1) / gaps) * Math.PI * 2 - 0.32;
      const pts: [number, number][] = [];
      for (let t = 0; t <= 5; t++) { const a = from + (to - from) * (t / 5); pts.push([x + Math.cos(a) * R, z + Math.sin(a) * R]); }
      b.palisade(pts, 2.6);
    }
    b.paint({ kind: 'circle', x, z, r: R - 2 }, 0, 0.5, 4, 0.8);
    b.prop('banner', x, z, 0, 1.3);
    b.prop('brazier', x + 4, z + 3, 0, 1);
    b.prop('logs', x - 5, z - 2, rng.range(0, 3), 1);
    b.prop('sacks', x + 2, z - 5, rng.range(0, 3), 1);
    b.avoid({ kind: 'circle', x, z, r: r * 1.5 });
  } else if (kind === 'chapel') {
    // a ruined chapel and its churchyard
    b.flatten({ kind: 'circle', x, z, r }, y, 10, 0.85);
    const rot = rng.range(-0.3, 0.3);
    b.building(x, z, rot, 8, 15, { style: 'ruin', roof: 'none', wallH: 5 });
    b.rubble(x + Math.cos(rot) * 7, z - Math.sin(rot) * 7, 3.5, 1.4, 'rubble');
    b.prop('cross', x - 8, z + 9, 0, 1);
    for (let i = 0; i < 10; i++) b.prop('rock', x + rng.range(-r, r) * 0.7, z + rng.range(-r, r) * 0.7, rng.range(0, 6), rng.range(0.35, 0.6));
    b.paint({ kind: 'circle', x, z, r: r * 0.6 }, 0, 0.45, 5, 0.9);
    b.avoid({ kind: 'circle', x, z, r: r + 4 });
  } else if (kind === 'crossroads') {
    b.flatten({ kind: 'circle', x, z, r }, y, 10, 0.8);
    b.path([[x - r * 2, z - 3], [x + r * 2, z + 3]], 5);
    b.path([[x + 2, z - r * 2], [x - 2, z + r * 2]], 5);
    b.prop('well', x + 5, z + 5, 0, 1);
    b.prop('cross', x - 4, z - 4, 0, 1);
    b.prop('cart', x + 8, z - 6, rng.range(0, 3), 1);
    b.prop('stall', x - 9, z + 7, rng.range(0, 3), 1);
    b.prop('hay', x - 7, z + 10, rng.range(0, 3), 1);
    b.prop('barrel', x + 9, z + 9, 0, 1); b.prop('barrel', x + 9.8, z + 8.3, 0, 1);
    b.paint({ kind: 'circle', x, z, r: 9 }, 0, 0.8, 4, 0.8);
    b.avoid({ kind: 'circle', x, z, r: r + 4 });
  } else {
    // a trampled meadow where the lines meet: stakes, mantlets and the wreck of a cart
    // (the first meadow of each castle is also its ground for single combat)
    b.duelSpot ??= { x, z };
    b.flatten({ kind: 'circle', x, z, r }, y, 14, 0.65);
    b.paint({ kind: 'circle', x, z, r: r * 0.7 }, 0, 0.4, r * 0.4, 1);
    for (let i = 0; i < 4; i++) {
      const a = rng.range(0, Math.PI * 2), d = rng.range(0.55, 0.9) * r;
      b.prop(rng.pick(['stakes', 'mantlet', 'stakes'] as const), x + Math.cos(a) * d, z + Math.sin(a) * d, a + Math.PI / 2, 1);
    }
    b.prop('cart', x + rng.range(-6, 6), z + rng.range(-6, 6), rng.range(0, 6), 1);
    b.prop('banner', x + rng.range(-4, 4), z + rng.range(-4, 4), 0, 1.2);
    b.scatterProps({ kind: 'circle', x, z, r }, 'rock', 6, [0.5, 1.1]);
    b.avoid({ kind: 'circle', x, z, r: r + 4 });
  }
  b.front([x, z]);
}

/** The yaw that faces from (x, z) toward (tx, tz) (a knight looks along -sin(yaw), -cos(yaw)). */
export function toward(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(-(tx - x), -(tz - z));
}
