'use strict';
/* Town, fortress and castle builders. A builder runs once per chunk it touches; the Stamp clips
   every write to that chunk. Builders must use the random stream identically each run. */

class Stamp {
  constructor(data, X0, Z0, s, rng, world) {
    this.data = data; this.X0 = X0; this.Z0 = Z0;
    this.ox = s.x; this.oy = s.y; this.oz = s.z;
    this.rng = rng; this.world = world; this.salt = s.x * 31 + s.z;
    this.spawns = [];
  }
  set(x, y, z, id) {
    const lx = this.ox + x - this.X0, lz = this.oz + z - this.Z0, wy = this.oy + y;
    if (lx < 0 || lz < 0 || lx >= CHUNK || lz >= CHUNK || wy < 1 || wy >= WORLD_H) return false;
    this.data[(wy * CHUNK + lz) * CHUNK + lx] = id;
    return true;
  }
  each(x0, y0, z0, x1, y1, z1, fn) {
    const ax = Math.max(x0 + this.ox - this.X0, 0), bx = Math.min(x1 + this.ox - this.X0, CHUNK - 1);
    const az = Math.max(z0 + this.oz - this.Z0, 0), bz = Math.min(z1 + this.oz - this.Z0, CHUNK - 1);
    const ay = Math.max(y0 + this.oy, 1), by = Math.min(y1 + this.oy, WORLD_H - 1);
    if (ax > bx || az > bz || ay > by) return;
    const data = this.data;
    for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
      const id = fn(x + this.X0, y, z + this.Z0);
      if (id >= 0) data[(y * CHUNK + z) * CHUNK + x] = id;
    }
  }
  fill(x0, y0, z0, x1, y1, z1, id) { this.each(x0, y0, z0, x1, y1, z1, () => id); }
  mix(x0, y0, z0, x1, y1, z1, a, b, p) {
    const salt = this.salt;
    this.each(x0, y0, z0, x1, y1, z1, (x, y, z) => rand3(salt, x, y, z) < p ? b : a);
  }
  checker(x0, y0, z0, x1, y1, z1, a, b) { this.each(x0, y0, z0, x1, y1, z1, (x, y, z) => ((x + z) & 1) ? b : a); }
  walls(x0, y0, z0, x1, y1, z1, id, b, p) {
    const f = b === undefined ? (a, c, d, e, g, h) => this.fill(a, c, d, e, g, h, id) : (a, c, d, e, g, h) => this.mix(a, c, d, e, g, h, id, b, p);
    f(x0, y0, z0, x1, y1, z0); f(x0, y0, z1, x1, y1, z1); f(x0, y0, z0, x0, y1, z1); f(x1, y0, z0, x1, y1, z1);
  }
  battlements(x0, z0, x1, z1, y, id) {
    const g = (a, c, d, e) => this.each(a, y, c, d, y, e, (x, yy, z) => ((x + z) & 1) ? -1 : id);
    g(x0, z0, x1, z0); g(x0, z1, x1, z1); g(x0, z0, x0, z1); g(x1, z0, x1, z1);
  }
  /* A flight of whole-block steps with headroom carved above. wx/wz widen the flight. */
  stairs(x, y, z, dx, dz, n, id, wx, wz) {
    for (let i = 0; i < n; i++) {
      const px = x + dx * i, pz = z + dz * i;
      this.fill(px, y, pz, px + wx, y + i, pz + wz, id);
      this.fill(px, y + i + 1, pz, px + wx, y + i + 3, pz + wz, B.AIR);
    }
  }
  pyramid(cx, y, cz, r, id) { for (let i = 0; i <= r; i++) this.fill(cx - r + i, y + i, cz - r + i, cx + r - i, y + i, cz + r - i, id); }
  chest(x, y, z, table) {
    if (this.set(x, y, z, B.CHEST) && this.world) this.world.chestLoot.set((this.ox + x) + ',' + (this.oy + y) + ',' + (this.oz + z), table);
  }
  spawn(x, y, z, kind) { this.spawns.push({ x: this.ox + x + 0.5, y: this.oy + y, z: this.oz + z + 0.5, kind }); }
}

