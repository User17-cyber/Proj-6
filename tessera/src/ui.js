'use strict';
/* Sound effects (synthesised) and all DOM interface: HUD, pack, Maker Table, chests. */

class Sfx {
  constructor() { this.ctx = null; this.vol = 0.6; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { this.ctx = new AC(); } catch (e) { return false; }
    const len = this.ctx.sampleRate * 0.5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    return true;
  }
  tone(type, f0, f1, dur, vol, delay) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol * this.vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(freq, dur, vol, delay) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.3), t + dur);
    g.gain.setValueAtTime(vol * this.vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t, Math.random() * 0.3, dur + 0.02);
  }
  play(name, k) {
    if (this.vol <= 0 || !this.ensure()) return;
    const v = k === undefined ? 1 : k;
    switch (name) {
      case 'dig': this.noise(900, 0.07, 0.22 * v); break;
      case 'break': this.noise(1400, 0.16, 0.34 * v); this.tone('triangle', 170, 70, 0.12, 0.2 * v); break;
      case 'place': this.tone('sine', 210, 110, 0.09, 0.4 * v); this.noise(700, 0.05, 0.14 * v); break;
      case 'hit': this.tone('square', 240, 110, 0.1, 0.16 * v); this.noise(2000, 0.06, 0.2 * v); break;
      case 'hurt': this.tone('sawtooth', 320, 120, 0.2, 0.2 * v); break;
      case 'die': this.noise(1200, 0.3, 0.3 * v); this.tone('triangle', 300, 60, 0.3, 0.2 * v); break;
      case 'pop': this.tone('sine', 620, 940, 0.08, 0.2 * v); break;
      case 'craft': this.tone('triangle', 520, 520, 0.07, 0.22 * v); this.tone('triangle', 780, 780, 0.1, 0.22 * v, 0.07); break;
      case 'eat': for (let i = 0; i < 3; i++) this.noise(1100, 0.05, 0.22 * v, i * 0.09); break;
      case 'bow': this.noise(3000, 0.14, 0.2 * v); this.tone('sine', 500, 200, 0.12, 0.12 * v); break;
      case 'hop': this.tone('sine', 150, 260, 0.1, 0.16 * v); break;
      default: break;
    }
  }
  playAt(name, dist) { if (dist < 24) this.play(name, 1 - dist / 24); }
}

