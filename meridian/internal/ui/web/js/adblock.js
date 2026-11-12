// Ad blocker: on/off, statistics, live log, lists and custom rules.
import { h, icon, replace, toast, num, clock, ago, switchEl, debounce } from './util.js';
import { get, post, put } from './api.js';
import { state, refreshSettings, emit } from './state.js';

let root, data = null, poll = null, filter = 'all', search = '';
let headEl, statsEl, topEl, logEl, listsEl, rulesEl;

export function mountAdblock(el) {
  root = el;
  headEl = h('div', { class: 'card ab-head' });
  statsEl = h('div', { class: 'stats' });
  topEl = h('div', { class: 'card card-pad' });
  logEl = h('div', { class: 'card card-pad' });
  listsEl = h('div', { class: 'mt' });
  rulesEl = h('div', { class: 'grid2' });
  replace(root, headEl, statsEl, h('div', { class: 'grid2' }, topEl, logEl), listsEl, rulesEl);
}

export function showAdblock() {
  load();
  clearInterval(poll);
  poll = setInterval(load, 2000);
}

export function hideAdblock() { clearInterval(poll); poll = null; }

async function load() {
  try {
    data = await get('/api/adblock?limit=200');
    render();
  } catch { /* the banner shows connectivity problems */ }
}

async function setEnabled(on) {
  try {
    await put('/api/settings', { adBlock: on });
    await refreshSettings();
    await load();
    toast(on ? 'Ad blocker on' : 'Ad blocker off');
  } catch (e) { toast(e.message, true); }
}

async function rule(action, domain) {
  try {
    data = await post('/api/adblock/rules', { action, domain });
    render();
    const msg = { allow: `${domain} is always allowed`, block: `${domain} is now blocked`, unallow: 'Allow rule removed', unblock: 'Block rule removed' }[action];
    toast(msg);
  } catch (e) { toast(e.message, true); }
}

