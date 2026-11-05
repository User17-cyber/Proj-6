/* DRILLION chiptune sound effects (Web Audio square/triangle waves). Starts on the first click. */
(function () {
  'use strict';
  let ctx = null, master = null, on = true;

  function ensure() {
    if (!on) return null;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.18;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }

  function tone(freq, start, dur, { type = 'square', vol = 0.6, to = null, delay = 0 } = {}) {
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime + start + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.setValueAtTime(vol, t0 + Math.max(0.01, dur - 0.04));
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const sfx = {
    get enabled() { return on; },
    set enabled(v) { on = !!v; if (on) ensure(); },
    unlock() { ensure(); },
    blip() { tone(NOTE(84), 0, 0.05, { vol: 0.25 }); },
    ping() {
      tone(1180, 0, 0.5, { type: 'sine', vol: 0.5, to: 1100 });
      tone(1180, 0.32, 0.4, { type: 'sine', vol: 0.18, to: 1100 });
    },
    dive() {
      tone(NOTE(57), 0, 0.9, { type: 'triangle', vol: 0.5, to: NOTE(33) });
      for (let i = 0; i < 6; i++) tone(NOTE(76 - i * 2), i * 0.12, 0.06, { vol: 0.12 });
    },
    good(level) {
      // level 1 (common) .. 5 (legendary): more notes for rarer catches
      const seq = [72, 76, 79, 84, 88, 91];
      const n = 1 + Math.max(1, level);
      for (let i = 0; i < n; i++) tone(NOTE(seq[i]), i * 0.08, 0.1, { vol: 0.35 });
      if (level >= 4) for (let i = 0; i < 4; i++) tone(NOTE(96 + (i % 2) * 3), n * 0.08 + i * 0.05, 0.05, { vol: 0.15 });
    },
    bad() { tone(196, 0, 0.18, { vol: 0.4 }); tone(147, 0.18, 0.35, { vol: 0.4, to: 70 }); },
    warn() { tone(NOTE(93), 0, 0.06, { vol: 0.22 }); tone(NOTE(93), 0.09, 0.06, { vol: 0.22 }); },
    retry() { tone(NOTE(55), 0, 0.07, { vol: 0.3 }); tone(NOTE(55), 0.1, 0.07, { vol: 0.3 }); },
    tick() { tone(NOTE(96), 0, 0.025, { vol: 0.12 }); },
    fanfare() {
      const m = [[67, 0], [72, 0.12], [76, 0.24], [79, 0.36], [76, 0.52], [79, 0.64], [84, 0.8]];
      m.forEach(([n, t]) => tone(NOTE(n), t, 0.14, { vol: 0.35 }));
      tone(NOTE(48), 0, 1.0, { type: 'triangle', vol: 0.5 });
    },
  };
  window.DRILLION = window.DRILLION || {};
  window.DRILLION.sfx = sfx;
})();
