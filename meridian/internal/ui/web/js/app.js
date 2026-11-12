// Meridian app: routing, the live status stream and view setup.
import { h, replace, closeMenus } from './util.js';
import { get, stream, token } from './api.js';
import { state, emit, loadRegions, refreshLocations, refreshSettings } from './state.js';
import { mountHome } from './home.js';
import { mountLocations } from './locations.js';
import { mountAdblock, showAdblock, hideAdblock } from './adblock.js';
import { mountSettings, applyTheme } from './settings.js';

const VIEWS = ['home', 'locations', 'adblock', 'settings'];

function route() {
  const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
  for (const el of document.querySelectorAll('.view')) el.classList.toggle('active', el.dataset.view === v);
  for (const el of document.querySelectorAll('.nav-item')) {
    el.classList.toggle('active', el.dataset.view === v);
    if (el.dataset.view === v) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  }
  if (v === 'adblock') showAdblock(); else hideAdblock();
  closeMenus();
}

function setOnline(on) {
  state.online = on;
  const svc = document.getElementById('svc-status');
  svc.className = 'svc ' + (on ? 'ok' : 'err');
  replace(svc, h('span', { class: 'dot' }), h('span', null, on ? `Service running ${state.meta?.version || ''}` : 'Service not running'));
  const banner = document.getElementById('banner');
  banner.classList.toggle('hidden', on);
  if (!on) banner.textContent = 'Cannot reach the Meridian service. It may be starting, or it stopped. Reopen Meridian, or restart the "Meridian" service.';
  emit('online');
}

let lastLocCount = -1;
function onStatus(st) {
  const prev = state.status;
  state.status = st;
  if (st.locations !== lastLocCount) {
    lastLocCount = st.locations;
    refreshLocations().catch(() => {});
  } else if (prev && prev.exit?.ip !== st.exit?.ip) {
    refreshLocations().catch(() => {}); // the exit check may have placed a location
  }
  document.title = st.state === 'connected' && st.location ? `Meridian · ${st.location.name}` : 'Meridian VPN';
  emit('status');
}

async function start() {
  applyTheme();
  if (!token) {
    replace(document.getElementById('main'), h('div', { class: 'view active' }, h('div', { class: 'card empty-hero' },
      h('img', { src: 'icon.svg', width: 56, height: 56, alt: '' }),
      h('h2', null, 'Open Meridian from its app icon'),
      h('p', null, 'This page needs the access key that the Meridian app passes when it opens. Close this tab and start Meridian from your applications menu, or run "meridian url" in a terminal.'))));
    return;
  }
  try {
    await loadRegions();
    state.meta = await get('/api/meta');
    await Promise.all([refreshLocations(), refreshSettings()]);
    emit('meta');
  } catch (e) {
    setOnline(false);
  }
  mountHome(document.getElementById('view-home'));
  mountLocations(document.getElementById('view-locations'));
  mountAdblock(document.getElementById('view-adblock'));
  mountSettings(document.getElementById('view-settings'));
  window.addEventListener('hashchange', route);
  route();
  stream('/api/events', (ev, data) => { if (ev === 'status') onStatus(data); }, async (on) => {
    if (on && !state.meta) {
      try { state.meta = await get('/api/meta'); await Promise.all([refreshLocations(), refreshSettings()]); emit('meta'); } catch { /* retry on next event */ }
    }
    setOnline(on);
  });
}

start();
