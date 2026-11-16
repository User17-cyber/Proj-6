// App state: one reducer, persisted to localStorage.

import { useEffect, useReducer, useState } from 'react';
import { todayISO } from './dates.js';
import { buildSeed, STORAGE_VERSION } from './seed.js';
import { adaptLift, getPlan, liftWorkouts, rowWorkout } from './plan.js';
import { readinessOn } from './load.js';

const STORAGE_KEY = 'erg-and-iron:v1';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version === STORAGE_VERSION && Array.isArray(parsed.workouts)) return parsed;
    }
  } catch {
    // Storage blocked or corrupt: fall through to fresh demo data.
  }
  return buildSeed(todayISO());
}

function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private window or quota: the app still works for this visit.
  }
}

let counter = 0;
const newId = () => `w-${Date.now().toString(36)}-${(counter++).toString(36)}`;

function setPlan(state, date, patch) {
  const current = getPlan(state, date);
  return { ...state, plans: { ...state.plans, [date]: { ...current, ...patch } } };
}

/** A logged session of a kind counts as that day's planned session done. */
function markDone(state, date, kind, done) {
  const plan = getPlan(state, date);
  const key = kind === 'row' ? 'rowDone' : 'liftDone';
  if (!plan[kind] || plan[key] === done) return state;
  return setPlan(state, date, { [key]: done });
}

function reducer(state, action) {
  switch (action.type) {
    case 'log': {
      const added = action.workouts.map((w) => ({ ...w, id: newId() }));
      let next = { ...state, workouts: [...state.workouts, ...added] };
      for (const w of added) next = markDone(next, w.date, w.kind, true);
      return next;
    }
    case 'delete': {
      const gone = state.workouts.find((w) => w.id === action.id);
      if (!gone) return state;
      const workouts = state.workouts.filter((w) => w.id !== action.id);
      let next = { ...state, workouts };
      const stillSome = workouts.some((w) => w.date === gone.date && w.kind === gone.kind);
      if (!stillSome) next = markDone(next, gone.date, gone.kind, false);
      return next;
    }
    case 'completeRow': {
      const plan = getPlan(state, action.date);
      if (!plan.row || plan.rowDone) return state;
      const r = readinessOn(state.workouts, action.date);
      const w = rowWorkout(plan.row, action.date, state.athlete.pr2k.split, Math.min(r.post.score, r.cns.score));
      return reducer(state, { type: 'log', workouts: [w] });
    }
    case 'completeLift': {
      const plan = getPlan(state, action.date);
      if (!plan.lift || plan.liftDone) return state;
      return reducer(state, { type: 'log', workouts: liftWorkouts(plan.lift, action.date) });
    }
    case 'adapt': {
      const plan = getPlan(state, action.date);
      if (!plan.lift || plan.adapted || plan.liftDone) return state;
      return setPlan(state, action.date, {
        lift: adaptLift(plan.lift),
        originalLift: plan.lift,
        adapted: true,
      });
    }
    case 'restore': {
      const plan = getPlan(state, action.date);
      if (!plan.adapted || plan.liftDone) return state;
      return setPlan(state, action.date, { lift: plan.originalLift, originalLift: null, adapted: false });
    }
    case 'units':
      return { ...state, units: action.units };
    case 'reset':
      return buildSeed(todayISO());
    default:
      return state;
  }
}

export function useStore() {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => save(state), [state]);
  return [state, dispatch];
}

/** Today's date, refreshed when the tab regains focus or the day rolls over. */
export function useToday() {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const check = () => setToday(todayISO());
    const timer = setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return today;
}

export { reducer };
