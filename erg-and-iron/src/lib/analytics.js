// Derived metrics: weekly volume, stroke-phase balance and power transfer.

import { addDays, diffDays, lastNDays } from './dates.js';
import { ROW_TYPE, splitToWatts } from './rowing.js';
import { EXERCISE, PHASES, tonnage } from './exercises.js';
import { readinessOn } from './load.js';

/* ───────────────────────── Weekly volume ───────────────────────── */

/** Last 7 days of metres (aerobic vs hard) and tonnage (controlled vs grindy). */
export function weeklyVolume(workouts, today) {
  const days = lastNDays(today, 7).map((date) => ({
    date,
    base: 0,
    hard: 0,
    controlled: 0,
    grindy: 0,
  }));
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
  for (const w of workouts) {
    const day = byDate[w.date];
    if (!day) continue;
    if (w.kind === 'row') day[ROW_TYPE[w.type].band] += w.distance;
    else day[w.feel === 'grindy' ? 'grindy' : 'controlled'] += tonnage(w);
  }
  const sum = (key) => days.reduce((t, d) => t + d[key], 0);
  const totals = { base: sum('base'), hard: sum('hard'), controlled: sum('controlled'), grindy: sum('grindy') };
  return {
    days,
    totals,
    meters: totals.base + totals.hard,
    tonnage: totals.controlled + totals.grindy,
  };
}

/* ─────────────────────── Stroke-phase balance ─────────────────────── */

export const NEGLECT_THRESHOLD = 15;
export const DOMINANCE_THRESHOLD = 65;

const NEGLECT_TEXT = {
  finish:
    'Finish/Scapular pulling is under 15% of volume. Add rear delt and serratus work to protect against rib stress.',
  swing:
    'Body swing and trunk work is under 15% of volume. Add anti-rotation and back-extension work so the lumbar spine is not the weak link between legs and handle.',
  drive:
    'Catch and leg-drive work is under 15% of volume. The legs produce most of the stroke, so add a squat or trap bar pull to keep the drive strong.',
};

/**
 * Share of the last 7 days of lifting given to each stroke phase.
 * metric: 'sets' (working sets) or 'tonnage' (kg lifted).
 */
export function phaseBalance(workouts, today, metric = 'sets') {
  const from = addDays(today, -6);
  const value = (w) => (metric === 'tonnage' ? tonnage(w) : w.sets);
  const sums = { drive: 0, swing: 0, finish: 0, push: 0 };
  for (const w of workouts) {
    if (w.kind !== 'lift' || w.date < from || w.date > today) continue;
    sums[EXERCISE[w.exercise].phase] += value(w);
  }
  const total = sums.drive + sums.swing + sums.finish;
  const phases = PHASES.map((p) => ({
    ...p,
    value: sums[p.id],
    pct: total > 0 ? (sums[p.id] / total) * 100 : 0,
  }));

  let callout;
  if (total === 0) {
    callout = { level: 'manage', phase: null, text: 'No stroke-specific lifting logged in the last 7 days.' };
  } else {
    const weakest = [...phases].sort((a, b) => a.pct - b.pct)[0];
    const strongest = [...phases].sort((a, b) => b.pct - a.pct)[0];
    if (weakest.pct < NEGLECT_THRESHOLD) {
      callout = { level: weakest.pct < 8 ? 'high' : 'manage', phase: weakest.id, text: NEGLECT_TEXT[weakest.id] };
    } else if (strongest.pct > DOMINANCE_THRESHOLD) {
      callout = {
        level: 'manage',
        phase: strongest.id,
        text: `${strongest.short} is over ${DOMINANCE_THRESHOLD}% of volume. Shift a few sets to the other two phases so one link in the chain is not carrying the stroke.`,
      };
    } else {
      callout = {
        level: 'primed',
        phase: null,
        text: 'All three stroke phases are getting at least 15% of your lifting volume.',
      };
    }
  }
  return { metric, total, push: sums.push, phases, callout };
}

/* ───────────────────────── Power transfer ───────────────────────── */

export const KEY_LIFTS = ['trap-bar-deadlift', 'front-squat', 'weighted-pull-up'];

/** Epley estimated one-rep max. */
export function e1rm(weight, reps) {
  return weight * (1 + reps / 30);
}

