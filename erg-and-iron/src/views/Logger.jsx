import { useMemo, useState } from 'react';
import { ArrowRight, Dumbbell, Plus, Trash2, Waves, Zap } from 'lucide-react';
import { Button, Card, Field, Segmented, Stepper, cx, inputClass } from '../components/ui.jsx';
import { addDays, relDay } from '../lib/dates.js';
import { ROW_TYPE, ROW_TYPES, durationSec, formatClock, formatSplit, rowGuidance, rowTitle, splitToWatts } from '../lib/rowing.js';
import { EXERCISE, EXERCISES, FEEL, FEELS, GROUP, GROUPS, isTimed, liftTitle, tonnage } from '../lib/exercises.js';
import { readinessOn, statusFor } from '../lib/load.js';
import { best2k, e1rm } from '../lib/analytics.js';
import { fromDisplay, int, mass, toDisplay, weight } from '../lib/format.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ───────────────────────── impact preview ───────────────────────── */

function Impact({ state, today, candidate, children }) {
  const now = readinessOn(state.workouts, today);
  const after = candidate ? readinessOn([...state.workouts, candidate], today) : now;
  const row = (label, a, b) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-ink-2">{label}</span>
      <span className="tnum flex items-center gap-2 text-sm">
        <span className="text-ink-3">{a}%</span>
        <ArrowRight size={13} className="text-ink-3" aria-hidden="true" />
        <span className="font-semibold" style={{ color: statusFor(b).color }}>
          {b}%
        </span>
      </span>
    </div>
  );
  return (
    <div className="rounded-lg border border-line bg-night p-4">
      {children}
      <div className="mt-4 space-y-2 border-t border-line pt-3.5">
        <p className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">Readiness if you log this</p>
        {row('Posterior chain', now.post.score, after.post.score)}
        {row('CNS / upper body', now.cns.score, after.cns.score)}
      </div>
    </div>
  );
}

function DateField({ id, value, onChange, today }) {
  return (
    <Field label="Date" htmlFor={id} hint={cap(relDay(value, today))}>
      <input
        id={id}
        type="date"
        value={value}
        max={today}
        min={addDays(today, -60)}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className={inputClass}
      />
    </Field>
  );
}

