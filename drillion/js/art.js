/* DRILLION pixel art: a 200x120 canvas scene that scrolls down through seven ocean zones.
   The world is a vertical strip: zone i fills world rows i*120 .. i*120+119, the surface sits above zone 0. */
(function () {
  'use strict';
  const W = 200, H = 120, WATERLINE = -68;
  const DEPTHS = [18, 160, 640, 2600, 5200, 8400, 10935];
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- sprites ----------
  const PAL = {
    k: '#141428', G: '#b8b8c8', g: '#606078', Y: '#f8d878', y: '#d08020', W: '#ffffff', B: '#3cbcfc', b: '#0058f8', R: '#e83020',
    O: '#f87818', S: '#2c8c3c', s: '#58b848', h: '#a8d878', f: '#a8d878', P: '#f878c8', p: '#f8b8e8',
    D: '#5a4890', E: '#f8f8f8', L: '#f8f878', w: '#8c4c1c', V: '#b86c2c', C: '#f8b800', X: '#000000',
    A: '#f8a888', a: '#f87858', N: '#f8c8d8', n: '#c890a0', M: '#24244a', m: '#14142a',
  };
  const S = {
    propA: ['....kk....kk....', '...kGGk..kGGk...', '....kkkkkkkk....'],
    propB: ['......kkkk......', '.....kGGGGk.....', '....kkkkkkkk....'],
    body: [
      '....kyyyyyyk....', '..kkkYYYYYYkkk..', '.kyykYWYYYYkyyk.', '.kyykWYYYYYkyyk.', '..kkkYYYYYYkkk..',
      '...kYYkkkkYYk...', '...kYkBBBWkYk...', '...kYkBBBBkYk...', '...kYkbBBBkYk...', '...kYYkkkkYYk...',
      '...kYYYYYYyYk...', '...kRYRYRYRyk...', '...kYYYYYYyYk...', '...kyyyyyyyyk...', '....kkkkkkkk....',
    ],
    drillA: ['....kGGGGggk....', '.....kGGggk.....', '.....kggGGk.....', '......kGgk......', '......kgGk......', '.......kk.......'],
    drillB: ['....kggGGGGk....', '.....kggGGk.....', '.....kGGggk.....', '......kgGk......', '......kGgk......', '.......kk.......'],
    clown: ['O..OWO..', 'OOOOWOOk', 'OOOOWOOO', 'O..OWO..'],
    fish: ['....X...', 'X.XXXXX.', 'XXXXXXkX', 'X.XXXXX.'],
    turtle: ['..f....f....', '...SSSS.....', '..SsSsSS.hh.', '.SSsSSsSShhh', '..SSSSSS.hh.', '...f....f...'],
    jellyA: ['..PPP..', '.PPPPP.', 'PPpPpPP', 'PPPPPPP', '.p.p.p.', '.p.p.p.', 'p.p.p..', '..p.p..', '.p...p.'],
    jellyB: ['..PPP..', '.PPPPP.', 'PPpPpPP', '.PPPPP.', 'p.p.p.p', '.p.p.p.', '.p.p.p.', 'p...p..', '..p..p.'],
    angler: ['........kL...', '.......k.....', '......k......', '..DDDDDD.....', '.DDDDDDDDD...', 'DDDDDDEDDDD..', '.DDDDDDDWDWD.', '..DDDDDDDDD..', '...DD..DD....'],
    dumbo: ['.a.AAA.a.', 'aaAAAAAaa', '.AAkAkAA.', '.AAAAAAA.', '..AAAAA..', '.A.A.A.A.', 'A..A.A..A'],
    whale: ['......XXXXXXXXXX........', '...XXXXXXXXXXXXXXXXX....', '.XXXXXXXXXXXXXXXXXXXXX.X', 'XXXXXXXXXXXXXXXXXXXXXXXX', '.XXXXXXXXXXXXXXXXXXXXX.X', '...XXXXXXXXXXXXXXX......', '.......XX...............'],
    snail: ['.NNNN..', 'NNNNNNk', 'nNNNNN.', '..nn...'],
    chestLid: ['..kkkkkkkkkk..', '.kVwwwwwwwwVk.', 'kwwwwwwwwwwwwk'],
    chestBody: ['kCCCCCCCCCCCCk', 'kwwwwwYYwwwwwk', 'kwwwwwYkwwwwwk', 'kwwwwwwwwwwwwk', 'kCCCCCCCCCCCCk', 'kwwwwwwwwwwwwk', 'kkkkkkkkkkkkkk'],
  };
  const ICONS = {
    junk: ['....bbbb....', '....bBBb....', '....bBBb....', '....bBBb....', '....bBBb....', '...bBBBb....', '..bBBBBBbb..', '.bBBBBBBBBb.', '.bBBBBBBBBBb', '.bbbbbbbbbbb', '............', '............'],
    common: ['............', '...XXXXXX...', '..XxXXxXxX..', '.XxXXxXXxXX.', '.XxXxXXxXxX.', 'XxXxXXXXxXxX', 'XxXXxXXxXXxX', '.XXxXXXXxXX.', '..XXXXXXXX..', '....XXXX....', '.....xx.....', '....xxxx....'],
    uncommon: ['.....XX.....', '.....XX.....', '....XXXX....', 'XXXXXXXXXXXX', '.XXXXxXXXXX.', '..XXXXXXXX..', '...XXXXXX...', '...XXXXXX...', '..XXX..XXX..', '..XX....XX..', '.XX......XX.', '............'],
    rare: ['............', '....xxxx....', '..xxXXXXxx..', '.xXXWWXXXXx.', '.xXWWXXXXXx.', 'xXXWXXXXXXXx', 'xXXXXXXXXXXx', 'xXXXXXXXXXxx', '.xXXXXXXXXx.', '.xxXXXXXXxx.', '..xxxxxxxx..', '............'],
    epic: ['............', '...XXXXXX...', '..XWXXXXwX..', '.XWXXXXXXwX.', 'XXXXXXXXXXXX', '.xXXXXXXXXx.', '..xXXXXXXx..', '...xXXXXx...', '....xXXx....', '.....xx.....', '............', '............'],
    legendary: ['............', '............', 'X....X....X.', 'XX..XXX..XX.', 'XXXXXXXXXXX.', 'XXRXXBXXRXX.', 'XXXXXXXXXXX.', 'xxxxxxxxxxx.', '............', '............', '............', '............'],
  };
  const TIER_COLORS = { common: '#e8dcc8', uncommon: '#58d854', rare: '#bcecfc', epic: '#c890ff', legendary: '#f8b800', junk: '#8c5c2c' };

  const cache = new Map();
  function sprite(name, rows, pal, flip) {
    const key = name + (flip ? '<' : '>') + (pal && pal.X ? pal.X : '');
    if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas');
    c.width = rows[0].length; c.height = rows.length;
    const g = c.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      g.fillStyle = (pal && pal[ch]) || PAL[ch] || '#ff00ff';
      g.fillRect(flip ? c.width - 1 - x : x, y, 1, 1);
    }));
    cache.set(key, c);
    return c;
  }
  const draw = (g, name, x, y, opts = {}) => g.drawImage(sprite(name, S[name], opts.pal, opts.flip), Math.round(x), Math.round(y));

  // ---------- colour helpers ----------
  const WATER = [[0, [92, 200, 252]], [30, [24, 144, 240]], [200, [0, 88, 208]], [1000, [30, 34, 118]], [4000, [14, 12, 52]], [6000, [7, 6, 28]], [11000, [2, 1, 8]]];
  function waterAt(m) {
    for (let i = 1; i < WATER.length; i++) {
      if (m <= WATER[i][0]) {
        const [m0, c0] = WATER[i - 1], [m1, c1] = WATER[i], k = (m - m0) / (m1 - m0);
        return [0, 1, 2].map((j) => c0[j] + (c1[j] - c0[j]) * k);
      }
    }
    return WATER[WATER.length - 1][1];
  }
  function metersAt(z) {
    if (z <= -1) return 0;
    if (z < 0) return DEPTHS[0] * (z + 1);
    if (z >= 6) return DEPTHS[6];
    const i = Math.floor(z), f = z - i;
    return DEPTHS[i] + (DEPTHS[i + 1] - DEPTHS[i]) * f;
  }
  function rowMeters(worldY) {
    if (worldY < 0) return Math.max(0, DEPTHS[0] * (worldY - WATERLINE) / -WATERLINE);
    return metersAt(Math.min(6.99, worldY / 120));
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

  // ---------- state ----------
  let g, img, canvas;
  let cam = -1, from = -1, to = -1, t0 = 0, dur = 0, doneCb = null, vel = 0;
  let chest = 0, chestTarget = 0, shake = 0;
  let onFrame = null;
  const snow = [], bubbles = [], sparks = [], stars = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  function seeded(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

  // Trench wall profiles (fixed per page load).
  const wallL = [], wallR = [];
  { const r = seeded(7); let a = 18, b = 18; for (let y = 0; y < 240; y++) { a = Math.max(6, Math.min(34, a + (r() - 0.5) * 5)); b = Math.max(6, Math.min(34, b + (r() - 0.5) * 5)); wallL.push(a); wallR.push(b); } }
  { const r = seeded(11); for (let i = 0; i < 40; i++) stars.push({ x: r() * W, y: r() * 120, p: r() * 6.28, c: r() < 0.5 ? '#7cf8f8' : '#b8f818' }); }
  for (let i = 0; i < 46; i++) snow.push({ x: rnd(0, W), y: rnd(0, H), s: rnd(0.2, 1) });

  // ---------- zone props ----------
  function reef(sy, t) {
    // sand floor
    g.fillStyle = '#e8c070'; g.fillRect(0, sy + 104, W, 16);
    g.fillStyle = '#c89848'; for (let x = 3; x < W; x += 9) g.fillRect(x, sy + 108 + (x % 3) * 3, 2, 1);
    // seaweed
    for (const x0 of [12, 30, 150, 176, 188]) {
      for (let y = 0; y < 34; y += 2) {
        const off = Math.round(Math.sin(t / 700 + y / 6 + x0) * (y / 12));
        g.fillStyle = y % 4 ? '#38a838' : '#58d854'; g.fillRect(x0 + off, sy + 104 - y, 2, 2);
      }
    }
    // coral
    const coral = (x, h, c1, c2) => {
      g.fillStyle = c1; g.fillRect(x, sy + 104 - h, 3, h);
      g.fillRect(x - 4, sy + 104 - h + 6, 4, 2); g.fillRect(x - 4, sy + 104 - h + 2, 2, 5);
      g.fillRect(x + 3, sy + 104 - h + 9, 4, 2); g.fillRect(x + 5, sy + 104 - h + 4, 2, 6);
      g.fillStyle = c2; g.fillRect(x, sy + 104 - h, 3, 1); g.fillRect(x - 4, sy + 104 - h + 2, 2, 1); g.fillRect(x + 5, sy + 104 - h + 4, 2, 1);
    };
    coral(52, 20, '#f86878', '#fcb8b8'); coral(70, 13, '#f87818', '#fcc890'); coral(128, 17, '#c048f8', '#e8b8fc'); coral(110, 10, '#f86878', '#fcb8b8');
    g.fillStyle = '#f8a830'; g.fillRect(88, sy + 99, 9, 5); g.fillStyle = '#fcd070'; g.fillRect(89, sy + 99, 7, 1); // brain coral
    // clownfish pair and a school of tangs
    const cx = ((t / 40) % 260) - 30;
    draw(g, 'clown', cx, sy + 80 + Math.sin(t / 300) * 2);
    draw(g, 'clown', cx - 12, sy + 86 + Math.sin(t / 340) * 2);
    for (let i = 0; i < 5; i++) {
      const fx = W + 20 - ((t / 28 + i * 9) % 280);
      draw(g, 'fish', fx, sy + 30 + (i % 3) * 6 + Math.sin(t / 400 + i) * 2, { pal: { X: '#3c7cfc' }, flip: true });
    }
  }
  function sunlight(sy, t) {
    // a whale passing far behind
    g.globalAlpha = 0.28;
    draw(g, 'whale', W + 40 - ((t / 70) % (W + 90)), sy + 22, { pal: { X: '#0a3c8c' } });
    g.globalAlpha = 1;
    draw(g, 'turtle', ((t / 55) % 260) - 30, sy + 74 + Math.sin(t / 500) * 3);
    for (let i = 0; i < 9; i++) {
      const fx = W + 10 - ((t / 22 + (i % 3) * 7 + Math.floor(i / 3) * 3) % 260);
      draw(g, 'fish', fx, sy + 48 + Math.floor(i / 3) * 5 + Math.sin(t / 300 + i) * 1.5, { pal: { X: '#c8d8e8' }, flip: true });
    }
  }
  function twilight(sy, t) {
    const jel = [[30, 40], [150, 70], [90, 96]];
    jel.forEach(([x, y], i) => {
      const fr = Math.floor(t / 420 + i) % 2 ? 'jellyA' : 'jellyB';
      g.globalAlpha = 0.85;
      draw(g, fr, x + Math.sin(t / 900 + i) * 6, sy + y + Math.sin(t / 700 + i * 2) * 5);
      g.globalAlpha = 1;
    });
    for (let i = 0; i < 6; i++) {
      const fx = ((t / 30 + i * 37) % 240) - 20, fy = sy + 20 + i * 15;
      g.fillStyle = '#1a2050'; g.fillRect(fx, fy, 4, 2);
      g.fillStyle = (Math.floor(t / 250 + i) % 3) ? '#7cf8f8' : '#1a2050'; g.fillRect(fx + 1, fy + 1, 1, 1);
    }
  }
  function midnight(sy, t) {
    stars.forEach((s) => {
      const a = 0.5 + 0.5 * Math.sin(t / 500 + s.p);
      if (a < 0.35) return;
      g.globalAlpha = a; g.fillStyle = s.c; g.fillRect(s.x, sy + s.y, 1, 1); g.globalAlpha = 1;
    });
    const ax = W + 20 - ((t / 60) % (W + 50));
    draw(g, 'angler', ax, sy + 78, { flip: true });
    const lit = Math.floor(t / 300) % 4 !== 0;
    if (lit) { g.globalAlpha = 0.3; g.fillStyle = '#f8f878'; g.fillRect(ax - 1, sy + 75, 7, 5); g.globalAlpha = 0.6; g.fillRect(ax + 1, sy + 76, 3, 3); g.globalAlpha = 1; }
  }
  function abyss(sy, t) {
    // giant squid tentacles reaching in from the right
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 46; i++) {
        const x = W - i * 1.3, y = sy + 30 + k * 18 + Math.sin(t / 600 + i / 7 + k) * (i / 6);
        g.fillStyle = i % 5 ? '#a02818' : '#e85840'; g.fillRect(Math.round(x), Math.round(y), 2, 2);
      }
    }
    draw(g, 'dumbo', 30 + Math.sin(t / 1400) * 14, sy + 66 + Math.sin(t / 500) * 4);
  }
  function hadal(sy, t) {
    for (let y = 0; y < 120; y += 2) {
      const a = wallL[y], b = wallR[y];
      g.fillStyle = '#0e0e22'; g.fillRect(0, sy + y, a, 2); g.fillRect(W - b, sy + y, b, 2);
      g.fillStyle = '#22224a'; g.fillRect(a - 2, sy + y, 2, 2); g.fillRect(W - b, sy + y, 2, 2);
    }
    draw(g, 'snail', 40 + ((t / 90) % 120), sy + 88 + Math.sin(t / 400) * 2);
    for (let i = 0; i < 4; i++) { g.fillStyle = '#c8b8a0'; g.fillRect(60 + i * 23 + Math.sin(t / 250 + i) * 3, sy + 40 + i * 13, 2, 1); }
  }
  function deep(sy, t) {
    g.fillStyle = '#16141e'; g.fillRect(0, sy + 100, W, 20);
    g.fillStyle = '#2a2632'; for (let x = 2; x < W; x += 7) g.fillRect(x, sy + 102 + (x % 4), 2, 1);
    g.fillStyle = '#201c2a'; g.fillRect(20, sy + 94, 18, 6); g.fillRect(24, sy + 91, 10, 3); g.fillRect(158, sy + 96, 22, 4); g.fillRect(164, sy + 93, 9, 3);
    // treasure chest; lid lifts as chest -> 1
    const cxp = 93, cyp = sy + 90;
    if (chest > 0.05) {
      // dithered beams of light rising from the open chest
      g.globalAlpha = Math.min(1, chest) * 0.55; g.fillStyle = '#f8d878';
      for (let y = 0; y < 26; y++) {
        const spread = 6 + y * 0.6;
        for (let x = Math.round(cxp + 7 - spread); x < cxp + 7 + spread; x++) if ((x + y) % 3 === 0 && (x * 7 + y * 3 + Math.floor(t / 120)) % 5 < 2) g.fillRect(x, cyp + 2 - y, 1, 1);
      }
      g.globalAlpha = 1;
      g.fillStyle = '#f8b800'; g.fillRect(cxp + 1, cyp + 1, 12, 2); g.fillStyle = '#fcfc98'; g.fillRect(cxp + 3, cyp, 3, 1); g.fillRect(cxp + 8, cyp + 1, 2, 1);
    }
    draw(g, 'chestBody', cxp, cyp + 3);
    draw(g, 'chestLid', cxp, cyp - Math.round(chest * 5));
    if (Math.floor(t / 600) % 3 === 0 && chest < 0.05) { g.fillStyle = '#ffffff'; g.fillRect(cxp + 11, cyp + 4, 1, 1); g.fillRect(cxp + 10, cyp + 5, 3, 1); g.fillRect(cxp + 11, cyp + 6, 1, 1); }
  }
  const PROPS = [reef, sunlight, twilight, midnight, abyss, hadal, deep];

  function surface(sy, t) {
    // sun and clouds above the waterline (world y -120 .. -68)
    g.fillStyle = '#fcf0a8'; g.fillRect(156, sy + 10, 14, 14); g.fillStyle = '#f8d878'; g.fillRect(158, sy + 8, 10, 18); g.fillRect(154, sy + 12, 18, 10);
    const cloud = (x, y) => { g.fillStyle = '#ffffff'; g.fillRect(x, y, 22, 5); g.fillRect(x + 4, y - 3, 10, 3); g.fillRect(x + 14, y - 2, 5, 2); };
    cloud(((t / 120) % 260) - 30, sy + 18); cloud(((t / 160 + 120) % 260) - 30, sy + 30);
    // waves
    const wl = sy + (WATERLINE + 120);
    for (let x = 0; x < W; x += 2) {
      const h = Math.round(Math.sin(t / 400 + x / 9) * 1.5);
      g.fillStyle = '#ffffff'; g.fillRect(x, wl + h - 1, 2, 1);
      g.fillStyle = '#8cdcfc'; g.fillRect(x, wl + h, 2, 2);
    }
  }

  function drawWater() {
    const d = img.data;
    const top = cam * 120;
    for (let y = 0; y < H; y++) {
      const wy = top + y;
      let c;
      if (wy < WATERLINE) { const k = Math.max(0, Math.min(1, (wy + 120) / 52)); c = [60 + 108 * k, 188 + 40 * k, 252]; } else c = waterAt(rowMeters(wy));
      for (let x = 0; x < W; x++) {
        const th = BAYER[((y & 3) << 2) | (x & 3)], i = (y * W + x) * 4;
        d[i] = Math.min(255, Math.floor(c[0] / 20 + th) * 20);
        d[i + 1] = Math.min(255, Math.floor(c[1] / 20 + th) * 20);
        d[i + 2] = Math.min(255, Math.floor(c[2] / 20 + th) * 20);
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }

  function frame(now) {
    const t = now;
    const prev = cam;
    if (dur) {
      const k = Math.min(1, (now - t0) / dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      cam = from + (to - from) * e;
      if (k >= 1) { dur = 0; cam = to; const cb = doneCb; doneCb = null; if (cb) setTimeout(cb, 0); }
    }
    vel = (cam - prev) * 120;
    chest += (chestTarget - chest) * 0.06;

    drawWater();
    const top = cam * 120;
    // surface scene sits in world rows -120..-1
    if (top < 0) surface(-120 - top, t);
    // sun rays in the bright zones
    if (cam < 1.6) {
      g.globalAlpha = Math.max(0, 0.12 * (1.6 - cam) / 1.6);
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 6; i++) {
        const x0 = ((i * 41 + t / 90) % 260) - 40;
        for (let y = 0; y < H; y += 2) g.fillRect(x0 + y * 0.45, y, 6, 2);
      }
      g.globalAlpha = 1;
    }
    for (let i = 0; i < PROPS.length; i++) {
      const sy = i * 120 - top;
      if (sy > -120 && sy < H) PROPS[i](sy, t);
    }

    // marine snow streams upward while diving
    snow.forEach((p) => {
      p.y += -vel * (0.6 + p.s) + 0.05 * p.s;
      if (p.y < -2) { p.y = H + 1; p.x = rnd(0, W); }
      if (p.y > H + 2) { p.y = -1; p.x = rnd(0, W); }
      if (top + p.y < WATERLINE) return;
      g.globalAlpha = 0.25 + 0.45 * p.s; g.fillStyle = '#dce8f8';
      g.fillRect(Math.round(p.x), Math.round(p.y), 1, Math.abs(vel) > 0.6 ? 3 : 1);
    });
    g.globalAlpha = 1;

    // headlight cone in the dark zones
    const subX = 92, bob = reduced ? 0 : Math.round(Math.sin(t / 450) * 1.5);
    const shk = Math.abs(vel) > 0.3 && !reduced ? Math.round(rnd(-1, 1)) : 0;
    const subY = (cam <= -1 ? 36 : 40) + bob;
    if (cam > 1.3) {
      g.globalAlpha = Math.min(0.22, (cam - 1.3) * 0.15);
      g.fillStyle = '#fcf0a8';
      for (let y = subY + 25; y < H; y++) {
        const half = (y - subY - 25) * 0.55 + 2;
        for (let x = Math.round(subX + 8 - half); x < subX + 8 + half; x++) if ((x + y) % 2 === 0) g.fillRect(x, y, 1, 1);
      }
      g.globalAlpha = 1;
    }

    // bubbles from the propeller
    if (Math.random() < (Math.abs(vel) > 0.3 ? 0.7 : 0.12) && top + subY > WATERLINE + 4) bubbles.push({ x: subX + 6 + rnd(0, 4), y: subY, life: 0 });
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.life++; b.y -= 0.5 + Math.abs(vel) * 0.6; b.x += Math.sin(b.life / 5) * 0.3;
      if (b.y < -3 || top + b.y < WATERLINE) { bubbles.splice(i, 1); continue; }
      g.fillStyle = '#cfefff'; g.fillRect(Math.round(b.x), Math.round(b.y), b.life % 30 > 15 ? 2 : 1, b.life % 30 > 15 ? 2 : 1);
    }

    // the Drillion
    const spin = Math.floor(t / (Math.abs(vel) > 0.3 ? 40 : 160)) % 2;
    draw(g, spin ? 'propA' : 'propB', subX + shk, subY);
    draw(g, 'body', subX + shk, subY + 3);
    draw(g, spin ? 'drillA' : 'drillB', subX + shk, subY + 18);

    // sparkles when the chest opens
    if (chestTarget > 0 && Math.random() < 0.5) sparks.push({ x: 99 + rnd(-4, 6), y: (6 * 120 - top) + 90, vx: rnd(-0.7, 0.7), vy: rnd(-1.6, -0.6), life: 60 });
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.x += s.vx; s.y += s.vy; s.vy += 0.02; if (--s.life <= 0) { sparks.splice(i, 1); continue; }
      g.fillStyle = s.life % 8 < 4 ? '#f8d878' : '#ffffff'; g.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    }

    if (onFrame) onFrame(metersAt(cam), cam);
    if (!(document.hidden)) requestAnimationFrame(frame); else setTimeout(() => requestAnimationFrame(frame), 250);
  }

  function drawIcon(cv, tier) {
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    const base = TIER_COLORS[tier] || TIER_COLORS.junk;
    const darker = '#' + base.slice(1).match(/../g).map((h) => Math.round(parseInt(h, 16) * 0.62).toString(16).padStart(2, '0')).join('');
    const pal = { X: base, x: darker, W: '#ffffff', w: '#ffffff', b: '#4a2c14', B: '#8c5c2c', R: '#e83020' };
    const rows = ICONS[tier] || ICONS.junk;
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') { ctx.fillStyle = pal[ch]; ctx.fillRect(x + 2, y + 2, 1, 1); } }));
  }

  window.DRILLION.art = {
    init(cv, cb) {
      canvas = cv; g = cv.getContext('2d'); img = g.createImageData(W, H); onFrame = cb;
      requestAnimationFrame(frame);
    },
    moveTo(z, ms, cb) { from = cam; to = z; t0 = performance.now(); dur = reduced ? Math.min(ms, 250) : ms; doneCb = cb || null; if (!dur) { cam = z; if (cb) cb(); } },
    jump(z) { cam = from = to = z; dur = 0; },
    openChest(v) { chestTarget = v ? 1 : 0; if (!v) chest = 0; },
    get cam() { return cam; },
    metersAt, drawIcon, DEPTHS,
  };
})();
