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
