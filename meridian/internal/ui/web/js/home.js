// Home: the map, the connect button and live statistics.
import { h, icon, replace, flag, bytes, bits, duration, num, toast } from './util.js';
import { post } from './api.js';
import { state, subscribe, countryName, place, locationLabel, currentLocation, isActive } from './state.js';
import { WorldMap } from './map.js';
import { openImport } from './importer.js';
import { pickLocation } from './locations.js';

let root, map, panel, statsEl, emptyEl, timer;

export function mountHome(el) {
  root = el;
  map = new WorldMap({
    countryName,
    onCountry: (cc) => {
      const locs = state.locations.filter((l) => l.country === cc);
      if (locs.length === 1) connect(locs[0].id);
      else pickLocation(connect, cc);
    },
    onPin: (id) => connect(id),
  });
  panel = h('div', { class: 'panel' });
  statsEl = h('div', { class: 'stats' });
  emptyEl = h('div', { class: 'card empty-hero hidden' });
  const hero = h('div', { class: 'hero' }, map.el, panel);
  replace(root, emptyEl, hero, statsEl);
  subscribe(render);
  timer = setInterval(tick, 1000);
  render();
}

export async function connect(id) {
  try {
    await post('/api/connect', id ? { id } : {});
  } catch (e) {
    toast(e.message, true);
  }
}

async function disconnect() {
  try {
    await post('/api/disconnect');
  } catch (e) {
    toast(e.message, true);
  }
}

function headline(st) {
  switch (st?.state) {
    case 'connected': return { cls: 'on', label: 'Protected', ic: 'lock' };
    case 'connecting': return { cls: 'busy', label: 'Connecting…', ic: 'unlock' };
    case 'reconnecting': return { cls: 'busy', label: 'Reconnecting…', ic: 'unlock' };
    case 'disconnecting': return { cls: 'busy', label: 'Disconnecting…', ic: 'unlock' };
    default: return { cls: '', label: 'Not protected', ic: 'unlock' };
  }
}

function render() {
  if (!root) return;
  const st = state.status;
  const active = isActive();
  const loc = active ? state.locations.find((l) => l.id === st.location?.id) || st.location : currentLocation();
  const hasLocations = state.locations.length > 0;

  emptyEl.classList.toggle('hidden', hasLocations);
  if (!hasLocations) {
    replace(emptyEl,
      h('img', { src: 'icon.svg', width: 56, height: 56, alt: '' }),
      h('h2', null, 'Add your first location'),
      h('p', null, 'Meridian moves your digital location to wherever you have a VPN server. Import a WireGuard config from a provider such as Mullvad, Proton VPN or IVPN, or turn a cheap cloud server in any country into your own private location in about two minutes.'),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn primary', onclick: () => openImport('server') }, icon('server'), 'Set up my own server'),
        h('button', { class: 'btn', onclick: () => openImport('file') }, icon('file'), 'Import config files')));
  }

  // Map
  const pins = state.locations.map((l) => ({ ...(place(l) || {}), id: l.id, cc: l.country, label: `${l.name} · ${locationLabel(l)}` }));
  let here = null;
  if (active && st.exit?.lat) here = { lat: st.exit.lat, lon: st.exit.lon, cc: st.exit.countryCode || loc?.country };
  else if (loc) here = place(loc);
  const home = st?.home?.lat ? { lat: st.home.lat, lon: st.home.lon } : null;
  map.update({ pins, here, home, connected: st?.state === 'connected' });

  // Panel
  const hl = headline(st);
  let sub = '';
  if (st?.state === 'connected' && st.exit) sub = `Visible as ${st.exit.ip} · ${[st.exit.city, st.exit.countryCode].filter(Boolean).join(', ')}`;
  else if (st?.state === 'connected') sub = 'Checking your new address…';
  else if (active) sub = `Via ${st.endpoint || 'server'}`;
  else if (st?.home) sub = `Your IP ${st.home.ip} · ${[st.home.city, st.home.countryCode].filter(Boolean).join(', ')} is visible`;
  else sub = 'Your traffic and location are exposed';

  const title = active && loc ? `${loc.name}` : hasLocations ? 'Ready to connect' : 'No locations yet';
  const power = h('button', {
    class: 'power ' + (st?.state === 'connected' ? 'on' : active ? 'busy' : ''),
    'aria-label': active ? 'Disconnect' : 'Connect',
    title: active ? 'Disconnect' : 'Connect',
    disabled: !hasLocations || !state.online,
    onclick: () => (active ? disconnect() : connect(loc?.id)),
  }, icon('power'), st?.state === 'connecting' || st?.state === 'reconnecting' ? h('span', { class: 'ring' }) : null);

  const picker = h('button', { class: 'picker', disabled: !hasLocations, onclick: () => pickLocation(connect) },
    flag(loc?.country),
    h('span', { class: 't' },
      h('b', null, loc ? loc.name : 'Choose a location'),
      h('span', null, loc ? locationLabel(loc) || loc.endpoint || '' : 'Import a config to begin')),
    icon('chev'));

  replace(panel,
    h('div', { class: 'status-line ' + hl.cls }, icon(hl.ic), hl.label),
    h('div', { class: 'headline' }, title),
    h('div', { class: 'subline' }, sub),
    h('div', { class: 'connect-row' }, power, picker),
    st?.warning ? h('div', { class: 'warnbox' }, st.warning) : null,
    st?.error && !active ? h('div', { class: 'errbox' }, st.error) : null);

  renderStats();
}

function renderStats() {
  const st = state.status;
  const active = st?.state === 'connected' || st?.state === 'reconnecting';
  const since = st?.since && new Date(st.since).getFullYear() > 2000 ? new Date(st.since) : null;
  const dns = st?.dns || {};
  const pct = dns.queries ? Math.round((dns.blocked / dns.queries) * 100) : 0;
  const card = (ic, k, v, sub, id) => h('div', { class: 'card stat', id }, h('div', { class: 'k' }, icon(ic), k), h('div', { class: 'v' }, v), h('div', { class: 's' }, sub));
  replace(statsEl,
    card('down', 'Download', active ? bits(st.rxRate) : '—', active ? `${bytes(st.rxBytes)} this session` : 'Not connected'),
    card('up', 'Upload', active ? bits(st.txRate) : '—', active ? `${bytes(st.txBytes)} this session` : 'Not connected'),
    card('clock', 'Connected for', since ? duration(Date.now() - since) : '—', since ? `since ${since.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not connected', 'stat-time'),
    card('shield', 'Ads & trackers blocked', num(dns.blocked), st?.adBlock ? `${pct}% of ${num(dns.queries)} lookups · ${num(st?.totals?.blocked)} all time` : 'Ad blocker is off'));
}

function tick() {
  const el = document.querySelector('#stat-time .v');
  const st = state.status;
  if (el && st?.since && new Date(st.since).getFullYear() > 2000 && isActive()) {
    el.textContent = duration(Date.now() - new Date(st.since));
  }
}

export function unmountHome() { clearInterval(timer); }