function stackHTML(stack, ghost) {
  if (!stack) return '';
  const it = ITEMS[stack.id];
  return '<i class="' + (it.sprite ? 'px' : '') + (ghost ? ' ghost' : '') + '" style="background-image:url(' + itemIcon(stack.id) + ')"></i>' + (stack.n > 1 ? '<b>' + stack.n + '</b>' : '');
}
function slotHTML(c, i, stack, cls, extra) {
  return '<div class="slot ' + (cls || '') + '" data-c="' + c + '" data-i="' + i + '"' + (extra || '') + '>' + stackHTML(stack) + '</div>';
}
function esc(s) { return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

class UI {
  constructor(game) {
    this.g = game;
    const $ = (id) => document.getElementById(id);
    this.el = {};
    for (const id of ['hud', 'title', 'loading', 'pause', 'death', 'screen', 'panel', 'hotbar', 'hearts', 'armorPips', 'air', 'heldName', 'toasts', 'banner', 'say',
      'targetInfo', 'compassStrip', 'place', 'debug', 'tint', 'cursorStack', 'tooltip', 'loadBar', 'loadText', 'loadTitle', 'pauseTitle', 'pauseText', 'places', 'btnContinue']) this.el[id] = $(id);
    this.cursor = null;
    this.grid = new Array(9).fill(null);
    this.kind = null; this.chest = null; this.ghost = null; this.lastFill = null;
    this.hudDirty = true; this.compassKey = ''; this.targetKey = ''; this.marks = []; this.markT = 0;
    this.mouse = { x: 0, y: 0 };

    this.el.places.innerHTML = STRUCT_TYPES.map((t) =>
      '<div><b>' + t.name + '</b><span>up to one per ' + (t.region * t.region) + ' chunks</span>' + esc(t.benefit) + '</div>').join('');

    this.el.screen.addEventListener('mousedown', (ev) => this.onDown(ev));
    this.el.screen.addEventListener('contextmenu', (ev) => ev.preventDefault());
    document.addEventListener('mousemove', (ev) => { this.mouse.x = ev.clientX; this.mouse.y = ev.clientY; if (this.kind) this.onHover(ev); });
  }

  show(name, on) { this.el[name].classList.toggle('hidden', !on); }

  /* ---------- messages ---------- */
  toast(msg) {
    const now = performance.now();
    if (this.lastToast === msg && now - this.lastToastT < 1500) return;
    this.lastToast = msg; this.lastToastT = now;
    const d = document.createElement('div');
    d.textContent = msg;
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 5) this.el.toasts.removeChild(this.el.toasts.firstChild);
    setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 3300);
  }
  banner(title, sub) {
    const b = this.el.banner;
    b.querySelector('h2').textContent = title; b.querySelector('p').textContent = sub || '';
    b.classList.add('hidden'); void b.offsetWidth; b.classList.remove('hidden');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.add('hidden'), 4200);
  }
  say(name, text) {
    const s = this.el.say;
    s.querySelector('b').textContent = name; s.querySelector('p').textContent = text;
    s.classList.remove('hidden');
    clearTimeout(this.sayT);
    this.sayT = setTimeout(() => s.classList.add('hidden'), 6500);
  }
  loading(title, text, frac) {
    this.el.loadTitle.textContent = title; this.el.loadText.textContent = text; this.el.loadBar.style.width = Math.round(frac * 100) + '%';
  }

  /* ---------- HUD ---------- */
  renderHud() {
    const p = this.g.player;
    let h = '';
    for (let i = 0; i < 9; i++) h += '<div class="slot' + (i === p.sel ? ' sel' : '') + '"><em>' + (i + 1) + '</em>' + stackHTML(p.inv[i]) + '</div>';
    this.el.hotbar.innerHTML = h;
    const pips = (v, n) => { let s = ''; for (let i = 0; i < n; i++) s += '<i class="' + (v >= i * 2 + 2 ? 'full' : v >= i * 2 + 1 ? 'half' : '') + '"></i>'; return s; };
    this.el.hearts.innerHTML = pips(p.hp, 10);
    const ap = p.armorPoints();
    this.el.armorPips.innerHTML = ap > 0 ? pips(ap, 9) : '';
    let air = '';
    if (p.air < 9.9) for (let i = 0; i < Math.ceil(p.air); i++) air += '<i></i>';
    this.el.air.innerHTML = air;
    const s = p.held();
    this.el.heldName.textContent = s ? itemName(s.id) : '';
    this.hudDirty = false;
  }

  frame(dt) {
    const g = this.g, p = g.player;
    if (this.hudDirty) this.renderHud();
    /* crosshair target */
    let key = '', html = '';
    if (p.targetE) {
      const e = p.targetE;
      key = 'e' + e.type + Math.ceil(e.hp);
      html = esc(e.def.name) + (e.def.kind === 'villager' ? '<i>Right-click to talk</i>' : '<i>' + Math.max(0, Math.ceil(e.hp)) + ' / ' + e.def.hp + '</i>');
    } else if (p.target) {
      const d = BLOCKS[p.target.id], pr = Math.floor(p.mineP * 14);
      const hint = p.mine ? p.harvestHint(d) : (p.target.id === B.MAKER_TABLE ? 'Right-click to craft' : p.target.id === B.CHEST ? 'Right-click to open' : p.target.id === B.BED ? 'Right-click to sleep' : '');
      key = 'b' + p.target.id + pr + hint;
      if (p.mine || hint) html = esc(d.name) + (hint ? '<i>' + hint + '</i>' : '') + (p.mine ? '<div class="prog"><b style="width:' + Math.min(100, p.mineP * 100) + '%"></b></div>' : '');
    }
    if (key !== this.targetKey) { this.targetKey = key; this.el.targetInfo.innerHTML = html; }

    /* screen tint */
    const t = this.el.tint;
    if (p.hurtFlash > 0) t.style.background = 'rgba(229,72,77,' + (p.hurtFlash * 0.34).toFixed(2) + ')';
    else if (p.headWater) t.style.background = 'rgba(24,84,150,0.3)';
    else if (t.style.background !== 'transparent') t.style.background = 'transparent';

    /* compass */
    this.markT -= dt;
    if (this.markT <= 0) {
      this.markT = 1;
      this.marks = [];
      for (let ti = 0; ti < STRUCT_TYPES.length; ti++) {
        const n = g.world.gen.nearestStructure(ti, p.x, p.z, 2);
        if (n) this.marks.push({ type: STRUCT_TYPES[ti].type, name: STRUCT_TYPES[ti].name, x: n.s.x, z: n.s.z, dist: n.dist, radius: n.s.radius });
      }
      this.compassKey = '';
    }
    const heading = -p.yaw;
    const ck = Math.round(heading * 60) + '|' + Math.round(p.x / 2) + '|' + Math.round(p.z / 2);
    if (ck !== this.compassKey) {
      this.compassKey = ck;
      const wrap = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
      let c = '';
      ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].forEach((n, i) => {
        const rel = wrap(i * Math.PI / 4 - heading);
        if (Math.abs(rel) < Math.PI / 2) c += '<span class="' + (n.length === 1 ? 'card' : '') + '" style="left:' + (50 + rel / (Math.PI / 2) * 50).toFixed(1) + '%">' + n + '</span>';
      });
      for (const m of this.marks) {
        const dist = Math.hypot(m.x - p.x, m.z - p.z);
        const rel = wrap(Math.atan2(m.x - p.x, -(m.z - p.z)) - heading);
        const x = clamp(50 + rel / (Math.PI / 2) * 50, 5, 95);
        c += '<span class="mark ' + m.type + '" style="left:' + x.toFixed(1) + '%;opacity:' + (Math.abs(rel) > Math.PI / 2 ? 0.45 : 1) + '"><i></i>' + m.name + ' ' + Math.round(dist) + '</span>';
      }
      this.el.compassStrip.innerHTML = c;
    }
  }

  /* ---------- containers ---------- */
  arr(c) { const p = this.g.player; return c === 'inv' ? p.inv : c === 'armor' ? p.armor : c === 'grid' ? this.grid : c === 'chest' ? this.chest : null; }
  accepts(c, i, id) { return c !== 'armor' || (ITEMS[id].kind === 'armor' && ITEMS[id].slot === i); }
  addTo(arr, stack, from, to) {
    const max = maxStack(stack.id);
    for (let i = from; i < to && stack.n > 0; i++) { const s = arr[i]; if (s && s.id === stack.id && s.n < max) { const k = Math.min(stack.n, max - s.n); s.n += k; stack.n -= k; } }
    for (let i = from; i < to && stack.n > 0; i++) { if (!arr[i]) { const k = Math.min(stack.n, max); arr[i] = { id: stack.id, n: k }; stack.n -= k; } }
    return stack.n;
  }
  canFit(arr, id, n) {
    const max = maxStack(id);
    for (const s of arr) { if (!s) n -= max; else if (s.id === id) n -= max - s.n; if (n <= 0) return true; }
    return n <= 0;
  }

  openScreen(kind, chest) {
    const g = this.g;
    this.kind = kind; this.chest = chest || null; this.ghost = null; this.lastFill = null;
    g.setState('ui');
    this.show('screen', true);
    this.renderScreen();
  }
  closeScreen() {
    if (!this.kind) return;
    const p = this.g.player;
    let lost = false;
    for (let i = 0; i < 9; i++) if (this.grid[i]) { if (p.give(this.grid[i].id, this.grid[i].n) > 0) lost = true; this.grid[i] = null; }
    if (this.cursor) { if (p.give(this.cursor.id, this.cursor.n) > 0) lost = true; this.cursor = null; }
    if (lost) this.toast('Your pack was full. Some items were left behind');
    this.kind = null; this.chest = null;
    this.show('screen', false); this.show('cursorStack', false); this.show('tooltip', false);
    this.hudDirty = true;
  }

  gridIds() { return this.grid.map((s) => (s ? s.id : 0)); }

  /* Which pack items would fill this recipe (one set), or null if something is missing. */
  plan(r) {
    const p = this.g.player, used = {}, cells = recipeLayout(r), out = new Array(9).fill(0);
    for (let i = 0; i < 9; i++) {
      if (!cells[i]) continue;
      let got = 0;
      for (const id of cells[i]) { if (p.count(id) - (used[id] || 0) > 0) { got = id; break; } }
      if (!got) return null;
      used[got] = (used[got] || 0) + 1; out[i] = got;
    }
    return out;
  }
  autoFill(r) {
    const p = this.g.player;
    for (let i = 0; i < 9; i++) if (this.grid[i]) { p.give(this.grid[i].id, this.grid[i].n); this.grid[i] = null; }
    const sets = this.lastFill && this.lastFill.r === r ? this.lastFill.k + 1 : 1;
    let done = 0;
    for (let k = 0; k < sets; k++) {
      const plan = this.plan(r);
      if (!plan) break;
      let fits = true;
      for (let i = 0; i < 9; i++) if (plan[i] && this.grid[i] && (this.grid[i].id !== plan[i] || this.grid[i].n >= maxStack(plan[i]))) fits = false;
      if (!fits) break;
      for (let i = 0; i < 9; i++) if (plan[i]) { p.take(plan[i], 1); if (this.grid[i]) this.grid[i].n++; else this.grid[i] = { id: plan[i], n: 1 }; }
      done++;
    }
    this.lastFill = { r, k: done };
    if (done === 0) { this.ghost = recipeLayout(r); this.toast('Missing materials for ' + itemName(r.out)); }
    else this.ghost = null;
  }
  craft(all) {
    const p = this.g.player;
    let made = 0;
    for (let guard = 0; guard < 64; guard++) {
      const r = matchRecipe(this.gridIds());
      if (!r) break;
      if (all) { if (!this.canFit(p.inv, r.out, r.n)) break; p.give(r.out, r.n); }
      else {
        if (this.cursor && (this.cursor.id !== r.out || this.cursor.n + r.n > maxStack(r.out))) break;
        if (this.cursor) this.cursor.n += r.n; else this.cursor = { id: r.out, n: r.n };
      }
      for (let i = 0; i < 9; i++) if (this.grid[i] && --this.grid[i].n <= 0) this.grid[i] = null;
      made++;
      if (!all) break;
    }
    if (made) { this.g.audio.play('craft'); this.lastFill = null; }
  }

  onDown(ev) {
    const el = ev.target.closest('.slot');
    if (!el) return;
    ev.preventDefault();
    const c = el.dataset.c, i = Number(el.dataset.i), p = this.g.player;
    if (c === 'guide') { this.autoFill(RECIPES[i]); this.renderScreen(); return; }
    if (c === 'out') { this.craft(ev.shiftKey); this.renderScreen(); return; }
    const arr = this.arr(c);
    if (!arr) return;
    const s = arr[i], cur = this.cursor;
    if (ev.shiftKey) {
      if (s) {
        let left;
        if (c === 'inv') {
          const it = ITEMS[s.id];
          if (this.kind === 'chest') left = this.addTo(this.chest, s, 0, 27);
          else if (it.kind === 'armor' && !p.armor[it.slot]) { p.armor[it.slot] = { id: s.id, n: 1 }; left = 0; }
          else left = i < 9 ? this.addTo(p.inv, s, 9, 36) : this.addTo(p.inv, s, 0, 9);
        } else left = this.addTo(p.inv, s, 0, 36);
        if (left <= 0) arr[i] = null;
      }
    } else if (ev.button === 0) {
      if (!cur) { if (s) { this.cursor = s; arr[i] = null; } }
      else if (!s) { if (this.accepts(c, i, cur.id)) { arr[i] = cur; this.cursor = null; } }
      else if (s.id === cur.id && s.n < maxStack(s.id)) { const k = Math.min(cur.n, maxStack(s.id) - s.n); s.n += k; cur.n -= k; if (cur.n <= 0) this.cursor = null; }
      else if (this.accepts(c, i, cur.id)) { arr[i] = cur; this.cursor = s; }
    } else if (ev.button === 2) {
      if (!cur) { if (s) { const k = Math.ceil(s.n / 2); this.cursor = { id: s.id, n: k }; s.n -= k; if (s.n <= 0) arr[i] = null; } }
      else if (!s) { if (this.accepts(c, i, cur.id)) { arr[i] = { id: cur.id, n: 1 }; if (--cur.n <= 0) this.cursor = null; } }
      else if (s.id === cur.id && s.n < maxStack(s.id)) { s.n++; if (--cur.n <= 0) this.cursor = null; }
    }
    if (c === 'grid') { this.ghost = null; this.lastFill = null; }
    this.g.audio.play('pop', 0.5);
    this.renderScreen();
  }

  onHover(ev) {
    const cs = this.el.cursorStack;
    if (this.cursor) { cs.style.left = ev.clientX + 'px'; cs.style.top = ev.clientY + 'px'; }
    const el = ev.target.closest ? ev.target.closest('.slot') : null;
    const tip = this.el.tooltip;
    let html = '';
    if (el && !this.cursor) {
      const c = el.dataset.c, i = Number(el.dataset.i);
      let id = 0, extra = '';
      if (c === 'guide') {
        const r = RECIPES[i]; id = r.out;
        const need = {};
        for (const opts of recipeLayout(r)) if (opts) { const n = itemName(opts[0]) + (opts.length > 1 ? ' (any kind)' : ''); need[n] = (need[n] || 0) + 1; }
        extra = '<u>Makes ' + r.n + '</u><span>' + Object.keys(need).map((n) => need[n] + ' × ' + esc(n)).join('<br>') + '</span>';
      } else if (c === 'out') { const r = matchRecipe(this.gridIds()); if (r) id = r.out; }
      else { const a = this.arr(c); if (a && a[i]) id = a[i].id; }
      if (id) {
        const it = ITEMS[id];
        html = '<b>' + esc(it.name) + '</b>' + (it.desc ? '<span>' + esc(it.desc) + '</span>' : '') +
          (it.kind === 'tool' && it.dmg ? '<u>Damage ' + it.dmg + (it.speed ? ' · Dig speed ×' + it.speed : '') + '</u>' : '') +
          (it.kind === 'food' ? '<u>Restores ' + it.heal / 2 + ' health</u>' : '') + extra;
      }
    }
    if (html) {
      tip.innerHTML = html; tip.classList.remove('hidden');
      tip.style.left = Math.min(window.innerWidth - 270, ev.clientX + 16) + 'px'; tip.style.top = Math.min(window.innerHeight - 120, ev.clientY + 14) + 'px';
    } else tip.classList.add('hidden');
  }

  renderScreen() {
    const p = this.g.player;
    const grid = (c, from, to, cols, arr) => { let h = '<div class="gridN g' + cols + '">'; for (let i = from; i < to; i++) h += slotHTML(c, i, arr[i]); return h + '</div>'; };
    const pack = '<h4>Pack</h4>' + grid('inv', 9, 36, 9, p.inv) + '<h4>Hotbar</h4>' + grid('inv', 0, 9, 9, p.inv);
    let h = '';
    if (this.kind === 'inv') {
      const names = ['Helm', 'Cuirass', 'Greaves', 'Boots'];
      let ar = '<div class="gridN g1">';
      for (let i = 0; i < 4; i++) ar += slotHTML('armor', i, p.armor[i], p.armor[i] ? '' : 'hint', ' data-hint="' + names[i] + '"');
      ar += '</div>';
      h = '<div><h2>Your pack</h2><div class="invTop">' + ar + '<div class="statBox"><b>Health</b> ' + Math.ceil(p.hp) / 2 + ' / ' + p.maxHp / 2 +
        '<br><b>Armour</b> ' + p.armorPoints() + ' <span style="color:var(--dim)">(blocks ' + Math.round(Math.min(0.8, p.armorPoints() * 0.036) * 100) + '% of damage)</span>' +
        '<br><br><span class="note">Nothing can be crafted by hand. Place a <b>Maker Table</b> and right-click it to use its 3 × 3 grid.<br><br>Shift-click moves a stack. Right-click splits it.</span></div></div>' + pack + '</div>';
    } else if (this.kind === 'maker') {
      const r = matchRecipe(this.gridIds());
      let gl = '';
      for (const group of ['Basics', 'Tools', 'Weapons', 'Armour', 'Blocks', 'Food & Farming']) {
        gl += '<h4>' + group + '</h4><div class="gridN">';
        RECIPES.forEach((rc, i) => {
          if (rc.group === group) gl += '<div class="slot' + (this.plan(rc) ? ' can' : '') + '" data-c="guide" data-i="' + i + '">' + stackHTML({ id: rc.out, n: rc.n }) + '</div>';
        });
        gl += '</div>';
      }
      let gh = '<div class="gridN g3">';
      for (let i = 0; i < 9; i++) {
        const ghost = !this.grid[i] && this.ghost && this.ghost[i] ? stackHTML({ id: this.ghost[i][0], n: 1 }, true) : '';
        gh += '<div class="slot" data-c="grid" data-i="' + i + '">' + (this.grid[i] ? stackHTML(this.grid[i]) : ghost) + '</div>';
      }
      gh += '</div>';
      h = '<div id="guide"><h2>Recipes</h2><div id="guideList">' + gl + '</div></div><div><h2>Maker Table</h2><div class="makerTop">' + gh +
        '<div class="arrow"><i></i><u></u><s></s></div><div class="out">' + slotHTML('out', 0, r ? { id: r.out, n: r.n } : null) + '</div>' +
        '<div class="note">' + (r ? '<b>' + esc(itemName(r.out)) + '</b><br>Click to take. Shift-click makes as many as you can.' : 'Arrange materials on the grid, or click a recipe to lay it out. Outlined recipes are ones you can make now.') + '</div></div>' + pack + '</div>';
    } else if (this.kind === 'chest') {
      h = '<div><h2>Chest</h2>' + grid('chest', 0, 27, 9, this.chest) + pack + '</div>';
    }
    const list = document.getElementById('guideList');
    const scroll = list ? list.scrollTop : 0;
    this.el.panel.innerHTML = h;
    const list2 = document.getElementById('guideList');
    if (list2) list2.scrollTop = scroll;
    const cs = this.el.cursorStack;
    if (this.cursor) { cs.innerHTML = '<div class="slot">' + stackHTML(this.cursor) + '</div>'; cs.classList.remove('hidden'); cs.style.left = this.mouse.x + 'px'; cs.style.top = this.mouse.y + 'px'; this.el.tooltip.classList.add('hidden'); }
    else cs.classList.add('hidden');
    this.hudDirty = true;
  }
}
