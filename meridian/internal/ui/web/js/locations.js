// Locations: the saved servers, grouped by country.
import { h, icon, replace, flag, toast, menu, ago, copy } from './util.js';
import { get, patch, del, token } from './api.js';
import { state, subscribe, countryName, refreshLocations, isActive } from './state.js';
import { openImport } from './importer.js';
import { openModal, closeModal } from './modal.js';
import { connect } from './home.js';

let root, listEl, query = '';

export function mountLocations(el) {
  root = el;
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search countries, cities, providers…', 'aria-label': 'Search locations' });
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); render(); });
  listEl = h('div');
  replace(root,
    h('div', { class: 'view-head' },
      h('div', null, h('h1', null, 'Locations'), h('p', null, 'Each location is a VPN server. Connecting makes websites see you there.')),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => openImport('server') }, icon('server'), 'Set up a server'),
        h('button', { class: 'btn primary', onclick: () => openImport('file') }, icon('plus'), 'Add location'))),
    h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search'), search)),
    listEl);
  subscribe((what) => { if (what !== 'adblock') render(); });
  render();
}

function matches(l) {
  if (!query) return true;
  return [l.name, l.city, l.country, countryName(l.country), l.provider, l.endpoint].join(' ').toLowerCase().includes(query);
}

export function groupByCountry(locs) {
  const groups = new Map();
  for (const l of locs) {
    const key = l.favorite ? '★' : l.country || '?';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  return [...groups.entries()];
}

function render() {
  if (!listEl) return;
  const locs = state.locations.filter(matches);
  if (!state.locations.length) {
    replace(listEl, h('div', { class: 'card empty-hero' },
      h('h2', null, 'No locations yet'),
      h('p', null, 'Import WireGuard config files (.conf or a .zip of them) from your VPN provider, or set up your own server in any country.'),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn primary', onclick: () => openImport('file') }, icon('plus'), 'Import configs'),
        h('button', { class: 'btn', onclick: () => openImport('server') }, icon('server'), 'Set up a server'))));
    return;
  }
  if (!locs.length) {
    replace(listEl, h('p', { class: 'muted' }, `No location matches “${query}”.`));
    return;
  }
  replace(listEl, groupByCountry(locs).map(([key, items]) => h('div', { class: 'group' },
    h('div', { class: 'group-head' },
      key === '★' ? icon('star') : flag(key),
      key === '★' ? 'Favorites' : key === '?' ? 'Unknown country' : countryName(key),
      h('span', { class: 'count' }, `${items.length}`)),
    h('div', { class: 'card list-card' }, items.map(row)))));
}

function row(l) {
  const st = state.status;
  const current = isActive() && st?.location?.id === l.id;
  const chips = [];
  if (l.provider) chips.push(h('span', { class: 'chip' }, l.provider));
  if (l.ipv6) chips.push(h('span', { class: 'chip' }, 'IPv6'));
  if (!l.fullTunnel) chips.push(h('span', { class: 'chip warn', title: 'This config only routes some traffic, so it cannot change your location.' }, 'Split tunnel'));
  if (l.placeFrom === 'filename' || l.placeFrom === 'endpoint') chips.push(h('span', { class: 'chip', title: 'Guessed from the file name; confirmed after the first connection' }, 'Place guessed'));
  const more = h('button', { class: 'icon-btn', 'aria-label': `More actions for ${l.name}` }, icon('more'));
  more.addEventListener('click', (e) => { e.stopPropagation(); locationMenu(more, l); });
  const star = h('button', { class: 'icon-btn' + (l.favorite ? ' on' : ''), 'aria-label': l.favorite ? 'Remove from favorites' : 'Add to favorites', title: 'Favorite' }, icon(l.favorite ? 'star' : 'star-o'));
  star.addEventListener('click', async () => {
    try { await patch(`/api/locations/${l.id}`, { favorite: !l.favorite }); await refreshLocations(); } catch (e) { toast(e.message, true); }
  });
  const exit = l.exit ? `Last seen as ${l.exit.ip}${l.exit.city ? ' in ' + l.exit.city : ''}` : '';
  return h('div', { class: 'loc' + (current ? ' current' : '') },
    flag(l.country),
    h('div', { class: 't' },
      h('b', null, l.name),
      h('span', null, [l.city && l.city !== l.name ? l.city : null, l.endpoint, l.lastUsed && new Date(l.lastUsed).getFullYear() > 2000 ? `used ${ago(l.lastUsed)}` : null].filter(Boolean).join(' · ')),
      exit ? h('div', null, h('span', null, exit)) : null),
    h('div', { class: 'meta' }, chips),
    star,
    current
      ? h('span', { class: 'chip ok' }, icon('check', 'ic'), st.state === 'connected' ? 'Connected' : 'Connecting')
      : h('button', { class: 'btn small primary', onclick: () => connect(l.id) }, 'Connect'),
    more);
}

function locationMenu(anchor, l) {
  menu(anchor, [
    { label: 'Rename', icon: 'file', run: () => rename(l) },
    { label: 'Change country or city', icon: 'pin', run: () => editPlace(l) },
    { label: 'Show QR code for phone', icon: 'qr', run: () => showQR(l) },
    { label: 'Copy config', icon: 'copy', run: async () => copy(await fetchConfig(l)) },
    { label: 'Download config', icon: 'down', run: async () => download(l) },
    { label: 'Remove', icon: 'x', danger: true, run: () => remove(l) },
  ]);
}

