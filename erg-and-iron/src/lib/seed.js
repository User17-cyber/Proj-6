// Demo data for a competitive rower: 2k PR 6:18.4 (1:34.6), 140 kg trap bar
// deadlift. Everything is dated relative to today so the dashboard is always
// mid-week, with a heavy deadlift session yesterday and AT intervals tomorrow.

import { addDays } from './dates.js';
import { LIFTS, ROWS } from './plan.js';

export const STORAGE_VERSION = 1;

export function buildSeed(today) {
  const workouts = [];
  let n = 0;
  const id = () => `seed-${++n}`;
  const row = (offset, type, distance, split, rate, rpe, title) =>
    workouts.push({ id: id(), kind: 'row', date: addDays(today, offset), type, distance, split, rate, rpe, ...(title ? { title } : {}) });
  const lift = (offset, exercise, sets, reps, weight, feel = 'moderate') =>
    workouts.push({ id: id(), kind: 'lift', date: addDays(today, offset), exercise, sets, reps, weight, feel });

  // Seven earlier training weeks (oldest first), with strength and hard-piece
  // pace both progressing. `end` is the last day of each week.
  const deadlift = [120, 120, 122.5, 125, 125, 127.5, 140];
  const squat = [92.5, 95, 95, 97.5, 100, 100, 102.5];
  const pullUp = [10, 10, 12.5, 12.5, 15, 15, 17.5];
  const atSplit = [104.4, 104.1, 103.8, 103.3, 103.0, 102.6, 102.3];
  const sprintSplit = [87.6, 87.4, 87.1, 86.9, 86.6, 86.3, 86.1];

  for (let i = 0; i < 7; i++) {
    const end = -7 * (7 - i);
    const prWeek = i === 6;

    row(end - 6, 'ut2', 16000, 123.4 - i * 0.1, 19, 4);
    lift(end - 6, 'front-squat', 4, 5, squat[i]);
    lift(end - 6, 'power-clean', 5, 3, 72.5 + i * 1.25, 'explosive');
    lift(end - 6, 'weighted-plank', 3, 45, 15);

    if (prWeek) {
      // 2k test: 6:18.4
      row(end - 5, 'sprint', 2000, 94.6, 34, 10, '2k Test');
    } else {
      row(end - 5, 'at', 6000, atSplit[i], 26, 8, '6x1k AT Intervals');
    }

    row(end - 4, 'tech', 12000, 134, 20, 3);
    lift(end - 4, 'pendlay-row', 4, 6, 77.5 + i * 1.25);
    lift(end - 4, 'weighted-pull-up', 3, 5, pullUp[i]);
    lift(end - 4, 'face-pull', 3, 15, 22.5);
    lift(end - 4, 'pallof-press', 3, 10, 17.5);

    row(end - 3, 'ut1', 10000, 115.6 - i * 0.1, 22, 6);

    row(end - 2, 'ut2', 14000, 122.8 - i * 0.1, 19, 4);
    if (prWeek) lift(end - 2, 'trap-bar-deadlift', 3, 3, 140);
    else lift(end - 2, 'trap-bar-deadlift', 4, 5, deadlift[i], i % 3 === 2 ? 'grindy' : 'moderate');
    lift(end - 2, 'romanian-deadlift', 3, 8, 90 + i * 1.25);
    lift(end - 2, 'back-extension', 3, 12, 15);

    row(end - 1, 'sprint', 1500, sprintSplit[i], 36, 9, '6x250m Starts');
    row(end, 'ut2', 8000, 124, 18, 3, '8k Recovery Paddle');
  }

  // The last six days: 64,000 m on the water and erg.
  row(-6, 'ut2', 16000, 123.5, 19, 4);
  lift(-6, 'front-squat', 4, 5, 102.5);
  lift(-6, 'power-clean', 5, 3, 80, 'explosive');
  lift(-6, 'weighted-plank', 3, 45, 20);

  row(-5, 'at', 6000, 102.0, 26, 8, '6x1k AT Intervals');

  row(-4, 'tech', 12000, 134, 20, 3);
  lift(-4, 'pendlay-row', 3, 6, 85);
  lift(-4, 'face-pull', 3, 15, 25);
  lift(-4, 'pallof-press', 3, 10, 20);

  row(-3, 'ut1', 10000, 114.8, 22, 6);

  row(-2, 'ut2', 14000, 122.4, 19, 4);
  lift(-2, 'front-squat', 3, 5, 105);
  lift(-2, 'romanian-deadlift', 3, 8, 100);
  lift(-2, 'back-extension', 3, 12, 20);

  // Yesterday: the heavy session that today's readiness is recovering from.
  row(-1, 'ut1', 6000, 115.0, 22, 6);
  lift(-1, 'trap-bar-deadlift', 4, 5, 130, 'grindy');
  lift(-1, 'power-clean', 4, 3, 82.5, 'explosive');
  lift(-1, 'weighted-plank', 3, 45, 20);

  return {
    version: STORAGE_VERSION,
    units: 'kg',
    athlete: {
      name: 'Demo Athlete',
      squad: 'Openweight · 88 kg',
      bodyweight: 88,
      pr2k: { split: 94.6, date: addDays(today, -12) },
    },
    workouts,
    // Today: steady state plus a lower-body pull session. Tomorrow: AT intervals.
    plans: {
      [today]: { row: ROWS.steady12, lift: LIFTS.lowerPull },
      [addDays(today, 1)]: { row: ROWS.at8x500, lift: null },
    },
  };
}
