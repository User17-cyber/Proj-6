// Procedural sound synthesis into AudioBuffers (computed once, many random variants).

export type Gen = (ctx: BaseAudioContext, seed: number) => AudioBuffer;

function rng(seed: number) { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function buf(ctx: BaseAudioContext, secs: number, ch = 1) { return ctx.createBuffer(ch, Math.max(1, Math.floor(secs * ctx.sampleRate)), ctx.sampleRate); }

/** One-pole filters applied in place. */
function lowpass(d: Float32Array, sr: number, fc: number) { const a = Math.exp(-2 * Math.PI * fc / sr); let y = 0; for (let i = 0; i < d.length; i++) { y = (1 - a) * d[i] + a * y; d[i] = y; } }
function highpass(d: Float32Array, sr: number, fc: number) { const a = Math.exp(-2 * Math.PI * fc / sr); let y = 0, px = 0; for (let i = 0; i < d.length; i++) { y = a * (y + d[i] - px); px = d[i]; d[i] = y; } }
/** Two-pole resonant bandpass (biquad, constant skirt gain). */
function bandpass(d: Float32Array, sr: number, f: number | ((t: number) => number), q: number) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const fc = typeof f === 'number' ? f : f(i / sr);
    const w = 2 * Math.PI * Math.min(fc, sr * 0.45) / sr, al = Math.sin(w) / (2 * q), c = Math.cos(w);
    const b0 = al, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
    const x = d[i];
    const y = (b0 * x - b0 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    d[i] = y;
  }
}
function normalize(d: Float32Array, peak = 0.9) { let m = 0; for (const v of d) m = Math.max(m, Math.abs(v)); if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m; }

/** Steel on steel: inharmonic bar modes with a noisy transient. */
export const clang: Gen = (ctx, seed) => {
  const r = rng(seed), sr = ctx.sampleRate;
  const b = buf(ctx, 1.4), d = b.getChannelData(0);
  const f0 = 520 + r() * 900;
  const ratios = [1, 2.76, 5.4, 8.93, 13.34, 18.64, 3.9];
  const parts = ratios.map((k, i) => ({ f: f0 * k * (1 + (r() - 0.5) * 0.04), a: (1 / (1 + i * 0.6)) * (0.6 + r() * 0.6), dec: (0.25 + r() * 0.6) / (1 + i * 0.35), ph: r() * 6.28 }));
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    let s = 0;
    for (const p of parts) if (p.f < sr * 0.45) s += p.a * Math.sin(2 * Math.PI * p.f * t + p.ph) * Math.exp(-t / p.dec);
    // beat/shimmer
    s *= 1 + 0.15 * Math.sin(2 * Math.PI * (4 + r() * 0.01) * t);
    s += (r() * 2 - 1) * Math.exp(-t / 0.004) * 0.9;
    s += Math.sin(2 * Math.PI * 170 * t) * Math.exp(-t / 0.05) * 0.6;
    d[i] = s;
  }
  highpass(d, sr, 200);
  normalize(d, 0.85);
  return b;
};

/** Blow landing on a wooden shield. */
export const shieldThud: Gen = (ctx, seed) => {
  const r = rng(seed), sr = ctx.sampleRate;
  const b = buf(ctx, 0.5), d = b.getChannelData(0);
  const f = 140 + r() * 80;
  for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.exp(-t / 0.035) * 0.8 + Math.sin(2 * Math.PI * f * t * (1 - t * 0.5)) * Math.exp(-t / 0.09); }
  const n = new Float32Array(d.length); for (let i = 0; i < n.length; i++) n[i] = (r() * 2 - 1) * Math.exp(-i / sr / 0.12) * 0.4;
  bandpass(n, sr, 600 + r() * 300, 3);
  for (let i = 0; i < d.length; i++) d[i] += n[i];
  lowpass(d, sr, 2500);
  normalize(d, 0.9);
  return b;
};

/** Steel cutting into flesh and mail: wet thwack. */
export const hitFlesh: Gen = (ctx, seed) => {
  const r = rng(seed), sr = ctx.sampleRate;
  const b = buf(ctx, 0.6), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    d[i] = (r() * 2 - 1) * Math.exp(-t / 0.03) + Math.sin(2 * Math.PI * (85 + r() * 2) * t) * Math.exp(-t / 0.07) * 1.2;
  }
  lowpass(d, sr, 1800);
  const sq = new Float32Array(d.length);
  for (let i = 0; i < sq.length; i++) sq[i] = (r() * 2 - 1) * Math.exp(-i / sr / 0.14) * (0.4 + 0.6 * Math.sin(i / sr * 60));
  bandpass(sq, sr, (t) => 900 - t * 2500, 4);
  for (let i = 0; i < d.length; i++) d[i] += sq[i] * 1.6;
  // mail rings rattle
  const mail = new Float32Array(d.length);
  for (let i = 0; i < mail.length; i++) mail[i] = (r() * 2 - 1) * Math.exp(-i / sr / 0.06) * (r() < 0.1 ? 1 : 0.2);
  highpass(mail, sr, 4000);
  for (let i = 0; i < d.length; i++) d[i] += mail[i] * 0.5;
  normalize(d, 0.95);
  return b;
};