function render() {
  if (!data || !root) return;
  const on = data.enabled;
  replace(headEl,
    h('div', { class: 'shield' + (on ? '' : ' off') }, icon('shield')),
    h('div', { class: 't' },
      h('h1', null, 'Ad & tracker blocker'),
      h('p', null, on
        ? `Blocking ${num(data.rules)} ad, tracker and malware domains for every app on this computer${data.running ? '' : ' (starts when you connect)'}.`
        : 'Off. Turn it on to block ads and trackers in every app, not just the browser.')),
    switchEl(on, setEnabled, 'Ad blocker', true));

  const st = data.stats, tot = data.totals;
  const pct = st.queries ? (st.blocked / st.queries) * 100 : 0;
  const card = (k, v, s, bar) => h('div', { class: 'card stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), h('div', { class: 's' }, s),
    bar !== undefined ? h('div', { class: 'bar' }, h('i', { style: { width: Math.min(100, bar).toFixed(1) + '%' } })) : null);
  replace(statsEl,
    card('Blocked this session', num(st.blocked), `of ${num(st.queries)} lookups`, pct),
    card('Share blocked', `${pct.toFixed(pct < 10 ? 1 : 0)}%`, 'of all DNS lookups'),
    card('Blocked all time', num(tot.blocked), `${num(tot.queries)} lookups filtered`),
    card('Answered from cache', num(st.cached), 'faster browsing, fewer lookups'));

  replace(topEl,
    h('h2', null, 'Most blocked'),
    h('p', null, 'The domains your apps tried to reach most often this session.'),
    data.top.length ? data.top.map((t) => h('div', { class: 'top-row' },
      h('span', { class: 'd', title: t.domain }, t.domain),
      h('span', { class: 'n' }, num(t.count)),
      h('button', { class: 'btn small ghost', onclick: () => rule('allow', t.domain), title: 'Always allow this domain' }, 'Allow')))
      : h('p', { class: 'muted' }, data.running ? 'Nothing blocked yet.' : 'Connect to start blocking.'));

  renderLog();
  renderLists();
  renderRules();
}

function renderLog() {
  const fbtn = (k, label) => h('button', { class: 'btn small' + (filter === k ? ' primary' : ''), onclick: () => { filter = k; renderLog(); } }, label);
  const input = h('input', { class: 'input', type: 'search', placeholder: 'Filter domains', value: search, style: { height: '30px', width: '160px' }, 'aria-label': 'Filter the activity log' });
  input.addEventListener('input', debounce(() => { search = input.value.trim().toLowerCase(); renderLog(); input.focus(); }, 250));
  const items = (data.recent || []).filter((e) => (filter === 'all' || (filter === 'blocked') === e.blocked) && (!search || e.domain.includes(search)));
  replace(logEl,
    h('div', { class: 'row', style: { marginBottom: '8px', flexWrap: 'wrap' } },
      h('h2', { style: { margin: 0 } }, 'Live activity'), h('span', { class: 'spacer' }),
      fbtn('all', 'All'), fbtn('blocked', 'Blocked'), fbtn('allowed', 'Allowed'), input),
    h('div', { class: 'log' }, items.length ? items.map((e) => h('div', { class: 'log-row' },
      h('span', { class: 'time' }, clock(e.time)),
      h('span', { class: 'dom', title: e.domain },
        e.domain,
        h('span', { class: 'why' }, e.blocked ? `${e.list || 'blocked'}${e.via ? ' · via ' + e.via : ''}` : [e.type, e.cached ? 'cached' : `${e.ms} ms`, e.direct ? 'sent to ' + e.direct : '', e.failed ? 'no answer' : ''].filter(Boolean).join(' · '))),
      e.blocked ? h('span', { class: 'chip bad' }, 'Blocked') : h('span', { class: 'chip' }, e.failed ? 'Failed' : 'Allowed'),
      h('button', { class: 'btn small ghost act', onclick: () => rule(e.blocked ? 'allow' : 'block', e.domain) }, e.blocked ? 'Allow' : 'Block')))
      : h('p', { class: 'muted' }, data.running ? (state.settings?.queryLog === false ? 'The activity log is off in Settings.' : 'No lookups yet.') : 'Connect to see what your apps look up.')));
}

function renderLists() {
  const cats = [
    ['ads', 'Ads and trackers'], ['privacy', 'Privacy and telemetry'], ['security', 'Security'],
    ['content', 'Content filters'], ['custom', 'Your lists'],
  ];
  const toggle = async (id, on) => {
    const enabled = new Set(data.lists.filter((l) => l.enabled).map((l) => l.id));
    on ? enabled.add(id) : enabled.delete(id);
    const custom = data.lists.filter((l) => l.custom);
    try {
      data = await put('/api/adblock/lists', { enabled: [...enabled], customUrls: custom });
      render();
    } catch (e) { toast(e.message, true); }
  };
  const update = h('button', { class: 'btn small', onclick: async () => { try { data = await post('/api/adblock/update'); render(); toast('Updating lists…'); } catch (e) { toast(e.message, true); } } }, icon('refresh'), 'Update now');
  const addUrl = h('input', { class: 'input', placeholder: 'https://example.com/blocklist.txt (hosts, domains or AdBlock format)' });
  const add = h('button', { class: 'btn', onclick: async () => {
    const url = addUrl.value.trim();
    if (!url) return;
    const custom = data.lists.filter((l) => l.custom).concat([{ url, name: url.replace(/^https?:\/\//, '').slice(0, 60) }]);
    const enabled = data.lists.filter((l) => l.enabled).map((l) => l.id);
    try {
      data = await put('/api/adblock/lists', { enabled, customUrls: custom });
      const added = data.lists.find((l) => l.custom && l.url === url);
      if (added) data = await put('/api/adblock/lists', { enabled: enabled.concat([added.id]), customUrls: data.lists.filter((l) => l.custom) });
      addUrl.value = '';
      render();
      toast('List added; downloading…');
    } catch (e) { toast(e.message, true); }
  } }, icon('plus'), 'Add list');

  replace(listsEl,
    h('div', { class: 'view-head', style: { marginTop: '22px' } },
      h('div', null, h('h1', { style: { fontSize: '18px' } }, 'Blocklists'), h('p', null, 'Lists download once and refresh automatically every day.')),
      update),
    cats.map(([cat, label]) => {
      const items = data.lists.filter((l) => l.category === cat);
      if (!items.length && cat !== 'custom') return null;
      return h('div', null, h('div', { class: 'cat' }, label),
        h('div', { class: 'lists' }, items.map((l) => h('div', { class: 'card list-item' },
          h('div', { class: 't' },
            h('b', null, l.name, l.large ? h('span', { class: 'chip warn', style: { marginLeft: '8px' } }, 'Large') : null),
            l.description ? h('p', null, l.description) : null,
            h('small', null, l.error ? h('span', { style: { color: 'var(--red)' } }, l.error)
              : l.downloading ? 'Downloading…'
                : l.enabled ? `${num(l.rules)} rules${l.url ? ' · updated ' + ago(l.updated) : ' · built in'}` : l.url ? 'Off' : 'Built in')),
          switchEl(l.enabled, (on) => toggle(l.id, on), l.name)))),
        cat === 'custom' ? h('div', { class: 'add-row' }, addUrl, add) : null);
    }));
}

function renderRules() {
  const box = (title, desc, list, action, removeAction, placeholder) => {
    const input = h('input', { class: 'input', placeholder });
    const submit = () => { const d = input.value.trim(); if (d) rule(action, d); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    return h('div', { class: 'card card-pad' },
      h('h2', null, title), h('p', null, desc),
      h('div', { class: 'add-row' }, input, h('button', { class: 'btn', onclick: submit }, icon('plus'), 'Add')),
      h('div', { class: 'rules' }, list.length ? list.map((d) => h('span', { class: 'rule' }, d,
        h('button', { 'aria-label': `Remove ${d}`, onclick: () => rule(removeAction, d) }, icon('x')))) : h('span', { class: 'muted', style: { fontSize: '13px' } }, 'None yet.')));
  };
  replace(rulesEl,
    box('Always allow', 'Sites that break because of blocking. Subdomains are included.', data.allow || [], 'allow', 'unallow', 'e.g. ads.example.com'),
    box('Always block', 'Extra domains to block everywhere. Subdomains are included.', data.block || [], 'block', 'unblock', 'e.g. tracker.example.com'));
}

export function adblockEmitter() { emit('adblock'); }