/* ---------- town ---------- */
function buildHouse(S, cx, cz, face, workshop) {
  const rng = S.rng;
  const hw = 3 + (rng() < 0.5 ? 1 : 0), hd = 3 + (rng() < 0.5 ? 1 : 0);
  const wall = [B.PLANKS, B.PLANKS, B.STONE_BRICK, B.PAINT_WHITE, B.BRICKS, B.PAINT_YELLOW][Math.floor(rng() * 6)];
  const roof = [B.ROOF_RED, B.ROOF_RED, B.ROOF_BLUE, B.HAY][Math.floor(rng() * 4)];
  const x0 = cx - hw, x1 = cx + hw, z0 = cz - hd, z1 = cz + hd;
  S.fill(x0, -3, z0, x1, 0, z1, B.STONE_BRICK);
  S.fill(x0 + 1, 0, z0 + 1, x1 - 1, 0, z1 - 1, B.PLANKS);
  S.walls(x0, 1, z0, x1, 4, z1, wall);
  S.fill(x0 + 1, 1, z0 + 1, x1 - 1, 4, z1 - 1, B.AIR);
  for (const px of [x0, x1]) for (const pz of [z0, z1]) S.fill(px, 1, pz, px, 4, pz, B.LOG);
  if (face !== 'n') S.fill(cx - 1, 2, z0, cx + 1, 3, z0, B.GLASS);
  if (face !== 's') S.fill(cx - 1, 2, z1, cx + 1, 3, z1, B.GLASS);
  if (face !== 'w') S.fill(x0, 2, cz - 1, x0, 3, cz + 1, B.GLASS);
  if (face !== 'e') S.fill(x1, 2, cz - 1, x1, 3, cz + 1, B.GLASS);
  if (face === 's') { S.fill(cx, 1, z1, cx, 2, z1, B.AIR); S.fill(cx, 0, z1, cx, 0, -2, B.PATH); }
  else if (face === 'n') { S.fill(cx, 1, z0, cx, 2, z0, B.AIR); S.fill(cx, 0, 2, cx, 0, z0, B.PATH); }
  else if (face === 'e') { S.fill(x1, 1, cz, x1, 2, cz, B.AIR); S.fill(x1, 0, cz, -2, 0, cz, B.PATH); }
  else { S.fill(x0, 1, cz, x0, 2, cz, B.AIR); S.fill(2, 0, cz, x0, 0, cz, B.PATH); }
  for (let i = 0; ; i++) {
    const a = hw + 1 - i, b = hd + 1 - i;
    if (a < 0 || b < 0) break;
    S.fill(cx - a, 5 + i, cz - b, cx + a, 5 + i, cz + b, roof);
  }
  /* Furnish the corners away from the door. */
  const corners = [[x0 + 1, z0 + 1], [x1 - 1, z0 + 1], [x0 + 1, z1 - 1], [x1 - 1, z1 - 1]];
  S.set(corners[0][0], 1, corners[0][1], B.BED);
  S.chest(corners[1][0], 1, corners[1][1], workshop ? 'workshop' : 'town');
  S.set(corners[2][0], 1, corners[2][1], workshop ? B.MAKER_TABLE : (rng() < 0.4 ? B.MAKER_TABLE : B.HAY));
  S.set(corners[3][0], 1, corners[3][1], B.LOG);
  S.set(corners[3][0], 2, corners[3][1], B.LANTERN);
  if (workshop) S.chest(cx, 1, face === 'n' ? z1 - 1 : z0 + 1, 'workshop');
}

function buildFarm(S, cx, cz) {
  const rng = S.rng;
  const crop = [B.WHEAT_0, B.WHEAT_0, B.CARROT_0, B.BEET_0, B.PUMPKIN_0][Math.floor(rng() * 5)];
  S.fill(cx - 4, 0, cz - 3, cx + 4, 0, cz + 3, B.PLANKS);
  S.fill(cx - 3, 0, cz - 2, cx + 3, 0, cz + 2, B.FARMLAND);
  S.fill(cx - 3, 0, cz, cx + 3, 0, cz, B.WATER);
  S.fill(cx - 3, -1, cz, cx + 3, -1, cz, B.STONE_BRICK);
  for (let x = cx - 3; x <= cx + 3; x++) for (const z of [cz - 2, cz - 1, cz + 1, cz + 2]) {
    const stage = Math.min(3, Math.floor(rng() * 4.6));
    S.set(x, 1, z, crop + stage);
  }
  S.fill(cx + 5, 1, cz - 1, cx + 5, 1, cz, B.HAY);
  S.set(cx + 5, 2, cz - 1, B.HAY);
}

