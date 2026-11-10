// Player preferences, remembered between visits (localStorage can be unavailable: every
// access is guarded and the defaults always work).

import type { GfxSettings, Quality } from './render/renderer';
import type { ClassId } from '../shared/data/classes';
import { DEFAULT_SETTINGS, type MatchSettings } from '../shared/types';
import { BIND_ACTIONS, DEFAULT_BINDINGS, type Bindings, type CustomBind } from './input';

export interface Prefs {
  name: string;
  gfx: GfxSettings;
  sensitivity: number;
  invertY: boolean;
  volumes: { master: number; sfx: number; music: number; ambience: number };
  blood: boolean;
  /** 0 off, 1 standard, 2 brutal: decapitation, arterial spray, spreading pools, heavier gore */
  gore: 0 | 1 | 2;
  /** a moment of slow motion on your heaviest killing blows (single player) */
  slowmo: boolean;
  /** renown earned in battle; unlocks the renowned orders */
  renown: number;
  /** preferred mustering place per castle and house: index into its spawn zones (-1 nearest the fighting) */
  spawnPref: Record<string, number>;
  damageNumbers: boolean;
  nameplates: boolean;
  firstPerson: boolean;
  lastClass: ClassId;
  lastTeam: 0 | 1 | -1;
  match: MatchSettings;
  server: string;
  bindings: Bindings;
  /** the player's own extra keybinds */
  customBinds: CustomBind[];
}

const KEY = 'rose-and-ruin.prefs.v1';

/** The GPU's name, where the browser reveals it. */
function gpuName(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch { return ''; }
}

function defaultQuality(): Quality {
  // a conservative guess from the hardware; the player can raise it in Settings
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (mobile) return 0;
  const gpu = gpuName();
  // integrated and software renderers start at Medium; known discrete cards at High
  if (/SwiftShader|llvmpipe|Software/i.test(gpu)) return 0;
  if (/Apple/i.test(gpu)) return /Pro|Max|Ultra/i.test(gpu) ? 2 : 1;
  if (/Intel|UHD|Iris|Mali|Adreno|PowerVR|Vega \d|Radeon\(TM\) Graphics/i.test(gpu)) return 1;
  if (/RTX|GTX|Radeon RX|Radeon Pro|Arc A/i.test(gpu)) return 2;
  return cores >= 8 ? 2 : 1;
}

export function defaultPrefs(): Prefs {
  const q = defaultQuality();
  return {
    name: '',
    gfx: { quality: q, renderScale: 1, ao: q >= 1, bloom: true, fov: 70, shadowQuality: q, adaptive: true, colour: 2 },
    sensitivity: 1,
    invertY: false,
    volumes: { master: 0.8, sfx: 1, music: 0.5, ambience: 0.7 },
    blood: true,
    gore: 2,
    slowmo: true,
    renown: 0,
    spawnPref: {},
    damageNumbers: true,
    nameplates: true,
    firstPerson: false,
    lastClass: 'manatarms',
    lastTeam: -1,
    match: { ...DEFAULT_SETTINGS },
    server: '',
    bindings: { ...DEFAULT_BINDINGS },
    customBinds: [],
  };
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultPrefs();
    return normalizePrefs(JSON.parse(raw) as Partial<Prefs>);
  } catch {
    return defaultPrefs();
  }
}

/** Fill in and sanitise stored settings (from this browser or from a save file). */
export function normalizePrefs(p: Partial<Prefs>): Prefs {
  const d = defaultPrefs();
  try {
    return {
      ...d, ...p,
      gfx: { ...d.gfx, ...(p.gfx ?? {}) },
      volumes: { ...d.volumes, ...(p.volumes ?? {}) },
      match: { ...d.match, ...(p.match ?? {}) },
      bindings: { ...d.bindings, ...(p.bindings ?? {}) },
      renown: Math.max(0, Math.floor(Number(p.renown) || 0)),
      spawnPref: typeof p.spawnPref === 'object' && p.spawnPref ? p.spawnPref : {},
      gore: p.gore === 0 || p.gore === 1 || p.gore === 2 ? p.gore : p.blood === false ? 0 : 2,
      customBinds: Array.isArray(p.customBinds) ? p.customBinds.filter((c) => c && typeof c.code === 'string' && c.code !== '' && BIND_ACTIONS.some(([a]) => a === c.action)) : [],
    };
  } catch {
    return d;
  }
}

// ----------------------------------------------------------------------------- save files
// Progress lives in this browser's storage, which is tied to where the game is opened from: a
// fresh download, another folder or browser, or the online page each begin anew. A save file
// (or the same thing as a code to paste) carries it from one to another.

const SAVE_ID = 'rose-and-ruin-save';

/** The save as text: everything kept in Settings, the armoury and the renown earned. */
export function exportSave(p: Prefs): string {
  return JSON.stringify({ game: SAVE_ID, version: 1, saved: new Date().toISOString(), prefs: p }, null, 1);
}
/** The same save as one line to copy and paste. */
export function exportCode(p: Prefs): string {
  return 'RR1:' + btoa(unescape(encodeURIComponent(exportSave(p))));
}

/**
 * Read a save file's text or a save code. The renown kept is the greater of the save's and the
 * current one, so loading an older save never loses progress. Returns null if it is not a save.
 */
export function importSave(text: string, current: Prefs): Prefs | null {
  let raw = text.trim();
  try {
    if (raw.startsWith('RR1:')) raw = decodeURIComponent(escape(atob(raw.slice(4).replace(/\s+/g, ''))));
    const o = JSON.parse(raw) as { game?: string; prefs?: Partial<Prefs> };
    if (o.game !== SAVE_ID || !o.prefs || typeof o.prefs !== 'object') return null;
    const p = normalizePrefs(o.prefs);
    p.renown = Math.max(p.renown, current.renown);
    syncGore(p);
    return p;
  } catch {
    return null;
  }
}

/** Blood follows the gore level. */
export function syncGore(p: Prefs) { p.blood = p.gore > 0; }

export function savePrefs(p: Prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}
