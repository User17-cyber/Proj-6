// Menus: the great hall (main menu over a live battle), battle setup, the armoury with a
// live 3D knight, settings, the codex, the multiplayer muster and the loading screens.

import { MAPS } from '../../shared/world/maps/index';
import type { MapDef } from '../../shared/world/mapgen';
import { CLASSES, type ClassId } from '../../shared/data/classes';
import { DIFFICULTY_NAMES, TEAM_HOUSE, TEAM_MOTTO, type GameMode, type MatchSettings, type Team } from '../../shared/types';
import { icon } from './icons';
import { mapArt } from './mapArt';
import { classDetailHtml, classList, esc, keyLabel } from './classInfo';
import { roseDataUrl } from '../render/heraldry';
import { QUALITY_NAMES, type Quality } from '../render/renderer';
import { DEFAULT_BINDINGS, type Bindings } from '../input';
import { savePrefs, type Prefs } from '../prefs';

export interface RoomInfo { id: string; name: string; mapId: string; mode: GameMode; teamSize: number; humans: number; phase: string; timeLeft: number; difficulty: number }
export interface MpState { status: 'offline' | 'connecting' | 'online' | 'error'; message?: string; rooms: RoomInfo[] }

export interface MenuHost {
  startBattle(m: MatchSettings, cls: ClassId, team: Team | -1): void;
  startSpectate(m: MatchSettings): void;
  preview(cls: ClassId | null, team: Team): void;
  prefsChanged(p: Prefs): void;
  ui(name: 'tick' | 'open'): void;
  mpConnect(url: string): void;
  mpDisconnect(): void;
  mpCreate(m: MatchSettings): void;
  mpJoin(roomId: string, team: Team | -1, cls: ClassId): void;
  quit?(): void;
}

const MODE_INFO: Record<GameMode, { name: string; text: string }> = {
  battle: { name: 'Pitched Battle', text: 'Each house fields a reserve of men. Every knight who falls spends one; the house whose reserves are spent and whose last knight dies loses the field.' },
  conquest: { name: 'Conquest', text: 'Seize and hold the banners of the castle. A house holding more banners bleeds its enemy\'s reserves away; slain knights cost reserves too.' },
  laststand: { name: 'Last Stand', text: 'No reinforcements. Every knight has one life; the last house with men standing wins. Short, brutal, decisive.' },
};

const TIPS = [
  'Hold the right mouse button to raise your guard. Release it just as a blow lands to parry and leave the attacker reeling.',
  'A heavy blow (hold the left mouse button) cannot be parried by a light guard alone, but a kick (F) breaks any guard.',
  'Cancel a swing into a guard by pressing block during the windup: a feint that draws out your foe\'s parry.',
  'Blows to the head deal far more harm. Aim high, and keep your own helm out of reach.',
  'Longbows pierce mail at a full draw. Bodkin points pass through plate and shield alike.',
  'Stay near your banner-men: Rally heals every ally within twelve metres.',
  'Sprinting (Shift) drains stamina. A knight without stamina cannot block a heavy blow.',
  'Polearms outreach any sword. Close the distance before the halberdier hooks your legs.',
  'Thrusts (R or middle mouse) are quick and hard to see coming. They punish a careless guard.',
  'In Conquest, a banner taken by many knights falls faster. Stand on it together.',
];

function el(cls: string, html = '', tag = 'div'): HTMLElement { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; return e; }

export class Menus {
  private root: HTMLElement;
  private current: HTMLElement | null = null;
  private loading: HTMLElement | null = null;
  private mpEl: HTMLElement | null = null;
  private mp: MpState = { status: 'offline', rooms: [] };
  private attractCaption: HTMLElement | null = null;
  private loadoutCls: ClassId;
  private loadoutTeam: Team | -1;
  private onCloseOverlay: (() => void) | null = null;

  constructor(ui: HTMLElement, private host: MenuHost, private prefs: Prefs) {
    this.root = ui;
    this.loadoutCls = prefs.lastClass;
    this.loadoutTeam = prefs.lastTeam;
  }

  private mount(e: HTMLElement) {
    this.close();
    this.current = e;
    this.root.appendChild(e);
    this.host.ui('open');
  }
  close() {
    if (this.current) { this.current.remove(); this.current = null; }
    this.mpEl = null;
    this.host.preview(null, 0);
  }
  get isOpen() { return !!this.current; }