function buildTown(S) {
  const rng = S.rng;
  S.fill(-33, 0, -1, 33, 0, 1, B.PATH);
  S.fill(-1, 0, -33, 1, 0, 33, B.PATH);
  S.fill(-5, 0, -5, 5, 0, 5, B.STONE_BRICK);
  S.checker(-4, 0, -4, 4, 0, 4, B.STONE_BRICK, B.PATH);
  /* well */
  S.fill(-2, -3, -2, 2, 0, 2, B.STONE_BRICK);
  S.walls(-2, 1, -2, 2, 1, 2, B.STONE_BRICK);
  S.fill(-1, -2, -1, 1, 0, 1, B.WATER);
  for (const px of [-2, 2]) for (const pz of [-2, 2]) S.fill(px, 2, pz, px, 3, pz, B.LOG);
  S.fill(-2, 4, -2, 2, 4, 2, B.ROOF_RED);
  S.fill(-1, 5, -1, 1, 5, 1, B.ROOF_RED);
  for (const px of [-6, 6]) for (const pz of [-6, 6]) { S.fill(px, 1, pz, px, 3, pz, B.LOG); S.set(px, 4, pz, B.LANTERN); }
  for (const d of [-20, 20]) {
    S.fill(d, 1, 3, d, 3, 3, B.LOG); S.set(d, 4, 3, B.LANTERN);
    S.fill(3, 1, d, 3, 3, d, B.LOG); S.set(3, 4, d, B.LANTERN);
  }

  const slots = [
    [-14, -9, 's'], [-26, -9, 's'], [14, -9, 's'], [26, -9, 's'],
    [-14, 9, 'n'], [-26, 9, 'n'], [14, 9, 'n'], [26, 9, 'n'],
    [-9, -24, 'e'], [9, -24, 'w'], [-9, 24, 'e'], [9, 24, 'w'],
  ];
  for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = slots[i]; slots[i] = slots[j]; slots[j] = t; }
  slots.forEach(([x, z, face], i) => {
    const roll = rng();
    if (i === 0) buildHouse(S, x, z, face, true);
    else if (i <= 2 || roll < 0.22) buildFarm(S, x, z);
    else if (roll < 0.92) buildHouse(S, x, z, face, false);
    else { S.fill(x - 1, 1, z - 1, x + 1, 1, z + 1, B.HAY); S.fill(x, 2, z - 1, x, 2, z + 1, B.HAY); }
  });
  for (const [x, z] of [[4, 8], [-4, -8], [8, -4], [-8, 4], [18, 0], [-18, 0], [0, 18]]) S.spawn(x, 1, z, 'villager');
}