/** Blow on plate: dull clank and thud. */
export const hitPlate: Gen = (ctx, seed) => {
  const r = rng(seed), sr = ctx.sampleRate;
  const b = buf(ctx, 0.8), d = b.getChannelData(0);
  const f0 = 300 + r() * 250;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    d[i] = Math.sin(2 * Math.PI * f0 * t) * Math.exp(-t / 0.12) * 0.6 + Math.sin(2 * Math.PI * f0 * 2.4 * t) * Math.exp(-t / 0.06) * 0.4
      + Math.sin(2 * Math.PI * 95 * t) * Math.exp(-t / 0.06) * 1.1 + (r() * 2 - 1) * Math.exp(-t / 0.012) * 0.8;
  }
  lowpass(d, sr, 4500);
  normalize(d, 0.9);
  return b;
};

/** Blade cutting the air. heavy = longer and lower. */
export const whoosh = (heavy: boolean): Gen => (ctx, seed) => {
  const r = rng(seed), sr = ctx.sampleRate;
  const len = heavy ? 0.55 : 0.32;
  const b = buf(ctx, len), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  const peak = 0.45 + r() * 0.15;
  bandpass(d, sr, (t) => { const u = t / len; return (heavy ? 300 : 500) + Math.sin(Math.min(1, u / peak) * Math.PI * 0.5) * (heavy ? 900 : 1600) * (u < peak ? 1 : 1 - (u - peak)); }, heavy ? 1.6 : 2.2);
  for (let i = 0; i < d.length; i++) { const u = i / d.length; d[i] *= Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 2.2); }
  normalize(d, 0.8);
  return b;
};

export const kickThud: Gen = (ctx, seed) => {
  const r = rng(seed), sr = ctx.sampleRate;
  const b = buf(ctx, 0.35), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * 65 * t * (1 - t)) * Math.exp(-t / 0.08) * 1.2 + (r() * 2 - 1) * Math.exp(-t / 0.02) * 0.5; }
  lowpass(d, sr, 1200);
  normalize(d, 0.9);
  return b;
};

/** Longbow string release (Karplus-Strong) plus air. */
export const bowTwang: Gen = (ctx, seed) => {
  const r = rng(seed), sr = ctx.sampleRate;
  const b = buf(ctx, 0.6), d = b.getChannelData(0);
  const f = 95 + r() * 30;
  const N = Math.round(sr / f);
  const ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = r() * 2 - 1;
  let p = 0;
  for (let i = 0; i < d.length; i++) {
    const nx = (p + 1) % N;
    const v = 0.5 * (ring[p] + ring[nx]) * 0.985;
    ring[p] = v; p = nx;
    d[i] = v * Math.exp(-i / sr / 0.18);
  }
  const air = new Float32Array(d.length);
  for (let i = 0; i < air.length; i++) air[i] = (r() * 2 - 1) * Math.exp(-i / sr / 0.08);
  bandpass(air, sr, 2500, 1.2);
  for (let i = 0; i < d.length; i++) d[i] = d[i] * 0.9 + air[i] * 0.4;
  normalize(d, 0.8);
  return b;
};

export const arrowThunk: Gen = (ctx, seed) => {
  const r = rng(seed), sr = ctx.sampleRate;
  const b = buf(ctx, 0.25), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.exp(-t / 0.015) + Math.sin(2 * Math.PI * 240 * t) * Math.exp(-t / 0.04) * 0.6; }
  bandpass(d, sr, 900 + r() * 400, 1.5);
  normalize(d, 0.8);
  return b;
};

/** Footstep on turf with a rattle of harness. */
export const step = (armour: number): Gen => (ctx, seed) => {
  const r = rng(seed), sr = ctx.sampleRate;
  const b = buf(ctx, 0.28), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.exp(-t / 0.03); }
  lowpass(d, sr, 700);
  if (armour > 0) {
    const j = new Float32Array(d.length);
    for (let i = 0; i < j.length; i++) j[i] = (r() * 2 - 1) * Math.exp(-i / sr / 0.05) * (r() < 0.25 ? 1 : 0.1);
    bandpass(j, sr, 5200 + r() * 2000, 2);
    for (let i = 0; i < d.length; i++) d[i] += j[i] * armour * 1.5;
  }
  normalize(d, 0.7);
  return b;
};

