import type { BuiltMap, MapDef } from '../mapgen';
import { MapBuilder } from '../mapgen';
import { bodiam } from './bodiam';
import { harlech } from './harlech';
import { bamburgh } from './bamburgh';
import { tower } from './tower';
import { warwick } from './warwick';
import { conwy } from './conwy';
import { kenilworth } from './kenilworth';
import { ludlow } from './ludlow';
import { middleham } from './middleham';
import { raglan } from './raglan';
import { alnwick } from './alnwick';
import { dunstanburgh } from './dunstanburgh';
import { pembroke } from './pembroke';
import { caister } from './caister';
import { pontefract } from './pontefract';
import { ARENAS } from './arenas';
import { hohenzollern } from './hohenzollern';
import { carregcennen } from './carregcennen';
import { hedingham } from './hedingham';
import { tattershall } from './tattershall';
import { skipton } from './skipton';

export const MAPS: MapDef[] = [bodiam, harlech, bamburgh, tower, warwick, conwy, kenilworth, ludlow, middleham, raglan, alnwick, dunstanburgh, pembroke, caister, pontefract, hohenzollern, carregcennen, hedingham, tattershall, skipton, ...ARENAS];
/** the castles, for every manner of battle but single combat */
export const CASTLES: MapDef[] = MAPS.filter((m) => !m.arena);
/** the arenas, for single combat alone */
export const ARENA_MAPS: MapDef[] = MAPS.filter((m) => !!m.arena);
/** a map that suits the manner of battle (single combat needs an arena, the rest a castle) */
export function mapForMode(mapId: string, mode: string): string {
  const list = mode === 'duel' ? ARENA_MAPS : CASTLES;
  return list.some((m) => m.id === mapId) ? mapId : list[0].id;
}

export function getMap(id: string): MapDef {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}

const cache = new Map<string, BuiltMap>();

/** Build (or fetch the cached) static world for a map. Deterministic. */
export function buildMap(id: string): BuiltMap {
  const hit = cache.get(id);
  if (hit) return hit;
  const def = getMap(id);
  const b = new MapBuilder(def.id);
  def.build(b);
  const built = b.build(def);
  cache.set(id, built);
  return built;
}
