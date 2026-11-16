// Readiness model.
//
// Every workout adds fatigue to two systems: the lower body / posterior chain
// and the CNS / upper body. Fatigue fades by a fixed share each night, and
// readiness is what is left:
//
//   fatigue(day)   = Σ impulse(workout) × RETAIN ^ (days since workout)
//   readiness(day) = 100 × e^(−fatigue / K)
//
// The exponential keeps the score inside 0–100 however much is logged: each
// extra hard session costs a share of what remains rather than a fixed chunk.

import { diffDays } from './dates.js';
import { ROW_TYPE, durationSec, rowTitle } from './rowing.js';
import { EXERCISE, FEEL, repEquivalent, liftTitle } from './exercises.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Share of fatigue still present after one night. */
export const RETAIN = { post: 0.55, cns: 0.45 };
/** Fatigue that drops readiness to 1/e (about 37%). */
export const K = 160;
/** Workouts older than this no longer matter (0.55^10 < 0.3%). */
const HORIZON_DAYS = 10;

export const SYSTEMS = {
  post: { id: 'post', label: 'Lower Body / Posterior Chain', short: 'Posterior chain' },
  cns: { id: 'cns', label: 'CNS / Upper Body', short: 'CNS' },
};

/** Fatigue added by one workout: { post, cns }. */
export function impulse(w) {
  if (w.kind === 'row') {
    const type = ROW_TYPE[w.type];
    const minutes = durationSec(w.distance, w.split) / 60;
    // Session-RPE load with a 10-minute floor so short, maximal pieces still count.
    const load = (10 + minutes) * w.rpe;
    return { post: load * type.post, cns: load * type.cns };
  }
  const ex = EXERCISE[w.exercise];
  const repMult = clamp(Math.sqrt(repEquivalent(ex, w.reps) / 5), 0.6, 1.6);
  const relLoad = ex.ref > 0 ? clamp(0.4 + 0.6 * (w.weight / ex.ref), 0.45, 1.4) : 1;
  const sets = w.sets * repMult * relLoad * FEEL[w.feel].mult;
  return { post: sets * ex.post, cns: sets * ex.cns };
}

/**
 * Fatigue carried on `date`. `top` names the main cause for each system: the
 * session (a day's rowing or a day's lifting) contributing most, represented
 * by its single biggest workout.
 */
export function fatigueOn(workouts, date) {
  const out = {
    post: { fatigue: 0, top: null },
    cns: { fatigue: 0, top: null },
  };
  const sessions = { post: new Map(), cns: new Map() };
  for (const w of workouts) {
    const age = diffDays(date, w.date);
    if (age < 0 || age > HORIZON_DAYS) continue;
    const imp = impulse(w);
    for (const sys of ['post', 'cns']) {
      const residual = imp[sys] * RETAIN[sys] ** age;
      out[sys].fatigue += residual;
      const key = `${w.date}:${w.kind}`;
      const s = sessions[sys].get(key) ?? { residual: 0, workout: w, biggest: 0, age };
      s.residual += residual;
      if (residual > s.biggest) {
        s.biggest = residual;
        s.workout = w;
      }
      sessions[sys].set(key, s);
    }
  }
  for (const sys of ['post', 'cns']) {
    for (const s of sessions[sys].values()) {
      if (!out[sys].top || s.residual > out[sys].top.residual) out[sys].top = s;
    }
  }
  return out;
}

export function scoreFromFatigue(fatigue) {
  return clamp(Math.round(100 * Math.exp(-fatigue / K)), 0, 100);
}

/** Readiness on `date`: { post: { score, fatigue, top }, cns: { … } }. */
export function readinessOn(workouts, date) {
  const f = fatigueOn(workouts, date);
  return {
    post: { ...f.post, score: scoreFromFatigue(f.post.fatigue) },
    cns: { ...f.cns, score: scoreFromFatigue(f.cns.fatigue) },
  };
}

export const STATUS = {
  primed: { id: 'primed', label: 'Primed / Fresh', color: 'var(--color-primed)' },
  manage: { id: 'manage', label: 'Manage Load', color: 'var(--color-manage)' },
  high: { id: 'high', label: 'High Fatigue', color: 'var(--color-high)' },
};

export function statusFor(score) {
  if (score >= 75) return STATUS.primed;
  if (score >= 50) return STATUS.manage;
  return STATUS.high;
}

export function workoutTitle(w) {
  return w.kind === 'row' ? rowTitle(w) : liftTitle(w);
}