/** Formant voice: kind 0 effort grunt, 1 pain, 2 death cry, 3 battle shout. */
export const voice = (kind: number): Gen => (ctx, seed) => {
  const r = rng(seed), sr = ctx.sampleRate;
  const len = kind === 2 ? 1.1 + r() * 0.4 : kind === 3 ? 0.9 : kind === 1 ? 0.35 : 0.22;
  const b = buf(ctx, len), d = b.getChannelData(0);
  const f0 = (kind === 3 ? 150 : 105) + r() * 40;
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr, u = t / len;
    let f = f0 * (kind === 2 ? 1.25 - u * 0.55 : kind === 1 ? 1.15 - u * 0.25 : kind === 3 ? 1 + 0.1 * Math.sin(u * 3) : 1.05 - u * 0.15);
    f *= 1 + (r() - 0.5) * 0.04;
    ph += f / sr;
    const saw = (ph % 1) * 2 - 1;
    const pulse = Math.pow(Math.max(0, Math.sin(ph * Math.PI * 2)), 6) * 2 - 0.3;
    const breath = (r() * 2 - 1) * (kind === 2 ? 0.35 : 0.25);
    const env = kind === 2 ? Math.min(1, u * 8) * Math.pow(1 - u, 1.3) : Math.min(1, u * 20) * Math.pow(1 - u, kind === 0 ? 2.5 : 1.6);
    d[i] = (saw * 0.4 + pulse * 0.6 + breath) * env;
  }
  // vowel formants
  const vowels: [number, number, number][] = kind === 0 ? [[650, 1080, 2650], [500, 900, 2500]] : kind === 1 ? [[450, 1000, 2400], [400, 800, 2300]] : kind === 2 ? [[750, 1150, 2600], [520, 860, 2400]] : [[700, 1200, 2600], [750, 1250, 2700]];
  const out = new Float32Array(d.length);
  const gains = [1, 0.55, 0.25];
  for (let fI = 0; fI < 3; fI++) {
    const c = d.slice();
    bandpass(c, sr, (t) => vowels[0][fI] + (vowels[1][fI] - vowels[0][fI]) * Math.min(1, t / len), fI === 0 ? 5 : 7);
    for (let i = 0; i < out.length; i++) out[i] += c[i] * gains[fI];
  }
  lowpass(out, sr, 3800);
  normalize(out, kind === 2 ? 0.85 : 0.7);
  b.copyToChannel(out, 0);
  return b;
};

/** War horn: brassy saw with vibrato, swelling. */
export const horn = (notes: number[]): Gen => (ctx, seed) => {
  const r = rng(seed), sr = ctx.sampleRate;
  const len = notes.length * 1.2 + 0.8;
  const b = buf(ctx, len, 2);
  const L = b.getChannelData(0), R = b.getChannelData(1);
  let ph = 0, ph2 = 0;
  for (let i = 0; i < L.length; i++) {
    const t = i / sr;
    const ni = Math.min(notes.length - 1, Math.floor(t / 1.2));
    const f = notes[ni] * (1 + 0.006 * Math.sin(2 * Math.PI * 5.2 * t)) * (1 + (r() - 0.5) * 0.002);
    ph += f / sr; ph2 += f * 1.003 / sr;
    const s = ((ph % 1) * 2 - 1) * 0.6 + ((ph2 % 1) * 2 - 1) * 0.4;
    const lt = t - ni * 1.2;
    const env = Math.min(1, lt / 0.25) * (ni === notes.length - 1 ? Math.exp(-Math.max(0, lt - 0.7) / 0.5) : Math.min(1, (1.2 - lt) / 0.1 + 0.3));
    L[i] = s * env; R[i] = s * env;
  }
  lowpass(L, sr, 1400); lowpass(L, sr, 2200); lowpass(R, sr, 1300); lowpass(R, sr, 2100);
  normalize(L, 0.7); normalize(R, 0.7);
  return b;
};

export const drum: Gen = (ctx, seed) => {
  const r = rng(seed), sr = ctx.sampleRate;
  const b = buf(ctx, 0.9), d = b.getChannelData(0);
  const f0 = 70 + r() * 20;
  for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * f0 * t * (1 - t * 0.35)) * Math.exp(-t / 0.28) + (r() * 2 - 1) * Math.exp(-t / 0.02) * 0.4; }
  lowpass(d, sr, 900);
  normalize(d, 0.9);
  return b;
};

