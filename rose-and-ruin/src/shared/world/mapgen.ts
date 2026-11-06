// Map construction kit. A map definition sculpts the heightfield and places castle
// structures, props and trees through a MapBuilder. The result (BuiltMap) holds the
// physical world for the simulation plus render descriptions for the client.

import { Heightfield, StaticWorld, makeBox, makeCyl, makePlatform, MAT_STONE, MAT_WOOD, MAT_EARTH, MAT_CLOTH, type WaterBody } from './world';
import { Noise2, Rng, hashString } from '../rng';
import { clamp, smoothstep, lerp } from '../math';

export type SkyId = 'overcast' | 'golden' | 'dawn' | 'sunset' | 'noon';

export type Shape =
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'ellipse'; x: number; z: number; rx: number; rz: number; rot?: number }
  | { kind: 'rect'; x: number; z: number; hx: number; hz: number; rot?: number }
  | { kind: 'poly'; pts: [number, number][] }
  | { kind: 'line'; pts: [number, number][]; w: number };

export type StoneStyle = 'ashlar' | 'rubble' | 'banded' | 'white' | 'red';

export type StructureDef =
  | { type: 'wall'; ax: number; az: number; bx: number; bz: number; thick: number; top: number; base: number; crenel: boolean; style: StoneStyle; brokenA?: boolean; brokenB?: boolean; slits: boolean }
  | { type: 'tower'; x: number; z: number; r: number; top: number; base: number; shape: 'round' | 'square' | 'poly'; sides: number; rot: number; roof: 'cone' | 'flat' | 'none'; style: StoneStyle; turret?: boolean; hx?: number; hz?: number }
  | { type: 'gatehouse'; x: number; z: number; rot: number; w: number; d: number; top: number; base: number; passW: number; passH: number; towers: 'round' | 'square' | 'none'; towerR: number; towerOff: number; style: StoneStyle; floor: number }
  | { type: 'keep'; x: number; z: number; rot: number; w: number; d: number; top: number; base: number; turrets: 'square' | 'round' | 'mixed' | 'none'; style: StoneStyle }
  | { type: 'building'; x: number; z: number; rot: number; w: number; d: number; wallH: number; base: number; roof: 'thatch' | 'slate' | 'tile' | 'lead' | 'none'; style: 'stone' | 'timber' | 'ruin'; floors: number }
  | { type: 'bridge'; ax: number; az: number; bx: number; bz: number; w: number; y: number; rails: boolean; style: 'wood' | 'stone' }
  | { type: 'ramp'; ax: number; az: number; bx: number; bz: number; w: number; y0: number; y1: number; style: 'stone' | 'wood' | 'earth' }
  | { type: 'palisade'; pts: [number, number][]; h: number }
  | { type: 'motte'; x: number; z: number; r: number; h: number }
  | { type: 'rubble'; x: number; z: number; r: number; h: number; style: StoneStyle }
  | { type: 'stairs'; x: number; z: number; rot: number; w: number; len: number; y0: number; y1: number };

export type PropType =
  | 'barrel' | 'crate' | 'cart' | 'hay' | 'tent' | 'pavilion' | 'campfire' | 'brazier' | 'torch' | 'banner'
  | 'well' | 'rack' | 'trebuchet' | 'ladder' | 'rubbleStones' | 'stakes' | 'logs' | 'table' | 'sacks' | 'fence'
  | 'cannon' | 'mantlet' | 'cross' | 'stall' | 'boat' | 'rock';

export interface PropDef { type: PropType; x: number; y: number; z: number; rot: number; s: number; team?: number; v?: number }
export interface TreeDef { x: number; y: number; z: number; s: number; kind: number }
export interface SpawnZone { x: number; z: number; yaw: number; w: number; d: number }
export interface ObjectiveDef { name: string; short: string; x: number; z: number; r: number; owner: number }
export interface LightDef { x: number; y: number; z: number; color: number; intensity: number; fire: boolean }
export interface HedgeDef { pts: [number, number][]; h: number }

export interface Atmosphere {
  sky: SkyId;
  /** rotate the HDRI so the sun sits at this azimuth (degrees, 0 = +X, 90 = +Z) */
  sunAzimuth: number;
  /** override sun elevation for lighting only (sky sun hidden) */
  sunElevation?: number;
  sunIntensity: number;
  envIntensity: number;
  exposure: number;
  fogColor: [number, number, number];
  fogDensity: number;
  fogHeight: number;
  haze: number;
  wind: number;
  grassTint: [number, number, number];
  ambientSound: 'meadow' | 'coast' | 'wind' | 'city';
  dust: number;
}

