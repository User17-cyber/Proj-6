// In-battle HUD: vitals, abilities, crosshair, hit/kill markers, damage numbers and
// direction, kill feed, score & objectives, minimap, nameplates, scoreboard, and the
// death, end-of-battle and pause screens.

import * as THREE from 'three';
import type { SessionView, KnightState } from '../game/session';
import type { HudSink } from '../game/gameView';
import type { SimEvent } from '../../shared/types';
import { TEAM_NAMES, TEAM_HOUSE } from '../../shared/types';
import { CLASSES, ABILITIES, CLASS_IDS, type ClassId } from '../../shared/data/classes';
import { icon, crestSvg, objectiveSvg } from './icons';
import { TEAM_CSS, TEAM_CSS_LIGHT, roseDataUrl } from '../render/heraldry';
import { Minimap } from './minimap';
import { classDetailHtml, classList, esc, keyLabel, classForKey, classLocked, classKeyLabel } from './classInfo';
import type { Prefs } from '../prefs';

export interface HudHost {
  respawn(cls: ClassId): void;
  resume(): void;
  leave(): void;
  restart(): void;
  openSettings(): void;
  openCodex(): void;
  sendChat(text: string): void;
  selectClass(cls: ClassId): void;
  /** the player's chosen mustering place for this castle and house (-1 nearest the fighting) */
  spawnPref(team: number): number;
  setSpawnPref(team: number, zone: number): void;
}

export interface HudFrame {
  s: SessionView;
  cam: THREE.PerspectiveCamera;
  localId: number;
  spectating: boolean;
  watchId: number;
  camLabel: string;
  heading: number;
  viewX: number; viewZ: number;
  timeScale: number;
  online: boolean;
  firstPerson: boolean;
  /** the mouse is captured for fighting */
  locked?: boolean;
}

interface DmgNum { el: HTMLElement; x: number; y: number; z: number; t: number; drift: number }
interface DirInd { el: HTMLElement; x: number; z: number; t: number }

const WEAPON_ICON = CLASS_IDS as readonly string[];
const fmtTime = (s: number) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function h(cls: string, html = '', tag = 'div'): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
/** Restart a CSS animation on the next frame (no forced layout, unlike reading offsetWidth). */
function replay(e: Element, cls = 'show') {
  e.classList.remove(cls);
  requestAnimationFrame(() => e.classList.add(cls));
}

export class Hud implements HudSink {
  readonly root: HTMLElement;
  private s: SessionView | null = null;
  private minimap: Minimap | null = null;
  private roses: string[] = [roseDataUrl(0, 64), roseDataUrl(1, 64)];
  // elements
  private vitals!: HTMLElement; private crest!: HTMLElement; private nameEl!: HTMLElement;
  private hpFill!: HTMLElement; private hpLag!: HTMLElement; private hpVal!: HTMLElement; private hpBar!: HTMLElement;
  private stFill!: HTMLElement; private buffs!: HTMLElement;
  private shBar!: HTMLElement; private shFill!: HTMLElement; private lastShield = 1;
  private abil!: HTMLElement; private slots: { root: HTMLElement; cdv: HTMLElement; cdt: HTMLElement; last: number; id: string }[] = [];
  private cross!: HTMLElement; private hitmark!: HTMLElement; private skull!: HTMLElement; private ctext!: HTMLElement;
  private dmgLayer!: HTMLElement; private dmgNums: DmgNum[] = [];
  private dirWrap!: HTMLElement; private splatLayer!: HTMLElement; private dirs: DirInd[] = [];
  private feed!: HTMLElement;
  private score!: HTMLElement; private sideL!: HTMLElement; private sideR!: HTMLElement; private clock!: HTMLElement; private tbar!: HTMLElement; private objRow!: HTMLElement;
  private mapWrap!: HTMLElement;
  private notice!: HTMLElement; private noticeQ: { text: string; team: number; big: boolean }[] = []; private noticeT = 0;
  private kbanner!: HTMLElement;
  private plates: HTMLElement[] = [];
  private plateLayer!: HTMLElement;
  private objMarkers: HTMLElement[] = [];
  private warm!: HTMLElement;
  private spec!: HTMLElement;
  private chatBox!: HTMLElement; private chatLog!: HTMLElement; private chatIn!: HTMLInputElement;
  private chatLines: { el: HTMLElement; t: number }[] = [];
  // overlays
  private board!: HTMLElement; boardOpen = false; private boardT = 0;
  private death!: HTMLElement; private deathShownAt = -1; private deathCls: ClassId = 'manatarms'; private deathKiller = '';
  private setDeathSel: ((c: ClassId) => void) | null = null; private respawnBtn!: HTMLButtonElement; private respawnTimer!: HTMLElement; private deathDetail!: HTMLElement;
  /** set by the app when a battle ends: the renown it earned */
  renownSummary = '';
  private end!: HTMLElement; private endShown = false; private endAt = -1;
  private pause!: HTMLElement; paused = false;
  private lastHp = -1;
  private miniT = 0; private plateT = 0; private time = 0;
  deadSince = -1;
  chatting = false;

  constructor(parent: HTMLElement, private host: HudHost, private prefs: Prefs) {
    this.root = h('', '', 'div');
    this.root.id = 'hud';
    parent.appendChild(this.root);
    this.build();
    this.root.classList.add('hidden');
  }

