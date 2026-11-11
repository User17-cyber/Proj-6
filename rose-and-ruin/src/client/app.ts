// The application: boots the renderer, runs a live battle behind the menus, and moves
// between the great hall, loading, battle (as a knight or a spectator) and multiplayer.

import * as THREE from 'three';
import { Renderer } from './render/renderer';
import { buildWorldView, type WorldView } from './render/world';
import { MAPS, buildMap, getMap } from '../shared/world/maps/index';
import type { BuiltMap } from '../shared/world/mapgen';
import { LocalSession, type SessionView, type LiveInput } from './game/session';
import { GameView } from './game/gameView';
import { NetClient, NetSession } from './game/net';
import { AudioEngine } from './audio/audio';
import { Input } from './input';
import { CameraRig, type FocusKnight } from './camera';
import { Hud, type HudHost, type HudFrame } from './ui/hud';
import { Menus, type MenuHost, type MpState } from './ui/menus';
import { ClassPreview } from './ui/preview';
import { CLASS_KEY_CODES, classForKey, classLocked, setRenown } from './ui/classInfo';
import { UNLOCK_ORDER, CLASS_IDS } from '../shared/data/classes';
import { lockedClasses, nextUnlock, FINISH_BOUNTY, VICTORY_BOUNTY } from './progress';
import { loadPrefs, syncGore, savePrefs, type Prefs } from './prefs';
import { Act, Btn, DEFAULT_SETTINGS, type MatchSettings, type SimEvent, type Team } from '../shared/types';
import { CLASSES, type ClassId } from '../shared/data/classes';
import { knightName } from '../shared/data/names';
import { Rng } from '../shared/rng';
import { clamp, lerp } from '../shared/math';
import { Perf } from './perf';

type Mode = 'boot' | 'menu' | 'loading' | 'battle';
type SpecCam = 'director' | 'follow' | 'free';

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** seconds of a slow-motion killing blow */
const SLOWMO_TIME = 1.1;

export class App implements HudHost, MenuHost {
  private r!: Renderer;
  private audio = new AudioEngine();
  private input!: Input;
  private prefs: Prefs;
  private menus!: Menus;
  private hud!: Hud;
  private rig!: CameraRig;
  private world: WorldView | null = null;
  private session: SessionView | null = null;
  private view: GameView | null = null;
  private previewKnight: ClassPreview | null = null;
  private mode: Mode = 'boot';
  private attract = false;
  private spectating = false;
  private frame: LiveInput = { seq: 0, mx: 0, mz: 0, yaw: 0, pitch: 0, buttons: 0, held: 0, pulse: 0 };
  private net: NetClient | null = null;
  private mpState: MpState = { status: 'offline', rooms: [] };
  private lastMatch: MatchSettings | null = null;
  private loadout: { cls: ClassId; team: Team | -1 };
  private specCam: SpecCam = 'director';
  private watchId = -1;
  private killerId = -1;
  private deathAt = -1;
  private hitStop = 0;
  /** renown earned in the current battle: the score already counted, the total, and whether the end bounty is paid */
  private renownTrack = { seen: 0, gained: 0, ended: false };
  private renownSavedAt = 0;
  /** slow-motion killing blow: time left, when the last one played, and whether the blow was heavy */
  private slowT = 0; private lastSlow = -99; private killBlowHeavy = false;
  private baseScale = 1;
  private hurtPulse = 0;
  private flash = 0;
  private time = 0;
  private last = performance.now();
  private firstPerson = false;
  private portrait = { active: false, pos: new THREE.Vector3(), look: new THREE.Vector3(), dist: 3.6, mapId: '', kx: 0, kz: 0, yaw: 0 };
  private musicMode = '';
  /** pitched battle: orders the player has fallen as */
  private usedCls = new Set<ClassId>();
  private endHandled = false;
  private lockHint!: HTMLElement;
  private uiRoot!: HTMLElement;
  private audioReady = false;
  private boardHeld = false;
  private frames = 0;
  private params = new URLSearchParams(location.search);
  private perf = new Perf(new URLSearchParams(location.search).has('perf'));
  /** test aid: lets the simulation keep real time on very slow (software) renderers */
  private turbo = Math.max(1, Math.min(20, Number(new URLSearchParams(location.search).get('turbo') ?? 1)));

  constructor() {
    this.prefs = loadPrefs();
    syncGore(this.prefs);
    setRenown(this.prefs.renown);
    // closing the page mid-battle still banks the renown earned
    window.addEventListener('pagehide', () => this.settleRenown());
    if (!this.prefs.name) {
      this.prefs.name = knightName(new Rng((Math.random() * 1e9) | 0), 0, 'manatarms', new Set());
      savePrefs(this.prefs);
    }
    this.loadout = { cls: this.prefs.lastClass, team: this.prefs.lastTeam };
    const q = this.params.get('q');
    if (q !== null) { const v = Math.max(0, Math.min(4, Number(q))) as 0 | 1 | 2 | 3 | 4; this.prefs.gfx = { ...this.prefs.gfx, quality: v, shadowQuality: v, ao: v >= 1 }; }
    this.firstPerson = this.prefs.firstPerson;
  }

