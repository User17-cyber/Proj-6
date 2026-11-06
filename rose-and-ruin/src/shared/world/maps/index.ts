import type { BuiltMap, MapDef } from '../mapgen';
import { MapBuilder } from '../mapgen';
import { bodiam } from './bodiam';
import { harlech } from './harlech';
import { bamburgh } from './bamburgh';
import { tower } from './tower';
import { warwick } from './warwick';

export const MAPS: MapDef[] = [bodiam, harlech, bamburgh, tower, warwick];

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