  private build() {
    const R = this.root;
    // vitals
    this.vitals = h('vitals');
    this.crest = h('crest');
    const bars = h('bars');
    this.nameEl = h('name');
    this.hpBar = h('bar hp', '<i class="lag"></i><i class="fill"></i><div class="ticks"></div><span class="val"></span>');
    this.hpLag = this.hpBar.children[0] as HTMLElement; this.hpFill = this.hpBar.children[1] as HTMLElement; this.hpVal = this.hpBar.children[3] as HTMLElement;
    const st = h('bar st thin', '<i class="fill"></i>');
    this.stFill = st.children[0] as HTMLElement;
    // shield durability: drains as the shield turns blows and splinters at zero
    this.shBar = h('bar sh thin', `<i class="fill"></i><svg viewBox="0 0 64 64"><path d="M12 10 H52 V28 C52 43 43 52 32 59 C21 52 12 43 12 28 Z"/></svg>`);
    this.shFill = this.shBar.children[0] as HTMLElement;
    this.shBar.title = 'Shield';
    this.buffs = h('buffs');
    bars.append(this.nameEl, this.hpBar, st, this.shBar, this.buffs);
    this.vitals.append(this.crest, bars);
    // abilities
    this.abil = h('abilities');
    // centre
    this.cross = h('crosshair', '<div class="dot"></div><div class="tk t"></div><div class="tk b"></div><div class="tk l"></div><div class="tk r"></div>');
    this.hitmark = h('hitmark', '<i></i><i></i><i></i><i></i>');
    this.skull = h('', icon('skull', 'skullmark'));
    this.skull = this.skull.firstElementChild as HTMLElement;
    this.ctext = h('combattext');
    this.dmgLayer = h('');
    this.dirWrap = h('dmgdir');
    this.splatLayer = h('splats');
    this.feed = h('killfeed');
    // score
    this.score = h('score');
    const row = h('row');
    this.sideL = h('side l'); this.clock = h('clock'); this.sideR = h('side r');
    row.append(this.sideL, this.clock, this.sideR);
    this.tbar = h('tbar', '<i style="left:0;background:#b3262a"></i><i style="right:0;background:#3d63b8"></i>');
    this.objRow = h('objs');
    this.score.append(row, this.tbar, this.objRow);
    this.mapWrap = h('minimap');
    this.notice = h('notice');
    this.kbanner = h('killbanner', '<div class="k1"></div><div class="k2"></div><div class="k3"></div>');
    this.plateLayer = h('');
    this.warm = h('warmup hidden', '<div class="w1"></div><div class="w2"></div>');
    this.spec = h('spectate-bar panel hidden');
    this.chatBox = h('chat');
    this.chatLog = h('');
    this.chatIn = document.createElement('input');
    this.chatIn.className = 'textin hidden';
    this.chatIn.maxLength = 120;
    this.chatIn.placeholder = 'Speak to the field…';
    this.chatIn.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const t = this.chatIn.value.trim(); if (t) this.host.sendChat(t); this.closeChat(); }
      if (e.key === 'Escape') this.closeChat();
    });
    this.chatBox.append(this.chatLog, this.chatIn);
    R.append(this.splatLayer, this.plateLayer, this.mapWrap, this.score, this.feed, this.vitals, this.abil, this.dirWrap, this.cross, this.hitmark, this.skull, this.ctext, this.dmgLayer, this.notice, this.kbanner, this.warm, this.spec, this.chatBox);
    // overlays live in #ui so they can take the mouse
    const ui = this.root.parentElement!;
    this.board = h('overlay hidden', '<div class="board parchment"></div>');
    this.board.style.pointerEvents = 'none';
    this.death = h('overlay death hidden');
    this.end = h('overlay endscreen hidden');
    this.pause = h('overlay pause hidden');
    ui.append(this.board, this.death, this.end, this.pause);
    this.buildDeath();
    this.buildPause();
  }

  // ------------------------------------------------------------------ session
  attach(s: SessionView) {
    this.s = s;
    this.minimap = new Minimap(s.map, 190);
    this.mapWrap.innerHTML = '';
    this.mapWrap.appendChild(this.minimap.canvas);
    this.objRow.innerHTML = '';
    for (const m of this.objMarkers) m.remove();
    this.objMarkers = [];
    for (const o of s.objectives) {
      const e = h('obj', `<span>${esc(o.def.short)}</span>`);
      e.dataset.k = '';
      this.objRow.appendChild(e);
      const mk = h('objmarker hidden', `<span>${esc(o.def.short)}</span><span class="d"></span>`);
      this.plateLayer.appendChild(mk);
      this.objMarkers.push(mk);
    }
    this.feed.innerHTML = '';
    this.chatLog.innerHTML = '';
    this.chatLines = [];
    this.endShown = false; this.endAt = -1; this.renownSummary = '';
    this.end.classList.add('hidden');
    this.death.classList.add('hidden');
    this.deathShownAt = -1; this.deadSince = -1;
    this.lastHp = -1;
    this.showPause(false);
    this.root.classList.remove('hidden');
  }

  detach() {
    this.s = null;
    this.root.classList.add('hidden');
    this.board.classList.add('hidden');
    this.death.classList.add('hidden');
    this.end.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.closeChat();
  }

  private spent = new Set<ClassId>();
  /** Pitched battle: orders the player has already fallen as can't be chosen again. */
  setSpent(spent: Set<ClassId>, pitched: boolean) {
    this.spent = new Set(spent);
    const btns = this.death.querySelectorAll<HTMLButtonElement>('.class-list .classbtn');
    CLASS_IDS.forEach((c, i) => { const b = btns[i]; if (!b) return; b.disabled = this.spent.has(c); b.classList.toggle('spent', this.spent.has(c)); });
    const note = this.death.querySelector('.spentnote') as HTMLElement | null;
    if (note) note.textContent = pitched ? (this.spent.size ? `Each order may take the field once. ${CLASS_IDS.filter((c) => !classLocked(c)).length - this.spent.size} of ${CLASS_IDS.filter((c) => !classLocked(c)).length} remain to you.` : 'In a pitched battle each order may take the field only once.') : '';
    if (this.spent.has(this.deathCls)) { const free = CLASS_IDS.find((c) => !this.spent.has(c)); if (free) { this.setLoadout(free); this.host.selectClass(free); } }
  }

  setLoadout(cls: ClassId) {
    this.deathCls = cls;
    this.setDeathSel?.(cls);
    this.deathDetail.innerHTML = classDetailHtml(cls, [keyLabel(this.prefs.bindings.ability1), keyLabel(this.prefs.bindings.ability2)]);
  }

  // ------------------------------------------------------------------ HudSink
  hitMarker(killed: boolean, head: boolean, blocked: boolean) {
    this.hitmark.classList.toggle('kill', killed);
    this.hitmark.classList.toggle('block', blocked);
    this.hitmark.style.width = this.hitmark.style.height = head ? '54px' : '46px';
    replay(this.hitmark);
    if (killed) { replay(this.skull); this.splatter(0.25); }
  }

  damageNumber(x: number, y: number, z: number, dmg: number, head: boolean, killed: boolean) {
    if (!this.prefs.damageNumbers) return;
    const el = h('dmgnum' + (killed ? ' kill' : head ? ' head' : ''), String(Math.round(dmg)));
    this.dmgLayer.appendChild(el);
    this.dmgNums.push({ el, x, y: y + 0.25, z, t: 0, drift: (Math.random() - 0.5) * 40 });
    if (this.dmgNums.length > 14) this.dmgNums.shift()!.el.remove();
  }

  /** Blood thrown onto the view: dark blots at the edges that run and fade. */
  splatter(amount: number) {
    if (!this.prefs.blood || amount <= 0.05) return;
    const n = Math.min(6, 1 + Math.round(amount * 4));
    for (let i = 0; i < n; i++) {
      const el = document.createElement('i');
      const edge = Math.random();
      const x = edge < 0.5 ? (Math.random() < 0.5 ? Math.random() * 18 : 82 + Math.random() * 18) : Math.random() * 100;
      const y = edge < 0.5 ? Math.random() * 100 : (Math.random() < 0.5 ? Math.random() * 18 : 82 + Math.random() * 18);
      const s = (30 + Math.random() * 90) * (0.6 + amount);
      el.style.cssText = `left:${x}%;top:${y}%;width:${s}px;height:${s * (0.7 + Math.random() * 0.5)}px;transform:translate(-50%,-50%) rotate(${Math.random() * 360}deg)`;
      this.splatLayer.appendChild(el);
      el.animate([{ opacity: 0.85, transform: el.style.transform }, { opacity: 0.75, offset: 0.35 }, { opacity: 0, transform: el.style.transform + ` translateY(${20 + Math.random() * 30}px)` }], { duration: 2200 + Math.random() * 1600, easing: 'ease-in' }).onfinish = () => el.remove();
    }
    while (this.splatLayer.children.length > 24) this.splatLayer.firstElementChild!.remove();
  }

  damageFrom(x: number, z: number, amount: number) {
    this.splatter(Math.min(1, amount / 45));
    let d = this.dirs.find((q) => Math.hypot(q.x - x, q.z - z) < 1.5);
    if (!d) {
      const el = document.createElement('i');
      this.dirWrap.appendChild(el);
      d = { el, x, z, t: 0 };
      this.dirs.push(d);
    }
    d.x = x; d.z = z; d.t = 0;
    d.el.style.opacity = String(Math.min(1, 0.45 + amount / 40));
  }

  killFeed(e: Extract<SimEvent, { t: 'kill' }>) {
    const s = this.s;
    if (!s) return;
    const K = s.knights;
    const killer = e.killer >= 0 ? K[e.killer] : null;
    const victim = K[e.victim];
    if (!victim) return;
    const mine = (e.killer === s.localId || e.victim === s.localId) && s.localId >= 0;
    const wIcon = e.weapon === 99 ? 'arrow' : e.weapon >= 0 ? WEAPON_ICON[e.weapon] : 'bleedKill';
    const row = h('kf' + (mine ? ' me' : ''),
      `${killer ? `<span class="t${killer.team}">${esc(killer.name)}</span>` : ''}${icon(wIcon)}${e.head ? icon('skull', 'hs') : ''}<span class="t${victim.team}">${esc(victim.name)}</span>`);
    this.feed.prepend(row);
    while (this.feed.children.length > 7) this.feed.lastElementChild!.remove();
    setTimeout(() => { row.style.transition = 'opacity .8s'; row.style.opacity = '0'; setTimeout(() => row.remove(), 900); }, 8000);
  }

  killBanner(victim: KnightState, head: boolean, streak: number) {
    const [k1, k2, k3] = Array.from(this.kbanner.children) as HTMLElement[];
    k1.textContent = head ? 'Head Struck · Slain' : 'Slain';
    k2.textContent = victim.name;
    k3.textContent = `+${head ? 150 : 100}${streak >= 2 ? ` · ${streak} foes this life` : ''}`;
    replay(this.kbanner);
  }

  notify(text: string, team: number, big = false) {
    this.noticeQ.push({ text, team, big });
    if (this.noticeQ.length > 4) this.noticeQ.shift();
  }

  combatText(text: string, kind: 'parry' | 'block' | 'broke' | 'stun') {
    this.ctext.className = 'combattext ' + kind;
    this.ctext.textContent = text;
    replay(this.ctext);
  }

  localDied(killer: KnightState | null) {
    this.deadSince = this.time;
    this.deathKiller = killer ? `by <b>${esc(killer.name)}</b> of ${TEAM_HOUSE[killer.team]}, ${esc(CLASSES[killer.cls].name)}` : 'by the fortunes of war';
  }

  ended(_winner: number) { this.endAt = this.time; }

  chat(name: string, team: number, text: string) {
    const el = h('m', `<b style="color:${team >= 0 ? TEAM_CSS_LIGHT[team] : '#f1d488'}">${esc(name)}:</b> ${esc(text)}`);
    this.chatLog.appendChild(el);
    this.chatLines.push({ el, t: this.time });
    while (this.chatLines.length > 8) this.chatLines.shift()!.el.remove();
  }
  openChat() { this.chatting = true; this.chatIn.classList.remove('hidden'); this.chatIn.value = ''; setTimeout(() => this.chatIn.focus(), 0); for (const l of this.chatLines) l.el.style.opacity = '1'; }
  closeChat() { this.chatting = false; this.chatIn.blur(); this.chatIn.classList.add('hidden'); }

  // ------------------------------------------------------------------ overlays
  private buildDeath() {
    this.death.innerHTML = `<div class="wrap">
      <h1>Thou Art Slain</h1><div class="by"></div>
      <div class="classes"><div class="class-list"></div><div class="class-detail parchment"></div></div>
      <div class="spawn-pick"></div><div class="respawn"><div class="respawn-btns"><button class="btn" data-a="rejoin">Rejoin the Fight</button><button class="btn iron" data-a="leave">Leave the Battle</button></div><div class="timer"></div><div class="spentnote hint"></div><div class="keys">Choose with <kbd>1</kbd>–<kbd>0</kbd>, <kbd>Shift</kbd>+<kbd>1</kbd>–<kbd>6</kbd> · rejoin with <kbd>Space</kbd> · menu with <kbd>Esc</kbd></div></div></div>`;
    const list = this.death.querySelector('.class-list') as HTMLElement;
    this.deathDetail = this.death.querySelector('.class-detail') as HTMLElement;
    this.setDeathSel = classList(list, this.deathCls, (c) => { if (this.spent.has(c) || classLocked(c)) return; this.setLoadout(c); this.host.selectClass(c); });
    this.respawnBtn = this.death.querySelector('[data-a="rejoin"]') as HTMLButtonElement;
    (this.death.querySelector('[data-a="leave"]') as HTMLButtonElement).addEventListener('click', () => this.host.leave());
    this.respawnTimer = this.death.querySelector('.timer') as HTMLElement;
    this.respawnBtn.addEventListener('click', () => this.host.respawn(this.deathCls));
    this.setLoadout(this.deathCls);
  }

  /** The mustering places this house may return at, as a row of choices on the death screen. */
  private renderSpawnPick(team: number) {
    const box = this.death.querySelector('.spawn-pick') as HTMLElement;
    const zones = this.s ? this.s.map.spawns[team] : [];
    if (!this.s || zones.length < 2 || this.s.settings.mode === 'duel') { box.innerHTML = ''; return; }
    const sel = this.host.spawnPref(team);
    box.innerHTML = `<span class="lbl">Return at</span>` + [{ name: 'Nearest the fighting', i: -1 }, ...zones.map((z, i) => ({ name: z.name, i }))]
      .map((z) => `<button data-zone="${z.i}" class="${z.i === sel ? 'on' : ''}">${esc(z.name)}</button>`).join('');
    box.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('[data-zone]') as HTMLElement | null;
      if (!b) return;
      this.host.setSpawnPref(team, Number(b.dataset.zone));
      box.querySelectorAll('[data-zone]').forEach((x) => x.classList.toggle('on', x === b));
    };
  }

  /** Keyboard shortcuts on the death screen; returns true if consumed. */
  deathKey(code: string, shift = false): boolean {
    if (this.death.classList.contains('hidden')) return false;
    const c = classForKey(code, shift);
    if (c) { if (!this.spent.has(c) && !classLocked(c)) { this.setLoadout(c); this.host.selectClass(c); } return true; }
    if (code === 'Space' || code === 'Enter') { if (!this.respawnBtn.disabled) this.host.respawn(this.deathCls); return true; }
    return false;
  }
  get deathOpen() { return !this.death.classList.contains('hidden'); }
  get endOpen() { return !this.end.classList.contains('hidden'); }

  private buildPause() {
    this.pause.innerHTML = `<div class="wrap panel"><h2 class="gold-text">Respite</h2>
      <button class="btn" data-a="resume">Return to Battle</button>
      <button class="btn iron" data-a="settings">Settings</button>
      <button class="btn iron" data-a="codex">Codex of Arms</button>
      <button class="btn iron" data-a="leave">Leave the Battle</button></div>`;
    this.pause.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a;
      if (a === 'resume') this.host.resume();
      else if (a === 'settings') this.host.openSettings();
      else if (a === 'codex') this.host.openCodex();
      else if (a === 'leave') this.host.leave();
    });
  }
  showPause(on: boolean) { this.paused = on; this.pause.classList.toggle('hidden', !on); }

  private showEnd() {
    const s = this.s!;
    const me = s.localId >= 0 ? s.knights[s.localId] : null;
    const w = s.winner;
    let title: string, color: string;
    if (w < 0) { title = 'Stalemate'; color = 'var(--parch)'; }
    else if (!me) { title = `${TEAM_NAMES[w]} Triumphs`; color = TEAM_CSS_LIGHT[w]; }
    else if (me.team === w) { title = 'Victory'; color = 'var(--gold-hi)'; }
    else { title = 'Defeat'; color = '#d8402f'; }
    const sorted = [...s.knights].sort((a, b) => b.score - a.score);
    const mvp = sorted[0];
    const t0 = s.teams[0], t1 = s.teams[1];
    const duel = s.settings.mode === 'duel';
    const sub = duel ? `Single combat won ${Math.max(t0.tickets, t1.tickets)} rounds to ${Math.min(t0.tickets, t1.tickets)}` : w < 0 ? 'Neither house yields the field' : `The field belongs to the ${TEAM_HOUSE[w]}`;
    this.end.innerHTML = `<div class="wrap">
      <img src="${this.roses[w >= 0 ? w : 0]}" width="72" height="72" alt="" style="filter:drop-shadow(0 4px 10px #000)">
      <h1 style="color:${color};text-shadow:0 6px 30px rgba(0,0,0,.9)">${title}</h1>
      <div class="sub">${sub}</div>
      ${me ? `<div class="stats">
        <div class="stat"><b>${me.kills}</b><span>Slain</span></div>
        <div class="stat"><b>${me.deaths}</b><span>Fallen</span></div>
        ${duel ? `<div class="stat"><b>${t0.tickets}–${t1.tickets}</b><span>Rounds</span></div>` : `<div class="stat"><b>${me.assists}</b><span>Assists</span></div>
        <div class="stat"><b>${me.score}</b><span>Renown</span></div>`}</div>` : `<div class="stats">
        <div class="stat"><b style="color:${TEAM_CSS_LIGHT[0]}">${t0.kills}</b><span>Lancaster kills</span></div>
        <div class="stat"><b style="color:${TEAM_CSS_LIGHT[1]}">${t1.kills}</b><span>York kills</span></div></div>`}
      ${mvp && !duel ? `<div class="mvp parchment">${icon('crown', '')} <b class="title-caps">Champion of the Field</b><br><span style="font-size:20px">${esc(mvp.name)}</span> — ${esc(CLASSES[mvp.cls].name)} of ${TEAM_NAMES[mvp.team]} · ${mvp.kills} slain · ${mvp.score} renown</div>` : ''}
      ${this.renownSummary ? `<div class="renown-gain">${esc(this.renownSummary)}</div>` : ''}
      <div class="btns">${s.online ? '' : '<button class="btn" data-a="again">Fight Again</button>'}<button class="btn iron" data-a="board">Roll of the Fallen</button><button class="btn iron" data-a="leave">Return to the Hall</button></div></div>`;
    const svg = this.end.querySelector('.mvp svg') as SVGElement | null;
    if (svg) { svg.setAttribute('width', '22'); svg.setAttribute('height', '22'); svg.style.fill = 'var(--gold-lo)'; svg.style.verticalAlign = '-4px'; }
    this.end.onclick = (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a;
      if (a === 'again') this.host.restart();
      else if (a === 'leave') this.host.leave();
      else if (a === 'board') this.showBoard(!this.boardOpen);
    };
    this.end.classList.remove('hidden');
  }

  showBoard(on: boolean) {
    this.boardOpen = on;
    this.board.classList.toggle('hidden', !on);
    if (on) { this.boardT = 0; this.renderBoard(); }
  }

  private renderBoard() {
    const s = this.s;
    if (!s) return;
    const box = this.board.firstElementChild as HTMLElement;
    const cols = [0, 1].map((t) => {
      const ks = s.knights.filter((k) => k.team === t).sort((a, b) => b.score - a.score || b.kills - a.kills);
      const alive = ks.filter((k) => k.alive).length;
      const rows = ks.map((k) => `<tr class="${k.id === s.localId ? 'me' : ''} ${k.alive ? '' : 'dead'}"><td>${icon(k.cls)}</td><td>${esc(k.name)}${k.bot ? '' : ' <span style="color:#7d6128">⚑</span>'}</td><td>${k.kills}</td><td>${k.deaths}</td><td>${k.assists}</td><td>${k.score}</td></tr>`).join('');
      const tk = s.settings.mode === 'laststand' ? `${alive} standing` : s.settings.mode === 'duel' ? `${s.teams[t].tickets} rounds` : `${s.teams[t].tickets} reserves`;
      return `<div><div class="house t${t}"><img src="${this.roses[t]}" alt="">${TEAM_HOUSE[t]} · <span style="font-size:14px">${tk}</span></div>
        <table><thead><tr><th></th><th>Knight</th><th>Slain</th><th>Fallen</th><th>Assist</th><th>Renown</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }).join('');
    box.innerHTML = `<h2>${esc(s.map.def.name)} · ${({ battle: 'Pitched Battle', conquest: 'Conquest', laststand: 'Last Stand', duel: 'Single Combat' } as const)[s.settings.mode]}</h2><div class="cols">${cols}</div>`;
  }

  // ------------------------------------------------------------------ frame
  update(dt: number, f: HudFrame) {
    this.time += dt;
    const s = f.s;
    this.s = s;
    const K = s.knights;
    const me = f.localId >= 0 ? K[f.localId] : null;
    const watched = f.watchId >= 0 ? K[f.watchId] : null;
    const showPlayerHud = !!me && me.alive && !f.spectating;
    this.vitals.classList.toggle('hidden', !showPlayerHud);
    this.abil.classList.toggle('hidden', !showPlayerHud);
    this.cross.classList.toggle('hidden', !showPlayerHud || this.endShown);
    if (me && showPlayerHud) this.updateVitals(me, f);
    this.updateScore(s);
    this.updateNotices(dt);
    this.updateDmg(dt, f.cam);
    this.updateDirs(dt, f);
    this.miniT -= dt;
    if (this.minimap && this.miniT <= 0) {
      this.miniT = 1 / 20;
      const team = me ? me.team : watched ? watched.team : 0;
      this.minimap.draw(f.viewX, f.viewZ, f.heading, team, K, s.objectives, me && me.alive ? f.localId : -1, f.spectating);
    }
    this.plateT -= dt;
    this.updatePlates(f, me);
    this.updateObjMarkers(f);
    // warmup countdown
    if (s.phase === 'warmup') {
      this.warm.classList.remove('hidden');
      const [w1, w2] = Array.from(this.warm.children) as HTMLElement[];
      if (s.held) {
        w1.textContent = 'Your host awaits your command';
        w2.innerHTML = '<span style="font-family:var(--caps);font-size:22px;letter-spacing:.12em">Press Space or click to sound the charge</span><br><span style="font-size:14px;opacity:.75">Esc for the menu, or to leave the field</span>';
      } else {
        w1.textContent = 'The hosts are mustering';
        w2.textContent = String(Math.max(1, Math.ceil(6 - s.phaseT)));
      }
    } else if (s.settings.mode === 'duel' && s.phase === 'live' && s.timeLeft > 0 && s.knights.every((k) => k.alive)) {
      // single combat: the count at the marks before each round
      this.warm.classList.remove('hidden');
      const [w1, w2] = Array.from(this.warm.children) as HTMLElement[];
      w1.textContent = `Round ${s.teams[0].tickets + s.teams[1].tickets + 1} · to your marks`;
      w2.innerHTML = String(Math.max(1, Math.ceil(s.timeLeft))) + (f.locked === false ? '<br><span style="font-size:15px;letter-spacing:.12em;font-family:var(--caps)">Click to take up your weapon</span>' : '');
    } else this.warm.classList.add('hidden');
    // spectator bar
    if (f.spectating || (me && !me.alive && !this.deathOpen && this.deadSince >= 0 && me.respawnT > 900)) {
      this.spec.classList.remove('hidden');
      const who = watched ? `<span style="color:${TEAM_CSS_LIGHT[watched.team]}">${esc(watched.name)}</span> · ${esc(CLASSES[watched.cls].name)} · ${Math.max(0, Math.round(watched.hp))} vigour` : esc(f.camLabel);
      const html = `<div class="who">${who}</div><div class="keys"><kbd>1</kbd> director <kbd>2</kbd> follow <kbd>3</kbd> free <kbd>←</kbd><kbd>→</kbd> knight <kbd>-</kbd><kbd>+</kbd> pace ×${f.timeScale.toFixed(2).replace(/\.?0+$/, '')}${s.paused ? ' · paused' : ''} <kbd>P</kbd> pause <kbd>Tab</kbd> roll <kbd>Esc</kbd> menu</div>`;
      if (this.spec.dataset.h !== html) { this.spec.innerHTML = html; this.spec.dataset.h = html; }
    } else this.spec.classList.add('hidden');
    // death screen; in single combat the same knight menu opens after every round, won or lost
    const duel = s.settings.mode === 'duel';
    const foe = duel && me ? s.knights.find((k) => k.team !== me.team) : undefined;
    const interlude = duel && s.phase === 'live' && !!me && !!foe && (!me.alive || !foe.alive);
    if (me && (!me.alive || interlude) && s.phase !== 'ended' && !f.spectating) {
      if (this.deadSince < 0) this.deadSince = this.time;
      const canRespawn = me.respawnT < 900 || duel;
      if ((duel || this.time - this.deadSince > 1.6) && canRespawn && this.death.classList.contains('hidden')) {
        const round = s.teams[0].tickets + s.teams[1].tickets + 2;
        (this.death.querySelector('h1') as HTMLElement).textContent = duel ? (me.alive ? 'The Round Is Yours' : 'Thou Art Bested') : 'Thou Art Slain';
        (this.death.querySelector('.by') as HTMLElement).innerHTML = duel ? `Choose your knight for round ${round}` : this.deathKiller ? `Struck down ${this.deathKiller}` : 'You have fallen';
        this.respawnBtn.style.display = duel ? 'none' : '';
        this.renderSpawnPick(me.team);
        this.death.classList.remove('hidden');
        this.deathShownAt = this.time;
      }
      if (!this.death.classList.contains('hidden')) {
        const t = Math.max(0, duel ? s.timeLeft : me.respawnT);
        this.respawnBtn.disabled = t > 0;
        this.respawnTimer.textContent = duel ? (t > 0 ? `The next round begins in ${Math.ceil(t)}` : 'To your marks') : t > 0 ? `Reinforcements muster in ${Math.ceil(t)}` : 'The line awaits you';
      }
    } else {
      if (!this.death.classList.contains('hidden')) this.death.classList.add('hidden');
      if (me && me.alive) { this.deadSince = -1; this.deathKiller = ''; }
    }
    // end screen
    if (s.phase === 'ended' && !this.endShown && this.time - Math.max(0, this.endAt) > 2.5) {
      this.endShown = true;
      this.death.classList.add('hidden');
      this.showEnd();
    }
    // scoreboard refresh
    if (this.boardOpen) {
      this.boardT -= dt;
      if (this.boardT <= 0) { this.boardT = 0.5; this.renderBoard(); }
    }
    // chat fade
    for (const l of this.chatLines) if (!this.chatting) l.el.style.opacity = String(Math.max(0, Math.min(1, 1 - (this.time - l.t - 10) / 2)));
  }

  private updateVitals(me: KnightState, f: HudFrame) {
    const key = `${me.team}${me.cls}`;
    if (this.crest.dataset.k !== key) {
      this.crest.dataset.k = key;
      this.crest.innerHTML = crestSvg(TEAM_CSS[me.team], '#c9a24f') + icon(me.cls, 'cls');
      this.abil.innerHTML = '';
      this.slots = [];
      CLASSES[me.cls].abilities.forEach((id, i) => {
        const a = ABILITIES[id];
        const k = keyLabel(i === 0 ? this.prefs.bindings.ability1 : this.prefs.bindings.ability2);
        const root = h('slot', `${icon(a.icon)}<div class="cdv"></div><div class="cdt"></div><kbd>${k}</kbd>`);
        root.title = a.name;
        this.abil.appendChild(root);
        this.slots.push({ root, cdv: root.querySelector('.cdv') as HTMLElement, cdt: root.querySelector('.cdt') as HTMLElement, last: 0, id });
      });
      this.lastHp = me.hp;
      this.cross.classList.toggle('bow', CLASSES[me.cls].ranged);
    }
    const name = `${esc(me.name)}<small>${esc(CLASSES[me.cls].name)}</small>`;
    if (this.nameEl.dataset.h !== name) { this.nameEl.innerHTML = name; this.nameEl.dataset.h = name; }
    const hpP = Math.max(0, me.hp / me.maxHp);
    // the pale "lag" bar trails the red one through its delayed CSS transition
    const w = `calc(${(hpP * 100).toFixed(1)}% - 2px)`;
    if (this.hpFill.style.width !== w) { this.hpFill.style.width = w; this.hpLag.style.width = w; }
    this.lastHp = me.hp;
    this.hpVal.textContent = String(Math.ceil(Math.max(0, me.hp)));
    this.hpBar.classList.toggle('low', hpP < 0.3);
    this.stFill.style.width = `calc(${(Math.max(0, me.stamina / me.maxStamina) * 100).toFixed(1)}% - 2px)`;
    const hasShield = !!CLASSES[me.cls].shield;
    this.shBar.style.display = hasShield ? '' : 'none';
    if (hasShield) {
      const sp = me.shieldBroken ? 0 : Math.max(0, Math.min(1, me.shield));
      this.shFill.style.width = `calc(${(sp * 100).toFixed(1)}% - 2px)`;
      this.shBar.classList.toggle('worn', sp > 0 && sp < 0.3);
      this.shBar.classList.toggle('broken', sp <= 0);
      this.shBar.title = sp > 0 ? `${CLASSES[me.cls].shield === 'pavise' ? 'Pavise' : 'Shield'}: ${Math.ceil(sp * 100)}%` : 'Shield broken';
      if (sp < this.lastShield - 0.005) { this.shBar.classList.remove('hit'); void this.shBar.offsetWidth; this.shBar.classList.add('hit'); }
      this.lastShield = sp;
    }
    const b: string[] = [];
    if (me.spawnProt > 0) b.push('<span class="buff">Protected</span>');
    if (me.rallyT > 0) b.push('<span class="buff">Rallied</span>');
    if (me.bulwarkT > 0) b.push('<span class="buff">Bulwark</span>');
    if (me.bloodletT > 0) b.push('<span class="buff">Bloodletting</span>');
    if (me.bodkin) b.push('<span class="buff">Bodkin nocked</span>');
    if (me.buffs & 1) b.push('<span class="buff">Holding the line</span>');
    if (me.buffs & 2) b.push('<span class="buff">Half-sword</span>');
    if (me.buffs & 4) b.push('<span class="buff">War cry</span>');
    if (me.buffs & 8) b.push('<span class="buff">Executioner</span>');
    if (me.buffs & 16) b.push('<span class="buff">Juggernaut</span>');
    if (me.buffs & 32) b.push('<span class="buff">Murder stroke</span>');
    if (me.buffs & 64) b.push('<span class="buff">Shield-breaker</span>');
    if (me.debuffs & 4) b.push('<span class="buff">Blessed</span>');
    if (me.debuffs & 1) b.push('<span class="buff bad">Disarmed</span>');
    if (me.debuffs & 2) b.push('<span class="buff bad">Lamed</span>');
    if (me.shieldBroken && hasShield) b.push('<span class="buff bad">Shield broken</span>');
    if (me.bleedStacks > 0) b.push(`<span class="buff bad">Bleeding${me.bleedStacks > 1 ? ' ×' + me.bleedStacks : ''}</span>`);
    const bh = b.join('');
    if (this.buffs.dataset.h !== bh) { this.buffs.innerHTML = bh; this.buffs.dataset.h = bh; }
    this.slots.forEach((sl, i) => {
      const cd = i === 0 ? me.cd0 : me.cd1;
      const total = ABILITIES[sl.id as keyof typeof ABILITIES].cooldown;
      sl.cdv.style.setProperty('--p', `${Math.min(100, (cd / total) * 100).toFixed(1)}%`);
      sl.cdt.textContent = cd > 0 ? String(Math.ceil(cd)) : '';
      if (sl.last > 0 && cd <= 0) replay(sl.root, 'ready');
      sl.last = cd;
    });
    // bow crosshair tightens as the string is drawn
    if (CLASSES[me.cls].ranged) {
      const spread = 4 + (1 - me.draw) * 12;
      const tks = this.cross.querySelectorAll<HTMLElement>('.tk');
      tks[0].style.top = `${-spread + 4}px`; tks[1].style.bottom = `${-spread + 4}px`; tks[2].style.left = `${-spread + 4}px`; tks[3].style.right = `${-spread + 4}px`;
    }
  }

  private updateScore(s: SessionView) {
    const last = s.settings.mode === 'laststand';
    const alive = [0, 0];
    for (const k of s.knights) if (k.alive) alive[k.team]++;
    const v = [0, 1].map((t) => (last ? alive[t] : s.teams[t].tickets));
    const duel = s.settings.mode === 'duel';
    const lbl = last ? 'standing' : duel ? 'rounds' : 'reserves';
    const l = `<div><div>${v[0]}</div><small>${lbl}</small></div><img src="${this.roses[0]}" alt="">`;
    const r = `<img src="${this.roses[1]}" alt=""><div><div>${v[1]}</div><small>${lbl}</small></div>`;
    if (this.sideL.dataset.h !== l) { this.sideL.innerHTML = l; this.sideL.dataset.h = l; }
    if (this.sideR.dataset.h !== r) { this.sideR.innerHTML = r; this.sideR.dataset.h = r; }
    const clock = s.phase === 'warmup' ? (duel ? 'To Your Marks' : 'Muster') : s.phase === 'ended' ? 'Ended' : duel ? `Round ${s.teams[0].tickets + s.teams[1].tickets + 1}` : fmtTime(s.timeLeft);
    if (this.clock.textContent !== clock) this.clock.textContent = clock;
    const st = last ? Math.max(1, s.settings.teamSize) : Math.max(1, s.teams[0].startTickets);
    const bars = this.tbar.children as HTMLCollectionOf<HTMLElement>;
    bars[0].style.width = `${(Math.min(1, v[0] / st) * 50).toFixed(1)}%`;
    bars[1].style.width = `${(Math.min(1, v[1] / st) * 50).toFixed(1)}%`;
    s.objectives.forEach((o, i) => {
      const e = this.objRow.children[i] as HTMLElement | undefined;
      if (!e) return;
      const fill = o.owner === 0 ? TEAM_CSS[0] : o.owner === 1 ? TEAM_CSS[1] : '#5a5249';
      const ring = o.progress < 0 ? TEAM_CSS_LIGHT[0] : TEAM_CSS_LIGHT[1];
      const key = `${o.owner}${Math.round(o.progress * 20)}${o.contested}`;
      if (e.dataset.k !== key) {
        e.dataset.k = key;
        e.innerHTML = objectiveSvg(fill, o.progress, ring) + `<span style="position:relative">${esc(o.def.short)}</span>`;
        e.classList.toggle('contested', o.contested);
      }
    });
  }

  private updateNotices(dt: number) {
    this.noticeT -= dt;
    if (this.noticeT <= 0 && this.noticeQ.length) {
      const n = this.noticeQ.shift()!;
      this.notice.className = 'notice' + (n.big ? ' big' : '') + (n.team === 0 ? ' t0' : n.team === 1 ? ' t1' : ' gold');
      this.notice.textContent = n.text;
      replay(this.notice);
      this.noticeT = n.big ? 2.2 : 1.6;
    }
  }

  private project(x: number, y: number, z: number, cam: THREE.PerspectiveCamera): { x: number; y: number; ok: boolean; d: number } {
    _v.set(x, y, z);
    const d = _v.distanceTo(cam.position);
    _v.applyMatrix4(cam.matrixWorldInverse);
    const ok = _v.z < -0.1;
    _v.applyMatrix4(cam.projectionMatrix);
    return { x: (_v.x * 0.5 + 0.5) * window.innerWidth, y: (-_v.y * 0.5 + 0.5) * window.innerHeight, ok: ok && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1, d };
  }

  private updateDmg(dt: number, cam: THREE.PerspectiveCamera) {
    for (let i = this.dmgNums.length - 1; i >= 0; i--) {
      const n = this.dmgNums[i];
      n.t += dt;
      if (n.t > 1.1) { n.el.remove(); this.dmgNums.splice(i, 1); continue; }
      const p = this.project(n.x, n.y, n.z, cam);
      if (!p.ok) { n.el.style.opacity = '0'; continue; }
      const rise = 30 * n.t + 26 * (1 - Math.exp(-n.t * 8));
      const sc = n.t < 0.08 ? 1.5 - n.t * 6 : 1;
      n.el.style.opacity = String(Math.min(1, (1.1 - n.t) / 0.35));
      n.el.style.transform = `translate(${(p.x + n.drift * n.t).toFixed(1)}px, ${(p.y - rise).toFixed(1)}px) translate(-50%, -50%) scale(${sc.toFixed(2)})`;
    }
  }

  private updateDirs(dt: number, f: HudFrame) {
    for (let i = this.dirs.length - 1; i >= 0; i--) {
      const d = this.dirs[i];
      d.t += dt;
      if (d.t > 1.4) { d.el.remove(); this.dirs.splice(i, 1); continue; }
      // angle of the source relative to where the camera looks
      const a = Math.atan2(d.x - f.cam.position.x, d.z - f.cam.position.z);
      const fwd = f.cam.getWorldDirection(_v2);
      const cf = Math.atan2(fwd.x, fwd.z);
      const rel = cf - a;
      d.el.style.transform = `rotate(${(rel * 180 / Math.PI).toFixed(1)}deg)`;
      if (d.t > 0.5) d.el.style.opacity = String(Math.max(0, (1.4 - d.t) / 0.9) * 0.9);
    }
  }

  private updatePlates(f: HudFrame, me: KnightState | null) {
    if (!this.prefs.nameplates) { for (const p of this.plates) p.classList.add('hidden'); return; }
    const K = f.s.knights;
    const cam = f.cam;
    const team = me ? me.team : -1;
    const fwd = cam.getWorldDirection(_v2);
    let used = 0;
    const max = f.spectating ? 6 : 16;
    for (const k of K) {
      if (!k.alive || k.id === f.localId) continue;
      if (f.spectating && k.id === f.watchId) continue;
      const dx = k.x - cam.position.x, dy = k.y + 1.7 - cam.position.y, dz = k.z - cam.position.z;
      const d = Math.hypot(dx, dy, dz);
      const ally = k.team === team;
      const facing = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / (d || 1);
      // allies near the crosshair; enemies when close or under the crosshair
      const show = f.spectating ? d < 16 && facing > 0.99 : ally ? d < 24 && facing > 0.985 : (facing > 0.996 && d < 45) || (d < 4.5 && facing > 0.8);
      if (!show) continue;
      const p = this.project(k.x, k.y + 2.12, k.z, cam);
      if (!p.ok) continue;
      if (used >= max) break;
      let el = this.plates[used];
      if (!el) { el = h('nameplate', '<div class="n"></div><div class="hp"><i></i></div>'); this.plateLayer.appendChild(el); this.plates.push(el); }
      used++;
      el.classList.remove('hidden');
      el.className = `nameplate t${k.team}`;
      const n = el.firstElementChild as HTMLElement;
      const label = ally || f.spectating ? k.name : `${k.name}`;
      if (n.textContent !== label) n.textContent = label;
      const hpEl = el.lastElementChild as HTMLElement;
      // in battle only the foe's vigour is shown; spectators see every knight's
      const showHp = !ally || f.spectating;
      hpEl.style.display = showHp ? '' : 'none';
      (hpEl.firstElementChild as HTMLElement).style.width = `${Math.max(0, (k.hp / k.maxHp) * 100).toFixed(0)}%`;
      const sc = Math.max(0.65, Math.min(1, 9 / Math.max(1, d)));
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%) scale(${sc.toFixed(2)})`;
      el.style.left = '0'; el.style.top = '0';
      el.style.opacity = String(Math.min(1, (ally ? 24 - d : 45 - d) / 6));
    }
    for (let i = used; i < this.plates.length; i++) this.plates[i].classList.add('hidden');
  }

  private updateObjMarkers(f: HudFrame) {
    const s = f.s;
    s.objectives.forEach((o, i) => {
      const mk = this.objMarkers[i];
      if (!mk) return;
      const y = s.map.world.groundAt(o.def.x, o.def.z, 999) + 3.2;
      const p = this.project(o.def.x, y, o.def.z, f.cam);
      if (!p.ok || p.d < o.def.r * 0.6) { mk.classList.add('hidden'); return; }
      mk.classList.remove('hidden');
      const fill = o.owner === 0 ? TEAM_CSS[0] : o.owner === 1 ? TEAM_CSS[1] : '#5a5249';
      const key = `${o.owner}${Math.round(o.progress * 12)}`;
      if (mk.dataset.k !== key) {
        mk.dataset.k = key;
        mk.innerHTML = objectiveSvg(fill, o.progress, o.progress < 0 ? TEAM_CSS_LIGHT[0] : TEAM_CSS_LIGHT[1]) + `<span style="position:relative">${esc(o.def.short)}</span><span class="d"></span>`;
      }
      (mk.lastElementChild as HTMLElement).textContent = `${Math.round(p.d)} m`;
      mk.style.left = '0'; mk.style.top = '0';
      mk.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`;
    });
  }
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