async function fetchConfig(l) {
  const res = await fetch(`/api/locations/${l.id}/config`, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error('Could not read the config');
  return res.text();
}

async function download(l) {
  try {
    const text = await fetchConfig(l);
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: (l.name || 'meridian').replace(/[^\w.-]+/g, '-') + '.conf' });
    document.body.append(a);
    a.click();
    a.remove();
  } catch (e) { toast(e.message, true); }
}

function rename(l) {
  const input = h('input', { class: 'input', value: l.name, maxlength: 60 });
  openModal('Rename location', [h('label', { class: 'f' }, 'Name', input)], [
    h('button', { class: 'btn', onclick: closeModal }, 'Cancel'),
    h('button', { class: 'btn primary', onclick: async () => {
      try { await patch(`/api/locations/${l.id}`, { name: input.value }); closeModal(); await refreshLocations(); } catch (e) { toast(e.message, true); }
    } }, 'Save'),
  ]);
  setTimeout(() => input.select(), 50);
}

export function countrySelect(value) {
  const sel = h('select', { class: 'input' }, h('option', { value: '' }, 'Unknown'),
    state.countries.map((c) => h('option', { value: c.code, selected: c.code === value }, c.name)));
  return sel;
}

function editPlace(l) {
  const sel = countrySelect(l.country);
  const city = h('input', { class: 'input', value: l.city || '', placeholder: 'City (optional)', list: 'city-list' });
  const dl = h('datalist', { id: 'city-list' }, state.cities.map((c) => h('option', { value: c.name }, countryName(c.country))));
  openModal('Where is this server?', [
    h('p', { class: 'muted' }, 'Meridian also checks this automatically each time you connect.'),
    h('div', { class: 'form-grid' }, h('label', { class: 'f full' }, 'Country', sel), h('label', { class: 'f full' }, 'City', city, dl)),
  ], [
    h('button', { class: 'btn', onclick: closeModal }, 'Cancel'),
    h('button', { class: 'btn primary', onclick: async () => {
      try { await patch(`/api/locations/${l.id}`, { country: sel.value, city: city.value }); closeModal(); await refreshLocations(); } catch (e) { toast(e.message, true); }
    } }, 'Save'),
  ]);
}

async function showQR(l) {
  try {
    const res = await fetch(`/api/locations/${l.id}/qr.svg`, { headers: { Authorization: 'Bearer ' + token } });
    const url = URL.createObjectURL(await res.blob());
    openModal(`Use ${l.name} on your phone`, [
      h('p', { class: 'muted' }, 'Install the free WireGuard app on iPhone or Android, tap +, choose "Scan from QR code" and point the camera here. If this is your own Meridian server, ads are blocked on the phone too.'),
      h('div', { class: 'qr' }, h('img', { src: url, alt: 'QR code with the WireGuard configuration' })),
      h('p', { class: 'muted', style: { fontSize: '12.5px' } }, 'This code contains the private key for this location. Only show it to devices you own. A phone and a computer should not use the same config at the same time.'),
    ], [h('button', { class: 'btn', onclick: closeModal }, 'Done')]);
  } catch (e) { toast(e.message, true); }
}

function remove(l) {
  openModal(`Remove ${l.name}?`, [h('p', { class: 'muted' }, 'The config is deleted from this computer. You can import it again later.')], [
    h('button', { class: 'btn', onclick: closeModal }, 'Cancel'),
    h('button', { class: 'btn primary', onclick: async () => {
      try { await del(`/api/locations/${l.id}`); closeModal(); await refreshLocations(); toast('Location removed'); } catch (e) { toast(e.message, true); }
    } }, 'Remove'),
  ]);
}

// pickLocation opens a searchable list; cb receives the chosen ID.
export function pickLocation(cb, country) {
  let q = '';
  const list = h('div', { class: 'pick-list' });
  const draw = () => {
    const items = state.locations.filter((l) => (!country || l.country === country) &&
      (!q || [l.name, l.city, countryName(l.country), l.provider].join(' ').toLowerCase().includes(q)));
    replace(list, items.length ? items.map((l) => h('button', {
      class: 'loc', style: { width: '100%', border: '0', background: 'transparent', textAlign: 'left', cursor: 'pointer', color: 'inherit' },
      onclick: () => { closeModal(); cb(l.id); },
    }, flag(l.country), h('div', { class: 't' }, h('b', null, l.name), h('span', null, [l.city !== l.name ? l.city : '', countryName(l.country), l.provider].filter(Boolean).join(' · '))),
    l.favorite ? icon('star') : null, icon('chev'))) : h('p', { class: 'muted', style: { padding: '12px' } }, 'Nothing matches.'));
  };
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search…', 'aria-label': 'Search locations' });
  search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); draw(); });
  draw();
  openModal(country ? `Locations in ${countryName(country)}` : 'Choose a location', [h('div', { class: 'search' }, icon('search'), search), list], [
    h('button', { class: 'btn', onclick: () => { closeModal(); openImport('file'); } }, icon('plus'), 'Add location'),
    h('button', { class: 'btn', onclick: closeModal }, 'Close'),
  ]);
  setTimeout(() => search.focus(), 50);
}
