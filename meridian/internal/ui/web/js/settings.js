// Settings.
import { h, replace, toast, switchEl } from './util.js';
import { put, post } from './api.js';
import { state, subscribe, refreshSettings } from './state.js';

let root;

export function mountSettings(el) {
  root = el;
  subscribe((what) => { if (what === 'settings' || what === 'locations' || what === 'meta') render(); });
  render();
}

async function save(patch, msg) {
  try {
    state.settings = await put('/api/settings', patch);
    if (msg) toast(msg);
  } catch (e) {
    toast(e.message, true);
  }
  await refreshSettings();
}

function toggle(key, title, desc, msgOn, msgOff) {
  const s = state.settings;
  return h('div', { class: 'set' },
    h('div', { class: 't' }, h('b', null, title), h('span', null, desc)),
    switchEl(s[key], (on) => save({ [key]: on }, on ? msgOn : msgOff), title));
}

function render() {
  if (!root || !state.settings) return;
  const s = state.settings;
  const presets = state.meta?.dnsPresets || [];

  const upstream = h('select', { class: 'input', 'aria-label': 'DNS server' },
    h('option', { value: 'auto', selected: s.dnsUpstream === 'auto' }, 'Automatic'),
    presets.map((p) => h('option', { value: p.id, selected: s.dnsUpstream === p.id }, p.name)),
    h('option', { value: 'custom', selected: s.dnsUpstream === 'custom' }, 'Custom…'));
  const custom = h('input', { class: 'input' + (s.dnsUpstream === 'custom' ? '' : ' hidden'), value: s.customDns || '', placeholder: '9.9.9.9, 149.112.112.112 or https://…/dns-query' });
  upstream.addEventListener('change', () => {
    custom.classList.toggle('hidden', upstream.value !== 'custom');
    if (upstream.value !== 'custom') save({ dnsUpstream: upstream.value }, 'DNS server changed');
  });
  custom.addEventListener('change', () => save({ dnsUpstream: 'custom', customDns: custom.value.trim() }, 'Custom DNS saved'));

  const auto = h('select', { class: 'input', 'aria-label': 'Location to connect to at startup' },
    h('option', { value: '', selected: !s.autoConnectTo }, 'Last used location'),
    state.locations.map((l) => h('option', { value: l.id, selected: s.autoConnectTo === l.id }, l.name)));
  auto.addEventListener('change', () => save({ autoConnectTo: auto.value }));

  const mtu = h('input', { class: 'input', type: 'number', min: 0, max: 1500, value: s.mtu || 0, style: { width: '120px' } });
  mtu.addEventListener('change', () => save({ mtu: parseInt(mtu.value, 10) || 0 }, 'MTU saved; it applies to the next connection'));

  const theme = h('select', { class: 'input', 'aria-label': 'Theme' },
    ['system', 'dark', 'light'].map((t) => h('option', { value: t, selected: (localStorageGet('theme') || 'system') === t }, t[0].toUpperCase() + t.slice(1))));
  theme.addEventListener('change', () => { localStorageSet('theme', theme.value); applyTheme(); });

  replace(root,
    h('div', { class: 'view-head' }, h('div', null, h('h1', null, 'Settings'), h('p', null, 'Changes apply immediately, even while connected.'))),

    h('div', { class: 'set-group' }, h('h2', null, 'Protection'), h('div', { class: 'card' },
      toggle('killSwitch', 'Kill switch', 'Block all internet traffic outside the VPN while connected, so nothing leaks if the connection drops.', 'Kill switch on', 'Kill switch off'),
      toggle('allowLan', 'Allow local network', state.meta?.os === 'windows'
        ? 'Keep printers and file shares reachable. On Windows this works with the kill switch off; with it on, only the VPN is reachable.'
        : 'Keep printers, file shares and casting working while the kill switch is on.', 'Local network allowed', 'Local network blocked'),
      toggle('blockIPv6Leaks', 'Block IPv6 leaks', 'Send IPv6 into the tunnel too, so a location without IPv6 cannot expose your real address.', 'IPv6 leak protection on', 'IPv6 leak protection off'))),

    h('div', { class: 'set-group' }, h('h2', null, 'Connection'), h('div', { class: 'card' },
      toggle('autoConnect', 'Connect when the computer starts', 'The VPN connects in the background before you sign in.', 'Auto-connect on', 'Auto-connect off'),
      h('div', { class: 'set' }, h('div', { class: 't' }, h('b', null, 'Location at startup'), h('span', null, 'Used by auto-connect and the connect button.')), auto),
      toggle('checkExitLocation', 'Verify my location after connecting', 'Ask a "what is my IP" service (through the tunnel) where websites now see you.', 'Location check on', 'Location check off'),
      toggle('showHomeLocation', 'Show my real location when disconnected', 'Looks up your unprotected address so you can compare.', 'On', 'Off'))),

    h('div', { class: 'set-group' }, h('h2', null, 'DNS'), h('div', { class: 'card' },
      h('div', { class: 'set' }, h('div', { class: 't' }, h('b', null, 'DNS server'), h('span', null, 'Where allowed lookups are answered, always through the tunnel. Automatic uses the location\'s own resolver; the encrypted options hide lookups even from the VPN server.')),
        h('div', { style: { display: 'grid', gap: '8px' } }, upstream, custom)),
      toggle('interceptAllDns', 'Filter apps that use their own DNS', 'Also apply the blocker to lookups sent straight to other servers (for example 8.8.8.8).', 'On', 'Off'),
      toggle('blockDoT', 'Block DNS-over-TLS bypass', 'Stop apps from hiding lookups on port 853 so the blocker sees them.', 'On', 'Off'),
      toggle('queryLog', 'Keep an activity log', 'Recent lookups are kept in memory only, never written to disk.', 'Activity log on', 'Activity log off'))),

    h('div', { class: 'set-group' }, h('h2', null, 'Advanced'), h('div', { class: 'card' },
      h('div', { class: 'set' }, h('div', { class: 't' }, h('b', null, 'Tunnel MTU'), h('span', null, '0 uses the config\'s value or 1420. Lower it (for example 1280) if some sites stall.')), mtu),
      h('div', { class: 'set' }, h('div', { class: 't' }, h('b', null, 'Appearance')), theme),
      h('div', { class: 'set' }, h('div', { class: 't' }, h('b', null, 'Flush DNS cache'), h('span', null, 'Forget cached answers, for example after changing hosts.')),
        h('button', { class: 'btn', onclick: async () => { await post('/api/dns/flush'); toast('DNS cache flushed'); } }, 'Flush')))),

    h('div', { class: 'set-group' }, h('h2', null, 'About'), h('div', { class: 'card card-pad' },
      h('p', { style: { margin: 0 } }, h('b', null, 'Meridian VPN '), state.meta?.version || ''),
      h('p', { class: 'muted', style: { marginBottom: 0 } },
        'Built on WireGuard® (wireguard-go). Blocklists by their respective authors: StevenBlack/hosts (MIT), HaGeZi DNS blocklists (GPL-3.0), OISD. Map data from Natural Earth (public domain). WireGuard is a registered trademark of Jason A. Donenfeld.'))));
}

function localStorageGet(k) { try { return localStorage.getItem('meridian-' + k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem('meridian-' + k, v); } catch { /* ignore */ } }

export function applyTheme() {
  const t = localStorageGet('theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