  // ======================================================================= boot
  async boot() {
    const boot = document.createElement('div');
    boot.id = 'boot';
    boot.innerHTML = `<div class="wrap"><h1 class="gold-text">Rose &amp; Ruin</h1><div class="sub">THE WARS OF THE ROSES</div><div class="loadbar"><i></i></div><div class="loadlabel">Sharpening blades</div></div>`;
    document.body.appendChild(boot);
    const setBoot = (p: number, label: string) => {
      (boot.querySelector('.loadbar i') as HTMLElement).style.width = `calc(${(clamp(p, 0, 1) * 100).toFixed(0)}% - 2px)`;
      (boot.querySelector('.loadlabel') as HTMLElement).textContent = label;
    };
    this.uiRoot = document.getElementById('ui')!;
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) throw new Error('WebGL 2 is not available in this browser.');
      this.r = new Renderer(canvas, { ...this.prefs.gfx });
    } catch (e) {
      setBoot(0, `This browser cannot raise the battlefield: ${(e as Error).message}`);
      throw e;
    }
    this.input = new Input(canvas);
    this.input.sensitivity = this.prefs.sensitivity;
    this.input.invertY = this.prefs.invertY;
    this.input.bindings = { ...this.prefs.bindings };
    this.input.custom = this.prefs.customBinds.map((c) => ({ ...c }));
    this.input.onLockChange = (locked) => this.onLock(locked);
    // automated tests: behave as if the pointer were captured
    if (this.params.has('testlock')) { (window as unknown as { __app: App }).__app = this; this.input.locked = true; this.input.requestLock = () => { this.input.locked = true; }; this.input.exitLock = () => { /* stay captured */ }; }
    this.rig = new CameraRig(this.r.camera, null);
    this.hud = new Hud(this.uiRoot, this, this.prefs);
    this.menus = new Menus(this.uiRoot, this, this.prefs);
    this.lockHint = document.createElement('div');
    this.lockHint.className = 'lockhint hidden';
    this.lockHint.innerHTML = '<div class="panel"><b class="title-caps">Click to take up arms</b><div class="keys">Esc for respite</div></div>';
    this.uiRoot.appendChild(this.lockHint);
    const unlock = () => this.unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    try { await Promise.race([document.fonts?.ready, sleep(2500)]); } catch { /* fonts optional */ }

    const auto = this.params.get('auto');
    const startMap = this.params.get('map') ?? MAPS[Math.floor(Math.random() * MAPS.length)].id;
    setBoot(0.05, 'Surveying the land');
    await nextFrame();
    await this.loadWorld(startMap, (p, l) => setBoot(0.08 + p * 0.82, l));
    this.startAttract();
    setBoot(0.94, 'Lighting the torches');
    await this.warmShaders();
    setBoot(1, 'To arms');
    requestAnimationFrame(this.loop);
    await sleep(250);
    boot.classList.add('gone');
    setTimeout(() => boot.remove(), 900);
    if (auto === 'battle' || auto === 'spectate') {
      const m: MatchSettings = { ...DEFAULT_SETTINGS, ...this.prefs.match, mapId: startMap, seed: 7 };
      if (this.params.has('size')) m.teamSize = Number(this.params.get('size'));
      if (this.params.has('mode')) m.mode = this.params.get('mode') as MatchSettings['mode'];
      if (auto === 'battle') this.startBattle(m, (this.params.get('cls') as ClassId) ?? this.loadout.cls, (Number(this.params.get('team') ?? 0) as Team));
      else this.startSpectate(m);
    } else {
      this.mode = 'menu';
      this.menus.showMain(this.caption());
    }
  }

  private caption() {
    const d = this.world?.map.def;
    return d ? { place: d.name, when: `${d.location} · ${d.year}` } : undefined;
  }

  private async warmShaders() {
    try {
      const rr = this.r.renderer as THREE.WebGLRenderer & { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<unknown> };
      this.view?.update(1 / 60, -1, this.r.camera);
      if (rr.compileAsync) await Promise.race([rr.compileAsync(this.r.scene, this.r.camera), sleep(8000)]);
    } catch { /* compile on first draw instead */ }
    this.r.render(1 / 60);
    await nextFrame();
  }

  private unlockAudio() {
    if (this.audioReady) return;
    this.audioReady = true;
    this.audio.init();
    this.audio.setVolumes(this.prefs.volumes);
    // generating the sound banks takes a moment: spread it out
    setTimeout(() => this.audio.warm(), 30);
    this.musicMode = '';
  }

  // ======================================================================= worlds & sessions
  private async loadWorld(mapId: string, progress: (p: number, label: string) => void): Promise<WorldView> {
    if (this.world && this.world.map.def.id === mapId) { progress(1, 'Ready'); return this.world; }
    this.disposeSession();
    if (this.previewKnight) { this.previewKnight.dispose(); this.previewKnight = null; }
    if (this.view) { this.view.dispose(); this.view = null; }
    if (this.world) { this.world.dispose(); this.world = null; }
    progress(0, 'Surveying the land');
    await nextFrame();
    const map: BuiltMap = buildMap(mapId);
    this.world = await buildWorldView(this.r, map, progress);
    this.rig.setWorld(map.world);
    this.portrait.mapId = '';
    return this.world;
  }

  private present(s: SessionView, withHud: boolean) {
    this.session = s;
    if (s instanceof LocalSession) s.maxSteps = 8 * this.turbo;
    if (!this.view) this.view = new GameView(this.r, this.world!, s, this.audio, withHud ? this.hud : null);
    else this.view.reset(s, withHud ? this.hud : null);
    this.view.showBlood = this.prefs.gore > 0;
    this.view.gore = this.prefs.gore;
    this.view.firstPerson = false;
    this.endHandled = false;
    this.usedCls.clear();
    this.hud.setSpent(this.usedCls, s.settings.mode === 'battle');
    this.killerId = -1;
    this.deathAt = -1;
    this.watchId = -1;
    this.hitStop = 0;
    this.slowT = 0;
    this.baseScale = 1;
  }

  private disposeSession() {
    if (this.session) { this.session.dispose(); this.session = null; }
    this.hud.detach();
    this.spectating = false;
  }

  private startAttract() {
    const map = this.world!.map;
    const s = new LocalSession({ ...DEFAULT_SETTINGS, mapId: map.def.id, teamSize: 20, difficulty: 2, timeLimit: 3600, mode: 'battle', ticketScale: 10, seed: (Math.random() * 1e9) | 0 }, null);
    // the hall's backdrop: both hosts drawn up and waiting; nothing fights until you choose to
    s.match.hold = true;
    s.update(0);
    this.present(s, false);
    this.attract = true;
    this.rig.mode = 'director';
    this.input.enabled = false;
  }

  // ======================================================================= MenuHost
  async startBattle(m: MatchSettings, cls: ClassId, team: Team | -1) {
    this.lastMatch = { ...m };
    this.loadout = { cls, team };
    this.prefs.lastClass = cls;
    savePrefs(this.prefs);
    await this.enterLocal(m, { name: this.prefs.name || 'Sir Knight', team, cls, locked: lockedClasses(this.prefs.renown) }, 'Mustering the hosts');
  }

  async startSpectate(m: MatchSettings) {
    this.lastMatch = { ...m };
    await this.enterLocal(m, null, 'The hosts take the field');
  }

  /** bumped to abandon a load in progress (Turn Back on the loading screen) */
  private loadToken = 0;
  /** the load in progress is an online muster (leaving it tells the server) */
  private loadingNet = false;
  /** the player turned back while a join was on its way: leave the muster when it answers */
  private netTurnedBack = false;
  cancelLoading() {
    if (this.mode !== 'loading') return;
    this.loadToken++;
    if (this.loadingNet) { this.net?.leave(); this.netTurnedBack = true; }
    this.loadingNet = false;
    this.menus.hideLoading();
    this.leave();
  }

  private async enterLocal(m: MatchSettings, player: { name: string; team: Team | -1; cls: ClassId; locked?: ClassId[] } | null, subtitle: string) {
    const token = ++this.loadToken;
    const gone = () => token !== this.loadToken;
    this.loadingNet = false;
    this.mode = 'loading';
    this.previewKnight?.show(false);
    this.portrait.active = false;
    this.r.setDof(false);
    this.menus.showLoading(getMap(m.mapId), subtitle);
    await nextFrame();
    this.disposeSession();
    await this.loadWorld(m.mapId, (p, l) => this.menus.setLoading(p * 0.9, l));
    if (gone()) return;
    this.menus.setLoading(0.92, 'Arraying the battle lines');
    await nextFrame();
    if (gone()) return;
    const s = new LocalSession(m, player);
    // with a knight of your own, the battle waits for you to sound the charge;
    // a bots-only battle (Watch the Battle) starts by itself
    if (player) s.match.hold = true;
    this.present(s, true);
    this.attract = false;
    this.spectating = !player;
    this.hud.attach(s);
    this.renownTrack = { seen: 0, gained: 0, ended: false };
    if (player) this.hud.setLoadout(player.cls);
    this.specCam = 'director';
    this.rig.mode = player ? (this.firstPerson ? 'first' : 'third') : 'director';
    if (player) {
      const k = s.knights[s.localId];
      this.input.yaw = k.yaw; this.input.pitch = 0;
    }
    this.menus.setLoading(0.97, 'Lighting the torches');
    await this.warmShaders();
    if (gone()) return;
    this.menus.hideLoading();
    this.mode = 'battle';
    this.input.enabled = true;
    this.musicMode = '';
  }

  preview(cls: ClassId | null, team: Team) {
    if (!cls || !this.world) {
      this.previewKnight?.show(false);
      if (this.portrait.active) { this.portrait.active = false; this.r.setDof(false); this.rig.mode = 'director'; }
      return;
    }
    if (!this.previewKnight) this.previewKnight = new ClassPreview(this.world);
    if (this.portrait.mapId !== this.world.map.def.id) this.findPortrait(this.world.map);
    const p = this.portrait;
    this.previewKnight.set(cls, team);
    this.previewKnight.place(p.kx, p.kz, p.yaw);
    this.previewKnight.show(true);
    p.active = true;
    this.r.setDof(true, p.dist, 2.2);
  }

  private findPortrait(map: BuiltMap) {
    const W = map.world;
    const p = this.portrait;
    p.mapId = map.def.id;
    const tryAt = (kx: number, kz: number, dx: number, dz: number) => {
      const ky = W.groundAt(kx, kz, 999);
      if (!W.walkable(kx, kz, ky)) return false;
      const rx = -dz, rz = dx;
      const cx = kx - dx * 3.6 - rx * 0.4, cz = kz - dz * 3.6 - rz * 0.4;
      const cy = W.groundAt(cx, cz, 999);
      if (Math.abs(cy - ky) > 1.2 || W.pointBlocked(cx, cy + 1.4, cz)) return false;
      if (!W.los(cx, cy + 1.5, cz, kx, ky + 1.2, kz)) return false;
      p.kx = kx; p.kz = kz;
      p.yaw = Math.atan2(dx, dz) + 0.42;
      p.pos.set(cx, cy + 1.5, cz);
      p.look.set(kx - rx * 1.3, ky + 1.18, kz - rz * 1.3);
      p.dist = Math.hypot(cx - kx, cz - kz);
      return true;
    };
    for (const c of map.camera) {
      const dx0 = c.tx - c.x, dz0 = c.tz - c.z;
      const l = Math.hypot(dx0, dz0) || 1;
      const dx = dx0 / l, dz = dz0 / l;
      for (let s = 6; s < 60; s += 3) if (tryAt(c.x + dx * s, c.z + dz * s, dx, dz)) return;
    }
    const sp = map.spawns[0][0];
    const dx = -Math.sin(sp.yaw), dz = -Math.cos(sp.yaw);
    if (!tryAt(sp.x, sp.z, dx, dz)) { p.kx = sp.x; p.kz = sp.z; p.yaw = sp.yaw + Math.PI; const y = W.groundAt(sp.x, sp.z, 999); p.pos.set(sp.x - dx * 3.6, y + 1.5, sp.z - dz * 3.6); p.look.set(sp.x, y + 1.2, sp.z); p.dist = 3.6; }
  }

  prefsChanged(p: Prefs) {
    this.prefs = p;
    this.r.applySettings({ ...p.gfx });
    this.input.sensitivity = p.sensitivity;
    this.input.invertY = p.invertY;
    this.input.bindings = { ...p.bindings };
    this.input.custom = p.customBinds.map((c) => ({ ...c }));
    this.audio.setVolumes(p.volumes);
    if (this.view) { this.view.showBlood = p.gore > 0; this.view.gore = p.gore; }
    this.firstPerson = p.firstPerson;
    if (this.mode === 'battle' && !this.spectating) this.rig.mode = this.firstPerson ? 'first' : 'third';
  }

  ui(name: 'tick' | 'open') { if (name === 'tick') this.audio.play('tick', { bus: 'ui', vol: 0.35, rateVar: 0.05 }); }

  // ---- multiplayer
  mpConnect(url: string) {
    if (!this.net) {
      this.net = new NetClient({
        state: (status, message) => { this.mpState = { ...this.mpState, status, message }; this.menus.setMpState(this.mpState); if (status === 'error' && this.mode === 'battle' && this.session?.online) this.menus.toast(message ?? 'Connection lost'); },
        rooms: (rooms) => { this.mpState = { ...this.mpState, rooms }; this.menus.setMpState(this.mpState); },
        created: () => { this.menus.toast('Your banner is raised. Choose it from the list to join.'); this.net?.send({ t: 'list' }); },
        // a muster that answers after the player turned back is left at once
        joined: (s) => { if (this.netTurnedBack) { this.netTurnedBack = false; this.net?.leave(); return; } void this.enterNet(s); },
        error: (msg) => {
          this.menus.toast(msg);
          // a refused join leaves us on the loading screen: back to the muster list
          if (this.mode === 'loading' && !(this.session instanceof NetSession)) { this.menus.hideLoading(); this.mode = 'menu'; this.menus.showMultiplayer(); }
        },
      });
    }
    this.net.connect(url, this.prefs.name || 'Sir Knight');
  }
  mpDisconnect() { this.net?.disconnect(); this.mpState = { status: 'offline', rooms: [] }; }
  mpCreate(m: MatchSettings) { this.net?.create(m); }
  mpJoin(room: string, team: Team | -1, cls: ClassId) {
    this.loadout = { cls, team };
    this.menus.showLoading(getMap(this.mpState.rooms.find((r) => r.id === room)?.mapId ?? MAPS[0].id), 'Riding to the muster');
    this.mode = 'loading';
    this.loadingNet = true;
    this.netTurnedBack = false;
    this.loadToken++;
    this.net?.join(room, this.prefs.name || 'Sir Knight', team, cls, lockedClasses(this.prefs.renown));
  }

  private async enterNet(s: NetSession) {
    const token = this.loadToken;
    const gone = () => token !== this.loadToken;
    this.mode = 'loading';
    this.previewKnight?.show(false);
    this.portrait.active = false;
    this.r.setDof(false);
    this.menus.showLoading(getMap(s.settings.mapId), 'Riding to the muster');
    await nextFrame();
    if (this.session && this.session !== s) { const old = this.session; this.session = null; if (!(old instanceof NetSession)) old.dispose(); }
    this.hud.detach();
    await this.loadWorld(s.settings.mapId, (p, l) => this.menus.setLoading(p * 0.9, l));
    if (gone()) return;
    s.onChat = (name, team, text) => this.hud.chat(name, team, text);
    this.present(s, true);
    this.attract = false;
    this.spectating = false;
    this.hud.attach(s);
    this.renownTrack = { seen: 0, gained: 0, ended: false };
    this.hud.setLoadout(this.loadout.cls);
    this.rig.mode = this.firstPerson ? 'first' : 'third';
    await this.warmShaders();
    if (gone()) return;
    this.loadingNet = false;
    s.catchUp();
    this.menus.hideLoading();
    this.mode = 'battle';
    this.input.enabled = true;
    this.musicMode = '';
  }

  // ======================================================================= HudHost
  respawn(cls: ClassId) {
    if (this.usedCls.has(cls) || classLocked(cls)) return;
    this.loadout.cls = cls;
    this.prefs.lastClass = cls;
    savePrefs(this.prefs);
    const s = this.session, me = this.localKnight();
    s?.requestSpawn(cls, s && me ? this.spawnPref(me.team) : -1);
    this.input.enabled = true;
    this.input.requestLock();
  }
  spawnPref(team: number): number {
    const s = this.session;
    if (!s) return -1;
    const v = this.prefs.spawnPref[`${s.settings.mapId}:${team}`];
    return typeof v === 'number' && v < s.map.spawns[team].length ? v : -1;
  }
  setSpawnPref(team: number, zone: number) {
    const s = this.session;
    if (!s) return;
    this.prefs.spawnPref[`${s.settings.mapId}:${team}`] = zone;
    savePrefs(this.prefs);
    this.ui('tick');
  }
  /** Single combat: the order to fight the next round as (or this one, while still at the marks). */
  private pickRoundClass(cls: ClassId) {
    if (classLocked(cls)) return;
    this.loadout.cls = cls;
    this.prefs.lastClass = cls;
    savePrefs(this.prefs);
    this.session?.requestSpawn(cls);
    this.ui('tick');
  }
  selectClass(cls: ClassId) {
    this.loadout.cls = cls;
    // single combat: the choice in the menu is the knight for the next round
    if (this.session?.settings.mode === 'duel') this.pickRoundClass(cls);
  }
  resume() {
    this.hud.showPause(false);
    if (this.session && !this.session.online) this.session.paused = false;
    // back to the death screen (pointer free to choose an order) or into the fight
    const me = this.localKnight();
    if (!this.spectating && me && !me.alive) return;
    this.input.enabled = true;
    this.input.requestLock();
  }
  /** Open the pause menu (with Leave the Battle) from any state of a battle. */
  openPause() {
    if (this.mode !== 'battle' || !this.session || this.hud.paused || this.hud.chatting || this.hud.endOpen) return;
    this.hud.showPause(true);
    if (!this.session.online) this.session.paused = true;
    this.input.enabled = false;
    this.input.exitLock();
  }
  /** Bank everything earned so far in this battle (leaving early forfeits only the end bounty). */
  private settleRenown(): number {
    const s = this.session;
    if (s && this.mode === 'battle' && !this.spectating) {
      this.trackRenown(s);
      // offline, the simulation may be a frame ahead of the view: count that too
      if (s instanceof LocalSession && s.localId >= 0) {
        const k = s.match.knights[s.localId], T = this.renownTrack;
        if (k && k.score > T.seen) { this.awardRenown(k.score - T.seen); T.seen = k.score; }
      }
    }
    savePrefs(this.prefs);
    return this.renownTrack.gained;
  }
  leave() {
    const early = this.mode === 'battle' && !!this.session && this.session.phase !== 'ended' && !this.spectating;
    const gained = this.settleRenown();
    this.renownTrack = { seen: 0, gained: 0, ended: true };
    this.hud.showPause(false);
    this.hud.showBoard(false);
    this.input.exitLock();
    if (this.session?.online) this.net?.leave();
    this.disposeSession();
    this.mode = 'menu';
    this.startAttract();
    this.menus.showMain(this.caption());
    this.musicMode = '';
    if (early && gained > 0) this.menus.toast(`You leave the field with +${gained.toLocaleString()} renown (${this.prefs.renown.toLocaleString()} in all).`);
  }
  restart() {
    if (!this.lastMatch) return this.leave();
    const m = { ...this.lastMatch, seed: (Math.random() * 1e9) | 0 };
    if (this.spectating) void this.startSpectate(m);
    else void this.startBattle(m, this.loadout.cls, this.loadout.team);
  }
  openSettings() { this.menus.showSettings(() => { /* back to the pause menu */ }, true); }
  openCodex() { this.menus.showCodex(() => { /* back to the pause menu */ }, true); }
  sendChat(text: string) { if (this.session instanceof NetSession) this.session.chat(text); this.input.enabled = true; }

  // ======================================================================= input
  private onLock(locked: boolean) {
    if (locked || this.mode !== 'battle' || !this.session) return;
    const me = this.localKnight();
    // losing the pointer mid-fight opens the pause menu
    if ((this.spectating || (me && me.alive)) && !this.hud.deathOpen && !this.hud.endOpen && !this.hud.chatting) this.openPause();
  }

  private onKeyDown(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.code === 'F3') { e.preventDefault(); this.perf.toggle(); return; }
    if (this.mode !== 'battle') return;
    if (e.code === 'Escape' && this.hud.paused) { this.resume(); return; }
    // P pauses (and resumes) too; while watching a battle it keeps freezing the action instead
    if (e.code === 'KeyP' && !this.spectating && !this.hud.chatting) { if (this.hud.paused) this.resume(); else this.openPause(); return; }
    // Esc opens the menu at any moment: mustering, fighting, fallen or watching
    if (e.code === 'Escape' && !this.hud.chatting) { this.openPause(); return; }
    if (e.code === 'Tab') e.preventDefault();
  }

  /** Turn the local knight's renown score into lasting renown, and pay the bounty at the end of a battle. */
  private trackRenown(s: SessionView) {
    const me = this.localKnight();
    if (!me) return;
    const T = this.renownTrack;
    if (me.score > T.seen) { this.awardRenown(me.score - T.seen); T.seen = me.score; }
    if (s.phase === 'ended' && !T.ended) {
      T.ended = true;
      this.awardRenown(FINISH_BOUNTY + (s.winner === me.team ? VICTORY_BOUNTY : 0));
      const n = nextUnlock(this.prefs.renown);
      this.hud.renownSummary = `+${T.gained.toLocaleString()} renown this battle · ${this.prefs.renown.toLocaleString()} in all` + (n ? ` · ${(n.need - this.prefs.renown).toLocaleString()} more to win the ${CLASSES[n.cls].name}` : ' · every order is yours');
      savePrefs(this.prefs);
    }
    if (this.time - this.renownSavedAt > 5) { this.renownSavedAt = this.time; savePrefs(this.prefs); }
  }

  private awardRenown(n: number) {
    const before = this.prefs.renown;
    this.prefs.renown = before + n;
    this.renownTrack.gained += n;
    for (const c of UNLOCK_ORDER) {
      const need = CLASSES[c].unlock ?? 0;
      if (before < need && this.prefs.renown >= need) {
        this.hud.notify(`A new order is yours: ${CLASSES[c].name}`, -1, true);
        this.audio.play('killSting', { bus: 'ui', vol: 0.7, rateVar: 0, rate: 0.8 });
        // take it to the field at once
        if (this.session instanceof LocalSession && this.session.localId >= 0) this.session.match.knights[this.session.localId].lockedCls.delete(c);
        savePrefs(this.prefs);
      }
    }
    setRenown(this.prefs.renown);
  }

  private localKnight() { const s = this.session; return s && s.localId >= 0 ? s.knights[s.localId] ?? null : null; }

  private battleInput(s: SessionView) {
    const I = this.input;
    const me = this.localKnight();
    // scoreboard while Tab is held (or toggled on the end screen)
    const tab = I.keys.has('Tab');
    if (tab !== this.boardHeld) { this.boardHeld = tab; this.hud.showBoard(tab); }
    // death screen choices
    // single combat: at the marks the camera and aim are turned squarely on the foe
    if (s.settings.mode === 'duel' && me && me.alive && (s.phase === 'warmup' || (s.timeLeft > 0 && s.knights.every((k) => k.alive)))) { I.yaw = me.yaw; I.pitch = 0; }
    // the knight menu (death screen, or single combat between rounds): number keys pick an order
    // (1-0, then Shift+1-6), Space or Enter rejoins
    const shift = I.keys.has('ShiftLeft') || I.keys.has('ShiftRight');
    if (this.hud.deathOpen) for (const code of [...CLASS_KEY_CODES, 'Space', 'Enter']) if (I.consumeKey(code)) { if (this.hud.deathKey(code, shift) && (code === 'Space' || code === 'Enter') && s.settings.mode !== 'duel') { this.input.enabled = true; this.input.requestLock(); } }
    if (s.online && !this.hud.chatting && I.consumeKey(this.prefs.bindings.chat)) { this.hud.openChat(); this.input.enabled = false; }
    if (I.consumeAction('camera', this.prefs.bindings.camera) && me) {
      this.firstPerson = !this.firstPerson;
      this.rig.mode = this.firstPerson ? 'first' : 'third';
    }
    // sound the charge once you are ready
    if (s instanceof LocalSession && s.held && me && me.alive && this.input.locked && !this.hud.paused) {
      if (I.consumeKey('Space') || I.consumeKey('Enter') || (I.latched & Btn.Attack)) { s.release(); I.clearLatched(); this.audio.play('hornShort', { bus: 'ui', vol: 0.6, rateVar: 0 }); }
    }
    const spectatorKeys = this.spectating || (me && !me.alive && me.respawnT > 900 && this.time - this.deathAt > 3);
    if (spectatorKeys) this.spectatorKeys(s);
    const f = this.frame;
    f.yaw = I.yaw; f.pitch = I.pitch;
    if (me && me.alive && !this.hud.paused && !this.hud.chatting && this.input.locked) {
      const ranged = CLASSES[me.cls].ranged;
      let held = I.held();
      let latched = I.latched;
      if (ranged) {
        // archers aim with the right button instead of guarding
        if (held & Btn.Block) held = (held & ~Btn.Block) | Btn.Zoom;
        latched &= ~Btn.Block;
      }
      const mv = I.move();
      f.mx = mv.mx; f.mz = mv.mz;
      f.pulse |= latched;
      I.clearLatched();
      f.held = held;
      f.buttons = held | f.pulse;
      this.aimPoint(f);
    } else {
      f.mx = 0; f.mz = 0; f.held = 0; f.buttons = 0; f.pulse = 0;
      I.clearLatched();
    }
    s.setInput(f);
  }

  private aimPoint(f: LiveInput) {
    const cam = this.r.camera;
    const d = cam.getWorldDirection(_v);
    const W = this.world!.map.world;
    const o = cam.position;
    const far = 260;
    const t = W.raycast(o.x, o.y, o.z, o.x + d.x * far, o.y + d.y * far, o.z + d.z * far);
    const dist = t >= 0 ? t * far : 160;
    f.aimX = o.x + d.x * dist; f.aimY = o.y + d.y * dist; f.aimZ = o.z + d.z * dist;
  }

  private spectatorKeys(s: SessionView) {
    const I = this.input;
    if (I.consumeKey('Digit1')) this.specCam = 'director';
    if (I.consumeKey('Digit2')) { this.specCam = 'follow'; if (this.watchId < 0) this.cycleWatch(s, 1); this.syncLook(); }
    if (I.consumeKey('Digit3')) { this.specCam = 'free'; this.rig.pos.copy(this.r.camera.position); this.syncLook(); }
    if (I.consumeKey('ArrowRight') || I.consumeKey('KeyE')) { this.cycleWatch(s, 1); if (this.specCam === 'director') this.specCam = 'follow'; }
    if (I.consumeKey('ArrowLeft') || I.consumeKey('KeyQ')) { this.cycleWatch(s, -1); if (this.specCam === 'director') this.specCam = 'follow'; }
    if (!s.online) {
      const scales = [0.25, 0.5, 1, 2];
      let i = scales.indexOf(this.baseScale);
      if (i < 0) i = 2;
      if (I.consumeKey('Minus') || I.consumeKey('NumpadSubtract')) this.baseScale = scales[Math.max(0, i - 1)];
      if (I.consumeKey('Equal') || I.consumeKey('NumpadAdd')) this.baseScale = scales[Math.min(scales.length - 1, i + 1)];
      if (I.consumeKey('KeyP')) s.paused = !s.paused;
    }
  }

  private syncLook() {
    const d = this.r.camera.getWorldDirection(_v);
    this.input.yaw = Math.atan2(-d.x, -d.z);
    this.input.pitch = Math.asin(clamp(d.y, -1, 1));
  }

  private cycleWatch(s: SessionView, dir: number) {
    const me = this.localKnight();
    const pool = s.knights.filter((k) => k.alive && (!me || this.spectating || k.team === me.team));
    if (!pool.length) { this.watchId = -1; return; }
    const i = pool.findIndex((k) => k.id === this.watchId);
    this.watchId = pool[(i + dir + pool.length) % pool.length].id;
  }

  // ======================================================================= frame
  private loop = () => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = clamp((now - this.last) / 1000, 0, 0.1 * this.turbo);
    this.last = now;
    this.time += dt;
    try { this.tick(dt); } catch (e) { console.error(e); (window as unknown as { __error: string }).__error = String((e as Error)?.stack ?? e); }
  };

  private tick(dt: number) {
    const s = this.session, v = this.view, w = this.world;
    if (!w) { this.input.endFrame(); return; }
    if (!s || !v) { w.update(dt); this.r.render(dt); this.input.endFrame(); return; }
    const P = this.perf;
    this.r.renderer.info.reset();
    if (!s.online) {
      if (this.slowT > 0) {
        // slow motion: drops to a quarter speed at once, then eases back over a second
        this.slowT = Math.max(0, this.slowT - dt);
        const u = 1 - this.slowT / SLOWMO_TIME;
        s.timeScale = this.baseScale * (0.22 + 0.78 * u * u * (3 - 2 * u));
      } else if (this.hitStop > 0) { this.hitStop -= dt; s.timeScale = 0.2; } else s.timeScale = this.baseScale;
    }
    if (this.mode === 'battle') {
      this.input.enabled = !this.hud.paused && !this.hud.chatting && !this.hud.deathOpen && !this.hud.endOpen;
      if (!this.spectating) this.trackRenown(s);
      this.battleInput(s);
    }
    P.begin('sim');
    s.update(dt);
    P.end('sim');
    if (s instanceof NetSession && s.lost && this.mode === 'battle') { this.menus.toast('The connection to the muster was lost.'); this.leave(); return; }
    P.begin('events');
    const events = s.drainEvents();
    this.scanEvents(events, s);
    v.processEvents(events, s.localId);
    P.end('events');
    this.updateCamera(dt, s, v);
    v.firstPerson = this.mode === 'battle' && !this.spectating && this.rig.mode === 'first';
    P.begin('knights');
    v.update(dt, s.localId, this.r.camera);
    P.end('knights');
    P.begin('world');
    w.update(dt);
    this.previewKnight?.update(dt);
    P.end('world');
    P.begin('hud');
    if (this.mode === 'battle') {
      const me = this.localKnight();
      const watched = this.watchId >= 0 ? s.knights[this.watchId] : null;
      const hf: HudFrame = {
        s, cam: this.r.camera, localId: s.localId, spectating: this.spectating, watchId: this.specCam === 'follow' ? this.watchId : -1,
        camLabel: this.specCam === 'director' ? 'The director chooses the view' : this.specCam === 'free' ? 'Free camera — WASD, mouse, Space/C' : 'Following',
        heading: this.spectating || !me || !me.alive ? this.camHeading() : this.input.yaw,
        viewX: me && me.alive && !this.spectating ? me.x : watched && this.specCam === 'follow' ? watched.x : this.r.camera.position.x,
        viewZ: me && me.alive && !this.spectating ? me.z : watched && this.specCam === 'follow' ? watched.z : this.r.camera.position.z,
        timeScale: this.baseScale, online: s.online, firstPerson: this.firstPerson, locked: this.input.locked,
      };
      this.hud.update(dt, hf);
      // the death and end screens need the mouse
      if ((this.hud.deathOpen || this.hud.endOpen) && this.input.locked) this.input.exitLock();
      // (not over the knight menu, nor over the duel count, which carries its own prompt)
      const duelCount = s.settings.mode === 'duel' && s.phase === 'live' && s.timeLeft > 0 && s.knights.every((k) => k.alive);
      const needLock = !this.spectating && me && me.alive && !this.input.locked && !this.hud.paused && !this.hud.chatting && !this.hud.endOpen && !this.hud.deathOpen && !duelCount;
      this.lockHint.classList.toggle('hidden', !needLock);
      if (this.spectating && (this.specCam === 'free' || this.specCam === 'follow') && !this.input.locked) this.lockHint.classList.add('hidden');
    } else this.lockHint.classList.add('hidden');
    P.end('hud');
    P.begin('audio');
    this.updateAudio(dt, s, v);
    P.end('audio');
    this.updateGrade(dt, s);
    P.begin('render');
    this.r.render(dt);
    P.end('render');
    const info = this.r.renderer.info.render;
    P.frame(dt, info, { knights: s.knights.filter((k) => k.alive).length, scale: this.r.effectiveScale });
    this.r.adapt(dt * 1000);
    this.input.endFrame();
    if (this.attract && s.phase === 'ended' && s.phaseT > 8) this.startAttract();
    this.frames++;
    if (this.frames === 20) (window as unknown as { __ready: boolean }).__ready = true;
  }

  private camHeading() {
    const d = this.r.camera.getWorldDirection(_v);
    return Math.atan2(-d.x, -d.z);
  }

  private scanEvents(events: SimEvent[], s: SessionView) {
    const me = s.localId;
    if (me < 0) return;
    for (const e of events) {
      switch (e.t) {
        case 'spawn':
          if (e.k === me) {
            const k = s.knights[me];
            // face the way the knight was set down (the sim's view may already hold the old aim)
            if (k) { this.input.yaw = e.yaw ?? k.yaw; this.input.pitch = 0; }
            this.rig.mode = this.firstPerson ? 'first' : 'third';
            this.killerId = -1;
            this.deathAt = -1;
          }
          break;
        case 'kill':
          if (e.victim === me) {
            const vk = s.knights[me];
            if (vk && s.settings.mode === 'battle') this.usedCls.add(vk.cls);
            this.hud.setSpent(this.usedCls, s.settings.mode === 'battle');
            this.killerId = e.killer;
            this.deathAt = this.time;
            const k = s.knights[me];
            if (k) this.rig.startDeath(k as FocusKnight);
            this.rig.addShake(0.5);
          } else if (e.killer === me) {
            if (!s.online) {
              // the heaviest killing blows (heavy, through the head, or a beheading) play out in slow motion
              if (this.prefs.slowmo && this.killBlowHeavy && this.time - this.lastSlow > 4) { this.slowT = SLOWMO_TIME; this.lastSlow = this.time; }
              else this.hitStop = 0.07;
            }
            this.rig.addShake(0.3);
            this.flash = 0.12;
          }
          break;
        case 'hit':
          if (e.a === me && e.killed) this.killBlowHeavy = e.heavy || e.zone === 0 || e.kind === 2;
          if (e.a === me && !e.killed) { this.rig.addShake(e.heavy ? 0.16 : 0.08); this.flash = Math.max(this.flash, 0.03); }
          if (e.v === me) { this.rig.addShake(Math.min(0.7, e.dmg / 55)); this.hurtPulse = Math.min(1, this.hurtPulse + e.dmg / 45); }
          break;
        case 'block':
          if (e.v === me || e.a === me) this.rig.addShake(e.parry ? 0.2 : 0.1);
          break;
        case 'kick':
          if (e.v === me && e.hit) this.rig.addShake(0.35);
          break;
        default: break;
      }
    }
  }

  private pickFocus(s: SessionView): { id: number; centroid: THREE.Vector3 } | null {
    const K = s.knights;
    const fighting: number[] = [];
    let cx = 0, cy = 0, cz = 0, n = 0;
    for (const a of K) {
      if (!a.alive) continue;
      cx += a.x; cy += a.y; cz += a.z; n++;
      for (const b of K) {
        if (!b.alive || b.team === a.team) continue;
        if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 < 25) { fighting.push(a.id); break; }
      }
    }
    if (!n) return null;
    let id: number;
    if (fighting.length) {
      id = fighting[Math.floor(Math.random() * fighting.length)];
      cx = cy = cz = 0;
      for (const f of fighting) { cx += K[f].x; cy += K[f].y; cz += K[f].z; }
      n = fighting.length;
    } else {
      const alive = K.filter((k) => k.alive);
      id = alive[Math.floor(Math.random() * alive.length)].id;
    }
    return { id, centroid: _c.set(cx / n, cy / n + 1, cz / n) };
  }

  private updateCamera(dt: number, s: SessionView, v: GameView) {
    const fov = this.prefs.gfx.fov;
    const rig = this.rig;
    const cam = this.r.camera;
    if (this.portrait.active) {
      const p = this.portrait;
      const sway = Math.sin(this.time * 0.25) * 0.08;
      cam.position.lerp(_v.set(p.pos.x + sway, p.pos.y, p.pos.z), 1 - Math.exp(-dt * 4));
      cam.lookAt(p.look);
      if (Math.abs(cam.fov - (fov - 12)) > 0.05) { cam.fov = lerp(cam.fov, fov - 12, 1 - Math.exp(-dt * 6)); cam.updateProjectionMatrix(); }
      return;
    }
    const getK = (id: number) => s.knights[id] ?? null;
    if (this.mode !== 'battle' || this.attract) {
      rig.mode = 'director';
      rig.updateDirector(dt, getK, () => this.pickFocus(s), fov, s.map.camera);
      return;
    }
    const me = this.localKnight();
    const lastStandOut = me && !me.alive && me.respawnT > 900 && this.time - this.deathAt > 3;
    if (this.spectating || lastStandOut) {
      if (this.specCam === 'director') { rig.updateDirector(dt, getK, () => this.pickFocus(s), fov, s.map.camera); return; }
      if (this.specCam === 'follow') {
        let k = this.watchId >= 0 ? s.knights[this.watchId] : null;
        if (!k || !k.alive) { this.cycleWatch(s, 1); k = this.watchId >= 0 ? s.knights[this.watchId] : null; }
        if (k) {
          if (this.input.locked) { rig.freeYaw = this.input.yaw; rig.freePitch = clamp(this.input.pitch, -1.2, 0.6); }
          else { rig.freeYaw += dt * 0.12; }
          rig.updateFollow(dt, k, fov);
          return;
        }
        rig.updateDirector(dt, getK, () => this.pickFocus(s), fov, s.map.camera);
        return;
      }
      // free flight
      rig.freeYaw = this.input.yaw; rig.freePitch = this.input.pitch;
      const I = this.input;
      const up = (I.keys.has('Space') ? 1 : 0) - (I.keys.has('KeyC') || I.keys.has('ControlLeft') ? 1 : 0);
      rig.updateFree(dt, I.move(), up, I.keys.has('ShiftLeft'), fov);
      return;
    }
    if (me && !me.alive) {
      const body = v.corpseOf(s.localId, _b) ?? _b.set(me.x, me.y + 0.3, me.z);
      const killer = this.killerId >= 0 ? s.knights[this.killerId] : null;
      rig.updateDeath(dt, body, killer && killer.alive ? _k.set(killer.x, killer.y + 1, killer.z) : null, fov);
      return;
    }
    if (me) {
      rig.mode = this.firstPerson ? 'first' : 'third';
      const ranged = CLASSES[me.cls].ranged;
      const zoomT = ranged && (this.input.held() & Btn.Block) && this.input.locked ? 1 : 0;
      rig.zoom = lerp(rig.zoom, zoomT, 1 - Math.exp(-dt * 9));
      const head = this.firstPerson ? v.headOf(s.localId, _h) : null;
      rig.updatePlayer(dt, me, this.input.yaw, this.input.pitch, head, me.sprinting && Math.hypot(me.vx, me.vz) > 4, fov);
    }
  }

  private updateAudio(dt: number, s: SessionView, v: GameView) {
    const A = this.audio;
    if (!A.ctx) return;
    const cam = this.r.camera;
    A.setListener(cam.position, cam.getWorldDirection(_v), _u.set(0, 1, 0).applyQuaternion(cam.quaternion));
    A.update(dt);
    // music
    let mode: 'menu' | 'battle' | 'victory' | 'defeat' = this.mode === 'battle' ? 'battle' : 'menu';
    const me = this.localKnight();
    if (this.mode === 'battle' && s.phase === 'ended') mode = !me || s.winner < 0 ? 'victory' : me.team === s.winner ? 'victory' : 'defeat';
    if (mode !== this.musicMode) { this.musicMode = mode; A.musicMode(mode); }
    A.musicIntensity(clamp(v.combatNear / 3, 0, 1));
    // ambience
    const amb = s.map.def.atmosphere.ambientSound;
    A.loop('wind', 'wind', amb === 'wind' ? 0.5 : amb === 'coast' ? 0.25 : 0.2);
    if (amb === 'coast') A.loop('surf', 'surf', 0.45);
    let fighting = 0;
    for (const k of s.knights) if (k.alive && (k.act === Act.Release || k.act === Act.Block || k.act === Act.Windup) && (k.x - cam.position.x) ** 2 + (k.z - cam.position.z) ** 2 < 90 * 90) fighting++;
    A.loop('battle', 'battle', clamp(fighting / 26, 0.04, 0.75) * (this.mode === 'battle' ? 1 : 0.6));
    let fd = 1e9;
    for (const f of this.world!.fires) fd = Math.min(fd, (f.x - cam.position.x) ** 2 + (f.y - cam.position.y) ** 2 + (f.z - cam.position.z) ** 2);
    A.loop('fire', 'fire', clamp(1 - Math.sqrt(fd) / 22, 0, 1) * 0.55);
  }

  private updateGrade(dt: number, s: SessionView) {
    const g = this.r.grade;
    const me = this.mode === 'battle' && !this.spectating ? this.localKnight() : null;
    this.hurtPulse = Math.max(0, this.hurtPulse - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 1.4);
    let hurt = 0, desat = 0;
    if (me) {
      if (me.alive) hurt = Math.pow(clamp(1 - me.hp / me.maxHp, 0, 1), 1.6) * 0.65 + this.hurtPulse * 0.4;
      else { desat = 0.6; hurt = 0.35; }
    }
    const H = g.u('hurt'), D = g.u('desat'), F = g.u('flash');
    H.value = lerp(H.value as number, hurt, 1 - Math.exp(-dt * 8));
    D.value = lerp(D.value as number, desat, 1 - Math.exp(-dt * 2));
    F.value = this.flash;
    void s;
  }
}

const _v = new THREE.Vector3(), _u = new THREE.Vector3(), _b = new THREE.Vector3(), _k = new THREE.Vector3(), _h = new THREE.Vector3(), _c = new THREE.Vector3();
