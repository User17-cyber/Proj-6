'use strict';
/* The player: movement, inventory, mining, placing, farming and fighting. */

const VILLAGER_LINES = [
  'Everything worth having is made on a Maker Table. Lay your materials on its nine squares.',
  'Till soil with a Tiller, then press seeds into it. Crops ripen faster than you would think.',
  'A Spade makes short work of dirt and sand. A Pick is what you want for stone.',
  'Iron ore needs a stone pick. Prism ore, deep down, needs an iron one.',
  'Sleep in a bed and the night passes. The Gloomers only walk in the dark.',
  'Help yourself to the chests. That is what a town is for.',
  'Raw iron and a lump of coal on the table make an ingot.',
];

class Player {
  constructor(game) {
    this.g = game;
    this.x = 0; this.y = 80; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0;
    this.hw = 0.3; this.h = 1.8; this.eye = 1.62;
    this.yaw = 0; this.pitch = 0;
    this.maxHp = 20; this.hp = 20; this.dead = false;
    this.inv = new Array(36).fill(null);
    this.armor = new Array(4).fill(null);
    this.sel = 0;
    this.spawn = { x: 0, y: 80, z: 0 };
    this.onGround = false; this.inWater = false; this.headWater = false;
    this.mine = null; this.mineP = 0; this.swing = 0; this.swingOn = false;
    this.attackCool = 0; this.useCool = 0; this.invuln = 0; this.sinceHurt = 99; this.regenT = 0;
    this.bob = 0; this.fallV = 0; this.hurtFlash = 0; this.air = 10; this.drownT = 0;
    this.target = null; this.targetE = null;
  }

  /* ---------- inventory ---------- */
  give(id, n) {
    const max = maxStack(id);
    for (let i = 0; i < 36 && n > 0; i++) {
      const s = this.inv[i];
      if (s && s.id === id && s.n < max) { const k = Math.min(n, max - s.n); s.n += k; n -= k; }
    }
    for (let i = 0; i < 36 && n > 0; i++) {
      if (!this.inv[i]) { const k = Math.min(n, max); this.inv[i] = { id, n: k }; n -= k; }
    }
    this.g.ui.hudDirty = true;
    return n;
  }
  count(id) { let n = 0; for (const s of this.inv) if (s && s.id === id) n += s.n; return n; }
  take(id, n) {
    for (let i = 35; i >= 0 && n > 0; i--) {
      const s = this.inv[i];
      if (!s || s.id !== id) continue;
      const k = Math.min(n, s.n);
      s.n -= k; n -= k;
      if (s.n <= 0) this.inv[i] = null;
    }
    this.g.ui.hudDirty = true;
    return n === 0;
  }
  held() { return this.inv[this.sel]; }
  heldItem() { const s = this.inv[this.sel]; return s ? ITEMS[s.id] : null; }
  useHeld() {
    const s = this.inv[this.sel];
    if (!s) return;
    s.n--;
    if (s.n <= 0) this.inv[this.sel] = null;
    this.g.ui.hudDirty = true;
  }
  armorPoints() { let a = 0; for (const s of this.armor) if (s) a += ITEMS[s.id].armor; return a; }