export interface MapDef {
  id: string;
  name: string;
  location: string;
  year: string;
  blurb: string;
  history: string;
  atmosphere: Atmosphere;
  /** teams: which house holds which spawn ([0] = Lancaster spawn index) */
  build(b: MapBuilder): void;
  /** colours for the menu card illustration */
  card: { sky: [string, string]; ground: string; silhouette: string };
}

export interface BuiltMap {
  def: MapDef;
  world: StaticWorld;
  structures: StructureDef[];
  props: PropDef[];
  trees: TreeDef[];
  hedges: HedgeDef[];
  lights: LightDef[];
  spawns: [SpawnZone[], SpawnZone[]];
  objectives: ObjectiveDef[];
  /** points of interest for bots in battle mode: lanes the fighting gravitates to */
  rally: [number, number][];
  seaLevel: number | null;
  camera: { x: number; y: number; z: number; tx: number; ty: number; tz: number }[];
}

export class MapBuilder {
  readonly hf: Heightfield;
  readonly world: StaticWorld;
  readonly noise: Noise2;
  readonly noise2: Noise2;
  readonly rng: Rng;
  readonly structures: StructureDef[] = [];
  readonly props: PropDef[] = [];
  readonly trees: TreeDef[] = [];
  readonly hedges: HedgeDef[] = [];
  readonly lights: LightDef[] = [];
  readonly spawns: [SpawnZone[], SpawnZone[]] = [[], []];
  readonly objectives: ObjectiveDef[] = [];
  readonly rally: [number, number][] = [];
  readonly cameras: BuiltMap['camera'] = [];
  seaLevel: number | null = null;
  private keepOut: Shape[] = [];

  constructor(seedName: string, size = 512, res = 512) {
    this.hf = new Heightfield(size, res);
    this.world = new StaticWorld(this.hf);
    const seed = hashString(seedName);
    this.noise = new Noise2(seed);
    this.noise2 = new Noise2(seed ^ 0x5bd1e995);
    this.rng = new Rng(seed ^ 0x27d4eb2d);
  }

  h(x: number, z: number) { return this.hf.height(x, z); }

  // ---------------------------------------------------------------- terrain operations
  /** Set the whole heightfield from a function. */
  base(fn: (x: number, z: number) => number) {
    const hf = this.hf;
    for (let iz = 0; iz < hf.n; iz++) for (let ix = 0; ix < hf.n; ix++) hf.h[iz * hf.n + ix] = fn(hf.sx(ix), hf.sx(iz));
  }

  /** Gentle rolling countryside: amp metres of low-frequency relief plus small bumps. */
  rolling(amp: number, scale = 180, detail = 0.35) {
    const n = this.noise;
    this.base((x, z) => amp * n.fbm(x / scale, z / scale, 4) + detail * n.fbm(x / 9, z / 9, 3));
  }