function RpePicker({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="RPE" className="grid grid-cols-10 gap-1">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
        const active = n === value;
        const tone = n >= 9 ? 'var(--color-high)' : n >= 7 ? 'var(--color-manage)' : 'var(--color-primed)';
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`RPE ${n}`}
            onClick={() => onChange(n)}
            className={cx(
              'tnum h-11 rounded-lg border text-sm font-semibold transition-colors',
              active ? 'text-night' : 'border-line-2 bg-night text-ink-2 hover:border-ink-3',
            )}
            style={active ? { background: tone, borderColor: tone } : undefined}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

const RPE_WORDS = ['', 'Very easy', 'Easy', 'Easy', 'Steady', 'Steady', 'Working', 'Hard', 'Very hard', 'Near max', 'Max effort'];

/* ───────────────────────── rowing form ───────────────────────── */

function RowForm({ state, today, dispatch, notify }) {
  const pr = best2k(state.workouts, state.athlete);
  const preset = (typeId) => {
    const g = rowGuidance(typeId, pr.split, 100);
    const mid = Math.round(((g.fast + g.slow) / 2) * 10) / 10;
    return { min: Math.floor(mid / 60), sec: Math.round((mid % 60) * 10) / 10, rate: Math.round((g.rate[0] + g.rate[1]) / 2) };
  };
  const first = preset('ut2');
  const [type, setType] = useState('ut2');
  const [distance, setDistance] = useState(12000);
  const [min, setMin] = useState(first.min);
  const [sec, setSec] = useState(first.sec);
  const [rate, setRate] = useState(first.rate);
  const [rpe, setRpe] = useState(4);
  const [date, setDate] = useState(today);

  const pickType = (id) => {
    const p = preset(id);
    setType(id);
    setMin(p.min);
    setSec(p.sec);
    setRate(p.rate);
    setRpe({ ut2: 4, ut1: 6, at: 8, sprint: 9, tech: 3 }[id]);
    setDistance({ ut2: 12000, ut1: 10000, at: 6000, sprint: 2000, tech: 12000 }[id]);
  };

  const split = min * 60 + sec;
  const errors = {
    distance: !(distance >= 100 && distance <= 60000) && 'Enter 100 to 60,000 m',
    split: !(split >= 70 && split <= 240 && sec >= 0 && sec < 60) && 'Enter a split between 1:10 and 4:00',
    rate: !(rate >= 10 && rate <= 60) && 'Enter 10 to 60 spm',
  };
  const valid = !errors.distance && !errors.split && !errors.rate;
  const watts = errors.split ? 0 : splitToWatts(split);
  const candidate = valid ? { kind: 'row', date, type, distance, split, rate, rpe } : null;

  const submit = (e) => {
    e.preventDefault();
    if (!candidate) return;
    const before = readinessOn(state.workouts, today);
    dispatch({ type: 'log', workouts: [candidate] });
    notify(`Logged ${rowTitle(candidate)}`, before);
  };

  return (
    <form noValidate onSubmit={submit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-5">
        <Field label="Session type">
          <div role="radiogroup" aria-label="Session type" className="flex flex-wrap gap-2">
            {ROW_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={type === t.id}
                onClick={() => pickType(t.id)}
                className={cx(
                  'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  type === t.id ? 'border-erg-hard bg-erg/15 text-ink' : 'border-line-2 bg-night text-ink-2 hover:border-ink-3',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Distance" htmlFor="row-distance" error={errors.distance}>
            <Stepper id="row-distance" value={distance} onChange={setDistance} step={500} min={100} max={60000} unit="m" invalid={!!errors.distance} />
          </Field>
          <Field label="Avg split" htmlFor="row-split-min" hint="/500m" error={errors.split}>
            <div className="flex items-center gap-2">
              <input
                id="row-split-min"
                type="number"
                inputMode="numeric"
                aria-label="Split minutes"
                value={Number.isFinite(min) ? min : ''}
                min={1}
                max={4}
                onChange={(e) => setMin(e.target.value === '' ? NaN : Number(e.target.value))}
                className={cx(inputClass, 'text-center font-medium')}
              />
              <span className="figure text-xl text-ink-3">:</span>
              <input
                id="row-split-sec"
                type="number"
                inputMode="decimal"
                aria-label="Split seconds"
                value={Number.isFinite(sec) ? sec : ''}
                min={0}
                max={59.9}
                step={0.1}
                onChange={(e) => setSec(e.target.value === '' ? NaN : Number(e.target.value))}
                className={cx(inputClass, 'text-center font-medium')}
              />
            </div>
          </Field>
          <Field label="Stroke rate" htmlFor="row-rate" error={errors.rate}>
            <Stepper id="row-rate" value={rate} onChange={setRate} step={1} min={10} max={60} unit="spm" invalid={!!errors.rate} />
          </Field>
          <DateField id="row-date" value={date} onChange={setDate} today={today} />
        </div>

        <Field label="RPE" hint={`${rpe} · ${RPE_WORDS[rpe]}`}>
          <RpePicker value={rpe} onChange={setRpe} />
        </Field>
      </div>

      <div className="min-w-0 space-y-4">
        <Impact state={state} today={today} candidate={candidate}>
          <p className="flex items-center gap-1.5 text-xs text-ink-3">
            <Zap size={14} aria-hidden="true" /> Average power
          </p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="figure text-[44px]" data-testid="watts">
              {watts ? Math.round(watts) : '–'}
            </span>
            <span className="text-sm text-ink-2">W</span>
          </p>
          <dl className="tnum mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <dt className="text-ink-3">Split</dt>
              <dd className="mt-0.5 text-sm text-ink">{errors.split ? '–' : formatSplit(split)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Time</dt>
              <dd className="mt-0.5 text-sm text-ink">{valid ? formatClock(durationSec(distance, split)) : '–'}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Of 2k power</dt>
              <dd className="mt-0.5 text-sm text-ink">{watts ? `${Math.round((watts / pr.watts) * 100)}%` : '–'}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Power to weight</dt>
              <dd className="mt-0.5 text-sm text-ink">{watts ? `${(watts / state.athlete.bodyweight).toFixed(2)} W/kg` : '–'}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] text-ink-3">Watts = 2.80 ÷ (seconds per metre)³</p>
        </Impact>
        <Button type="submit" className="h-12 w-full" disabled={!valid} icon={<Plus size={17} aria-hidden="true" />}>
          Log rowing session
        </Button>
      </div>
    </form>
  );
}

/* ───────────────────────── lifting form ───────────────────────── */

function LiftForm({ state, today, dispatch, notify }) {
  const u = state.units;
  const lastFor = (id) => {
    const prev = [...state.workouts].reverse().find((w) => w.kind === 'lift' && w.exercise === id);
    const [sets, reps, kg] = EXERCISE[id].d;
    return prev ? { sets: prev.sets, reps: prev.reps, kg: prev.weight, feel: prev.feel } : { sets, reps, kg, feel: 'moderate' };
  };
  const start = lastFor('trap-bar-deadlift');
  const [group, setGroup] = useState('drive');
  const [exercise, setExercise] = useState('trap-bar-deadlift');
  const [sets, setSets] = useState(start.sets);
  const [reps, setReps] = useState(start.reps);
  const [kg, setKg] = useState(start.kg);
  const [feel, setFeel] = useState(start.feel);
  const [date, setDate] = useState(today);

  const ex = EXERCISE[exercise];
  const timed = isTimed(ex);
  const pickExercise = (id) => {
    const p = lastFor(id);
    setExercise(id);
    setSets(p.sets);
    setReps(p.reps);
    setKg(p.kg);
    setFeel(p.feel);
  };
  const pickGroup = (id) => {
    setGroup(id);
    pickExercise(EXERCISES.find((e) => e.phase === id).id);
  };

  const errors = {
    sets: !(sets >= 1 && sets <= 20 && Number.isInteger(sets)) && '1 to 20 sets',
    reps: !(reps >= 1 && reps <= (timed ? 600 : 50)) && (timed ? '1 to 600 s' : '1 to 50 reps'),
    weight: !(kg >= 0 && kg <= 500) && `0 to ${weight(500, u)} ${u}`,
  };
  const valid = !errors.sets && !errors.reps && !errors.weight;
  const candidate = valid ? { kind: 'lift', date, exercise, sets, reps, weight: kg, feel } : null;
  const shown = Number.isFinite(kg) ? Math.round(toDisplay(kg, u) * 10) / 10 : NaN;
  const step = u === 'lb' ? 5 : ex.step;

  const submit = (e) => {
    e.preventDefault();
    if (!candidate) return;
    const before = readinessOn(state.workouts, today);
    dispatch({ type: 'log', workouts: [candidate] });
    notify(`Logged ${liftTitle(candidate)}`, before);
  };

  return (
    <form noValidate onSubmit={submit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-5">
        <Field label="Rowing stroke phase">
          <div role="radiogroup" aria-label="Rowing stroke phase" className="grid gap-2 sm:grid-cols-2">
            {GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={group === g.id}
                onClick={() => pickGroup(g.id)}
                className={cx(
                  'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                  group === g.id ? 'border-ink-3 bg-raised' : 'border-line-2 bg-night hover:border-ink-3',
                )}
              >
                <span aria-hidden="true" className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: g.color }} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{g.label}</span>
                  <span className="block text-xs text-ink-3">{g.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Exercise">
          <div role="radiogroup" aria-label="Exercise" className="flex flex-wrap gap-2">
            {EXERCISES.filter((e) => e.phase === group).map((e) => (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={exercise === e.id}
                onClick={() => pickExercise(e.id)}
                className={cx(
                  'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  exercise === e.id ? 'border-iron-hard bg-iron/15 text-ink' : 'border-line-2 bg-night text-ink-2 hover:border-ink-3',
                )}
              >
                {e.name}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Sets" htmlFor="lift-sets" error={errors.sets}>
            <Stepper id="lift-sets" value={sets} onChange={setSets} min={1} max={20} invalid={!!errors.sets} />
          </Field>
          <Field label={timed ? 'Seconds per set' : 'Reps'} htmlFor="lift-reps" error={errors.reps}>
            <Stepper id="lift-reps" value={reps} onChange={setReps} step={timed ? 5 : 1} min={1} max={timed ? 600 : 50} invalid={!!errors.reps} />
          </Field>
          <Field
            label={ex.bodyweight ? 'Added weight' : 'Weight'}
            htmlFor="lift-weight"
            error={errors.weight}
            className="col-span-2 sm:col-span-1"
          >
            <Stepper
              id="lift-weight"
              value={shown}
              onChange={(v) => setKg(Number.isFinite(v) ? fromDisplay(v, u) : NaN)}
              step={step}
              min={0}
              max={Math.round(toDisplay(500, u))}
              unit={u}
              invalid={!!errors.weight}
            />
          </Field>
        </div>

        <Field label="Bar speed / velocity feel">
          <Segmented
            label="Bar speed"
            className="flex w-full"
            value={feel}
            onChange={setFeel}
            options={FEELS.map((f) => ({ value: f.id, label: <><span className="sm:hidden">{f.short}</span><span className="hidden sm:inline">{f.label}</span></> }))}
          />
        </Field>

        <DateField id="lift-date" value={date} onChange={setDate} today={today} />
      </div>

      <div className="min-w-0 space-y-4">
        <Impact state={state} today={today} candidate={candidate}>
          <p className="flex items-center gap-1.5 text-xs text-ink-3">
            <Dumbbell size={14} aria-hidden="true" /> Tonnage
          </p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="figure text-[44px]">{valid ? mass(tonnage(candidate), u) : '–'}</span>
            <span className="text-sm text-ink-2">{u}</span>
          </p>
          <dl className="tnum mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <dt className="text-ink-3">Stroke phase</dt>
              <dd className="mt-0.5 text-sm text-ink">{GROUP[ex.phase].short}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Estimated 1RM</dt>
              <dd className="mt-0.5 text-sm text-ink">
                {valid && !timed && kg > 0
                  ? `${weight(e1rm(kg + (ex.bodyweight ? state.athlete.bodyweight : 0), reps), u)} ${u}`
                  : '–'}
              </dd>
            </div>
          </dl>
          {ex.bodyweight && <p className="mt-3 text-[11px] text-ink-3">1RM includes bodyweight ({weight(state.athlete.bodyweight, u)} {u}).</p>}
        </Impact>
        <Button type="submit" className="h-12 w-full" disabled={!valid} icon={<Plus size={17} aria-hidden="true" />}>
          Log lifting set block
        </Button>
      </div>
    </form>
  );
}

/* ───────────────────────── recent sessions ───────────────────────── */

function Recent({ state, today, dispatch, notify }) {
  const u = state.units;
  const recent = useMemo(
    () =>
      state.workouts
        .map((w, i) => ({ w, i }))
        .sort((a, b) => (a.w.date === b.w.date ? b.i - a.i : a.w.date < b.w.date ? 1 : -1))
        .slice(0, 14)
        .map((x) => x.w),
    [state.workouts],
  );
  return (
    <Card title="Recent sessions" aside={<span className="text-xs text-ink-3">{state.workouts.length} logged</span>}>
      <ul className="divide-y divide-line">
        {recent.map((w) => {
          const isRow = w.kind === 'row';
          return (
            <li key={w.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-night"
                style={{ color: isRow ? 'var(--color-erg-hard)' : 'var(--color-iron-hard)' }}
              >
                {isRow ? <Waves size={17} /> : <Dumbbell size={17} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{isRow ? rowTitle(w) : liftTitle(w)}</p>
                <p className="tnum mt-0.5 text-xs text-ink-3">
                  {isRow
                    ? `${int(w.distance)} m · ${formatSplit(w.split)} · ${w.rate} spm · RPE ${w.rpe} · ${Math.round(splitToWatts(w.split))} W`
                    : `${w.weight > 0 ? `${weight(w.weight, u)} ${u}` : 'Bodyweight'} · ${FEEL[w.feel].short} · ${GROUP[EXERCISE[w.exercise].phase].short}`}
                </p>
              </div>
              <span className="shrink-0 text-xs text-ink-3">{cap(relDay(w.date, today))}</span>
              <button
                type="button"
                aria-label={`Delete ${isRow ? rowTitle(w) : liftTitle(w)}`}
                onClick={() => {
                  dispatch({ type: 'delete', id: w.id });
                  notify('Session deleted');
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-raised hover:text-high"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          );
        })}
        {recent.length === 0 && <li className="py-2 text-sm text-ink-2">Nothing logged yet. Your first session will appear here.</li>}
      </ul>
    </Card>
  );
}

/* ───────────────────────── view ───────────────────────── */

export default function Logger({ state, today, dispatch, notify }) {
  const [mode, setMode] = useState('row');
  return (
    <div className="space-y-4 lg:space-y-5">
      <Card>
        <Segmented
          label="Workout type"
          className="mb-5 flex w-full sm:inline-flex sm:w-auto"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'row', label: 'Rowing session', icon: <Waves size={16} aria-hidden="true" /> },
            { value: 'lift', label: 'Lifting session', icon: <Dumbbell size={16} aria-hidden="true" /> },
          ]}
        />
        {mode === 'row' ? (
          <RowForm state={state} today={today} dispatch={dispatch} notify={notify} />
        ) : (
          <LiftForm state={state} today={today} dispatch={dispatch} notify={notify} />
        )}
      </Card>
      <Recent state={state} today={today} dispatch={dispatch} notify={notify} />
    </div>
  );
}