  /* ---------- health ---------- */
  hurt(dmg, fromX, fromZ, raw) {
    if (this.dead || (this.invuln > 0 && !raw)) return;
    const real = raw ? dmg : Math.max(1, Math.round(dmg * (1 - Math.min(0.8, this.armorPoints() * 0.036))));
    this.hp -= real;
    this.invuln = 0.55; this.sinceHurt = 0; this.hurtFlash = 1;
    if (fromX !== undefined) {
      const dx = this.x - fromX, dz = this.z - fromZ, d = Math.hypot(dx, dz) || 1;
      this.vx += dx / d * 7; this.vz += dz / d * 7; this.vy = Math.max(this.vy, 4.5);
    }
    this.g.audio.play('hurt');
    this.g.ui.hudDirty = true;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.g.onDeath(); }
  }
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); this.g.ui.hudDirty = true; }
  respawn() {
    const s = this.spawn;
    this.x = s.x; this.y = s.y; this.z = s.z; this.vx = this.vy = this.vz = 0;
    this.hp = this.maxHp; this.dead = false; this.invuln = 2; this.air = 10;
    this.g.ui.hudDirty = true;
  }

  forward(out) {
    const cp = Math.cos(this.pitch);
    out[0] = -Math.sin(this.yaw) * cp; out[1] = Math.sin(this.pitch); out[2] = -Math.cos(this.yaw) * cp;
    return out;
  }

  /* ---------- movement ---------- */
  move(dt, inp) {
    const w = this.g.world;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mx = 0, mz = 0;
    if (!this.dead && inp) {
      const f = (inp.fwd ? 1 : 0) - (inp.back ? 1 : 0), s = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      mx = fx * f + rx * s; mz = fz * f + rz * s;
      const l = Math.hypot(mx, mz);
      if (l > 0) { mx /= l; mz /= l; }
    }
    const bx = Math.floor(this.x), bz = Math.floor(this.z);
    this.inWater = w.getBlock(bx, Math.floor(this.y + 0.5), bz) === B.WATER;
    this.headWater = w.getBlock(bx, Math.floor(this.y + this.eye), bz) === B.WATER;
    const sprint = inp && inp.sprint && !this.inWater;
    const speed = this.inWater ? 2.7 : sprint ? 6.5 : 4.4;
    const k = 1 - Math.exp(-dt * (this.onGround ? 13 : this.inWater ? 5 : 2.6));
    this.vx += (mx * speed - this.vx) * k; this.vz += (mz * speed - this.vz) * k;
    if (this.inWater) {
      const want = inp && inp.jump && !this.dead ? 3.4 : -1.8;
      this.vy += (want - this.vy) * (1 - Math.exp(-dt * 5));
      if (inp && inp.jump && !this.headWater && this.vy < 5) this.vy = 5.2;
    } else {
      this.vy -= 28 * dt;
      if (this.onGround && inp && inp.jump && !this.dead) { this.vy = 8.7; }
    }
    if (this.vy < -55) this.vy = -55;
    const preVy = this.vy;
    moveBody(w, this, dt);
    if (this.onGround && preVy < -17 && !this.inWater) this.hurt(Math.floor((-preVy - 14) * 0.55), undefined, undefined, true);
    if (this.y < -20) { this.y = w.surfaceY(bx, bz) + 1; this.vy = 0; }
    const hs = Math.hypot(this.vx, this.vz);
    if (this.onGround && hs > 0.5) this.bob += dt * hs * 1.9;
  }

  /* ---------- per-frame update ---------- */
  update(dt, inp) {
    const g = this.g, w = g.world;
    this.move(dt, inp);
    this.invuln -= dt; this.attackCool -= dt; this.useCool -= dt; this.sinceHurt += dt;
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    if (!this.dead && this.sinceHurt > 8 && this.hp < this.maxHp) {
      this.regenT += dt;
      if (this.regenT > 3.5) { this.regenT = 0; this.heal(1); }
    }
    /* breath */
    if (this.headWater && !this.dead) {
      this.air -= dt;
      if (this.air <= 0) { this.drownT += dt; if (this.drownT > 1) { this.drownT = 0; this.hurt(2, undefined, undefined, true); } }
    } else this.air = Math.min(10, this.air + dt * 4);
    if (Math.floor(this.air) !== this.lastAir) { this.lastAir = Math.floor(this.air); g.ui.hudDirty = true; }

    /* what is under the crosshair */
    const d = this.forward([0, 0, 0]);
    const ex = this.x, ey = this.y + this.eye, ez = this.z;
    const hb = w.raycast(ex, ey, ez, d[0], d[1], d[2], 5.2);
    const he = g.entities.raycast(ex, ey, ez, d[0], d[1], d[2], 3.6);
    this.targetE = he && (!hb || he.dist < hb.dist) ? he.e : null;
    this.target = this.targetE ? null : hb;

    if (this.swingOn) { this.swing += dt * 3.6; if (this.swing >= 1) { this.swing = 0; this.swingOn = false; } }
    if (this.dead || !inp) { this.mine = null; this.mineP = 0; return; }

    /* left button: attack or dig */
    if (inp.lmb) {
      if (this.targetE) {
        if (this.attackCool <= 0) {
          const it = this.heldItem();
          g.entities.hurt(this.targetE, it && it.dmg ? it.dmg : 1, this.x, this.z, true);
          this.attackCool = 0.36; this.startSwing();
        }
        this.mine = null; this.mineP = 0;
      } else if (this.target) {
        const t = this.target;
        if (!this.mine || this.mine.x !== t.x || this.mine.y !== t.y || this.mine.z !== t.z) { this.mine = { x: t.x, y: t.y, z: t.z }; this.mineP = 0; this.digT = 0; }
        const time = this.breakTime(BLOCKS[t.id]);
        this.mineP += dt / time;
        this.digT -= dt;
        if (this.digT <= 0) { this.digT = 0.22; g.audio.play('dig'); g.render.burst(t.x + 0.5 + t.nx * 0.5, t.y + 0.5 + t.ny * 0.5, t.z + 0.5 + t.nz * 0.5, this.blockColor(t), 2, 2, 0.07); }
        if (!this.swingOn) this.startSwing();
        if (this.mineP >= 1) { this.breakBlock(t.x, t.y, t.z, true); this.mine = null; this.mineP = 0; }
      } else {
        if (inp.lmbEdge) this.startSwing();
        this.mine = null; this.mineP = 0;
      }
    } else { this.mine = null; this.mineP = 0; }

    /* right button: use */
    if (inp.rmb && (inp.rmbEdge || this.useCool <= 0)) {
      if (this.use(inp.sneak, inp.rmbEdge)) this.useCool = 0.24;
    }
  }
  startSwing() { this.swing = 0.01; this.swingOn = true; }

  blockColor(t) {
    const d = BLOCKS[t.id];
    if (d.tint) {
      const c = this.g.world.getChunk(t.x >> 4, t.z >> 4);
      if (c) { const i = ((t.z & 15) * CHUNK + (t.x & 15)) * 3; return [c.tint[i] / 255, c.tint[i + 1] / 255, c.tint[i + 2] / 255]; }
    }
    return d.color;
  }
  toolMatches(d) { const it = this.heldItem(); return !!(it && it.kind === 'tool' && d.tool && it.tool === d.tool); }
  breakTime(d) {
    if (d.hard > 1e8) return Infinity;
    const it = this.heldItem();
    let t = d.hard / (this.toolMatches(d) ? it.speed : 1);
    if (this.headWater) t *= 2;
    return Math.max(t, 0.06);
  }
  canHarvest(d) { return d.tier === 0 || (this.toolMatches(d) && this.heldItem().tier >= d.tier); }
  /* Text shown under the crosshair when the tool in hand is wrong for the block. */
  harvestHint(d) {
    if (d.hard > 1e8) return 'Unbreakable';
    if (this.canHarvest(d)) return '';
    return 'Needs a ' + TIERS[d.tier].name.toLowerCase() + ' ' + d.tool + ' or better';
  }

  chestSlots(x, y, z) {
    const w = this.g.world, key = x + ',' + y + ',' + z;
    let arr = w.chests.get(key);
    if (!arr) {
      const table = w.chestLoot.get(key);
      arr = table ? rollLoot(table, mulberry32(hashInt(w.seed + 77, x * 31 + y, z))) : new Array(27).fill(null);
      w.chests.set(key, arr);
    }
    return arr;
  }

  breakBlock(x, y, z, byHand) {
    const g = this.g, w = g.world;
    const id = w.getBlock(x, y, z), d = BLOCKS[id];
    if (id === B.AIR || d.hard > 1e8) return;
    if (id === B.CHEST) {
      if (this.chestSlots(x, y, z).some((s) => s)) { g.ui.toast('Empty the chest before breaking it'); return; }
      w.chests.delete(x + ',' + y + ',' + z);
    }
    if (!byHand || this.canHarvest(d)) {
      const drops = d.drop === undefined ? [[id, 1]] : d.drop === null ? [] : d.drop(Math.random);
      for (const [did, n] of drops) if (n > 0 && this.give(did, n) > 0) g.ui.toast('Inventory full');
    }
    const c = this.blockColor({ id, x, y, z });
    let fill = B.AIR;
    if (y <= SEA + 1) for (const [dx, dy, dz] of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) if (w.getBlock(x + dx, y + dy, z + dz) === B.WATER) fill = B.WATER;
    w.setBlock(x, y, z, fill);
    g.render.burst(x + 0.5, y + 0.5, z + 0.5, c, d.shape === 'cube' ? 14 : 6, 4, 0.13);
    if (byHand) g.audio.play('break');
    const up = w.getBlock(x, y + 1, z);
    if (BLOCKS[up].needsSoil) this.breakBlock(x, y + 1, z, false);
  }

  /* Right-click. Returns true if something happened. */
  use(sneak, edge) {
    const g = this.g, w = g.world;
    if (this.targetE && this.targetE.type === 'villager') {
      if (edge) this.talk(this.targetE);
      return edge;
    }
    let t = this.target;
    if (t && !sneak && edge) {
      if (t.id === B.MAKER_TABLE) { g.ui.openScreen('maker'); return true; }
      if (t.id === B.CHEST) { g.ui.openScreen('chest', this.chestSlots(t.x, t.y, t.z)); g.audio.play('place'); return true; }
      if (t.id === B.BED) { this.sleep(t); return true; }
    }
    const s = this.held(), it = s ? ITEMS[s.id] : null;
    if (!it) return false;
    if (it.kind === 'food') {
      if (!edge) return false;
      if (this.hp >= this.maxHp) { g.ui.toast('You are not hurt'); return true; }
      this.heal(it.heal); this.useHeld(); g.audio.play('eat'); this.startSwing();
      return true;
    }
    if (it.tool === 'bow') {
      if (this.attackCool > 0) return false;
      if (!this.take(I.ARROW, 1)) { if (edge) g.ui.toast('No arrows'); return true; }
      const d = this.forward([0, 0, 0]);
      g.entities.shoot('arrow', this.x + d[0] * 0.5, this.y + this.eye - 0.1 + d[1] * 0.5, this.z + d[2] * 0.5, d[0], d[1] + 0.03, d[2], 30, 6, 'player');
      this.attackCool = 0.55; g.audio.play('bow'); this.startSwing();
      return true;
    }
    if (!t) return false;
    /* tools and seeds aimed at a plant act on the ground it grows from */
    if ((it.tool === 'tiller' || it.tool === 'spade') && BLOCKS[t.id].shape === 'plant') t = { x: t.x, y: t.y - 1, z: t.z, nx: 0, ny: 1, nz: 0, id: w.getBlock(t.x, t.y - 1, t.z) };
    const above = w.getBlock(t.x, t.y + 1, t.z);
    const clearAbove = above === B.AIR || BLOCKS[above].shape === 'plant';
    if (it.tool === 'tiller') {
      if ((t.id === B.GRASS || t.id === B.DIRT || t.id === B.PATH) && clearAbove) {
        if (above !== B.AIR) this.breakBlock(t.x, t.y + 1, t.z, false);
        w.setBlock(t.x, t.y, t.z, B.FARMLAND);
        g.audio.play('dig'); g.render.burst(t.x + 0.5, t.y + 1, t.z + 0.5, BLOCKS[B.DIRT].color, 6, 2.5, 0.09); this.startSwing();
        return true;
      }
      return false;
    }
    if (it.tool === 'spade' && t.id === B.GRASS && clearAbove) {
      if (above !== B.AIR) this.breakBlock(t.x, t.y + 1, t.z, false);
      w.setBlock(t.x, t.y, t.z, B.PATH);
      g.audio.play('dig'); this.startSwing();
      return true;
    }
    if (it.kind === 'seed') {
      if (t.id === B.FARMLAND && above === B.AIR) {
        w.setBlock(t.x, t.y + 1, t.z, it.plants);
        this.useHeld(); g.audio.play('place'); this.startSwing();
        return true;
      }
      if (edge && t.id !== B.FARMLAND && !isCropBlock(t.id)) g.ui.toast('Seeds need tilled soil. Use a Tiller first');
      return false;
    }
    if (it.kind === 'block') {
      let px = t.x, py = t.y, pz = t.z;
      if (!BLOCKS[t.id].replace) { px += t.nx; py += t.ny; pz += t.nz; }
      if (py < 1 || py >= WORLD_H) return false;
      const cur = w.getBlock(px, py, pz);
      if (!BLOCKS[cur].replace) return false;
      const nd = BLOCKS[s.id];
      if (nd.needsSoil) {
        const below = w.getBlock(px, py - 1, pz);
        if (!SOIL_BLOCKS.has(below) && !(s.id === B.CACTUS && below === B.CACTUS)) { if (edge) g.ui.toast('That needs soil underneath'); return false; }
      }
      if (nd.solid) {
        if (px + 1 > this.x - this.hw && px < this.x + this.hw && pz + 1 > this.z - this.hw && pz < this.z + this.hw && py + nd.height > this.y && py < this.y + this.h) return false;
        for (const e of g.entities.list) {
          if (px + 1 > e.x - e.hw && px < e.x + e.hw && pz + 1 > e.z - e.hw && pz < e.z + e.hw && py + 1 > e.y && py < e.y + e.h) return false;
        }
      }
      w.setBlock(px, py, pz, s.id);
      this.useHeld(); g.audio.play('place'); this.startSwing();
      return true;
    }
    return false;
  }

  sleep(t) {
    const g = this.g;
    this.spawn = { x: t.x + 0.5, y: t.y + 0.6, z: t.z + 0.5 };
    if (g.render.sunHeight < 0.05) { g.time = 0.03; g.ui.banner('Morning', 'You slept through the night. Spawn point set.'); }
    else g.ui.toast('Spawn point set. You can only sleep at night');
  }

  talk(e) {
    const g = this.g;
    const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    let line;
    if (Math.random() < 0.45) {
      const ti = Math.random() < 0.5 ? 1 : 2;
      const near = g.world.gen.nearestStructure(ti, this.x, this.z, 2);
      if (near) {
        const b = Math.atan2(near.s.x - this.x, -(near.s.z - this.z));
        line = 'There is a ' + near.s.name.toLowerCase() + ' about ' + Math.round(near.dist / 10) * 10 + ' blocks to the ' + names[((Math.round(b / (Math.PI / 4)) % 8) + 8) % 8] + '. Go armed.';
      }
    }
    if (!line) line = VILLAGER_LINES[Math.floor(Math.random() * VILLAGER_LINES.length)];
    g.ui.say('Townsfolk', line);
    g.audio.play('pop');
  }
}