/* ---------- fortress ---------- */
function buildFortress(S) {
  const R = 18, WH = 7;
  S.mix(-R, 0, -R, R, 0, R, B.STONE_BRICK, B.PATH, 0.4);
  S.fill(-R, -3, -R, R, -1, R, B.STONE);
  for (let t = 0; t < 2; t++) S.walls(-R + t, 1, -R + t, R - t, WH, R - t, B.STONE_BRICK, B.MOSSY_STONE, 0.22);
  S.battlements(-R, -R, R, R, WH + 1, B.STONE_BRICK);
  S.fill(-1, 1, R - 1, 1, 4, R, B.AIR);
  S.fill(-1, 0, R - 1, 1, 0, R + 3, B.PATH);
  /* corner towers */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * R, cz = sz * R;
    S.walls(cx - 3, 1, cz - 3, cx + 3, 11, cz + 3, B.STONE_BRICK, B.MOSSY_STONE, 0.2);
    S.fill(cx - 2, 1, cz - 2, cx + 2, 10, cz + 2, B.AIR);
    S.fill(cx - 3, -3, cz - 3, cx + 3, 0, cz + 3, B.STONE_BRICK);
    S.fill(cx - 2, WH, cz - 2, cx + 2, WH, cz + 2, B.PLANKS);
    S.fill(cx - 3, 11, cz - 3, cx + 3, 11, cz + 3, B.STONE_BRICK);
    S.battlements(cx - 3, cz - 3, cx + 3, cz + 3, 12, B.STONE_BRICK);
    S.fill(Math.min(cx, cx - sx), WH + 1, cz - sz * 3, Math.max(cx, cx - sx), WH + 2, cz - sz * 3, B.AIR);
    S.fill(cx - sx * 3, WH + 1, Math.min(cz, cz - sz), cx - sx * 3, WH + 2, Math.max(cz, cz - sz), B.AIR);
    S.set(cx + sx, WH + 1, cz + sz, B.LANTERN);
  }
  S.chest(-R, WH + 1, -R, 'fortress');
  /* steps up to the wall walk */
  S.stairs(-R + 2, 1, 9, 0, -1, WH, B.STONE_BRICK, 1, 0);
  /* keep */
  S.fill(-6, 0, -6, 6, 0, 6, B.PLANKS);
  S.walls(-6, 1, -6, 6, 9, 6, B.STONE_BRICK, B.MOSSY_STONE, 0.15);
  S.fill(-5, 1, -5, 5, 9, 5, B.AIR);
  S.fill(-5, 5, -5, 5, 5, 5, B.PLANKS);
  S.fill(-6, 10, -6, 6, 10, 6, B.STONE_BRICK);
  S.battlements(-6, -6, 6, 6, 11, B.STONE_BRICK);
  S.fill(-1, 1, 6, 0, 2, 6, B.AIR);
  for (const y of [3, 7]) {
    S.fill(-3, y, -6, -2, y, -6, B.GLASS); S.fill(2, y, -6, 3, y, -6, B.GLASS);
    S.fill(-6, y, -1, -6, y, 1, B.GLASS); S.fill(6, y, -1, 6, y, 1, B.GLASS);
  }
  S.fill(3, 7, 6, 4, 7, 6, B.GLASS);
  S.stairs(5, 1, 4, 0, -1, 4, B.STONE_BRICK, 0, 0);
  S.chest(-5, 1, -5, 'fortress'); S.chest(-4, 1, -5, 'fortress');
  S.set(-5, 1, 5, B.LANTERN); S.set(5, 1, -5, B.LANTERN);
  S.chest(-5, 6, -5, 'fortress'); S.set(-5, 6, 5, B.MAKER_TABLE); S.set(0, 6, -5, B.LANTERN); S.set(-4, 6, 5, B.BED);
  for (const px of [-10, 10]) { S.fill(px, 1, 10, px, 2, 10, B.LOG); S.set(px, 3, 10, B.LANTERN); }
  S.spawn(-9, 1, 11, 'knight'); S.spawn(9, 1, 11, 'knight'); S.spawn(-11, 1, -10, 'knight'); S.spawn(11, 1, -10, 'knight');
  S.spawn(0, 1, 0, 'knight'); S.spawn(0, 6, 0, 'knight');
  S.spawn(0, WH + 1, -R + 1, 'archer'); S.spawn(R - 1, WH + 1, 0, 'archer'); S.spawn(-R + 1, WH + 1, -6, 'archer'); S.spawn(6, WH + 1, R - 1, 'archer');
}

