/* DRILLION screens: title -> 7 x (prompt, result + drill) -> dive log.
   Points are drill power: every 100 points breaks through to the next zone,
   and each prompt comes from the zone the drill has reached. */
(function () {
  'use strict';
  const D = window.DRILLION, E = D.engine, art = D.art, sfx = D.sfx;
  const $ = (id) => document.getElementById(id);
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TURNS = 7;
  const TIME_LIMIT = 25; // seconds of air per prompt

  const store = {
    get(k, d) { try { const v = localStorage.getItem('drillion:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('drillion:' + k, JSON.stringify(v)); } catch (e) { /* storage blocked: fine */ } },
  };

  const TIER_LEVEL = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
  const EMOJI = { common: '🐚', uncommon: '⭐', rare: '🔵', epic: '💎', legendary: '👑', junk: '👢', timeout: '⌛' };
  const screens = ['title', 'prompt', 'result', 'end'];
  const m = (meters) => Math.round(meters).toLocaleString('en-US') + ' m';

  const state = { screen: 'title', turn: 0, prompts: [], results: [], total: 0, used: new Set(), drilling: false };

  // ---------- helpers ----------
  function show(name) {
    state.screen = name;
    screens.forEach((s) => { $('screen-' + s).hidden = s !== name; });
  }
  const pad = (n, w) => String(n).padStart(w, '0');
  function setTrack() {
    const t = $('track');
    t.innerHTML = '';
    const here = state.screen === 'title' ? -1 : E.zoneFor(state.total).index;
    E.ZONES.forEach((z, i) => {
      const dot = document.createElement('i');
      if (i < here || (state.total >= E.MAX_PTS)) dot.className = 'done';
      else if (i === here) dot.className = 'now';
      dot.title = z.name;
      t.appendChild(dot);
    });
  }
  function setHud() {
    $('hud-score').textContent = pad(state.total, 3);
    $('hud-zone').textContent = state.screen === 'title' ? '-/7' : `${Math.min(state.turn + 1, TURNS)}/7`;
  }
  let lastDepth = -1;
  function onFrame(meters) {
    const d = Math.round(meters);
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
      screen: state.screen, turn: state.turn, total: state.total, used: [...state.used], results: state.results,
      prompts: state.prompts.map((p) => ({ z: p.zone.index, key: p.key })),
    };
  }
  // How far the drill is through its current zone, for the gauge.
  function gauge() {
    const z = E.zoneFor(state.total);
    const into = Math.min(E.PTS_PER_ZONE, state.total - z.minPts);
    const left = E.PTS_PER_ZONE - into;
    $('gauge-fill').style.width = (into / E.PTS_PER_ZONE * 100) + '%';
    const nextZone = E.ZONES[z.index + 1];
    $('gauge-text').innerHTML = '';
    const b = document.createElement('b');
    b.textContent = left + ' pts';
    $('gauge-text').append('Drill ', b, nextZone ? ` more to break into ${nextZone.the}${nextZone.name}.` : ' more to hit the sea floor.');
  }

  // ---------- air timer ----------
  // Each prompt gets TIME_LIMIT seconds once it is fully on screen. Retries don't reset it.
  let timer = null, deadline = 0, lastSec = 0;
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  function drawTimer(left) {
    const sec = Math.ceil(left / 1000);
    $('o2-fill').style.width = (left / (TIME_LIMIT * 1000) * 100) + '%';
    $('o2-text').textContent = sec + 's';
    $('o2').classList.toggle('low', sec <= 8);
    return sec;
  }
  function startTimer() {
    stopTimer();
    deadline = performance.now() + TIME_LIMIT * 1000;
    lastSec = TIME_LIMIT;
    drawTimer(TIME_LIMIT * 1000);
    timer = setInterval(() => {
      if (state.screen !== 'prompt') { stopTimer(); return; }
      const left = Math.max(0, deadline - performance.now());
      const sec = drawTimer(left);
      if (sec !== lastSec) {
        lastSec = sec;
        if (sec <= 5 && sec > 0) sfx.warn();
        if (sec === 10 || sec === 5) $('live').textContent = `${sec} seconds of air left.`;
      }
      if (left <= 0) { stopTimer(); outOfAir(); }
    }, 100);
  }
  function outOfAir() {
    if (state.screen !== 'prompt') return;
    record(state.prompts[state.turn], $('answer').value, { status: 'timeout', points: 0, tier: E.tierFor(0) });
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
      li.children[0].textContent = z.minPts + ' pts';
      li.children[1].textContent = z.name;
      li.children[2].textContent = `${z.range} · ${z.theme}`;
      plan.appendChild(li);
    });
    const best = store.get('bestDepth', 0);
    $('best').textContent = best ? `DEEPEST DIVE: ${m(best)}` : '';
  }

  // ---------- dive ----------
  function startDive() {
    sfx.unlock();
    state.turn = 0; state.prompts = []; state.results = []; state.total = 0; state.used = new Set();
    art.openChest(false);
    ask(true);
  }

  function ask(fromSurface) {
    const zone = E.zoneFor(state.total);
    let p = state.prompts[state.turn];
    if (!p) {
      const history = store.get('history', []);
      p = E.promptFor(zone.index, history, state.prompts.map((x) => x.key));
      state.prompts[state.turn] = p;
      store.set('history', history.concat(p.key).slice(-84));
    }
    show('prompt'); setTrack(); setHud();
    $('z-eyebrow').textContent = `Prompt ${state.turn + 1} of ${TURNS} · ${m(E.depthFor(state.total))}`;
    $('z-name').textContent = p.zone.name;
    $('z-blurb').textContent = p.zone.blurb;
    $('theme').textContent = 'Category: ' + p.zone.theme;
    $('sonar-count').textContent = `Sonar detects ${p.valid.length} possible answers`;
    gauge();
    const input = $('answer');
    input.value = ''; input.disabled = true; $('drop').disabled = true; $('skip').disabled = true;
    $('msg').textContent = ''; $('msg').className = 'msg';
    stopTimer(); drawTimer(TIME_LIMIT * 1000);
    $('prompt').textContent = fromSurface ? 'Descending…' : '';
    $('prompt').classList.remove('done');
    const arrive = () => {
      sfx.ping();
      $('live').textContent = `${p.zone.name}. ${p.text}`;
      typewrite($('prompt'), p.text, () => {
        input.disabled = false; $('drop').disabled = false; $('skip').disabled = false;
        try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
        startTimer();
      });
    };
    if (fromSurface) { sfx.dive(); art.moveTo(0, 2400, arrive); } else arrive();
  }

  function submit(e) {
    if (e) e.preventDefault();
    if (state.screen !== 'prompt' || $('answer').disabled) return;
    const p = state.prompts[state.turn];
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
    record(state.prompts[state.turn], '', { status: 'skip', points: 0, tier: E.tierFor(0) });
  }

  function record(p, input, r) {
    stopTimer();
    const before = state.total, after = Math.min(E.MAX_PTS, before + (r.points || 0));
    const res = {
      key: p.key, text: p.text, zone: p.zone.name, zoneIndex: p.zone.index, input: input.trim(), status: r.status,
      name: r.entity ? r.entity.name : '', points: r.points || 0, tier: r.tier.id, tierLabel: r.status === 'timeout' ? 'OUT OF AIR' : r.tier.label,
      share: r.share || 0, fuzzy: !!r.fuzzy, why: r.message || '',
      before, after, depthBefore: E.depthFor(before), depthAfter: E.depthFor(after),
    };
    if (r.status === 'ok') state.used.add(r.entity.id);
    state.results[state.turn] = res;
    state.total = after;
    showResult(state.turn, true);
  }

  function showResult(i, fresh) {
    const p = state.prompts[i], res = state.results[i];
    show('result'); setTrack(); setHud();
    $('r-zone').textContent = `${p.zone.name} · ${p.zone.theme}`;
    $('r-prompt').textContent = p.text;
    art.drawIcon($('icon'), res.tier);
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
    } else if (res.status === 'timeout') {
      you.textContent = 'Out of air!';
      ans.textContent = '—';
      note.textContent = `The ${TIME_LIMIT} seconds ran out. No points.`;
      note.className = 'share-note why';
    } else {
      you.textContent = 'You skipped this one';
      ans.textContent = '—';
      note.textContent = 'An empty net. No points.';
    }

    // How far the points drilled.
    const drill = $('r-drill');
    drill.innerHTML = '';
    if (res.points > 0) {
      const b1 = document.createElement('b'); b1.textContent = m(res.depthAfter - res.depthBefore);
      const b2 = document.createElement('b'); b2.textContent = m(res.depthAfter);
      drill.append('Drilled ', b1, ' deeper. Now at ', b2, '.');
    } else {
      const b2 = document.createElement('b'); b2.textContent = m(res.depthAfter);
      drill.append('The drill didn’t move. Still at ', b2, '.');
    }
    const zc = $('r-zonechange');
    const zBefore = E.zoneFor(res.before), zAfter = E.zoneFor(res.after);
    if (res.after >= E.MAX_PTS && res.before < E.MAX_PTS) { zc.hidden = false; zc.textContent = 'You hit the sea floor! 10,935 m.'; } else if (zAfter !== zBefore) { zc.hidden = false; zc.textContent = `Breakthrough! You drilled into ${zAfter.the}${zAfter.name}.`; } else zc.hidden = true;

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
    $('live').textContent = (res.status === 'ok' ? `${res.name}: ${res.points} points, ${res.tierLabel}.` : res.status === 'wrong' ? `${res.name}: wrong. ${res.why}` : res.status === 'timeout' ? 'Out of air. No points.' : 'Skipped.') + ` Depth ${m(res.depthAfter)}.`;

    const nextBtn = $('next');
    const label = i === TURNS - 1 ? 'SEE YOUR DIVE ▼' : 'NEXT PROMPT ▼';
    if (fresh) {
      if (res.status === 'ok') sfx.good(TIER_LEVEL[res.tier] || 1); else sfx.bad();
      tally(pts, res.points);
      if (res.points > 0) {
        state.drilling = true;
        nextBtn.disabled = true; nextBtn.textContent = 'DRILLING…';
        setTimeout(() => sfx.dive(), 250);
        art.moveTo(res.after / E.PTS_PER_ZONE, 500 + res.points * 16, () => {
          state.drilling = false; nextBtn.disabled = false; nextBtn.textContent = label;
          if (!zc.hidden) sfx.good(5);
          try { nextBtn.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
        });
      } else { nextBtn.disabled = false; nextBtn.textContent = label; }
    } else {
      pts.textContent = '+' + res.points;
      art.jump(res.after / E.PTS_PER_ZONE);
      nextBtn.disabled = false; nextBtn.textContent = label;
    }
    if (!state.drilling) { try { nextBtn.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }

  function tally(el, target) {
    if (reduced || target === 0) { el.textContent = '+' + target; return; }
    const start = performance.now(), ms = 450 + target * 6;
    const step = (now) => {
      const k = Math.min(1, (now - start) / ms);
      const v = Math.round(target * k);
      el.textContent = '+' + v;
      if (v % 7 === 0) sfx.tick();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function next() {
    if (state.screen !== 'result' || state.drilling) return;
    if (state.turn < TURNS - 1) { state.turn++; ask(false); } else finish(true);
  }

  // ---------- end ----------
  function finish(fresh) {
    state.turn = TURNS;
    show('end'); setTrack();
    $('hud-zone').textContent = '7/7';
    $('hud-score').textContent = pad(state.total, 3);
    art.jump(state.total / E.PTS_PER_ZONE);
    const floor = state.total >= E.PTS_PER_ZONE * (E.ZONES.length - 1); // reached Challenger Deep
    art.openChest(floor);
    if (fresh) sfx.fanfare();
    const depth = E.depthFor(state.total), zone = E.zoneFor(state.total);
    $('e-total').textContent = m(depth);
    $('e-zone').textContent = state.total >= E.MAX_PTS ? 'THE SEA FLOOR' : zone.name;
    $('e-rank').textContent = 'RANK: ' + E.rankFor(state.total);
    $('e-points').textContent = state.total >= E.MAX_PTS ? `${state.total} points. A perfect dive!` : `${state.total} points. ${E.MAX_PTS - state.total} more would have reached the sea floor.`;
    const best = store.get('bestDepth', 0);
    if (fresh && depth > best) store.set('bestDepth', Math.round(depth));
    $('e-best').textContent = depth > best ? (best ? `New deepest dive! Old record: ${m(best)}.` : 'Your first logged dive.') : `Deepest dive: ${m(best)}.`;
    const tbody = $('e-log');
    tbody.innerHTML = '';
    state.results.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td><span></span><br><span class="muted"></span></td><td></td><td class="pts"><span class="dot"></span><span></span></td>';
      tr.children[0].children[0].textContent = r.zone;
      tr.children[0].children[2].textContent = r.text;
      tr.children[1].textContent = r.status === 'ok' ? r.name : r.status === 'wrong' ? `${r.name} (boot)` : r.status === 'timeout' ? '— (out of air)' : '—';
      tr.children[2].classList.add('t-' + r.tier);
      tr.children[2].children[1].textContent = r.points;
      tbody.appendChild(tr);
    });
    $('e-msg').textContent = '';
    try { $('again').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function shareText() {
    const icons = state.results.map((r) => EMOJI[r.status === 'timeout' ? 'timeout' : r.tier] || '👢').join('');
    const where = state.total >= E.MAX_PTS ? 'the sea floor' : E.zoneFor(state.total).name;
    const lines = state.results.map((r) => `${r.zone}: ${r.status === 'ok' ? r.name : '—'} (+${r.points})`);
    return `DRILLION 🌊 I drilled to ${m(E.depthFor(state.total))} (${where}) with ${state.total} pts\n${icons}\n${lines.join('\n')}`;
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

  function resume(data) {
    if (!data || !data.prompts || !data.prompts.length || !data.screen || data.screen === 'title') return false;
    const prompts = data.prompts.map((x) => E.rebuildOne(x.z, x.key));
    if (!prompts.every(Boolean)) return false;
    state.prompts = prompts; state.results = data.results || []; state.total = data.total || 0;
    state.used = new Set(data.used || []); state.turn = data.turn || 0;
    if (state.results.length >= TURNS || state.turn >= TURNS) { finish(false); return true; }
    art.jump(state.total / E.PTS_PER_ZONE);
    if (state.results[state.turn]) showResult(state.turn, false); else ask(false);
    return true;
  }

  function start(data) {
    renderTitle();
    bind();
    art.init($('scene'), onFrame);
    try { if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(snapshot); } catch (e) { /* not in a viewer */ }
    if (resume(data)) return;
    show('title'); setTrack(); setHud();
    art.jump(-1);
  }

  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.ready === 'function') hot.ready(start);
  else start((hot && hot.data) || {});
})();
