/* DRILLION screens: title -> 7 x (descend, prompt, result) -> treasure tally. */
(function () {
  'use strict';
  const D = window.DRILLION, E = D.engine, art = D.art, sfx = D.sfx;
  const $ = (id) => document.getElementById(id);
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const store = {
    get(k, d) { try { const v = localStorage.getItem('drillion:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('drillion:' + k, JSON.stringify(v)); } catch (e) { /* storage blocked: fine */ } },
  };

  const TIER_LEVEL = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
  const EMOJI = { common: '🐚', uncommon: '⭐', rare: '🔵', epic: '💎', legendary: '👑', junk: '👢' };
  const screens = ['title', 'prompt', 'result', 'end'];

  const state = { screen: 'title', run: null, i: 0, results: [], total: 0, used: new Set(), busy: false };

  // ---------- helpers ----------
  function show(name) {
    state.screen = name;
    screens.forEach((s) => { $('screen-' + s).hidden = s !== name; });
  }
  const pad = (n, w) => String(n).padStart(w, '0');
  function setTrack() {
    const t = $('track');
    t.innerHTML = '';
    E.ZONES.forEach((z, i) => {
      const dot = document.createElement('i');
      if (state.run && i < state.results.length) dot.className = 'done';
      else if (state.run && i === state.i && state.screen !== 'title') dot.className = 'now';
      dot.title = z.name;
      t.appendChild(dot);
    });
  }
  function setHud() {
    $('hud-score').textContent = pad(state.total, 3);
    $('hud-zone').textContent = state.run ? `${Math.min(state.i + 1, 7)}/7` : '-/7';
  }
  let lastDepth = -1;
  function onFrame(m) {
    const d = Math.round(m);
    if (d !== lastDepth) { lastDepth = d; $('hud-depth').textContent = d.toLocaleString('en-US'); }
  }
  function typewrite(el, text, done) {
    el.classList.remove('done');
    if (reduced) { el.textContent = text; el.classList.add('done'); if (done) done(); return; }
    let n = 0;
    el.textContent = '';
    const step = () => {
      n += 2;
      el.textContent = text.slice(0, n);
      if (n < text.length) setTimeout(step, 22); else { el.classList.add('done'); if (done) done(); }
    };
    step();
  }
  function snapshot() {
    return {
      screen: state.screen, keys: state.run ? state.run.map((p) => p.key) : null,
      i: state.i, results: state.results, total: state.total, used: [...state.used],
    };
  }

  // ---------- title ----------
  function renderTitle() {
    const logo = $('logo');
    logo.innerHTML = '';
    [...'DRILLION'].forEach((ch, i) => {
      const s = document.createElement('span');
      s.textContent = ch; s.style.animationDelay = (i * 0.12) + 's';
      s.setAttribute('aria-hidden', 'true');
      logo.appendChild(s);
    });
    const plan = $('plan');
    plan.innerHTML = '';
    E.ZONES.forEach((z) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="d"></span><span class="z"></span><span class="c"></span>';
      li.children[0].textContent = z.range;
      li.children[1].textContent = z.name;
      li.children[2].textContent = z.theme;
      plan.appendChild(li);
    });
    const best = store.get('best', 0);
    $('best').textContent = best ? `BEST DIVE: ${best}` : '';
  }

  // ---------- dive ----------
  function startDive() {
    sfx.unlock();
    const history = store.get('history', []);
    state.run = E.newRun(history);
    store.set('history', history.concat(state.run.map((p) => p.key)).slice(-84));
    state.i = 0; state.results = []; state.total = 0; state.used = new Set();
    art.openChest(false);
    goZone(0, true);
  }

  function fillZoneHead(p) {
    const z = p.zone, i = E.ZONES.indexOf(z);
    $('z-eyebrow').textContent = `Zone ${i + 1} of 7 · ${z.range}`;
    $('z-name').textContent = z.name;
    $('z-blurb').textContent = z.blurb;
    $('theme').textContent = 'Category: ' + z.theme;
    $('sonar-count').textContent = `Sonar detects ${p.valid.length} possible answers`;
  }

  function goZone(i, animate) {
    state.i = i;
    const p = state.run[i];
    show('prompt'); setTrack(); setHud();
    fillZoneHead(p);
    const input = $('answer');
    input.value = ''; input.disabled = true; $('drop').disabled = true; $('skip').disabled = true;
    $('msg').textContent = ''; $('msg').className = 'msg';
    $('prompt').textContent = 'Descending…';
    $('prompt').classList.remove('done');
    const arrive = () => {
      sfx.ping();
      $('live').textContent = `${p.zone.name}. ${p.text}`;
      typewrite($('prompt'), p.text, () => {
        input.disabled = false; $('drop').disabled = false; $('skip').disabled = false;
        try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
      });
    };
    if (animate) { sfx.dive(); art.moveTo(i, i === 0 ? 2600 : 2200, arrive); } else { art.jump(i); arrive(); }
  }

  function submit(e) {
    if (e) e.preventDefault();
    if (state.screen !== 'prompt' || $('answer').disabled) return;
    const p = state.run[state.i];
    const value = $('answer').value;
    const r = E.judge(p, value, state.used);
    if (r.status === 'retry') {
      sfx.retry();
      const msg = $('msg');
      msg.textContent = r.message; msg.className = 'msg';
      const f = $('answer'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
      return;
    }
    record(p, value, r);
  }

  function skip() {
    if (state.screen !== 'prompt' || $('skip').disabled) return;
    const p = state.run[state.i];
    record(p, '', { status: 'skip', points: 0, tier: E.tierFor(0) });
  }

  function record(p, input, r) {
    const res = {
      key: p.key, text: p.text, zone: p.zone.name, input: input.trim(), status: r.status,
      name: r.entity ? r.entity.name : '', points: r.points || 0, tier: r.tier.id,
      tierLabel: r.tier.label, share: r.share || 0, fuzzy: !!r.fuzzy, why: r.message || '',
    };
    if (r.status === 'ok') state.used.add(r.entity.id);
    state.results.push(res);
    state.total += res.points;
    showResult(state.i, true);
  }

  function showResult(i, fresh) {
    const p = state.run[i], res = state.results[i];
    show('result'); setTrack();
    art.drawIcon($('icon'), res.tier);
    $('r-zone').textContent = `${p.zone.name} · ${p.zone.theme}`;
    $('r-prompt').textContent = p.text;
    const you = $('r-you'), ans = $('r-answer'), pts = $('r-points'), badge = $('r-badge'), note = $('r-note');
    pts.className = 'points t-' + res.tier;
    badge.className = 'badge t-' + res.tier;
    badge.textContent = res.tierLabel;
    note.className = 'share-note';
    if (res.status === 'ok') {
      you.textContent = 'Your catch';
      ans.textContent = res.name;
      const pct = res.share < 1 ? 'Fewer than 1%' : `About ${Math.round(res.share)}%`;
      note.textContent = `${pct} of divers would think of this.` + (res.fuzzy && E.norm(res.input) !== E.norm(res.name) ? ` (Read “${res.input}” as ${res.name}.)` : '');
    } else if (res.status === 'wrong') {
      you.textContent = 'You hauled up an old boot';
      ans.textContent = res.name;
      note.textContent = res.why + ' No points.';
      note.className = 'share-note why';
    } else {
      you.textContent = 'You skipped this one';
      ans.textContent = '—';
      note.textContent = 'An empty net. No points.';
    }
    const skipEntity = p.valid.find((e) => e.name === res.name) || null;
    const rv = E.reveal(p, res.status === 'ok' ? skipEntity : null);
    const fill = (ul, items) => {
      ul.innerHTML = '';
      items.forEach((it) => {
        const li = document.createElement('li');
        li.innerHTML = '<span></span><span></span>';
        li.children[0].textContent = it.name; li.children[1].textContent = it.points + ' pts';
        ul.appendChild(li);
      });
    };
    fill($('r-common'), rv.common);
    fill($('r-rare'), rv.rare);
    $('next').textContent = i === 6 ? 'OPEN THE CHEST ▼' : 'DIVE DEEPER ▼';

    $('live').textContent = res.status === 'ok' ? `${res.name}: ${res.points} points, ${res.tierLabel}.` : res.status === 'wrong' ? `${res.name}: wrong. ${res.why}` : 'Skipped.';
    if (fresh) {
      if (res.status === 'ok') sfx.good(TIER_LEVEL[res.tier] || 1); else sfx.bad();
      tally(pts, res.points);
    } else {
      pts.textContent = '+' + res.points;
      setHud();
    }
    try { $('next').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function tally(el, target) {
    if (reduced || target === 0) { el.textContent = '+' + target; setHud(); return; }
    const start = performance.now(), ms = 450 + target * 6;
    const step = (now) => {
      const k = Math.min(1, (now - start) / ms);
      const v = Math.round(target * k);
      el.textContent = '+' + v;
      if (v % 7 === 0) sfx.tick();
      if (k < 1) requestAnimationFrame(step); else setHud();
    };
    requestAnimationFrame(step);
  }

  function next() {
    if (state.screen !== 'result') return;
    if (state.i < 6) goZone(state.i + 1, true); else finish(true);
  }

  // ---------- end ----------
  function finish(fresh) {
    state.i = 7;
    show('end'); setTrack(); setHud();
    $('hud-zone').textContent = '7/7';
    art.jump(6);
    art.openChest(true);
    if (fresh) sfx.fanfare();
    const total = state.total;
    $('e-total').textContent = total;
    $('e-rank').textContent = 'RANK: ' + E.rankFor(total);
    const best = store.get('best', 0);
    if (fresh && total > best) store.set('best', total);
    $('e-best').textContent = total > best ? (best ? `New best dive! Old best: ${best}.` : 'Your first logged dive.') : `Best dive: ${best}. Max possible: 700.`;
    const tbody = $('e-log');
    tbody.innerHTML = '';
    state.results.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td><span></span><br><span class="q"></span></td><td></td><td class="pts"><span class="dot"></span><span></span></td>';
      tr.children[0].children[0].textContent = r.zone;
      tr.children[0].children[2].textContent = r.text;
      tr.children[0].children[2].className = 'muted';
      tr.children[1].textContent = r.status === 'ok' ? r.name : r.status === 'wrong' ? `${r.name} (boot)` : '—';
      tr.children[2].classList.add('t-' + r.tier);
      tr.children[2].children[1].textContent = r.points;
      tbody.appendChild(tr);
    });
    $('e-msg').textContent = '';
    try { $('again').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function shareText() {
    const icons = state.results.map((r) => EMOJI[r.tier] || '👢').join('');
    const lines = state.results.map((r) => `${r.zone}: ${r.status === 'ok' ? r.name : '—'} (+${r.points})`);
    return `DRILLION 🌊 ${state.total}/700 · ${E.rankFor(state.total)}\n${icons}\n${lines.join('\n')}`;
  }
  function copy() {
    const text = shareText();
    const msg = $('e-msg');
    const fallback = () => {
      msg.textContent = '';
      const ta = document.createElement('textarea');
      ta.value = text; ta.readOnly = true; ta.rows = 9; ta.style.width = '100%'; ta.style.font = 'inherit';
      ta.setAttribute('aria-label', 'Dive results to copy');
      msg.appendChild(ta); ta.focus(); ta.select();
    };
    try {
      navigator.clipboard.writeText(text).then(() => { msg.textContent = 'Copied! Paste it anywhere.'; }, fallback);
    } catch (e) { fallback(); }
  }

  // ---------- boot ----------
  function bind() {
    $('start').addEventListener('click', startDive);
    $('again').addEventListener('click', startDive);
    $('form').addEventListener('submit', submit);
    $('skip').addEventListener('click', skip);
    $('next').addEventListener('click', next);
    $('copy').addEventListener('click', copy);
    const snd = $('sound');
    const setSnd = (on) => { sfx.enabled = on; snd.setAttribute('aria-pressed', String(on)); snd.textContent = on ? 'SOUND ON' : 'SOUND OFF'; };
    setSnd(store.get('sound', true));
    snd.addEventListener('click', () => { const on = !sfx.enabled; store.set('sound', on); setSnd(on); if (on) sfx.blip(); });
  }

  function start(data) {
    renderTitle();
    bind();
    art.init($('scene'), onFrame);
    try { if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(snapshot); } catch (e) { /* not in a viewer */ }

    // Resume a dive that was in progress when the page updated.
    if (data && data.keys && data.screen && data.screen !== 'title') {
      const run = E.rebuild(data.keys);
      if (run.every(Boolean)) {
        state.run = run; state.results = data.results || []; state.total = data.total || 0;
        state.used = new Set(data.used || []); state.i = data.i || 0;
        if (state.results.length >= 7) return finish(false);
        if (state.results.length > state.i) { art.jump(state.i); return showResult(state.i, false); }
        return goZone(state.i, false);
      }
    }
    show('title'); setTrack(); setHud();
    art.jump(-1);
  }

  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.ready === 'function') hot.ready(start);
  else start((hot && hot.data) || {});
})();