/** Load moved, counting bodyweight for pull-ups. */
function liftLoad(w, bodyweight) {
  return EXERCISE[w.exercise].bodyweight ? w.weight + bodyweight : w.weight;
}

/** Best set of an exercise by estimated 1RM within [from, to]. */
export function bestLift(workouts, exerciseId, bodyweight, from = '', to = '9999-12-31') {
  let best = null;
  for (const w of workouts) {
    if (w.kind !== 'lift' || w.exercise !== exerciseId || w.date < from || w.date > to) continue;
    const est = e1rm(liftLoad(w, bodyweight), w.reps);
    if (!best || est > best.e1rm) best = { e1rm: est, weight: w.weight, reps: w.reps, date: w.date };
  }
  return best;
}

/**
 * 2k performance: the seeded PR, beaten by any faster logged 2,000 m piece at
 * 2k/Sprint Pace.
 */
export function best2k(workouts, athlete) {
  let split = athlete.pr2k.split;
  let date = athlete.pr2k.date;
  for (const w of workouts) {
    if (w.kind === 'row' && w.type === 'sprint' && w.distance === 2000 && w.split < split) {
      split = w.split;
      date = w.date;
    }
  }
  return { split, time: split * 4, watts: splitToWatts(split), date };
}

/** Highest average power of any logged piece. */
export function peakWatts(workouts) {
  let best = null;
  for (const w of workouts) {
    if (w.kind !== 'row') continue;
    const watts = splitToWatts(w.split);
    if (!best || watts > best.watts) best = { watts, split: w.split, distance: w.distance, date: w.date };
  }
  return best;
}

export const TRANSFER_BAND = [2.4, 3.0];

/** 2k watts per kg of trap bar deadlift e1RM, with a rule-of-thumb reading. */
export function transferRatio(watts2k, deadliftE1rm) {
  if (!deadliftE1rm) return null;
  const ratio = watts2k / deadliftE1rm;
  const [lo, hi] = TRANSFER_BAND;
  if (ratio < lo) {
    return {
      ratio,
      zone: 'strength-rich',
      label: 'Strength-rich',
      text: 'You are stronger than your 2k shows. More weight is unlikely to move the split; spend the next block turning force into boat speed with rate work and race-pace pieces.',
    };
  }
  if (ratio > hi) {
    return {
      ratio,
      zone: 'strength-limited',
      label: 'Strength-limited',
      text: 'Your engine is ahead of your strength. Heavy leg-drive work is the cheapest speed available to you right now.',
    };
  }
  return {
    ratio,
    zone: 'balanced',
    label: 'Balanced',
    text: 'Strength and erg power are in proportion. Keep building both and watch that they keep moving together.',
  };
}

export const TREND_WEEKS = 8;

/** Hard erg work is tracked in three like-for-like buckets. */
export const ERG_BUCKETS = [
  { id: 'at', label: 'AT' },
  { id: 'sprint', label: 'Sprint' },
  { id: 'race', label: '2k pace' },
];

function ergBucket(w) {
  if (w.type === 'at') return 'at';
  // Short starts and full race-pace pieces produce very different watts, so
  // they are never compared with each other.
  if (w.type === 'sprint') return w.distance >= 2000 ? 'race' : 'sprint';
  return null;
}

/**
 * Eight rolling weeks of strength vs erg power, each indexed to 100 at the
 * first week that has data.
 *
 * strength  sum of the week's best e1RM on the three key lifts
 * erg       a chained index: each week it moves by the average change in best
 *           watts across the buckets (AT, sprint, 2k pace) it shares with the
 *           week before, so a bucket is only ever compared with itself
 * A week with no data for a measure carries the previous value forward.
 */
