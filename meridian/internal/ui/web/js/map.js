// The world map on the home screen.
import { MAP } from './worldmap.js';
import { s, h } from './util.js';

// Equal Earth projection, matching tools/mapgen/generate.mjs.
export function project(lat, lon) {
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
  const phi = (lat * Math.PI) / 180, lam = (lon * Math.PI) / 180;
  const l = Math.asin(M * Math.sin(phi)), l2 = l * l, l6 = l2 * l2 * l2;
  const x = (lam * Math.cos(l)) / (M * (A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2)));
  const y = l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2));
  return [MAP.tx + MAP.k * x, MAP.ty - MAP.k * y];
}

export class WorldMap {
  constructor({ onCountry, onPin, countryName }) {
    this.onCountry = onCountry;
    this.onPin = onPin;
    this.countryName = countryName;
    this.paths = new Map();
    this.svg = s('svg', { class: 'map', viewBox: `0 0 ${MAP.width} ${MAP.height}`, role: 'img', 'aria-label': 'World map of your VPN locations' });
    const land = s('g');
    for (const sh of MAP.shapes) {
      const p = s('path', { class: 'c', d: sh.d });
      if (sh.c) {
        p.dataset.cc = sh.c;
        if (!this.paths.has(sh.c)) this.paths.set(sh.c, []);
        this.paths.get(sh.c).push(p);
      }
      land.append(p);
    }
    this.overlay = s('g');
    this.svg.append(land, this.overlay);
    this.tip = h('div', { class: 'map-tip hidden' });
    this.el = h('div', { class: 'map-wrap' }, this.svg, this.tip);
    this.counts = {};

    land.addEventListener('mousemove', (e) => {
      const cc = e.target.dataset?.cc;
      if (!cc) return this.hideTip();
      const n = this.counts[cc] || 0;
      this.showTip(e, `${this.countryName(cc)}${n ? ` · ${n} location${n > 1 ? 's' : ''}` : ''}`);
    });
    land.addEventListener('mouseleave', () => this.hideTip());
    land.addEventListener('click', (e) => {
      const cc = e.target.dataset?.cc;
      if (cc && this.counts[cc]) this.onCountry(cc);
    });
  }

  showTip(e, text) {
    const r = this.el.getBoundingClientRect();
    this.tip.textContent = text;
    this.tip.classList.remove('hidden');
    const x = Math.min(e.clientX - r.left + 14, r.width - this.tip.offsetWidth - 6);
    this.tip.style.left = x + 'px';
    this.tip.style.top = e.clientY - r.top + 14 + 'px';
  }

  hideTip() { this.tip.classList.add('hidden'); }

  // pins: [{id, lat, lon, cc, label}], here: {lat, lon, cc} | null,
  // home: {lat, lon} | null, busy: bool
  update({ pins, here, home, connected }) {
    this.counts = {};
    for (const p of pins) if (p.cc) this.counts[p.cc] = (this.counts[p.cc] || 0) + 1;
    for (const [cc, paths] of this.paths) {
      for (const p of paths) {
        p.classList.toggle('has', !!this.counts[cc]);
        p.classList.toggle('here', !!(connected && here && here.cc === cc));
      }
    }
    this.overlay.replaceChildren();
    if (connected && here && home && home.lat !== undefined) {
      const [x1, y1] = project(home.lat, home.lon);
      const [x2, y2] = project(here.lat, here.lon);
      const d = Math.hypot(x2 - x1, y2 - y1);
      if (d > 4) {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.min(120, d * 0.35);
        this.overlay.append(s('path', { class: 'arc', d: `M${x1},${y1} Q${mx},${my} ${x2},${y2}` }));
      }
    }
    if (home && home.lat !== undefined) {
      const [x, y] = project(home.lat, home.lon);
      this.overlay.append(s('circle', { class: 'pin-home', cx: x, cy: y, r: 4.2 }, s('title', {}, 'Your real location')));
    }
    for (const p of pins) {
      if (p.lat === undefined) continue;
      const [x, y] = project(p.lat, p.lon);
      const c = s('circle', { class: 'pin' + (connected ? ' dim' : ''), cx: x, cy: y, r: 3.4, onclick: () => this.onPin(p.id) }, s('title', {}, p.label));
      this.overlay.append(c);
    }
    if (here && here.lat !== undefined) {
      const [x, y] = project(here.lat, here.lon);
      if (connected) this.overlay.append(s('circle', { class: 'pulse', cx: x, cy: y, r: 6 }));
      this.overlay.append(s('circle', { class: 'pin', cx: x, cy: y, r: 5.2 }));
    }
  }
}