  // ------------------------------------------------------------------ main
  showMain(caption?: { place: string; when: string }) {
    const s = el('screen menu-main');
    const items: [string, string, string, string][] = [
      ['battle', 'Take the Field', 'Fight at the head of a host of knights', 'battle'],
      ['spectate', 'Watch the Battle', 'Command nothing; witness everything', 'spectate'],
      ['multiplayer', 'Join a Muster', 'Fight alongside and against other players', 'mp'],
      ['armoury', 'The Armoury', 'Six orders of knighthood and their arms', 'armoury'],
      ['codex', 'Codex of Arms', 'Controls, and the art of the fight', 'codex'],
      ['settings', 'Settings', 'Graphics, sound and controls', 'settings'],
    ];
    s.innerHTML = `<div class="side">
      <div class="logo"><h1 class="gold-text">Rose <span class="amp">&amp;</span> Ruin</h1><div class="tag">The Wars of the Roses · 1455 – 1487</div></div>
      <div class="menu-list">${items.map(([ic, name, sub, a]) => `<button class="menu-item" data-a="${a}">${icon(ic)}${name}<small>${sub}</small></button>`).join('')}</div>
      <div class="menu-foot">${esc(TEAM_HOUSE[0])} · <i>${TEAM_MOTTO[0]}</i><br>${esc(TEAM_HOUSE[1])} · <i>${TEAM_MOTTO[1]}</i></div>
    </div><div class="menu-caption"><div class="place"></div><div class="when"></div></div>`;
    s.querySelector('.menu-list')!.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a;
      if (!a) return;
      this.host.ui('tick');
      if (a === 'battle') this.showSetup(false);
      else if (a === 'spectate') this.showSetup(true);
      else if (a === 'mp') this.showMultiplayer();
      else if (a === 'armoury') this.showArmoury('browse');
      else if (a === 'codex') this.showCodex(() => this.showMain(caption));
      else if (a === 'settings') this.showSettings(() => this.showMain(caption));
    });
    this.mount(s);
    this.attractCaption = s.querySelector('.menu-caption');
    if (caption) this.setCaption(caption.place, caption.when);
  }
  setCaption(place: string, when: string) {
    if (!this.attractCaption) return;
    (this.attractCaption.children[0] as HTMLElement).textContent = place;
    (this.attractCaption.children[1] as HTMLElement).textContent = when;
  }

  // ------------------------------------------------------------------ setup
  showSetup(spectate: boolean) {
    const m: MatchSettings = { ...this.prefs.match };
    const wrap = el('sheet-wrap');
    const sheet = el('sheet panel');
    wrap.appendChild(sheet);
    const render = () => {
      const def = MAPS.find((d) => d.id === m.mapId) ?? MAPS[0];
      const seg = (key: string, opts: [string | number, string][], cur: string | number) =>
        `<div class="seg" data-k="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
      sheet.innerHTML = `
        <div class="sheet-head"><h2 class="gold-text">${spectate ? 'Witness a Battle' : 'Muster for Battle'}</h2><button class="close-x" data-a="back" aria-label="Close">×</button></div>
        <div class="sheet-body">
          <div class="maps">${MAPS.map((d) => `<button class="mapcard ${d.id === m.mapId ? 'sel' : ''}" data-map="${d.id}">${mapArt(d)}<div class="meta"><div class="nm">${esc(d.name)}</div><div class="loc">${esc(d.location)} · ${esc(d.year)}</div></div></button>`).join('')}</div>
          <div class="map-blurb parchment"><b>${esc(def.name)}</b> — ${esc(def.blurb)}<br><i style="font-size:14px;color:var(--ink-soft)">${esc(def.history)}</i></div>
          <div class="opts">
            <div class="opt"><label>Manner of battle</label>${seg('mode', [['battle', 'Pitched'], ['conquest', 'Conquest'], ['laststand', 'Last Stand']], m.mode)}<div class="hint">${MODE_INFO[m.mode].text}</div></div>
            <div class="opt"><label>Knights per house</label><div class="range"><input type="range" min="20" max="64" step="2" value="${m.teamSize}" data-k="teamSize"><output>${m.teamSize}</output></div><div class="hint">${m.teamSize * 2} knights on the field. Larger hosts ask more of your machine.</div></div>
            <div class="opt"><label>Foes' prowess</label>${seg('difficulty', DIFFICULTY_NAMES.map((n, i) => [i, n] as [number, string]), m.difficulty)}</div>
            ${spectate ? '' : `<div class="opt"><label>Your house</label>${seg('team', [[0, 'Lancaster'], [1, 'York'], [-1, 'Either']], this.loadoutTeam)}</div>`}
            <div class="opt"><label>Time limit</label>${seg('timeLimit', [[600, '10 min'], [900, '15 min'], [1200, '20 min'], [1800, '30 min']], m.timeLimit)}</div>
            ${m.mode === 'laststand' ? '' : `<div class="opt"><label>Reserves</label>${seg('ticketScale', [[3, 'Few'], [5, 'Many'], [8, 'Vast']], m.ticketScale)}</div>`}
            <div class="opt"><label>Friendly fire</label>${seg('friendlyFire', [['false', 'Off'], ['true', 'On']], String(m.friendlyFire))}</div>
          </div>
        </div>
        <div class="sheet-foot"><button class="btn iron" data-a="back">Back</button><button class="btn" data-a="go">${spectate ? 'Watch the Battle' : 'Choose Your Knight'}</button></div>`;
    };
    render();
    sheet.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const card = t.closest('.mapcard') as HTMLElement | null;
      if (card) { m.mapId = card.dataset.map!; this.host.ui('tick'); render(); return; }
      const b = t.closest('.seg button') as HTMLElement | null;
      if (b) {
        const k = (b.parentElement as HTMLElement).dataset.k!;
        const v = b.dataset.v!;
        if (k === 'mode') m.mode = v as GameMode;
        else if (k === 'difficulty') m.difficulty = Number(v) as MatchSettings['difficulty'];
        else if (k === 'team') this.loadoutTeam = Number(v) as Team | -1;
        else if (k === 'timeLimit') m.timeLimit = Number(v);
        else if (k === 'ticketScale') m.ticketScale = Number(v);
        else if (k === 'friendlyFire') m.friendlyFire = v === 'true';
        this.host.ui('tick');
        render();
        return;
      }
      const a = t.closest('[data-a]') as HTMLElement | null;
      if (!a) return;
      if (a.dataset.a === 'back') { this.host.ui('tick'); this.showMain(); return; }
      if (a.dataset.a === 'go') {
        m.seed = (Math.random() * 1e9) | 0;
        this.prefs.match = { ...m };
        this.prefs.lastTeam = this.loadoutTeam;
        savePrefs(this.prefs);
        this.host.ui('tick');
        if (spectate) { this.close(); this.host.startSpectate(m); }
        else this.showArmoury('battle', (cls, team) => { this.close(); this.host.startBattle(m, cls, team); }, () => this.showSetup(false));
      }
    });
    sheet.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.k === 'teamSize') {
        m.teamSize = Number(t.value);
        (t.nextElementSibling as HTMLElement).textContent = t.value;
        (t.parentElement!.nextElementSibling as HTMLElement).textContent = `${m.teamSize * 2} knights on the field. Larger hosts ask more of your machine.`;
      }
    });
    this.mount(wrap);
  }

  // ------------------------------------------------------------------ armoury
  showArmoury(mode: 'browse' | 'battle', onConfirm?: (cls: ClassId, team: Team | -1) => void, onBack?: () => void, confirmLabel = 'To Battle!') {
    const s = el('screen armoury');
    s.innerHTML = `<div class="left">
        <div class="sheet-head" style="padding:0"><h2 class="gold-text">${mode === 'battle' ? 'Choose Your Knight' : 'The Armoury'}</h2><button class="close-x" data-a="back" aria-label="Close">×</button></div>
        <div class="grid"><div class="class-list"></div><div class="class-detail parchment"></div></div>
        <div class="hint">Every order may be chosen anew each time you fall.</div>
      </div>
      <div class="right"><div class="actions">
        <div class="seg house" style="min-width:320px">${[[0, 'Lancaster'], [1, 'York'], [-1, 'Either house']].map(([v, l]) => `<button data-team="${v}" class="${v === this.loadoutTeam ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${mode === 'battle' ? `<button class="btn" data-a="go" style="min-width:320px">${confirmLabel}</button>` : ''}
        <button class="btn iron small" data-a="back">Back</button>
      </div></div>`;
    const detail = s.querySelector('.class-detail') as HTMLElement;
    const keys: [string, string] = [keyLabel(this.prefs.bindings.ability1), keyLabel(this.prefs.bindings.ability2)];
    const team = () => (this.loadoutTeam === 1 ? 1 : 0) as Team;
    const select = (c: ClassId) => {
      this.loadoutCls = c;
      setSel(c);
      detail.innerHTML = classDetailHtml(c, keys);
      this.host.preview(c, team());
    };
    const setSel = classList(s.querySelector('.class-list') as HTMLElement, this.loadoutCls, (c) => { this.host.ui('tick'); select(c); });
    s.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const tb = t.closest('[data-team]') as HTMLElement | null;
      if (tb) {
        this.loadoutTeam = Number(tb.dataset.team) as Team | -1;
        s.querySelectorAll('[data-team]').forEach((b) => b.classList.toggle('on', b === tb));
        this.host.ui('tick');
        this.host.preview(this.loadoutCls, team());
        return;
      }
      const a = (t.closest('[data-a]') as HTMLElement | null)?.dataset.a;
      if (a === 'back') { this.host.ui('tick'); if (onBack) onBack(); else this.showMain(); }
      if (a === 'go' && onConfirm) {
        this.prefs.lastClass = this.loadoutCls;
        this.prefs.lastTeam = this.loadoutTeam;
        savePrefs(this.prefs);
        this.host.ui('tick');
        onConfirm(this.loadoutCls, this.loadoutTeam);
      }
    });
    const onKey = (e: KeyboardEvent) => {
      if (!s.isConnected) { window.removeEventListener('keydown', onKey); return; }
      const m = /^Digit([1-6])$/.exec(e.code);
      if (m) select((['manatarms', 'vanguard', 'halberdier', 'banneret', 'longbowman', 'errant'] as ClassId[])[Number(m[1]) - 1]);
    };
    window.addEventListener('keydown', onKey);
    this.mount(s);
    select(this.loadoutCls);
  }

  // ------------------------------------------------------------------ settings
  showSettings(onClose: () => void, overlay = false) {
    const p = this.prefs;
    const wrap = el('sheet-wrap');
    if (overlay) wrap.style.zIndex = '40';
    const sheet = el('sheet panel');
    wrap.appendChild(sheet);
    const tog = (k: string, v: boolean) => `<div class="seg" data-k="${k}"><button data-v="1" class="${v ? 'on' : ''}">On</button><button data-v="0" class="${!v ? 'on' : ''}">Off</button></div>`;
    const range = (k: string, min: number, max: number, step: number, v: number, fmt: (x: number) => string) => `<div class="range"><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-k="${k}"><output>${fmt(v)}</output></div>`;
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    const fmts: Record<string, (x: number) => string> = { renderScale: pct, fov: (x) => `${x}°`, sensitivity: (x) => x.toFixed(2), master: pct, music: pct, sfx: pct, ambience: pct };
    const bindRow = (k: keyof Bindings, label: string) => `<div><span>${label}</span><button class="btn iron small" data-bind="${k}">${keyLabel(p.bindings[k])}</button></div>`;
    const render = () => {
      sheet.innerHTML = `<div class="sheet-head"><h2 class="gold-text">Settings</h2><button class="close-x" data-a="close" aria-label="Close">×</button></div>
      <div class="sheet-body">
        <div class="opts">
          <div class="opt"><label>Your name</label><input class="textin" data-k="name" maxlength="24" placeholder="Sir…" value="${esc(p.name)}"></div>
          <div class="opt"><label>Graphics quality</label><div class="seg" data-k="quality">${QUALITY_NAMES.map((n, i) => `<button data-v="${i}" class="${i === p.gfx.quality ? 'on' : ''}">${n}</button>`).join('')}</div><div class="hint">Shadows, textures, grass density and effects.</div></div>
          <div class="opt"><label>Render resolution</label>${range('renderScale', 0.5, 1, 0.05, p.gfx.renderScale, pct)}</div>
          <div class="opt"><label>Field of view</label>${range('fov', 55, 100, 1, p.gfx.fov, fmts.fov)}</div>
          <div class="opt"><label>Ambient occlusion</label>${tog('ao', p.gfx.ao)}</div>
          <div class="opt"><label>Bloom</label>${tog('bloom', p.gfx.bloom)}</div>
          <div class="opt"><label>Mouse sensitivity</label>${range('sensitivity', 0.2, 3, 0.05, p.sensitivity, fmts.sensitivity)}</div>
          <div class="opt"><label>Invert mouse</label>${tog('invertY', p.invertY)}</div>
          <div class="opt"><label>View</label><div class="seg" data-k="firstPerson"><button data-v="0" class="${!p.firstPerson ? 'on' : ''}">Over the shoulder</button><button data-v="1" class="${p.firstPerson ? 'on' : ''}">Through the visor</button></div></div>
          <div class="opt"><label>Blood</label>${tog('blood', p.blood)}</div>
          <div class="opt"><label>Damage numbers</label>${tog('damageNumbers', p.damageNumbers)}</div>
          <div class="opt"><label>Nameplates</label>${tog('nameplates', p.nameplates)}</div>
          <div class="opt"><label>Master volume</label>${range('master', 0, 1, 0.05, p.volumes.master, pct)}</div>
          <div class="opt"><label>Music</label>${range('music', 0, 1, 0.05, p.volumes.music, pct)}</div>
          <div class="opt"><label>Effects</label>${range('sfx', 0, 1, 0.05, p.volumes.sfx, pct)}</div>
          <div class="opt"><label>Ambience</label>${range('ambience', 0, 1, 0.05, p.volumes.ambience, pct)}</div>
        </div>
        <h3 class="title-caps" style="color:var(--gold);font-size:14px;margin:22px 0 8px">Keys <span class="hint">(click, then press a key)</span></h3>
        <div class="controls-grid">${bindRow('forward', 'Advance')}${bindRow('back', 'Fall back')}${bindRow('left', 'Step left')}${bindRow('right', 'Step right')}${bindRow('sprint', 'Sprint')}${bindRow('jump', 'Jump')}${bindRow('kick', 'Kick')}${bindRow('thrust', 'Thrust')}${bindRow('ability1', 'First ability')}${bindRow('ability2', 'Second ability')}${bindRow('camera', 'Change view')}</div>
      </div>
      <div class="sheet-foot"><button class="btn iron" data-a="reset">Restore defaults</button><button class="btn" data-a="close">Done</button></div>`;
    };
    render();
    const changed = () => { savePrefs(p); this.host.prefsChanged(p); };
    let binding: keyof Bindings | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (!wrap.isConnected) { window.removeEventListener('keydown', onKey, true); return; }
      if (!binding) return;
      e.preventDefault(); e.stopPropagation();
      if (e.code !== 'Escape') { p.bindings[binding] = e.code; changed(); }
      binding = null;
      render();
    };
    window.addEventListener('keydown', onKey, true);
    sheet.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const bb = t.closest('[data-bind]') as HTMLElement | null;
      if (bb) { binding = bb.dataset.bind as keyof Bindings; bb.textContent = 'Press a key…'; return; }
      const b = t.closest('.seg button') as HTMLElement | null;
      if (b) {
        const k = (b.parentElement as HTMLElement).dataset.k!;
        const v = b.dataset.v!;
        if (k === 'quality') { p.gfx.quality = Number(v) as Quality; p.gfx.shadowQuality = p.gfx.quality; p.gfx.ao = p.gfx.quality >= 1; }
        else if (k === 'ao' || k === 'bloom') p.gfx[k] = v === '1';
        else if (k === 'invertY' || k === 'blood' || k === 'damageNumbers' || k === 'nameplates' || k === 'firstPerson') (p as unknown as Record<string, boolean>)[k] = v === '1';
        this.host.ui('tick');
        changed();
        render();
        return;
      }
      const a = (t.closest('[data-a]') as HTMLElement | null)?.dataset.a;
      if (a === 'close') { this.host.ui('tick'); if (overlay) wrap.remove(); onClose(); }
      if (a === 'reset') { p.bindings = { ...DEFAULT_BINDINGS }; p.sensitivity = 1; p.invertY = false; changed(); render(); }
    });
    sheet.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      const k = t.dataset.k;
      if (!k) return;
      if (k === 'name') { p.name = t.value.slice(0, 24); savePrefs(p); return; }
      const v = Number(t.value);
      if (k === 'renderScale' || k === 'fov') p.gfx[k] = v;
      else if (k === 'sensitivity') p.sensitivity = v;
      else if (k in p.volumes) (p.volumes as Record<string, number>)[k] = v;
      const out = t.nextElementSibling as HTMLElement | null;
      if (out) out.textContent = fmts[k] ? fmts[k](v) : String(v);
      changed();
    });
    if (overlay) { this.root.appendChild(wrap); this.onCloseOverlay = () => wrap.remove(); }
    else this.mount(wrap);
  }

  // ------------------------------------------------------------------ codex
  showCodex(onClose: () => void, overlay = false) {
    const b = this.prefs.bindings;
    const wrap = el('sheet-wrap');
    if (overlay) wrap.style.zIndex = '40';
    const k = (code: string) => `<kbd>${keyLabel(code)}</kbd>`;
    wrap.innerHTML = `<div class="sheet panel"><div class="sheet-head"><h2 class="gold-text">Codex of Arms</h2><button class="close-x" data-a="close" aria-label="Close">×</button></div>
      <div class="sheet-body">
        <div class="controls-grid">
          <div><span>Move</span><span>${k(b.forward)}${k(b.left)}${k(b.back)}${k(b.right)}</span></div>
          <div><span>Light attack (aim with your swing)</span><kbd>Left click</kbd></div>
          <div><span>Heavy attack</span><kbd>Hold left</kbd></div>
          <div><span>Guard / parry · Aim bow</span><kbd>Right click</kbd></div>
          <div><span>Thrust · Rondel stab</span><span>${k(b.thrust)} <kbd>Middle</kbd></span></div>
          <div><span>Kick (breaks guard)</span>${k(b.kick)}</div>
          <div><span>Abilities</span><span>${k(b.ability1)}${k(b.ability2)}</span></div>
          <div><span>Sprint · Jump</span><span>${k(b.sprint)}${k(b.jump)}</span></div>
          <div><span>Feint (cancel a windup)</span><kbd>Right click</kbd></div>
          <div><span>Over the shoulder / visor</span>${k(b.camera)}</div>
          <div><span>Roll of the fallen</span><kbd>Tab</kbd></div>
          <div><span>Speak (multiplayer)</span><kbd>Enter</kbd></div>
          <div><span>Respite (pause)</span><kbd>Esc</kbd></div>
          <div><span>Spectator: director / follow / free</span><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></span></div>
          <div><span>Spectator: next knight · pace</span><span><kbd>←</kbd><kbd>→</kbd><kbd>-</kbd><kbd>+</kbd></span></div>
        </div>
        <div class="tips">
          <h4>The guard</h4>Hold the right mouse button to raise your guard toward where you look. A guard turns a blow aside at the cost of stamina; heavy blows cost more. A shield guards a wider arc and stops arrows.
          <h4>The parry</h4>Raise your guard in the instant before a blow lands and you parry it: no stamina is lost and your attacker is thrown off balance, open to a riposte. A riposte struck straight after a parry comes faster.
          <h4>Breaking a guard</h4>A kick, a shield bash or a heavy blow against an exhausted foe breaks his guard. Watch his stamina; watch your own.
          <h4>Feints and timing</h4>Press guard during your windup to abandon the blow and stand ready. Lure a parry, then strike as it fades.
          <h4>Wounds</h4>Strikes to the head deal half again as much; strikes to the legs a little less. Blunt weapons are less hindered by plate; points find the gaps in mail.
          <h4>Orders of knighthood</h4>${(Object.keys(CLASSES) as ClassId[]).map((c) => `<b>${CLASSES[c].name}</b>: ${esc(CLASSES[c].title)}.`).join(' ')}
        </div>
      </div><div class="sheet-foot"><span></span><button class="btn" data-a="close">Close</button></div></div>`;
    wrap.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-a="close"]')) { this.host.ui('tick'); if (overlay) wrap.remove(); onClose(); }
    });
    if (overlay) this.root.appendChild(wrap);
    else this.mount(wrap);
  }

  // ------------------------------------------------------------------ multiplayer
  showMultiplayer() {
    const p = this.prefs;
    const wrap = el('sheet-wrap');
    const sheet = el('sheet panel');
    wrap.appendChild(sheet);
    const defUrl = defaultServer();
    if (!p.server) p.server = defUrl;
    sheet.innerHTML = `<div class="sheet-head"><h2 class="gold-text">Join a Muster</h2><button class="close-x" data-a="back" aria-label="Close">×</button></div>
      <div class="sheet-body">
        <div class="opts" style="margin-top:0">
          <div class="opt"><label>Your name</label><input class="textin" data-k="name" maxlength="24" placeholder="Sir…" value="${esc(p.name)}"></div>
          <div class="opt"><label>Server</label><input class="textin" data-k="server" value="${esc(p.server)}"><div class="hint">Run your own with <b>npm start</b> (see README); friends join at your address.</div></div>
          <div class="opt"><label>&nbsp;</label><button class="btn" data-a="connect" style="width:100%">Connect</button></div>
        </div>
        <div class="mp-status hint" style="margin:14px 0 8px;font-size:15px"></div>
        <div class="rooms"></div>
        <div class="mp-create" style="margin-top:18px"></div>
      </div>
      <div class="sheet-foot"><button class="btn iron" data-a="back">Back</button><button class="btn iron" data-a="create" disabled>Raise a New Muster</button></div>`;
    sheet.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.k === 'name') p.name = t.value.slice(0, 24);
      if (t.dataset.k === 'server') p.server = t.value.trim();
      savePrefs(p);
    });
    sheet.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const a = (t.closest('[data-a]') as HTMLElement | null)?.dataset.a;
      const join = (t.closest('[data-room]') as HTMLElement | null)?.dataset.room;
      if (join) {
        this.host.ui('tick');
        this.showArmoury('battle', (cls, team) => { this.close(); this.host.mpJoin(join, team, cls); }, () => this.showMultiplayer(), 'Join the Muster');
        return;
      }
      if (a === 'back') { this.host.ui('tick'); this.host.mpDisconnect(); this.showMain(); }
      if (a === 'connect') { this.host.ui('tick'); this.host.mpConnect(p.server || defUrl); }
      if (a === 'create') { this.host.ui('tick'); this.renderCreate(sheet.querySelector('.mp-create') as HTMLElement); }
    });
    this.mount(wrap);
    this.mpEl = sheet;
    this.renderMp();
    if (this.mp.status === 'offline') this.host.mpConnect(p.server || defUrl);
  }

  private renderCreate(box: HTMLElement) {
    const m: MatchSettings = { ...this.prefs.match, teamSize: Math.min(this.prefs.match.teamSize, 32) };
    box.innerHTML = `<div class="parchment" style="padding:14px 18px">
      <div class="opts" style="margin-top:0">
        <div class="opt"><label style="color:var(--ink-soft)">Castle</label><select class="textin" data-k="map" style="color:var(--parch)">${MAPS.map((d) => `<option value="${d.id}" ${d.id === m.mapId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
        <div class="opt"><label style="color:var(--ink-soft)">Manner of battle</label><select class="textin" data-k="mode" style="color:var(--parch)">${(Object.keys(MODE_INFO) as GameMode[]).map((g) => `<option value="${g}" ${g === m.mode ? 'selected' : ''}>${MODE_INFO[g].name}</option>`).join('')}</select></div>
        <div class="opt"><label style="color:var(--ink-soft)">Knights per house</label><select class="textin" data-k="size" style="color:var(--parch)">${[20, 24, 32, 40, 48, 64].map((n) => `<option ${n === m.teamSize ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="opt"><label style="color:var(--ink-soft)">Bots' prowess</label><select class="textin" data-k="diff" style="color:var(--parch)">${DIFFICULTY_NAMES.map((n, i) => `<option value="${i}" ${i === m.difficulty ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      </div>
      <div style="margin-top:12px;text-align:right"><button class="btn" data-a="docreate">Raise the Banner</button></div></div>`;
    box.querySelector('[data-a="docreate"]')!.addEventListener('click', () => {
      const v = (k: string) => (box.querySelector(`[data-k="${k}"]`) as HTMLSelectElement).value;
      m.mapId = v('map'); m.mode = v('mode') as GameMode; m.teamSize = Number(v('size')); m.difficulty = Number(v('diff')) as MatchSettings['difficulty'];
      m.seed = (Math.random() * 1e9) | 0;
      this.host.mpCreate(m);
      box.innerHTML = '';
    });
  }

  setMpState(s: MpState) { this.mp = s; this.renderMp(); }

  private renderMp() {
    const sheet = this.mpEl;
    if (!sheet || !sheet.isConnected) return;
    const st = sheet.querySelector('.mp-status') as HTMLElement;
    const rooms = sheet.querySelector('.rooms') as HTMLElement;
    const create = sheet.querySelector('[data-a="create"]') as HTMLButtonElement;
    const msg = { offline: 'Not connected.', connecting: 'Riding to the muster…', online: 'Connected. Choose a muster to join, or raise your own banner.', error: this.mp.message ?? 'The muster could not be reached.' }[this.mp.status];
    st.textContent = this.mp.status === 'error' ? `${msg} Multiplayer needs the Rose & Ruin server running (npm start).` : msg;
    create.disabled = this.mp.status !== 'online';
    if (this.mp.status !== 'online') { rooms.innerHTML = ''; rooms.dataset.h = ''; return; }
    const html = this.mp.rooms.length ? this.mp.rooms.map((r) => {
      const def = MAPS.find((d) => d.id === r.mapId);
      return `<div class="room"><div><b class="title-caps" style="color:var(--gold-hi)">${esc(r.name)}</b><div class="hint">${esc(def?.name ?? r.mapId)} · ${MODE_INFO[r.mode].name} · ${r.teamSize} per house · ${DIFFICULTY_NAMES[r.difficulty] ?? ''} bots · ${r.phase === 'live' ? `${Math.ceil(r.timeLeft / 60)} min left` : r.phase}</div></div><div class="title-caps">${r.humans} ⚑</div><button class="btn small" data-room="${esc(r.id)}">Join</button></div>`;
    }).join('') : '<div class="hint">No musters yet. Raise the first banner.</div>';
    // only touch the DOM when something changed, so a click is never lost to a refresh
    if (rooms.dataset.h !== html) { rooms.innerHTML = html; rooms.dataset.h = html; }
  }

  // ------------------------------------------------------------------ loading
  showLoading(def: MapDef, subtitle: string) {
    this.close();
    this.hideLoading();
    const s = el('screen loading');
    s.style.zIndex = '45';
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    s.innerHTML = `${mapArt(def, 'loadart')}<div class="loadshade"></div>
      <div class="loadwrap"><div class="sub title-caps">${esc(subtitle)}</div><h1 class="gold-text">${esc(def.name)}</h1>
      <div class="when">${esc(def.location)} · ${esc(def.year)}</div><div class="rule"></div>
      <p class="hist">${esc(def.history)}</p>
      <div class="loadbar"><i></i></div><div class="loadlabel"></div>
      <div class="tip"><b class="title-caps">Counsel</b> ${esc(tip)}</div></div>`;
    this.root.appendChild(s);
    this.loading = s;
  }
  setLoading(p: number, label: string) {
    if (!this.loading) return;
    (this.loading.querySelector('.loadbar i') as HTMLElement).style.width = `calc(${(p * 100).toFixed(0)}% - 2px)`;
    (this.loading.querySelector('.loadlabel') as HTMLElement).textContent = label;
  }
  hideLoading() {
    const l = this.loading;
    if (!l) return;
    this.loading = null;
    l.style.transition = 'opacity .6s ease';
    l.style.opacity = '0';
    setTimeout(() => l.remove(), 650);
  }

  /** Tiny toast for errors and notices outside battle. */
  toast(text: string, ms = 3500) {
    const t = el('toast parchment', esc(text));
    this.root.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 550); }, ms);
  }

  roseImg(team: number, size = 64) { return `<img src="${roseDataUrl(team, size)}" width="${size}" height="${size}" alt="">`; }
}

export function defaultServer(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = location.host || 'localhost:8787';
  return `${proto}//${host}/ws`;
}
