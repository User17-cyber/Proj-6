import test from 'node:test';
import assert from 'node:assert/strict';

import { addDays, diffDays, lastNDays, relDay } from '../src/lib/dates.js';
import { splitToWatts, wattsToSplit, formatSplit, formatClock, rowGuidance } from '../src/lib/rowing.js';
import { impulse, readinessOn, scoreFromFatigue, statusFor } from '../src/lib/load.js';
import { tonnage } from '../src/lib/exercises.js';
import { adaptLift, getPlan, interference, isHeavyPosterior, liftWorkouts } from '../src/lib/plan.js';
import { best2k, bestLift, e1rm, phaseBalance, transferRatio, transferTrend, weeklyVolume } from '../src/lib/analytics.js';
import { buildSeed } from '../src/lib/seed.js';
import { coachReadiness } from '../src/lib/coach.js';
import { generatePrimer, PRIMER_MODES, PRIMER_TOTAL } from '../src/lib/primer.js';
import { reducer } from '../src/lib/store.js';

const TODAY = '2026-11-13';
const seed = () => buildSeed(TODAY);
const lift = (date, exercise, sets, reps, weight, feel = 'moderate') => ({ kind: 'lift', date, exercise, sets, reps, weight, feel });
const row = (date, type, distance, split, rpe, rate = 20) => ({ kind: 'row', date, type, distance, split, rate, rpe });

test('dates: add, diff and relative labels', () => {
  assert.equal(addDays('2026-11-13', 1), '2026-11-14');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(diffDays('2026-11-13', '2026-11-06'), 7);
  assert.equal(relDay('2026-11-12', TODAY), 'yesterday');
  assert.equal(relDay('2026-11-14', TODAY), 'tomorrow');
  assert.deepEqual(lastNDays(TODAY, 3), ['2026-11-11', '2026-11-12', '2026-11-13']);
});

test('Concept2 watts = 2.80 / pace^3', () => {
  // 2:00.0 /500m is the textbook 202.5 W.
  assert.ok(Math.abs(splitToWatts(120) - 202.5) < 0.1);
  // 1:34.6 → 413 W (the demo 2k PR).
  assert.ok(Math.abs(splitToWatts(94.6) - 413.4) < 0.1);
  assert.ok(Math.abs(wattsToSplit(splitToWatts(101.3)) - 101.3) < 1e-9);
  assert.equal(splitToWatts(0), 0);
});

test('split and clock formatting', () => {
  assert.equal(formatSplit(94.6), '1:34.6');
  assert.equal(formatSplit(120), '2:00.0');
  assert.equal(formatSplit(119.96), '2:00.0');
  assert.equal(formatSplit(121.2, 0), '2:01');
  assert.equal(formatClock(378.4, 1), '6:18.4');
  assert.equal(formatClock(3725), '1:02:05');
});

test('pace guidance slows as readiness drops', () => {
  const fresh = rowGuidance('ut2', 94.6, 95);
  const tired = rowGuidance('ut2', 94.6, 68);
  const cooked = rowGuidance('ut2', 94.6, 35);
  assert.equal(fresh.trimmed, false);
  assert.ok(tired.fast > fresh.fast);
  assert.ok(cooked.slow > tired.slow);
  assert.equal(formatSplit(tired.fast, 0), '2:01');
  assert.equal(formatSplit(tired.slow, 0), '2:03');
});

test('fatigue impulse responds to volume, load, RPE and bar speed', () => {
  const base = impulse(lift(TODAY, 'trap-bar-deadlift', 4, 5, 130));
  assert.ok(impulse(lift(TODAY, 'trap-bar-deadlift', 6, 5, 130)).post > base.post);
  assert.ok(impulse(lift(TODAY, 'trap-bar-deadlift', 4, 5, 150)).post > base.post);
  assert.ok(impulse(lift(TODAY, 'trap-bar-deadlift', 4, 5, 130, 'grindy')).post > base.post);
  assert.ok(impulse(lift(TODAY, 'trap-bar-deadlift', 4, 5, 130, 'explosive')).post < base.post);
  // A deadlift hits the posterior chain far harder than a bench press does.
  assert.ok(base.post > 10 * impulse(lift(TODAY, 'bench-press', 4, 5, 90)).post);

  const easy = impulse(row(TODAY, 'ut2', 12000, 122, 4));
  assert.ok(impulse(row(TODAY, 'ut2', 12000, 122, 7)).post > easy.post);
  assert.ok(impulse(row(TODAY, 'ut2', 20000, 122, 4)).post > easy.post);
  // A 2k test costs the CNS more than a steady 12k.
  assert.ok(impulse(row(TODAY, 'sprint', 2000, 94.6, 10)).cns > easy.cns * 2);
});