/* ---------- castle ---------- */
function buildCastle(S) {
  const R = 24, WH = 9;
  /* moat and bridge */
  S.fill(-30, -1, -30, 30, 0, -27, B.WATER); S.fill(-30, -1, 27, 30, 0, 30, B.WATER);
  S.fill(-30, -1, -30, -27, 0, 30, B.WATER); S.fill(27, -1, -30, 30, 0, 30, B.WATER);
  S.fill(-30, -3, -30, 30, -2, 30, B.STONE);
  S.fill(-2, 0, 25, 2, 0, 31, B.PLANKS);
  /* curtain wall */
  S.mix(-R, 0, -R, R, 0, R, B.PATH, B.STONE_BRICK, 0.3);
  for (let t = 0; t < 3; t++) {
    S.walls(-R + t, 1, -R + t, R - t, WH, R - t, B.STONE_BRICK, B.DARK_BRICK, 0.14);
    S.walls(-R + t, 1, -R + t, R - t, 2, R - t, B.DARK_BRICK);
  }
  S.battlements(-R, -R, R, R, WH + 1, B.STONE_BRICK);
  S.fill(-2, 1, R - 2, 2, 5, R, B.AIR);
  S.fill(-2, 0, R - 2, 2, 0, R, B.PATH);
  /* corner towers with blue roofs */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * (R - 1), cz = sz * (R - 1), r = 4, h = 14;
    S.fill(cx - r, -3, cz - r, cx + r, 0, cz + r, B.DARK_BRICK);
    S.walls(cx - r, 1, cz - r, cx + r, h, cz + r, B.STONE_BRICK, B.DARK_BRICK, 0.18);
    S.fill(cx - r + 1, 1, cz - r + 1, cx + r - 1, h - 1, cz + r - 1, B.AIR);
    S.fill(cx - r + 1, WH, cz - r + 1, cx + r - 1, WH, cz + r - 1, B.PLANKS);
    S.fill(cx - r, h, cz - r, cx + r, h, cz + r, B.STONE_BRICK);
    S.pyramid(cx, h + 1, cz, r + 1, B.ROOF_BLUE);
    S.fill(cx, WH + 1, cz - sz * r, cx, WH + 2, cz - sz * r, B.AIR);
    S.fill(cx - sx * r, WH + 1, cz, cx - sx * r, WH + 2, cz, B.AIR);
    S.fill(cx + sx * r, WH + 2, cz, cx + sx * r, WH + 3, cz, B.GLASS);
    S.fill(cx, WH + 2, cz + sz * r, cx, WH + 3, cz + sz * r, B.GLASS);
    S.chest(cx + sx * 2, WH + 1, cz + sz * 2, 'fortress');
    S.set(cx - sx * 2, WH + 1, cz + sz * 2, B.LANTERN);
  }
  S.stairs(R - 3, 1, 12, 0, -1, WH, B.STONE_BRICK, 0, 0);
  for (const px of [-9, 9]) { S.fill(px, 1, 14, px, 2, 14, B.LOG); S.set(px, 3, 14, B.LANTERN); }

  /* keep */
  const kx0 = -10, kx1 = 10, kz0 = -14, kz1 = 6, KH = 18;
  S.fill(kx0, -3, kz0, kx1, -1, kz1, B.DARK_BRICK);
  S.checker(kx0, 0, kz0, kx1, 0, kz1, B.DARK_BRICK, B.STONE_BRICK);
  S.walls(kx0, 1, kz0, kx1, KH, kz1, B.STONE_BRICK, B.DARK_BRICK, 0.1);
  S.fill(kx0 + 1, 1, kz0 + 1, kx1 - 1, KH - 1, kz1 - 1, B.AIR);
  for (const px of [kx0, kx1]) for (const pz of [kz0, kz1]) S.fill(px, 1, pz, px, KH + 1, pz, B.DARK_BRICK);
  S.fill(kx0 + 1, 6, kz0 + 1, kx1 - 1, 6, kz1 - 1, B.PLANKS);
  S.fill(kx0 + 1, 12, kz0 + 1, kx1 - 1, 12, kz1 - 1, B.PLANKS);
  S.fill(kx0, KH, kz0, kx1, KH, kz1, B.STONE_BRICK);
  S.battlements(kx0, kz0, kx1, kz1, KH + 1, B.STONE_BRICK);
  for (const px of [kx0 + 1, kx1 - 1]) for (const pz of [kz0 + 1, kz1 - 1]) {
    S.fill(px - 1, KH + 1, pz - 1, px + 1, KH + 3, pz + 1, B.STONE_BRICK);
    S.pyramid(px, KH + 4, pz, 2, B.ROOF_BLUE);
  }
  S.fill(-3, KH + 1, -7, 3, KH + 5, -1, B.DARK_BRICK);
  S.fill(-1, KH + 3, -7, 1, KH + 4, -1, B.GLASS); S.fill(-3, KH + 3, -5, 3, KH + 4, -3, B.GLASS);
  S.pyramid(0, KH + 6, -4, 4, B.ROOF_BLUE);
  S.fill(-1, 1, kz1, 1, 4, kz1, B.AIR);
  for (const fy of [1, 7, 13]) {
    for (const x of [-6, -3, 3, 6]) { S.fill(x, fy + 1, kz0, x, fy + 2, kz0, B.GLASS); S.fill(x, fy + 1, kz1, x, fy + 2, kz1, B.GLASS); }
    for (const z of [-10, -6, -2, 2]) { S.fill(kx0, fy + 1, z, kx0, fy + 2, z, B.GLASS); S.fill(kx1, fy + 1, z, kx1, fy + 2, z, B.GLASS); }
  }
  /* great hall */
  S.fill(-1, 0, kz0 + 2, 1, 0, kz1, B.PAINT_RED);
  S.fill(-2, 1, -13, 2, 1, -11, B.DARK_BRICK);
  S.set(0, 2, -12, B.GOLD_BLOCK); S.fill(0, 2, -13, 0, 4, -13, B.GOLD_BLOCK);
  S.fill(-1, 2, -13, -1, 3, -13, B.PAINT_RED); S.fill(1, 2, -13, 1, 3, -13, B.PAINT_RED);
  for (const z of [-8, -3, 2]) for (const sx of [-5, 5]) { S.fill(sx, 1, z, sx, 5, z, B.DARK_BRICK); S.set(sx, 1, z + 1, B.LANTERN); }
  S.stairs(-9, 1, 3, 0, -1, 5, B.STONE_BRICK, 1, 0);
  /* armoury */
  S.stairs(8, 7, 3, 0, -1, 5, B.STONE_BRICK, 1, 0);
  S.chest(-4, 7, -13, 'castle'); S.chest(0, 7, -13, 'castle'); S.chest(4, 7, -13, 'castle');
  S.set(-9, 7, -13, B.MAKER_TABLE); S.set(-5, 7, -4, B.LANTERN); S.set(5, 7, -8, B.LANTERN); S.set(0, 7, 5, B.LANTERN);
  /* vault */
  S.walls(-4, 13, -13, 4, 17, -7, B.DARK_BRICK);
  S.fill(0, 13, -7, 0, 14, -7, B.AIR);
  S.chest(0, 13, -12, 'vault');
  S.set(-3, 13, -12, B.PRISM_BLOCK); S.set(3, 13, -12, B.GOLD_BLOCK); S.set(3, 14, -12, B.GOLD_BLOCK); S.set(-3, 13, -8, B.LANTERN);
  S.set(-9, 13, 5, B.LANTERN); S.set(9, 13, -13, B.LANTERN); S.set(-9, 13, -4, B.BED);

  S.spawn(0, 1, -7, 'warden');
  S.spawn(-5, 1, 3, 'knight'); S.spawn(5, 1, 3, 'knight'); S.spawn(-6, 7, 0, 'knight'); S.spawn(4, 7, -6, 'knight');
  S.spawn(0, 13, 0, 'knight'); S.spawn(4, 13, -3, 'knight');
  S.spawn(-14, 1, 14, 'knight'); S.spawn(14, 1, 14, 'knight'); S.spawn(-16, 1, -10, 'knight'); S.spawn(16, 1, -12, 'knight');
  S.spawn(0, WH + 1, -R + 1, 'archer'); S.spawn(-R + 1, WH + 1, 0, 'archer'); S.spawn(R - 1, WH + 1, -4, 'archer');
  S.spawn(10, WH + 1, R - 1, 'archer'); S.spawn(-10, WH + 1, R - 1, 'archer');
}

const STRUCT_BUILDERS = { town: buildTown, fortress: buildFortress, castle: buildCastle };
