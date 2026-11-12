// Small DOM and formatting helpers.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

const SVGNS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k) el.append(k);
  return el;
}

export function icon(name, cls = 'ic') {
  const svg = s('svg', { class: cls, 'aria-hidden': 'true' });
  svg.append(s('use', { href: '#i-' + name }));
  return svg;
}

export function replace(el, ...kids) {
  el.replaceChildren();
  append(el, kids);
}

export function bytes(n, perSecond = false) {
  if (!n || n < 0) n = 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
  const v = i === 0 ? Math.round(n) : n < 10 ? n.toFixed(1) : Math.round(n);
  return `${v} ${units[i]}${perSecond ? '/s' : ''}`;
}

export function bits(bytesPerSecond) {
  let n = (bytesPerSecond || 0) * 8;
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps'];
  let i = 0;
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
  return `${i === 0 ? Math.round(n) : n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

export function num(n) { return (n || 0).toLocaleString(); }

export function duration(ms) {
  if (!ms || ms < 0) return '0:00';
  const t = Math.floor(ms / 1000);
  const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  const p = (x) => String(x).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
}

export function ago(date) {
  if (!date) return 'never';
  const d = new Date(date);
  if (isNaN(d) || d.getFullYear() < 2000) return 'never';
  const sec = (Date.now() - d.getTime()) / 1000;
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  return `${Math.floor(sec / 86400)} d ago`;
}

export function clock(date) {
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Emoji flags do not render on Windows; detect support once.
let flagEmoji = null;
function flagsWork() {
  if (flagEmoji !== null) return flagEmoji;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const ctx = c.getContext('2d');
    ctx.font = '14px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('\u{1F1EB}\u{1F1F7}', 0, 0); // French flag: blue, white, red
    const d = ctx.getImageData(0, 0, 16, 16).data;
    let colored = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0 && Math.abs(d[i] - d[i + 2]) > 60) colored++;
    }
    flagEmoji = colored > 4;
  } catch {
    flagEmoji = false;
  }
  return flagEmoji;
}

export function flag(code, big = false) {
  const cc = (code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) {
    return h('span', { class: 'flag code' + (big ? ' big' : ''), title: 'Unknown location' }, '?');
  }
  if (flagsWork() && cc !== 'XK') {
    const emoji = String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0)));
    return h('span', { class: 'flag' + (big ? ' big' : ''), 'aria-hidden': 'true' }, emoji);
  }
  return h('span', { class: 'flag code' + (big ? ' big' : ''), 'aria-hidden': 'true' }, cc);
}

export function toast(msg, bad = false) {
  const el = h('div', { class: 'toast' + (bad ? ' bad' : '') }, icon(bad ? 'x' : 'check'), h('span', null, msg));
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), bad ? 6000 : 3200);
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to the clipboard');
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Copied to the clipboard');
  }
}

export function switchEl(checked, onchange, label, big = false) {
  const input = h('input', { type: 'checkbox', role: 'switch', 'aria-label': label });
  input.checked = !!checked;
  input.addEventListener('change', () => onchange(input.checked, input));
  return h('label', { class: 'switch' + (big ? ' big' : '') }, input, h('span'));
}

export function closeMenus() {
  document.querySelectorAll('.menu').forEach((m) => m.remove());
}

export function menu(anchor, items) {
  closeMenus();
  const m = h('div', { class: 'menu', role: 'menu' },
    items.filter(Boolean).map((it) => h('button', { role: 'menuitem', class: it.danger ? 'danger' : '', onclick: () => { closeMenus(); it.run(); } },
      it.icon ? icon(it.icon) : null, it.label)));
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  const mw = m.offsetWidth, mh = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.right - mw)) + 'px';
  m.style.top = (r.bottom + mh + 8 > window.innerHeight ? r.top - mh - 4 : r.bottom + 4) + 'px';
  setTimeout(() => document.addEventListener('click', closeMenus, { once: true }), 0);
  m.querySelector('button')?.focus();
}