test('readiness: full when rested, falls with load, recovers day by day', () => {
  assert.equal(readinessOn([], TODAY).post.score, 100);
  const heavy = [lift(TODAY, 'trap-bar-deadlift', 5, 5, 140, 'grindy')];
  const d0 = readinessOn(heavy, TODAY).post.score;
  const d1 = readinessOn(heavy, addDays(TODAY, 1)).post.score;
  const d3 = readinessOn(heavy, addDays(TODAY, 3)).post.score;
  assert.ok(d0 < 80);
  assert.ok(d1 > d0 && d3 > d1);
  // Future workouts never affect an earlier day.
  assert.equal(readinessOn(heavy, addDays(TODAY, -1)).post.score, 100);
  // Scores stay inside 0–100 however much is logged.
  const absurd = Array.from({ length: 40 }, () => heavy[0]);
  const s = readinessOn(absurd, TODAY).post.score;
  assert.ok(s >= 0 && s <= 100);
  assert.equal(scoreFromFatigue(0), 100);
  assert.equal(statusFor(80).id, 'primed');
  assert.equal(statusFor(60).id, 'manage');
  assert.equal(statusFor(40).id, 'high');
});

test('demo data matches the brief', () => {
  const s = seed();
  const pr = best2k(s.workouts, s.athlete);
  assert.equal(formatClock(pr.time, 1), '6:18.4');
  assert.equal(formatSplit(pr.split), '1:34.6');
  assert.equal(bestLift(s.workouts, 'trap-bar-deadlift', 88).weight, 140);
  assert.equal(weeklyVolume(s.workouts, TODAY).meters, 64000);
  const r = readinessOn(s.workouts, TODAY);
  assert.equal(statusFor(r.post.score).id, 'manage');
  assert.equal(statusFor(r.cns.score).id, 'primed');
  assert.match(coachReadiness(s, TODAY).lines[0], /after yesterday's 4×5 Trap Bar Deadlifts/);
});

test('weekly volume splits metres by zone and tonnage by bar speed', () => {
  const w = [
    row(TODAY, 'ut2', 12000, 122, 4),
    row(TODAY, 'at', 4000, 100, 8),
    row(addDays(TODAY, -7), 'ut2', 9999, 122, 4), // outside the window
    lift(TODAY, 'front-squat', 4, 5, 100),
    lift(addDays(TODAY, -1), 'trap-bar-deadlift', 3, 5, 100, 'grindy'),
  ];
  const v = weeklyVolume(w, TODAY);
  assert.equal(v.totals.base, 12000);
  assert.equal(v.totals.hard, 4000);
  assert.equal(v.meters, 16000);
  assert.equal(v.totals.controlled, 2000);
  assert.equal(v.totals.grindy, 1500);
  assert.equal(v.days.length, 7);
  assert.equal(tonnage(lift(TODAY, 'weighted-plank', 3, 45, 20)), 3 * 9 * 20);
});

test('stroke-phase percentages and neglect callout', () => {
  const w = [
    lift(TODAY, 'front-squat', 6, 5, 100),
    lift(TODAY, 'pallof-press', 3, 10, 20),
    lift(TODAY, 'face-pull', 1, 15, 20),
    lift(TODAY, 'bench-press', 4, 6, 80), // push is excluded from the split
  ];
  const b = phaseBalance(w, TODAY, 'sets');
  assert.equal(b.total, 10);
  assert.equal(b.push, 4);
  assert.deepEqual(b.phases.map((p) => p.pct), [60, 30, 10]);
  assert.equal(b.callout.phase, 'finish');
  assert.match(b.callout.text, /rib stress/);

  const fixed = phaseBalance([...w, lift(TODAY, 'weighted-pull-up', 3, 5, 10)], TODAY, 'sets');
  assert.equal(fixed.callout.level, 'primed');
  assert.ok(Math.abs(fixed.phases.reduce((t, p) => t + p.pct, 0) - 100) < 1e-9);

  const t = phaseBalance(w, TODAY, 'tonnage');
  assert.equal(t.phases[0].value, 3000);
});

test('Auto-Adapt removes heavy posterior lifts and clears the conflict', () => {
  const s = seed();
  const before = interference(s, TODAY);
  assert.equal(before.status, 'conflict');
  assert.equal(before.row.title, '8x500m AT Intervals');
  assert.ok(before.projected.post < before.need.post);
  assert.ok(before.canAdapt);

  const plan = getPlan(s, TODAY);
  const adapted = adaptLift(plan.lift);
  assert.ok(plan.lift.blocks.some(isHeavyPosterior));
  assert.ok(!adapted.blocks.some(isHeavyPosterior));
  assert.equal(adapted.blocks.length, plan.lift.blocks.length);

  const s2 = reducer(s, { type: 'adapt', date: TODAY });
  const after = interference(s2, TODAY);
  assert.equal(after.status, 'adapted');
  assert.equal(after.shortfall, 0);
  assert.ok(after.projected.post > before.projected.post);

  const s3 = reducer(s2, { type: 'restore', date: TODAY });
  assert.deepEqual(getPlan(s3, TODAY).lift, plan.lift);
  assert.equal(interference(s3, TODAY).status, 'conflict');
});

test('logging updates readiness and plan state; deleting undoes it', () => {
  const s = seed();
  const before = readinessOn(s.workouts, TODAY).post.score;
  const s2 = reducer(s, { type: 'completeLift', date: TODAY });
  assert.equal(s2.workouts.length, s.workouts.length + liftWorkouts(getPlan(s, TODAY).lift, TODAY).length);
  assert.ok(readinessOn(s2.workouts, TODAY).post.score < before - 10);
  assert.equal(getPlan(s2, TODAY).liftDone, true);
  assert.equal(interference(s2, TODAY).status, 'logged');

  let s3 = s2;
  for (const w of s2.workouts.filter((x) => x.date === TODAY)) s3 = reducer(s3, { type: 'delete', id: w.id });
  assert.equal(readinessOn(s3.workouts, TODAY).post.score, before);
  assert.equal(getPlan(s3, TODAY).liftDone, false);

  const s4 = reducer(s, { type: 'completeRow', date: TODAY });
  const logged = s4.workouts.at(-1);
  assert.equal(logged.distance, 12000);
  assert.equal(getPlan(s4, TODAY).rowDone, true);

  assert.equal(reducer(s4, { type: 'units', units: 'lb' }).units, 'lb');
});

test('power transfer: e1RM, 2k PR updates, ratio zones and trend', () => {
  assert.equal(e1rm(140, 3), 154);
  const s = seed();
  const faster = [...s.workouts, row(TODAY, 'sprint', 2000, 93.9, 10)];
  assert.equal(best2k(faster, s.athlete).split, 93.9);
  // Interval sessions at 2k pace are not 2k tests.
  assert.equal(best2k([...s.workouts, row(TODAY, 'sprint', 4000, 92, 9)], s.athlete).split, 94.6);

  assert.equal(transferRatio(413, 154).zone, 'balanced');
  assert.equal(transferRatio(413, 200).zone, 'strength-rich');
  assert.equal(transferRatio(413, 120).zone, 'strength-limited');
  assert.equal(transferRatio(413, 0), null);

  const t = transferTrend(s.workouts, TODAY, 88);
  assert.equal(t.points.length, 8);
  assert.equal(Math.round(t.points[0].strengthIdx), 100);
  assert.ok(t.strengthChange > 0 && t.ergChange > 0);
  assert.equal(t.verdict.level, 'primed');

  // Buckets are compared like for like: a faster 2k lifts the erg index even
  // though its watts are far below a 250 m start, and a slower one lowers it.
  const quicker = transferTrend([...s.workouts, row(TODAY, 'sprint', 2000, 93.5, 10)], TODAY, 88);
  assert.ok(quicker.ergChange > t.ergChange);
  const slower = transferTrend([...s.workouts, row(TODAY, 'sprint', 2000, 96.5, 10)], TODAY, 88);
  assert.ok(slower.ergChange < t.ergChange);

  // A big deadlift PR with no erg change lifts the strength index only.
  const stronger = transferTrend([...s.workouts, lift(TODAY, 'trap-bar-deadlift', 1, 3, 170)], TODAY, 88);
  assert.ok(stronger.strengthChange > t.strengthChange);
  assert.equal(stronger.ergChange, t.ergChange);
});

test('primers are five drills totalling six minutes, and vary', () => {
  for (const mode of PRIMER_MODES) {
    for (let v = 0; v < 4; v++) {
      const drills = generatePrimer(mode.id, v);
      assert.equal(drills.length, 5);
      assert.equal(drills.reduce((t, x) => t + x.seconds, 0), PRIMER_TOTAL);
      assert.ok(drills.every((x) => x.seconds >= 60 && x.seconds <= 90));
      assert.equal(new Set(drills.map((x) => x.id)).size, 5);
    }
    assert.notDeepEqual(generatePrimer(mode.id, 0), generatePrimer(mode.id, 1));
  }
  assert.ok(generatePrimer('lift-to-erg', 1, { easy: true }).every((x) => !x.intense));
});
