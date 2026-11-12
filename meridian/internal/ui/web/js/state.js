// Shared app state with a tiny publish/subscribe mechanism.
import { get } from './api.js';

export const state = {
  online: false,
  status: null,
  locations: [],
  settings: null,
  meta: null,
  countries: [],
  cities: [],
  byCode: new Map(),
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(what) { for (const fn of listeners) fn(what); }

export function countryName(cc) {
  return state.byCode.get((cc || '').toUpperCase())?.name || (cc ? cc.toUpperCase() : 'Unknown location');
}

// Where to draw a location on the map: its city if known, else its
// country, else wherever its exit address was seen.
export function place(loc) {
  if (!loc) return null;
  const cc = (loc.country || '').toUpperCase();
  if (loc.city) {
    const c = state.cities.find((x) => x.country === cc && x.name.toLowerCase() === loc.city.toLowerCase());
    if (c) return { lat: c.lat, lon: c.lon, cc };
  }
  if (loc.exit && loc.exit.lat && loc.exit.countryCode === cc) return { lat: loc.exit.lat, lon: loc.exit.lon, cc };
  const country = state.byCode.get(cc);
  if (country && country.lat !== undefined) return { lat: country.lat, lon: country.lon, cc };
  return null;
}

export function locationLabel(loc) {
  if (!loc) return '';
  const parts = [];
  if (loc.city && loc.city !== loc.name) parts.push(loc.city);
  if (loc.country) parts.push(countryName(loc.country));
  return parts.join(', ');
}

export async function loadRegions() {
  const r = await fetch('regions.json').then((x) => x.json());
  state.countries = r.countries;
  state.cities = r.cities;
  state.byCode = new Map(r.countries.map((c) => [c.code, c]));
}

export async function refreshLocations() {
  state.locations = await get('/api/locations');
  emit('locations');
}

export async function refreshSettings() {
  state.settings = await get('/api/settings');
  emit('settings');
}

export function currentLocation() {
  const id = state.status?.location?.id || state.status?.lastUsed;
  return state.locations.find((l) => l.id === id) || state.locations[0] || null;
}

export function isActive() {
  const st = state.status?.state;
  return st === 'connected' || st === 'connecting' || st === 'reconnecting';
}