  sdf(s: Shape, x: number, z: number): number {
    switch (s.kind) {
      case 'circle': return Math.hypot(x - s.x, z - s.z) - s.r;
      case 'ellipse': {
        const r = s.rot ?? 0, c = Math.cos(r), sn = Math.sin(r);
        const dx = x - s.x, dz = z - s.z;
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
        const k = Math.hypot(lx / s.rx, lz / s.rz);
        return (k - 1) * Math.min(s.rx, s.rz);
      }
      case 'rect': {
        const r = s.rot ?? 0, c = Math.cos(r), sn = Math.sin(r);
        const dx = x - s.x, dz = z - s.z;
        const lx = Math.abs(dx * c - dz * sn) - s.hx, lz = Math.abs(dx * sn + dz * c) - s.hz;
        const ox = Math.max(lx, 0), oz = Math.max(lz, 0);
        return Math.hypot(ox, oz) + Math.min(Math.max(lx, lz), 0);
      }
      case 'poly': {
        const p = s.pts; let d = Infinity; let inside = false;
        for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
          const [xi, zi] = p[i], [xj, zj] = p[j];
          d = Math.min(d, segDist(x, z, xi, zi, xj, zj));
          if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
        }
        return inside ? -d : d;
      }
      case 'line': {
        const p = s.pts; let d = Infinity;
        for (let i = 0; i < p.length - 1; i++) d = Math.min(d, segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]));
        return d - s.w / 2;
      }
    }
  }

  private bbox(s: Shape, pad: number): [number, number, number, number] {
    switch (s.kind) {
      case 'circle': return [s.x - s.r - pad, s.x + s.r + pad, s.z - s.r - pad, s.z + s.r + pad];
      case 'ellipse': { const m = Math.max(s.rx, s.rz) + pad; return [s.x - m, s.x + m, s.z - m, s.z + m]; }
      case 'rect': { const m = Math.hypot(s.hx, s.hz) + pad; return [s.x - m, s.x + m, s.z - m, s.z + m]; }
      case 'poly': case 'line': {
        let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
        for (const [x, z] of s.pts) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, z); d = Math.max(d, z); }
        const w = s.kind === 'line' ? s.w / 2 : 0;
        return [a - pad - w, b + pad + w, c - pad - w, d + pad + w];
      }
    }
  }

  /** Apply fn(oldHeight, weight, x, z) to every sample within blend of the shape. weight = 1 inside, falling to 0 at blend. */
  private apply(s: Shape, blend: number, fn: (h: number, w: number, x: number, z: number, d: number) => number) {
    const hf = this.hf;
    const [x0, x1, z0, z1] = this.bbox(s, blend + 1);
    const ix0 = clamp(Math.floor((x0 - hf.origin) / hf.cell), 0, hf.res), ix1 = clamp(Math.ceil((x1 - hf.origin) / hf.cell), 0, hf.res);
    const iz0 = clamp(Math.floor((z0 - hf.origin) / hf.cell), 0, hf.res), iz1 = clamp(Math.ceil((z1 - hf.origin) / hf.cell), 0, hf.res);
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const x = hf.sx(ix), z = hf.sx(iz);
      const d = this.sdf(s, x, z);
      if (d > blend) continue;
      const w = blend > 0 ? 1 - smoothstep(0, blend, d) : (d <= 0 ? 1 : 0);
      const i = iz * hf.n + ix;
      hf.h[i] = fn(hf.h[i], w, x, z, d);
    }
  }

  flatten(s: Shape, height: number, blend = 6, strength = 1) {
    this.apply(s, blend, (h, w) => lerp(h, height, w * strength));
  }
  /** Raise to at least `height` (plateau/crag) with optional rocky noise on the slopes. */
  plateau(s: Shape, height: number, blend: number, rough = 0) {
    const n = this.noise2;
    this.apply(s, blend, (h, w, x, z, d) => {
      const r = rough * (n.fbm(x / 7, z / 7, 3) * 0.6 + n.ridged(x / 23, z / 23, 3) * 0.6 + n.fbm(x / 2.5, z / 2.5, 2) * 0.35);
      const ww = d <= 0 ? 1 : w;
      const target = height + (d > 0 ? r * Math.min(1, d / 3) : r * 0.1);
      return Math.max(h, lerp(h, target, ww));
    });
  }
  /** Lower to at most `bottom` (moat, river bed, harbour). */
  carve(s: Shape, bottom: number, blend = 4) {
    this.apply(s, blend, (h, w) => Math.min(h, lerp(h, bottom, w)));
  }
  add(s: Shape, amount: number, blend = 6) {
    this.apply(s, blend, (h, w) => h + amount * w);
  }
  /** Mound (motte) with a flat top. */
  mound(x: number, z: number, rTop: number, rBase: number, top: number) {
    const s: Shape = { kind: 'circle', x, z, r: rTop };
    this.apply(s, rBase - rTop, (h, w) => Math.max(h, lerp(h, top, Math.pow(w, 0.8))));
    this.structures.push({ type: 'motte', x, z, r: rBase, h: top });
  }
  /** Box blur the heightfield inside a shape. */
  smooth(s: Shape, passes = 2) {
    const hf = this.hf;
    const [x0, x1, z0, z1] = this.bbox(s, 2);
    const ix0 = clamp(Math.floor((x0 - hf.origin) / hf.cell), 1, hf.res - 1), ix1 = clamp(Math.ceil((x1 - hf.origin) / hf.cell), 1, hf.res - 1);
    const iz0 = clamp(Math.floor((z0 - hf.origin) / hf.cell), 1, hf.res - 1), iz1 = clamp(Math.ceil((z1 - hf.origin) / hf.cell), 1, hf.res - 1);
    for (let p = 0; p < passes; p++) {
      const copy = hf.h.slice();
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
        if (this.sdf(s, hf.sx(ix), hf.sx(iz)) > 0) continue;
        const i = iz * hf.n + ix;
        hf.h[i] = (copy[i] * 4 + copy[i - 1] + copy[i + 1] + copy[i - hf.n] + copy[i + hf.n]) / 8;
      }
    }
  }
  /** Paint a surface channel: 0 dirt/mud, 1 cobbles/flagstones, 2 sand/shingle, 3 rock. */
  paint(s: Shape, channel: 0 | 1 | 2 | 3, value = 1, blend = 2, noisy = 0.5) {
    const hf = this.hf; const n = this.noise2;
    const [x0, x1, z0, z1] = this.bbox(s, blend + 1);
    const ix0 = clamp(Math.floor((x0 - hf.origin) / hf.cell), 0, hf.res), ix1 = clamp(Math.ceil((x1 - hf.origin) / hf.cell), 0, hf.res);
    const iz0 = clamp(Math.floor((z0 - hf.origin) / hf.cell), 0, hf.res), iz1 = clamp(Math.ceil((z1 - hf.origin) / hf.cell), 0, hf.res);
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const x = hf.sx(ix), z = hf.sx(iz);
      const d = this.sdf(s, x, z) + noisy * blend * n.fbm(x / 6, z / 6, 2);
      if (d > blend) continue;
      const w = blend > 0 ? 1 - smoothstep(-blend * 0.2, blend, d) : 1;
      const i = (iz * hf.n + ix) * 4 + channel;
      hf.paint[i] = Math.max(hf.paint[i], Math.round(255 * clamp(w * value, 0, 1)));
    }
  }
  /** Worn earth path between points. */
  path(pts: [number, number][], w: number, channel: 0 | 1 = 0, sink = 0.15) {
    const s: Shape = { kind: 'line', pts, w };
    this.paint(s, channel, 0.95, w * 0.5, 0.7);
    if (sink) this.add(s, -sink, w * 0.4);
  }

  water(level: number, minX: number, maxX: number, minZ: number, maxZ: number, kind: WaterBody['kind']) {
    this.world.water.push({ level, minX, maxX, minZ, maxZ, kind });
  }

  /** Areas where scatter (trees, rocks) must not go. */
  avoid(s: Shape) { this.keepOut.push(s); }
  blocked(x: number, z: number, pad = 0): boolean {
    for (const s of this.keepOut) if (this.sdf(s, x, z) < pad) return true;
    return false;
  }

  // ---------------------------------------------------------------- structures
  private groundMin(ax: number, az: number, bx: number, bz: number, thick: number): number {
    let m = Infinity;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.ceil(len / 1.5));
    const px = -(bz - az) / (len || 1), pz = (bx - ax) / (len || 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = lerp(ax, bx, t), z = lerp(az, bz, t);
      for (const o of [-thick / 2, 0, thick / 2]) m = Math.min(m, this.h(x + px * o, z + pz * o));
    }
    return m;
  }

  /** Curtain wall from A to B with its top at absolute height `top`. */
  wall(ax: number, az: number, bx: number, bz: number, top: number, o: { thick?: number; crenel?: boolean; style?: StoneStyle; brokenA?: boolean; brokenB?: boolean; slits?: boolean } = {}) {
    const thick = o.thick ?? 2.4;
    const base = this.groundMin(ax, az, bx, bz, thick) - 2;
    this.structures.push({ type: 'wall', ax, az, bx, bz, thick, top, base, crenel: o.crenel ?? true, style: o.style ?? 'ashlar', brokenA: o.brokenA, brokenB: o.brokenB, slits: o.slits ?? true });
    const len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(bx - ax, bz - az);
    this.world.colliders.push(makeBox((ax + bx) / 2, (az + bz) / 2, thick / 2, len / 2, rot, base, top + 1.2, MAT_STONE));
    this.avoid({ kind: 'line', pts: [[ax, az], [bx, bz]], w: thick + 3 });
  }
  /** Polyline of walls with towers at the vertices. */
  circuit(pts: [number, number][], top: number, towerTop: number, o: { thick?: number; towerR?: number; shape?: 'round' | 'square' | 'poly'; closed?: boolean; style?: StoneStyle; skip?: number[]; roof?: 'cone' | 'flat' | 'none'; towers?: boolean } = {}) {
    const closed = o.closed ?? true;
    const n = pts.length;
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      if (o.skip?.includes(i)) continue;
      const a = pts[i], b = pts[(i + 1) % n];
      this.wall(a[0], a[1], b[0], b[1], top, { thick: o.thick, style: o.style });
    }
    if (o.towers !== false) for (const p of pts) this.tower(p[0], p[1], { r: o.towerR ?? 5, top: towerTop, shape: o.shape ?? 'round', style: o.style, roof: o.roof });
  }
  tower(x: number, z: number, o: { r?: number; top: number; shape?: 'round' | 'square' | 'poly'; sides?: number; rot?: number; roof?: 'cone' | 'flat' | 'none'; style?: StoneStyle; turret?: boolean; hx?: number; hz?: number }) {
    const r = o.r ?? 5;
    const shape = o.shape ?? 'round';
    const base = Math.min(this.h(x, z), this.h(x + r, z), this.h(x - r, z), this.h(x, z + r), this.h(x, z - r)) - 2.5;
    const rot = o.rot ?? 0;
    this.structures.push({ type: 'tower', x, z, r, top: o.top, base, shape, sides: o.sides ?? (shape === 'poly' ? 8 : 4), rot, roof: o.roof ?? 'flat', style: o.style ?? 'ashlar', turret: o.turret, hx: o.hx, hz: o.hz });
    if (shape === 'square') this.world.colliders.push(makeBox(x, z, o.hx ?? r, o.hz ?? r, rot, base, o.top + 1.5));
    else this.world.colliders.push(makeCyl(x, z, r, base, o.top + 1.5));
    this.avoid({ kind: 'circle', x, z, r: r + 2 });
  }
  /**
   * Gatehouse centred at (x,z); the passage runs along local z (rot like a yaw).
   * w = total width across the passage, d = depth along it.
   */
  gatehouse(x: number, z: number, rot: number, o: { w?: number; d?: number; top: number; passW?: number; passH?: number; towers?: 'round' | 'square' | 'none'; towerR?: number; style?: StoneStyle; floor?: number }) {
    const w = o.w ?? 16, d = o.d ?? 10, passW = o.passW ?? 4.5, passH = o.passH ?? 5;
    const floor = o.floor ?? this.h(x, z);
    // level the passage floor so it meets bridges and courtyards without a step
    this.flatten({ kind: 'rect', x, z, hx: passW / 2 + 0.8, hz: d / 2 + 0.6, rot }, floor, 1.5);
    const base = Math.min(this.h(x - w / 2, z), this.h(x + w / 2, z), floor) - 2.5;
    const towers = o.towers ?? 'round';
    const towerR = o.towerR ?? d * 0.42;
    // flanking towers project from the outer face; keep them clear of the passage
    const towerOff = Math.max(w / 2 - towerR * 0.9, passW / 2 + towerR + 0.45);
    this.structures.push({ type: 'gatehouse', x, z, rot, w, d, top: o.top, base, passW, passH, towers, towerR, towerOff, style: o.style ?? 'ashlar', floor });
    const c = Math.cos(rot), s = Math.sin(rot);
    const side = (passW / 2 + (w / 2 - passW / 2) / 2);
    const hxSide = (w / 2 - passW / 2) / 2;
    for (const sg of [-1, 1]) {
      const lx = sg * side;
      const cx = x + lx * c, cz = z - lx * s;
      this.world.colliders.push(makeBox(cx, cz, hxSide, d / 2, rot, base, o.top + 1.5));
      if (towers !== 'none') {
        // projecting towers on the outer face (local -z)
        const tx = x + sg * towerOff * c + (-d / 2) * s;
        const tz = z - sg * towerOff * s + (-d / 2) * c;
        if (towers === 'round') this.world.colliders.push(makeCyl(tx, tz, towerR, base, o.top + 3));
        else this.world.colliders.push(makeBox(tx, tz, towerR, towerR, rot, base, o.top + 3));
      }
    }
    // lintel above the passage (blocks arrows, not knights)
    this.world.colliders.push(makeBox(x, z, passW / 2, d / 2, rot, floor + passH, o.top + 1.5));
    // paved passage
    this.paint({ kind: 'rect', x, z, hx: passW / 2 + 0.5, hz: d / 2 + 3, rot }, 1, 1, 1.5, 0.3);
    this.avoid({ kind: 'rect', x, z, hx: w / 2 + 3, hz: d / 2 + 8, rot });
  }
  keep(x: number, z: number, rot: number, w: number, d: number, top: number, turrets: 'square' | 'round' | 'mixed' | 'none' = 'square', style: StoneStyle = 'ashlar') {
    const base = Math.min(this.h(x - w / 2, z - d / 2), this.h(x + w / 2, z - d / 2), this.h(x - w / 2, z + d / 2), this.h(x + w / 2, z + d / 2), this.h(x, z)) - 2.5;
    this.structures.push({ type: 'keep', x, z, rot, w, d, top, base, turrets, style });
    this.world.colliders.push(makeBox(x, z, w / 2 + 0.6, d / 2 + 0.6, rot, base, top + 4));
    this.avoid({ kind: 'rect', x, z, hx: w / 2 + 4, hz: d / 2 + 4, rot });
  }
  building(x: number, z: number, rot: number, w: number, d: number, o: { wallH?: number; roof?: 'thatch' | 'slate' | 'tile' | 'lead' | 'none'; style?: 'stone' | 'timber' | 'ruin'; floors?: number; flatten?: boolean } = {}) {
    const floors = o.floors ?? 1;
    const wallH = o.wallH ?? (floors === 1 ? 3.6 : 3.2 * floors);
    const ground = this.h(x, z);
    if (o.flatten !== false) this.flatten({ kind: 'rect', x, z, hx: w / 2 + 0.5, hz: d / 2 + 0.5, rot }, ground, 2.5, 0.8);
    const base = Math.min(this.h(x - w / 2, z), this.h(x + w / 2, z), this.h(x, z - d / 2), this.h(x, z + d / 2)) - 1.2;
    const style = o.style ?? 'timber';
    this.structures.push({ type: 'building', x, z, rot, w, d, wallH, base, roof: o.roof ?? (style === 'timber' ? 'thatch' : 'slate'), style, floors });
    const roofH = style === 'ruin' ? 0 : Math.min(w, d) * 0.6;
    this.world.colliders.push(makeBox(x, z, w / 2, d / 2, rot, base, ground + wallH + roofH, style === 'timber' ? MAT_WOOD : MAT_STONE));
    this.avoid({ kind: 'rect', x, z, hx: w / 2 + 2.5, hz: d / 2 + 2.5, rot });
  }
  /** Walkable bridge deck from A to B at height y. */
  bridge(ax: number, az: number, bx: number, bz: number, w: number, y: number, o: { rails?: boolean; style?: 'wood' | 'stone' } = {}) {
    const len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(bx - ax, bz - az);
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const rails = o.rails ?? true;
    this.structures.push({ type: 'bridge', ax, az, bx, bz, w, y, rails, style: o.style ?? 'wood' });
    this.world.platforms.push(makePlatform(cx, cz, w / 2, len / 2, rot, y, y));
    if (rails) {
      const c = Math.cos(rot), s = Math.sin(rot);
      for (const sg of [-1, 1]) {
        const lx = sg * (w / 2 + 0.1);
        this.world.colliders.push(makeBox(cx + lx * c, cz - lx * s, 0.12, len / 2, rot, y - 0.2, y + 1.1, o.style === 'stone' ? MAT_STONE : MAT_WOOD));
      }
    }
    this.avoid({ kind: 'line', pts: [[ax, az], [bx, bz]], w: w + 4 });
  }
  /** Sloped walkable surface from (A, y0) to (B, y1). */
  ramp(ax: number, az: number, bx: number, bz: number, w: number, y0: number, y1: number, style: 'stone' | 'wood' | 'earth' = 'earth', render = true) {
    const len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(bx - ax, bz - az);
    if (render) this.structures.push({ type: 'ramp', ax, az, bx, bz, w, y0, y1, style });
    this.world.platforms.push(makePlatform((ax + bx) / 2, (az + bz) / 2, w / 2, len / 2, rot, y0, y1));
  }
  /** Earth ramp sculpted into the terrain itself. */
  earthRamp(ax: number, az: number, bx: number, bz: number, w: number, y0: number, y1: number) {
    const len = Math.hypot(bx - ax, bz - az);
    const s: Shape = { kind: 'line', pts: [[ax, az], [bx, bz]], w };
    this.apply(s, 5, (h, wgt, x, z) => {
      const t = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (len * len), 0, 1);
      return lerp(h, lerp(y0, y1, t), wgt);
    });
    this.paint(s, 0, 0.85, 2, 0.6);
  }
  /** A pile of stone rubble filling a breach: walkable mound plus scattered blocks. */
  rubble(x: number, z: number, r: number, h: number, style: StoneStyle = 'ashlar') {
    const ground = this.h(x, z);
    this.apply({ kind: 'circle', x, z, r: r * 0.3 }, r * 0.7, (hh, w) => Math.max(hh, ground + h * Math.pow(w, 0.9)));
    this.paint({ kind: 'circle', x, z, r: r * 0.9 }, 3, 0.85, 2, 0.8);
    this.paint({ kind: 'circle', x, z, r: r * 1.2 }, 0, 0.8, 2, 0.8);
    this.structures.push({ type: 'rubble', x, z, r, h, style });
    for (let i = 0; i < Math.round(r * 2.2); i++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(0.3, 1) * r;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      this.props.push({ type: 'rubbleStones', x: px, z: pz, y: this.h(px, pz), rot: this.rng.range(0, 6.28), s: this.rng.range(0.6, 1.4) });
    }
  }
  palisade(pts: [number, number][], h = 3.2) {
    this.structures.push({ type: 'palisade', pts, h });
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const g = Math.min(this.h(ax, az), this.h(bx, bz));
      this.world.colliders.push(makeBox((ax + bx) / 2, (az + bz) / 2, 0.25, len / 2, Math.atan2(bx - ax, bz - az), g - 1, g + h, MAT_WOOD));
    }
  }
  hedge(pts: [number, number][], h = 1.6) {
    this.hedges.push({ pts, h });
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const g = Math.min(this.h(ax, az), this.h(bx, bz));
      this.world.colliders.push(makeBox((ax + bx) / 2, (az + bz) / 2, 0.6, len / 2, Math.atan2(bx - ax, bz - az), g - 1, g + h, MAT_EARTH));
    }
  }

  prop(type: PropType, x: number, z: number, rot = 0, s = 1, extra: Partial<PropDef> = {}) {
    const y = extra.y ?? this.world.groundAt(x, z, 999);
    this.props.push({ type, x, y, z, rot, s, ...extra });
    const g = y;
    const W = this.world.colliders;
    switch (type) {
      case 'barrel': W.push(makeCyl(x, z, 0.34 * s, g - 0.5, g + 1.0 * s, MAT_WOOD)); break;
      case 'crate': W.push(makeBox(x, z, 0.45 * s, 0.45 * s, rot, g - 0.5, g + 0.9 * s, MAT_WOOD)); break;
      case 'cart': W.push(makeBox(x, z, 1.0 * s, 1.9 * s, rot, g - 0.5, g + 1.4 * s, MAT_WOOD)); break;
      case 'hay': W.push(makeBox(x, z, 0.7 * s, 0.45 * s, rot, g - 0.5, g + 0.8 * s, MAT_EARTH)); break;
      case 'tent': W.push(makeBox(x, z, 1.7 * s, 2.0 * s, rot, g - 0.5, g + 2.2 * s, MAT_CLOTH)); break;
      case 'pavilion': W.push(makeCyl(x, z, 2.9 * s, g - 0.5, g + 4 * s, MAT_CLOTH)); break;
      case 'well': W.push(makeCyl(x, z, 1.15 * s, g - 0.5, g + 1.0 * s, MAT_STONE)); break;
      case 'trebuchet': W.push(makeBox(x, z, 2.6 * s, 3.2 * s, rot, g - 0.5, g + 9 * s, MAT_WOOD)); break;
      case 'rack': W.push(makeBox(x, z, 1.0 * s, 0.3 * s, rot, g - 0.5, g + 1.6 * s, MAT_WOOD)); break;
      case 'table': W.push(makeBox(x, z, 1.0 * s, 0.5 * s, rot, g - 0.5, g + 0.9 * s, MAT_WOOD)); break;
      case 'logs': W.push(makeBox(x, z, 1.6 * s, 0.6 * s, rot, g - 0.5, g + 0.8 * s, MAT_WOOD)); break;
      case 'stall': W.push(makeBox(x, z, 1.4 * s, 0.9 * s, rot, g - 0.5, g + 2.4 * s, MAT_WOOD)); break;
      case 'cannon': W.push(makeBox(x, z, 0.7 * s, 1.8 * s, rot, g - 0.5, g + 1.2 * s, MAT_WOOD)); break;
      case 'mantlet': W.push(makeBox(x, z, 1.3 * s, 0.25 * s, rot, g - 0.5, g + 1.9 * s, MAT_WOOD)); break;
      case 'brazier': W.push(makeCyl(x, z, 0.35 * s, g - 0.5, g + 1.2 * s, MAT_STONE)); break;
      case 'cross': W.push(makeBox(x, z, 0.4 * s, 0.4 * s, rot, g - 0.5, g + 2.5 * s, MAT_STONE)); break;
      case 'rock': W.push(makeCyl(x, z, 0.9 * s, g - 1, g + 1.1 * s, MAT_STONE)); break;
      case 'stakes': W.push(makeBox(x, z, 1.6 * s, 0.5 * s, rot, g - 0.5, g + 1.2 * s, MAT_WOOD)); break;
      case 'fence': W.push(makeBox(x, z, 0.1 * s, 1.5 * s, rot, g - 0.5, g + 1.1 * s, MAT_WOOD)); break;
      case 'boat': W.push(makeBox(x, z, 1.1 * s, 2.8 * s, rot, g - 1.5, g + 0.6 * s, MAT_WOOD)); break;
      default: break;
    }
    if (type === 'brazier' || type === 'campfire' || type === 'torch') {
      const fy = type === 'brazier' ? 1.25 * s : type === 'torch' ? 2.2 * s : 0.5;
      this.lights.push({ x, y: g + fy, z, color: 0xff8a3a, intensity: type === 'campfire' ? 18 : 10, fire: true });
    }
  }
  /** A camp: tents in rows, fires, racks and banners, for one team. */
  camp(x: number, z: number, rot: number, team: number, rows = 2, cols = 4) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const lx = (k - (cols - 1) / 2) * 7.5 + this.rng.range(-0.8, 0.8);
      const lz = r * 9 + this.rng.range(-0.8, 0.8);
      const [px, pz] = at(lx, lz);
      if (this.blocked(px, pz, 1.5)) continue;
      const big = (r + k) % 5 === 0;
      this.prop(big ? 'pavilion' : 'tent', px, pz, rot + this.rng.range(-0.15, 0.15), big ? 1 : this.rng.range(0.9, 1.1), { team });
      this.avoid({ kind: 'circle', x: px, z: pz, r: 3.5 });
    }
    const [fx, fz] = at(0, rows * 9 + 2);
    this.prop('campfire', fx, fz, 0, 1);
    const [rx, rz] = at(-6, rows * 9 + 3);
    this.prop('rack', rx, rz, rot, 1);
    const [bx, bz] = at(6, rows * 9 + 1);
    this.prop('banner', bx, bz, rot, 1.2, { team });
    const [cx, cz] = at(9, rows * 9 + 4);
    this.prop('cart', cx, cz, rot + 0.4, 1);
    this.prop('barrel', cx + 2.2, cz - 0.5, 0, 1);
    this.prop('barrel', cx + 2.6, cz + 0.4, 0, 0.95);
  }

  tree(x: number, z: number, s = 1, kind = 0) {
    const y = this.h(x, z);
    this.trees.push({ x, y, z, s, kind });
    this.world.colliders.push(makeCyl(x, z, 0.32 * s, y - 1, y + 6 * s, MAT_WOOD));
  }
  /** Scatter trees within a shape, clustered by noise. */
  forest(s: Shape, count: number, o: { minSpacing?: number; kinds?: number[]; scale?: [number, number]; cluster?: number } = {}) {
    const [x0, x1, z0, z1] = this.bbox(s, 0);
    const spacing = o.minSpacing ?? 5;
    const placed: [number, number][] = [];
    let tries = 0;
    while (placed.length < count && tries < count * 30) {
      tries++;
      const x = this.rng.range(x0, x1), z = this.rng.range(z0, z1);
      if (this.sdf(s, x, z) > 0) continue;
      if (o.cluster && this.noise.fbm(x / 40, z / 40, 2) < (o.cluster - 0.5)) continue;
      if (this.blocked(x, z, 1)) continue;
      if (this.world.waterAt(x, z) && this.h(x, z) < (this.world.waterAt(x, z)!.level + 0.3)) continue;
      if (placed.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < spacing * spacing)) continue;
      placed.push([x, z]);
      const kinds = o.kinds ?? [0, 0, 1, 2];
      const [smin, smax] = o.scale ?? [0.85, 1.35];
      this.tree(x, z, this.rng.range(smin, smax), this.rng.pick(kinds));
    }
  }
  scatterProps(s: Shape, type: PropType, count: number, scale: [number, number] = [0.8, 1.2]) {
    const [x0, x1, z0, z1] = this.bbox(s, 0);
    let n = 0, tries = 0;
    while (n < count && tries < count * 20) {
      tries++;
      const x = this.rng.range(x0, x1), z = this.rng.range(z0, z1);
      if (this.sdf(s, x, z) > 0 || this.blocked(x, z, 0.5)) continue;
      this.prop(type, x, z, this.rng.range(0, Math.PI * 2), this.rng.range(scale[0], scale[1]));
      n++;
    }
  }

  spawn(team: 0 | 1, x: number, z: number, yaw: number, w = 24, d = 10) {
    this.spawns[team].push({ x, z, yaw, w, d });
    this.avoid({ kind: 'rect', x, z, hx: w / 2 + 2, hz: d / 2 + 2, rot: yaw });
  }
  objective(name: string, short: string, x: number, z: number, r = 9, owner = -1) {
    this.objectives.push({ name, short, x, z, r, owner });
  }
  bounds(minX: number, maxX: number, minZ: number, maxZ: number) {
    this.world.bounds = { minX, maxX, minZ, maxZ };
  }
  /** Fighting lanes for bots in pitched battle (they drift toward these between engagements). */
  front(...pts: [number, number][]) { this.rally.push(...pts); }
  cinematic(x: number, y: number, z: number, tx: number, ty: number, tz: number) { this.cameras.push({ x, y, z, tx, ty, tz }); }

  build(def: MapDef): BuiltMap {
    this.world.finalize();
    return {
      def,
      world: this.world,
      structures: this.structures,
      props: this.props,
      trees: this.trees,
      hedges: this.hedges,
      lights: this.lights,
      spawns: this.spawns,
      objectives: this.objectives,
      rally: this.rally,
      seaLevel: this.seaLevel,
      camera: this.cameras,
    };
  }
}

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export const MAT = { stone: MAT_STONE, wood: MAT_WOOD, earth: MAT_EARTH };