/** Distant battle din loop: roaring crowd, clashing steel, shouts. */
export const battleLoop: Gen = (ctx, seed) => {
  const r = rng(seed), sr = ctx.sampleRate;
  const len = 9;
  const b = buf(ctx, len, 2);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = (r() * 2 - 1);
    bandpass(d, sr, (t) => 380 + 120 * Math.sin(t * 0.7 + ch), 0.7);
    for (let i = 0; i < d.length; i++) d[i] *= 0.35 * (0.7 + 0.3 * Math.sin(i / sr * 1.3 + ch * 2));
    // scattered distant clangs
    for (let k = 0; k < 40; k++) {
      const at = Math.floor(r() * (d.length - sr * 0.4));
      const f = 700 + r() * 1500, a = 0.05 + r() * 0.12;
      for (let i = 0; i < sr * 0.35; i++) { const t = i / sr; d[at + i] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.08) * a + Math.sin(2 * Math.PI * f * 2.7 * t) * Math.exp(-t / 0.04) * a * 0.5; }
    }
    lowpass(d, sr, 3000);
    // crossfade the loop seam
    const fade = Math.floor(sr * 0.5);
    for (let i = 0; i < fade; i++) { const w = i / fade; d[i] = d[i] * w + d[d.length - fade + i] * (1 - w); }
    normalize(d, 0.5);
  }
  return b;
};

/** Wind (and surf when coastal) loop. */
export const windLoop = (surf: boolean): Gen => (ctx, seed) => {
  const r = rng(seed), sr = ctx.sampleRate;
  const len = 12;
  const b = buf(ctx, len, 2);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    lowpass(d, sr, surf ? 900 : 500);
    lowpass(d, sr, surf ? 1200 : 700);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const gust = 0.5 + 0.35 * Math.sin(t * 0.55 + ch) + 0.15 * Math.sin(t * 1.7 + ch * 3);
      const wave = surf ? 0.4 + 0.6 * Math.pow(Math.max(0, Math.sin(t * 0.6 + ch * 0.5)), 3) : 1;
      d[i] *= gust * wave;
    }
    const fade = Math.floor(sr * 1);
    for (let i = 0; i < fade; i++) { const w = i / fade; d[i] = d[i] * w + d[d.length - fade + i] * (1 - w); }
    normalize(d, 0.6);
  }
  return b;
};

export const fireLoop: Gen = (ctx, seed) => {
  const r = rng(seed), sr = ctx.sampleRate;
  const b = buf(ctx, 4), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (r() * 2 - 1) * 0.15;
  lowpass(d, sr, 600);
  for (let k = 0; k < 90; k++) { const at = Math.floor(r() * (d.length - 400)); const a = 0.3 + r() * 0.7; for (let i = 0; i < 300; i++) d[at + i] += (r() * 2 - 1) * a * Math.exp(-i / 40); }
  normalize(d, 0.6);
  return b;
};

export const uiTick: Gen = (ctx) => {
  const sr = ctx.sampleRate;
  const b = buf(ctx, 0.08), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * 2400 * t) * Math.exp(-t / 0.012) * 0.6 + Math.sin(2 * Math.PI * 900 * t) * Math.exp(-t / 0.02) * 0.4; }
  return b;
};
export const hitTick: Gen = (ctx) => {
  const sr = ctx.sampleRate;
  const b = buf(ctx, 0.12), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * 1500 * t) * Math.exp(-t / 0.02) * 0.5 + Math.sin(2 * Math.PI * 3100 * t) * Math.exp(-t / 0.01) * 0.35; }
  return b;
};
/** Sting for a kill: deep drum and a bright bell. */
export const killSting: Gen = (ctx) => {
  const sr = ctx.sampleRate;
  const b = buf(ctx, 1.4), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    d[i] = Math.sin(2 * Math.PI * 55 * t * (1 - t * 0.2)) * Math.exp(-t / 0.35) * 0.9
      + (Math.sin(2 * Math.PI * 880 * t) * 0.3 + Math.sin(2 * Math.PI * 1320 * t) * 0.2 + Math.sin(2 * Math.PI * 2420 * t) * 0.12) * Math.exp(-t / 0.5);
  }
  normalize(d, 0.75);
  return b;
};
/** Lute pluck for music (Karplus-Strong). */
export const pluck = (freq: number, len = 2.2): Gen => (ctx, seed) => {
  const r = rng(seed), sr = ctx.sampleRate;
  const b = buf(ctx, len), d = b.getChannelData(0);
  const N = Math.max(2, Math.round(sr / freq));
  const ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = (r() * 2 - 1) * (i < N / 2 ? 1 : 0.6);
  let p = 0;
  for (let i = 0; i < d.length; i++) {
    const nx = (p + 1) % N;
    const v = (ring[p] * 0.55 + ring[nx] * 0.45) * 0.996;
    ring[p] = v; p = nx;
    d[i] = v;
  }
  lowpass(d, sr, 3200);
  normalize(d, 0.6);
  return b;
};
