// Training plan: what is scheduled, Auto-Adapt, and the interference projection.

import { addDays, fromISO } from './dates.js';
import { ROW_TYPE, rowGuidance } from './rowing.js';
import { EXERCISE, HEAVY_POSTERIOR } from './exercises.js';
import { impulse, readinessOn } from './load.js';

const R = (type, title, distance, rpe) => ({ type, title, distance, rpe });
const B = (exercise, sets, reps, weight, feel = 'moderate') => ({ exercise, sets, reps, weight, feel });

export const LIFTS = {
  lowerStrength: {
    title: 'Lower Strength',
    blocks: [B('trap-bar-deadlift', 4, 5, 130), B('front-squat', 3, 5, 100), B('weighted-plank', 3, 45, 20)],
  },
  lowerPull: {
    title: 'Lower Pull Strength',
    blocks: [
      B('romanian-deadlift', 4, 6, 110),
      B('front-squat', 4, 4, 105),
      B('bulgarian-split-squat', 3, 8, 40),
      B('pallof-press', 3, 10, 20),
    ],
  },
  pull: {
    title: 'Pull & Posture',
    blocks: [B('pendlay-row', 4, 6, 85), B('weighted-pull-up', 3, 5, 20), B('face-pull', 3, 15, 25), B('pallof-press', 3, 10, 20)],
  },
  power: {
    title: 'Power & Trunk',
    blocks: [B('power-clean', 5, 3, 80, 'explosive'), B('back-extension', 3, 12, 20), B('rear-delt-fly', 3, 15, 10)],
  },
};

export const ROWS = {
  steady16: R('ut2', '16k Steady State', 16000, 4),
  steady12: R('ut2', '12k Steady State', 12000, 4),
  long18: R('ut2', '18k Long Steady State', 18000, 5),
  at8x500: R('at', '8x500m AT Intervals', 4000, 8),
  ut1: R('ut1', '10k UT1', 10000, 6),
  race4x1k: R('sprint', '4x1k at 2k Pace', 4000, 9),
  water: R('tech', '14k On-Water Technical', 14000, 3),
};

// Fallback week, indexed by getDay() (0 = Sunday). Used for any date that has
// no explicit plan, so the schedule never runs dry.
const WEEK = [
  { row: ROWS.long18, lift: null },
  { row: ROWS.steady16, lift: LIFTS.lowerStrength },
  { row: ROWS.at8x500, lift: null },
  { row: ROWS.steady12, lift: LIFTS.pull },
  { row: ROWS.ut1, lift: LIFTS.lowerPull },
  { row: ROWS.race4x1k, lift: null },
  { row: ROWS.water, lift: LIFTS.power },
];

const blank = { row: null, lift: null, originalLift: null, adapted: false, rowDone: false, liftDone: false };

export function getPlan(state, date) {
  const stored = state.plans?.[date];
  if (stored) return { ...blank, ...stored };
  return { ...blank, ...WEEK[fromISO(date).getDay()] };
}

/** Plan blocks as loggable lift workouts. */
export function liftWorkouts(lift, date) {
  return lift.blocks.map(({ exercise, sets, reps, weight, feel }) => ({
    kind: 'lift',
    date,
    exercise,
    sets,
    reps,
    weight,
    feel,
  }));
}

/** A planned row as a loggable workout, paced for the athlete's current state. */
export function rowWorkout(row, date, split2k, readiness) {
  const g = rowGuidance(row.type, split2k, readiness);
  return {
    kind: 'row',
    date,
    type: row.type,
    title: row.title,
    distance: row.distance,
    split: Math.round(((g.fast + g.slow) / 2) * 10) / 10,
    rate: Math.round((g.rate[0] + g.rate[1]) / 2),
    rpe: row.rpe,
  };
}

// Upper-body push and core work, alternated, used to replace posterior loading.
const SWAPS = [
  B('bench-press', 4, 6, 80),
  B('weighted-plank', 3, 45, 20),
  B('overhead-press', 3, 8, 47.5),
  B('pallof-press', 3, 10, 20),
  B('incline-db-press', 3, 10, 26),
  B('ab-wheel', 3, 10, 0),
];

export function isHeavyPosterior(block) {
  return EXERCISE[block.exercise].post >= HEAVY_POSTERIOR;
}

/**
 * Replace every heavy lower-body / posterior lift with upper-body push or core
 * work. Lifts that do not load the posterior chain are kept as written.
 */
export function adaptLift(lift) {
  const kept = new Set(lift.blocks.filter((b) => !isHeavyPosterior(b)).map((b) => b.exercise));
  const queue = SWAPS.filter((s) => !kept.has(s.exercise));
  const blocks = [];
  for (const block of lift.blocks) {
    if (!isHeavyPosterior(block)) {
      blocks.push(block);
      continue;
    }
    const swap = queue.shift();
    if (swap) blocks.push({ ...swap, replaces: block.exercise });
  }
  return { title: 'Upper Push + Core', blocks };
}

/**
 * Will today's lift compromise tomorrow's row?
 *
 * Projects tomorrow's readiness three ways (lift as planned, adapted, skipped)
 * with the same model the gauges use, and compares it with what the session
 * needs. Anything still to do today is counted as if it will be done.
 */
export function interference(state, today) {
  const tomorrow = addDays(today, 1);
  const plan = getPlan(state, today);
  const next = getPlan(state, tomorrow);
  if (!next.row) return { status: 'no-row', plan, next };

  const split2k = state.athlete.pr2k.split;
  const now = readinessOn(state.workouts, today);
  const pendingRow =
    plan.row && !plan.rowDone
      ? [rowWorkout(plan.row, today, split2k, Math.min(now.post.score, now.cns.score))]
      : [];
  const project = (lift) => {
    const extra = lift ? liftWorkouts(lift, today) : [];
    const r = readinessOn([...state.workouts, ...pendingRow, ...extra], tomorrow);
    return { post: r.post.score, cns: r.cns.score };
  };

  const need = ROW_TYPE[next.row.type].need;
  const short = (p) => Math.max(0, need.post - p.post, need.cns - p.cns);
  const base = { plan, next, need, row: next.row, skipped: project(null) };

  if (!plan.lift || plan.liftDone) {
    const p = base.skipped;
    return {
      ...base,
      status: plan.liftDone ? 'logged' : 'no-lift',
      projected: p,
      shortfall: short(p),
    };
  }

  const projected = project(plan.lift);
  const culprits = plan.lift.blocks
    .map((b) => ({ block: b, post: impulse({ kind: 'lift', ...b }).post }))
    .filter((c) => isHeavyPosterior(c.block))
    .sort((a, b) => b.post - a.post);

  if (plan.adapted) {
    return {
      ...base,
      status: 'adapted',
      projected,
      original: project(plan.originalLift),
      shortfall: short(projected),
    };
  }

  const adaptedLift = adaptLift(plan.lift);
  const adapted = project(adaptedLift);
  const shortfall = short(projected);
  const limiter = need.post - projected.post >= need.cns - projected.cns ? 'post' : 'cns';
  return {
    ...base,
    status: shortfall > 0 ? 'conflict' : 'clear',
    projected,
    adapted,
    adaptedLift,
    culprits,
    shortfall,
    limiter,
    // Auto-Adapt only helps if there is posterior work to swap and the swap
    // actually improves the limiting score.
    canAdapt: culprits.length > 0 && short(adapted) < shortfall,
  };
}
