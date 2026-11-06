// Player preferences, remembered between visits (localStorage can be unavailable: every
// access is guarded and the defaults always work).

import type { GfxSettings, Quality } from './render/renderer';
import type { ClassId } from '../shared/data/classes';
import { DEFAULT_SETTINGS, type MatchSettings } from '../shared/types';
import { DEFAULT_BINDINGS, type Bindings } from './input';

export interface Prefs {
  name: string;
  gfx: GfxSettings;
  sensitivity: number;
  invertY: boolean;
  volumes: { master: number; sfx: number; music: number; ambience: number };
  blood: boolean;
  damageNumbers: boolean;
  nameplates: boolean;
  firstPerson: boolean;
  lastClass: ClassId;
  lastTeam: 0 | 1 | -1;
  match: MatchSettings;
  server: string;
  bindings: Bindings;
}

const KEY = 'rose-and-ruin.prefs.v1';

function defaultQuality(): Quality {
  // a conservative guess from the hardware; the player can raise it in Settings
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (mobile) return 0;
  return cores >= 8 ? 2 : 1;
}

export function defaultPrefs(): Prefs {
  const q = defaultQuality();
  return {
    name: '',
    gfx: { quality: q, renderScale: 1, ao: q >= 1, bloom: true, fov: 70, shadowQuality: q },
    sensitivity: 1,
    invertY: false,
    volumes: { master: 0.8, sfx: 1, music: 0.5, ambience: 0.7 },
    blood: true,
    damageNumbers: true,
    nameplates: true,
    firstPerson: false,
    lastClass: 'manatarms',
    lastTeam: -1,
    match: { ...DEFAULT_SETTINGS },
    server: '',
    bindings: { ...DEFAULT_BINDINGS },
  };
}

export function loadPrefs(): Prefs {
  const d = defaultPrefs();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      ...d, ...p,
      gfx: { ...d.gfx, ...(p.gfx ?? {}) },
      volumes: { ...d.volumes, ...(p.volumes ?? {}) },
      match: { ...d.match, ...(p.match ?? {}) },
      bindings: { ...d.bindings, ...(p.bindings ?? {}) },
    };
  } catch {
    return d;
  }
}

export function savePrefs(p: Prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}
