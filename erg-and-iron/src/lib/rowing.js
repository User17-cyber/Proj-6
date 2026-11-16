// Rowing maths: Concept2 pace/watts conversion, session types and pace guidance.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Session types.
 *  post / cns  fatigue cost per load unit on each system (see load.js)
 *  pct         target power band as a fraction of 2k watts
 *  rate        stroke-rate band (spm)
 *  need        minimum readiness to hit the session as written
 *  band        'base' (aerobic) or 'hard' (AT and above) for the volume split
 */
export const ROW_TYPES = [
  { id: 'ut2', label: 'UT2 Steady State', short: 'UT2', band: 'base', post: 0.085, cns: 0.035, pct: [0.45, 0.5], rate: [18, 20], need: { post: 50, cns: 40 } },
  { id: 'ut1', label: 'UT1', short: 'UT1', band: 'base', post: 0.1, cns: 0.05, pct: [0.55, 0.65], rate: [20, 24], need: { post: 60, cns: 50 } },
  { id: 'at', label: 'AT / Threshold', short: 'AT', band: 'hard', post: 0.15, cns: 0.13, pct: [0.72, 0.82], rate: [24, 28], need: { post: 70, cns: 60 } },
  { id: 'sprint', label: '2k/Sprint Pace', short: '2k pace', band: 'hard', post: 0.19, cns: 0.24, pct: [0.97, 1.05], rate: [30, 36], need: { post: 75, cns: 75 } },
  { id: 'tech', label: 'On-Water Technical', short: 'Technical', band: 'base', post: 0.06, cns: 0.03, pct: [0.35, 0.45], rate: [18, 22], need: { post: 40, cns: 35 } },
];

export const ROW_TYPE = Object.fromEntries(ROW_TYPES.map((t) => [t.id, t]));

/** Concept2: watts = 2.80 / pace³, with pace in seconds per metre. */
export function splitToWatts(splitSec) {
  if (!(splitSec > 0)) return 0;
  const pace = splitSec / 500;
  return 2.8 / pace ** 3;
}

export function wattsToSplit(watts) {
  if (!(watts > 0)) return 0;
  return 500 * Math.cbrt(2.8 / watts);
}

export function durationSec(distance, splitSec) {
  return (distance / 500) * splitSec;
}

/** 94.6 → "1:34.6" */
export function formatSplit(sec, decimals = 1) {
  if (!(sec > 0)) return '–';
  const scale = 10 ** decimals;
  const total = Math.round(sec * scale) / scale;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  const width = decimals ? 3 + decimals : 2;
  return `${m}:${s.toFixed(decimals).padStart(width, '0')}`;
}

/** 378.4 → "6:18.4", 2926 → "48:46" */
export function formatClock(sec, decimals = 0) {
  if (!(sec >= 0)) return '–';
  const scale = 10 ** decimals;
  const total = Math.round(sec * scale) / scale;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total - h * 3600 - m * 60;
  const ss = s.toFixed(decimals).padStart(decimals ? 3 + decimals : 2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function rowTitle(w) {
  if (w.title) return w.title;
  const km = w.distance / 1000;
  const dist = Number.isInteger(km) ? `${km}k` : `${w.distance.toLocaleString('en-US')}m`;
  if (w.type === 'sprint') return w.distance === 2000 ? '2k at Race Pace' : `${dist} at 2k/Sprint Pace`;
  return `${dist} ${ROW_TYPE[w.type].label}`;
}

/**
 * Pace and rate band for a session, slowed when the limiting system is tired.
 * Fresh, the band is the zone's share of 2k watts. As readiness falls below 85%
 * the fast end is pulled back toward the easy end; below 60% the easy end
 * relaxes too.
 */
export function rowGuidance(typeId, split2k, readiness) {
  const type = ROW_TYPE[typeId];
  const w2k = splitToWatts(split2k);
  const [lo, hi] = type.pct;
  const span = hi - lo;
  const trim = clamp((85 - readiness) / 35, 0, 1);
  const relax = clamp((60 - readiness) / 30, 0, 1);
  const fastPct = hi - span * trim;
  const slowPct = lo - 0.03 * relax;
  return {
    fast: wattsToSplit(w2k * fastPct),
    slow: wattsToSplit(w2k * slowPct),
    rate: type.rate,
    trimmed: trim > 0,
  };
}