export function transferTrend(workouts, today, bodyweight) {
  const weeks = [];
  const lifts = {};
  let erg = {};
  let ergIdx = null;
  for (let k = TREND_WEEKS - 1; k >= 0; k--) {
    const to = addDays(today, -7 * k);
    const from = addDays(to, -6);
    for (const id of KEY_LIFTS) {
      const b = bestLift(workouts, id, bodyweight, from, to);
      if (b) lifts[id] = b.e1rm;
    }

    const weekBest = {};
    for (const w of workouts) {
      if (w.kind !== 'row' || w.date < from || w.date > to) continue;
      const bucket = ergBucket(w);
      if (bucket) weekBest[bucket] = Math.max(weekBest[bucket] ?? 0, splitToWatts(w.split));
    }
    const prev = erg;
    erg = { ...prev, ...weekBest };
    const shared = Object.keys(erg).filter((b) => prev[b]);
    if (ergIdx == null) {
      if (Object.keys(erg).length) ergIdx = 100;
    } else if (shared.length) {
      ergIdx *= shared.reduce((t, b) => t + erg[b] / prev[b], 0) / shared.length;
    }

    const haveLifts = KEY_LIFTS.filter((id) => lifts[id]);
    weeks.push({
      index: k,
      from,
      to,
      strength: haveLifts.length ? haveLifts.reduce((t, id) => t + lifts[id], 0) : null,
      liftCount: haveLifts.length,
      erg,
      ergIdx,
    });
  }

  // Strength is only comparable between weeks that include the same lifts.
  const fullCount = Math.max(...weeks.map((w) => w.liftCount));
  const baseStrength = weeks.find((w) => w.liftCount === fullCount && w.strength)?.strength ?? null;
  const points = weeks.map((w) => ({
    ...w,
    strengthIdx: w.strength && baseStrength && w.liftCount === fullCount ? (w.strength / baseStrength) * 100 : null,
  }));

  const change = (key) => {
    const vals = points.map((p) => p[key]).filter((v) => v != null);
    if (vals.length < 2) return null;
    return vals[vals.length - 1] - vals[0];
  };
  const strengthChange = change('strengthIdx');
  const ergChange = change('ergIdx');

  // Average posterior readiness across the last 7 days: is the lifting landing
  // as fitness or as fatigue?
  const recent = lastNDays(today, 7).map((d) => readinessOn(workouts, d).post.score);
  const avgReadiness = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);

  return {
    points,
    strengthChange,
    ergChange,
    avgReadiness,
    verdict: transferVerdict(strengthChange, ergChange, avgReadiness),
  };
}

export function transferVerdict(strengthChange, ergChange, avgReadiness) {
  if (strengthChange == null || ergChange == null) {
    return {
      level: 'manage',
      title: 'Not enough data yet',
      text: 'Log key lifts and hard erg pieces across at least two weeks to see whether strength is transferring.',
    };
  }
  const strengthUp = strengthChange >= 1.5;
  const ergUp = ergChange >= 0.75;
  const pct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;
  if (strengthUp && ergUp) {
    return {
      level: 'primed',
      title: 'Strength is transferring',
      text: `Key lifts are up ${pct(strengthChange)} and hard-piece power is up ${pct(ergChange)} over ${TREND_WEEKS} weeks. The gym work is showing up at the handle.`,
    };
  }
  if (strengthUp && !ergUp) {
    if (avgReadiness < 65) {
      return {
        level: 'high',
        title: 'Adding fatigue, not speed',
        text: `Key lifts are up ${pct(strengthChange)} but hard-piece power is ${pct(ergChange)}, and posterior readiness has averaged ${avgReadiness}% this week. Cut lower-body volume before hard erg days.`,
      };
    }
    return {
      level: 'manage',
      title: 'Stronger, but not faster yet',
      text: `Key lifts are up ${pct(strengthChange)} while hard-piece power is ${pct(ergChange)}. Add race-pace and rate work to convert the new strength.`,
    };
  }
  if (!strengthUp && ergUp) {
    return {
      level: 'primed',
      title: 'Erg gains without new strength',
      text: `Hard-piece power is up ${pct(ergChange)} with key lifts at ${pct(strengthChange)}. Fitness is driving the gains; strength has room to add more.`,
    };
  }
  return {
    level: avgReadiness < 65 ? 'high' : 'manage',
    title: 'Both have stalled',
    text: `Key lifts are ${pct(strengthChange)} and hard-piece power is ${pct(ergChange)} over ${TREND_WEEKS} weeks. ${
      avgReadiness < 65
        ? `Posterior readiness has averaged ${avgReadiness}%, so recover first.`
        : 'Change the stimulus on one side.'
    }`,
  };
}

/** Days since a date, for "set 12 days ago" labels. */
export function daysAgo(date, today) {
  return diffDays(today, date);
}
