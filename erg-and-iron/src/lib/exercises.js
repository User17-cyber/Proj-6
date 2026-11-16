// Lifting library, grouped by the part of the rowing stroke each lift supports.

export const PHASES = [
  {
    id: 'drive',
    label: 'Catch / Leg Drive',
    short: 'Catch & Drive',
    blurb: 'Squats, trap bar deadlifts, cleans',
    color: 'var(--color-phase-drive)',
  },
  {
    id: 'swing',
    label: 'Body Swing / Trunk Stability',
    short: 'Body Swing & Core',
    blurb: 'Hinges, planks, Pallof presses, back extensions',
    color: 'var(--color-phase-swing)',
  },
  {
    id: 'finish',
    label: 'Finish / Lats & Scapula',
    short: 'Finish & Posture',
    blurb: 'Rows, pull-ups, face pulls, rear delts',
    color: 'var(--color-phase-finish)',
  },
];

// Pressing is not part of the stroke. It is logged for structural balance and
// is what Auto-Adapt swaps in, but it is left out of the stroke-phase split.
export const PUSH_GROUP = {
  id: 'push',
  label: 'Antagonist Push',
  short: 'Antagonist Push',
  blurb: 'Pressing for structural balance (off-stroke)',
  color: 'var(--color-ink-3)',
};

export const GROUPS = [...PHASES, PUSH_GROUP];
export const GROUP = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

/**
 * post / cns  fatigue cost of one moderate set of five at the reference load
 * ref         a heavy working load for this athlete (kg); 0 = bodyweight
 * unit        'reps' or 'sec' (timed holds)
 * step        weight increment in kg
 */
export const EXERCISES = [
  // Catch / Leg Drive
  { id: 'trap-bar-deadlift', name: 'Trap Bar Deadlift', phase: 'drive', post: 6.0, cns: 3.6, ref: 140, step: 2.5, d: [4, 5, 130] },
  { id: 'front-squat', name: 'Front Squat', phase: 'drive', post: 4.2, cns: 3.0, ref: 110, step: 2.5, d: [4, 5, 100] },
  { id: 'back-squat', name: 'Back Squat', phase: 'drive', post: 4.8, cns: 3.2, ref: 130, step: 2.5, d: [4, 5, 115] },
  { id: 'power-clean', name: 'Power Clean', phase: 'drive', post: 3.2, cns: 3.8, ref: 90, step: 2.5, d: [5, 3, 80] },
  { id: 'bulgarian-split-squat', name: 'Bulgarian Split Squat', phase: 'drive', post: 3.4, cns: 1.8, ref: 60, step: 2.5, d: [3, 8, 40] },
  { id: 'leg-press', name: 'Leg Press', phase: 'drive', post: 3.0, cns: 1.4, ref: 220, step: 10, d: [3, 10, 180] },
  // Body Swing / Trunk Stability
  { id: 'romanian-deadlift', name: 'Romanian Deadlift', phase: 'swing', post: 4.6, cns: 2.4, ref: 120, step: 2.5, d: [3, 8, 100] },
  { id: 'hip-thrust', name: 'Barbell Hip Thrust', phase: 'swing', post: 3.0, cns: 1.2, ref: 140, step: 5, d: [3, 8, 110] },
  { id: 'back-extension', name: 'Back Extension', phase: 'swing', post: 2.2, cns: 0.8, ref: 30, step: 2.5, d: [3, 12, 20] },
  { id: 'weighted-plank', name: 'Weighted Plank', phase: 'swing', post: 0.5, cns: 0.9, ref: 25, step: 2.5, unit: 'sec', d: [3, 45, 20] },
  { id: 'pallof-press', name: 'Pallof Press', phase: 'swing', post: 0.3, cns: 0.8, ref: 25, step: 2.5, d: [3, 10, 20] },
  { id: 'ab-wheel', name: 'Ab Wheel Rollout', phase: 'swing', post: 0.4, cns: 1.0, ref: 0, step: 2.5, d: [3, 10, 0] },
  // Finish / Lats & Scapula
  { id: 'pendlay-row', name: 'Pendlay Row', phase: 'finish', post: 1.6, cns: 2.6, ref: 95, step: 2.5, d: [4, 6, 85] },
  { id: 'weighted-pull-up', name: 'Weighted Pull-Up', phase: 'finish', post: 0.3, cns: 3.0, ref: 25, step: 2.5, bodyweight: true, d: [3, 5, 20] },
  { id: 'bench-pull', name: 'Bench Pull', phase: 'finish', post: 0.3, cns: 2.6, ref: 90, step: 2.5, d: [4, 6, 80] },
  { id: 'face-pull', name: 'Face Pull', phase: 'finish', post: 0.1, cns: 0.9, ref: 30, step: 2.5, d: [3, 15, 25] },
  { id: 'rear-delt-fly', name: 'Rear Delt Fly', phase: 'finish', post: 0.1, cns: 0.8, ref: 12, step: 1, d: [3, 15, 10] },
  { id: 'serratus-punch', name: 'Serratus Cable Punch', phase: 'finish', post: 0.1, cns: 0.7, ref: 20, step: 2.5, d: [3, 12, 15] },
  // Antagonist Push
  { id: 'bench-press', name: 'Bench Press', phase: 'push', post: 0.2, cns: 2.6, ref: 95, step: 2.5, d: [4, 6, 80] },
  { id: 'overhead-press', name: 'Overhead Press', phase: 'push', post: 0.4, cns: 2.4, ref: 60, step: 2.5, d: [3, 8, 47.5] },
  { id: 'incline-db-press', name: 'Incline DB Press', phase: 'push', post: 0.1, cns: 2.0, ref: 32, step: 2, d: [3, 10, 26] },
  { id: 'push-up', name: 'Weighted Push-Up', phase: 'push', post: 0.1, cns: 1.2, ref: 20, step: 2.5, d: [3, 12, 10] },
];

export const EXERCISE = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export const FEELS = [
  { id: 'explosive', label: 'Explosive / Fast', short: 'Explosive', mult: 0.8 },
  { id: 'moderate', label: 'Moderate', short: 'Moderate', mult: 1.0 },
  { id: 'grindy', label: 'Grindy / Near Failure', short: 'Grindy', mult: 1.45 },
];

export const FEEL = Object.fromEntries(FEELS.map((f) => [f.id, f]));

/** A lift counts as heavy lower-body / posterior work at or above this cost. */
export const HEAVY_POSTERIOR = 2.0;

export function isTimed(ex) {
  return ex.unit === 'sec';
}

/** Rep count used for volume maths; a 5-second hold counts as one rep. */
export function repEquivalent(ex, reps) {
  return isTimed(ex) ? reps / 5 : reps;
}

/** Sets × reps × load in kg. */
export function tonnage(w) {
  const ex = EXERCISE[w.exercise];
  return w.sets * repEquivalent(ex, w.reps) * w.weight;
}

/** "4×5 Trap Bar Deadlift" */
export function liftTitle(w) {
  const ex = EXERCISE[w.exercise];
  return `${w.sets}×${w.reps}${isTimed(ex) ? 's' : ''} ${ex.name}`;
}
