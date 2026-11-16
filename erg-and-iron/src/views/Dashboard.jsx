import { useMemo } from 'react';
import { ArrowRight, CalendarClock, Check, Dumbbell, Undo2, WandSparkles, Waves } from 'lucide-react';
import { Button, Callout, Card, LEVEL, LegendItem, StatusPill, cx } from '../components/ui.jsx';
import { DayBars, Meter, ReadinessGauge, Spark } from '../components/charts.jsx';
import { addDays, lastNDays, shortDate, weekday } from '../lib/dates.js';
import { ROW_TYPE, formatClock, formatSplit, rowGuidance } from '../lib/rowing.js';
import { EXERCISE, isTimed } from '../lib/exercises.js';
import { readinessOn, statusFor } from '../lib/load.js';
import { coachReadiness } from '../lib/coach.js';
import { getPlan, interference } from '../lib/plan.js';
import { best2k, bestLift, weeklyVolume } from '../lib/analytics.js';
import { compact, int, mass, weight } from '../lib/format.js';

const list = (items) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const blockText = (b) => `${b.sets}×${b.reps}${isTimed(EXERCISE[b.exercise]) ? 's' : ''} ${EXERCISE[b.exercise].name}`;

/* ───────────────────────── benchmarks ───────────────────────── */

function Benchmarks({ state }) {
  const pr = best2k(state.workouts, state.athlete);
  const dl = bestLift(state.workouts, 'trap-bar-deadlift', state.athlete.bodyweight);
  const cell = 'min-w-0 px-3 py-3 sm:px-4';
  return (
    <div className="grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-panel">
      <div className={cell}>
        <p className="text-xs text-ink-3">2k best</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="figure text-2xl">{formatClock(pr.time, 1)}</span>
          <span className="text-xs text-ink-2">{Math.round(pr.watts)} W</span>
        </p>
      </div>
      <div className={cell}>
        <p className="text-xs text-ink-3">2k split</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="figure text-2xl">{formatSplit(pr.split)}</span>
          <span className="text-xs text-ink-2">/500m</span>
        </p>
      </div>
      <div className={cell}>
        <p className="text-xs text-ink-3">Trap bar deadlift</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="figure text-2xl">{dl ? weight(dl.weight, state.units) : '–'}</span>
          <span className="text-xs text-ink-2">{dl ? `${state.units} × ${dl.reps}` : 'not logged'}</span>
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────── readiness ───────────────────────── */

function GaugeBlock({ title, score, statusLabel, history }) {
  const status = statusFor(score);
  return (
    <div className="flex min-w-0 flex-col items-center gap-3 text-center">
      <ReadinessGauge score={score} color={status.color} label={`${title} readiness`} />
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <div className="mt-2">
          <StatusPill level={status.id}>{statusLabel ?? status.label}</StatusPill>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px] whitespace-nowrap text-ink-3">
        <Spark values={history} color={status.color} label={`${title} readiness over the last 7 days`} />
        <span>7 d</span>
      </div>
    </div>
  );
}

function Readiness({ state, today, className }) {
  const coach = useMemo(() => coachReadiness(state, today), [state, today]);
  const history = useMemo(
    () => lastNDays(today, 7).map((d) => readinessOn(state.workouts, d)),
    [state.workouts, today],
  );
  const { post, cns } = coach.readiness;
  const fatigueLabel = (score, name) => (score < 50 ? `High ${name} Fatigue` : undefined);
  return (
    <Card className={className} title="Concurrent readiness" aside={<StatusPill level={coach.status.id}>{coach.headline}</StatusPill>}>
      <div className="grid grid-cols-2 gap-4">
        <GaugeBlock
          title="Lower Body / Posterior Chain"
          score={post.score}
          statusLabel={fatigueLabel(post.score, 'Posterior')}
          history={history.map((h) => h.post.score)}
        />
        <GaugeBlock
          title="CNS / Upper Body"
          score={cns.score}
          statusLabel={fatigueLabel(cns.score, 'CNS')}
          history={history.map((h) => h.cns.score)}
        />
      </div>
      <div className={cx('mt-5 rounded-lg border p-4', LEVEL[coach.status.id].panel)}>
        <p className="label mb-1.5 !text-[12px]">Coaching guidance</p>
        <div className="space-y-1.5 text-[15px] leading-relaxed text-ink">
          {coach.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ───────────────────────── interference alert ───────────────────────── */

function Projection({ label, score, need }) {
  const ok = score >= need;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-ink-2">{label}</span>
        <span className="tnum font-semibold text-ink">{score}%</span>
      </div>
      <Meter value={score} color={ok ? 'var(--color-primed)' : score >= need - 8 ? 'var(--color-manage)' : 'var(--color-high)'} mark={need} />
    </div>
  );
}

function Interference({ state, today, dispatch, notify, className }) {
  const x = useMemo(() => interference(state, today), [state, today]);
  if (x.status === 'no-row') {
    return (
      <Card className={className} title="Interference check">
        <Callout level="primed" title="Nothing to protect tomorrow">
          No rowing session is scheduled for tomorrow, so today's lift can run as planned.
        </Callout>
      </Card>
    );
  }

  const sys = x.limiter === 'cns' ? 'cns' : 'post';
  const sysName = sys === 'cns' ? 'CNS' : 'posterior chain';
  const typeLabel = ROW_TYPE[x.row.type].short;
  const need = x.need[sys];
  const level =
    x.status === 'conflict'
      ? x.shortfall >= 8
        ? 'high'
        : 'manage'
      : x.shortfall > 0
        ? x.shortfall >= 8
          ? 'high'
          : 'manage'
        : 'primed';
  const { Icon } = LEVEL[level];

  let title;
  let body;
  if (x.status === 'conflict') {
    const names = x.culprits.slice(0, 2).map((c) => blockText(c.block));
    title = `Today's lift will blunt tomorrow's ${typeLabel} work`;
    body = `${x.plan.lift.title}${names.length ? ` (${list(names)})` : ''} would leave your ${sysName} at ${x.projected[sys]}% tomorrow. ${typeLabel} work needs ${need}%.`;
  } else if (x.status === 'adapted') {
    title = x.shortfall > 0 ? 'Lift adapted, but still short' : `Lift adapted. Tomorrow's session is protected.`;
    body =
      x.shortfall > 0
        ? `Even without lower-body pulls you are projected at ${x.projected.post}% posterior readiness for a session that needs ${x.need.post}%. Consider moving it back a day.`
        : `Heavy lower-body pulls are swapped for upper-body push and core work, lifting tomorrow's projection from ${x.original.post}% to ${x.projected.post}%.`;
  } else if (x.status === 'clear') {
    title = 'No interference';
    body = `${x.plan.lift.title} leaves you at ${x.projected.post}% posterior and ${x.projected.cns}% CNS readiness tomorrow, enough for ${typeLabel} work.`;
  } else if (x.status === 'logged') {
    title = x.shortfall > 0 ? `Tomorrow's ${typeLabel} work will be compromised` : `You are set for tomorrow`;
    body =
      x.shortfall > 0
        ? `With today's lifting logged you are projected at ${x.projected.post}% posterior and ${x.projected.cns}% CNS. ${typeLabel} work needs ${x.need.post}% and ${x.need.cns}%. Lengthen the warm-up and cap the pieces, or move the session back 24 hours.`
        : `With today's lifting logged you are projected at ${x.projected.post}% posterior and ${x.projected.cns}% CNS, enough for ${typeLabel} work.`;
  } else {
    title = x.shortfall > 0 ? `Tomorrow's ${typeLabel} work is at risk` : 'No lift scheduled today';
    body =
      x.shortfall > 0
        ? `Without any lifting you are projected at ${x.projected.post}% posterior readiness, below the ${x.need.post}% that ${typeLabel} work needs. Keep today easy.`
        : `Nothing in the gym today. You are projected at ${x.projected.post}% posterior readiness for tomorrow.`;
  }

  return (
    <section className={cx('min-w-0 rounded-xl border p-4 sm:p-5', LEVEL[level].panel, className)}>
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="label flex items-center gap-2">
          <Icon size={16} className={LEVEL[level].text} aria-hidden="true" />
          Smart interference alert
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-night/60 px-2.5 py-1 text-xs text-ink-2">
          <CalendarClock size={13} aria-hidden="true" />
          Tomorrow: <span className="font-semibold text-ink">{x.row.title}</span>
        </span>
      </header>

      <h3 className="text-lg leading-snug font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm text-ink-2">{body}</p>

      {(x.status === 'conflict' || x.status === 'adapted') && (
        <div className="mt-4 space-y-3">
          {x.status === 'conflict' ? (
            <>
              <Projection label={`${sys === 'cns' ? 'CNS' : 'Posterior'} tomorrow, lift as planned`} score={x.projected[sys]} need={need} />
              {x.canAdapt && (
                <Projection label={`${sys === 'cns' ? 'CNS' : 'Posterior'} tomorrow, lift auto-adapted`} score={x.adapted[sys]} need={need} />
              )}
            </>
          ) : (
            <>
              <Projection label="Posterior tomorrow, original lift" score={x.original.post} need={x.need.post} />
              <Projection label="Posterior tomorrow, adapted lift" score={x.projected.post} need={x.need.post} />
            </>
          )}
          <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <span aria-hidden="true" className="inline-block h-3 w-0.5 rounded-full bg-ink" />
            {need}% needed for {typeLabel} work
          </p>
        </div>
      )}

      {x.status === 'conflict' && x.canAdapt && (
        <div className="mt-4">
          <Button
            className="w-full sm:w-auto"
            icon={<WandSparkles size={16} aria-hidden="true" />}
            onClick={() => {
              dispatch({ type: 'adapt', date: today });
              notify(`Lift adapted: tomorrow's projection ${x.projected[sys]}% → ${x.adapted[sys]}%`);
            }}
          >
            Auto-Adapt Today's Lift
          </Button>
          <p className="mt-2 text-xs text-ink-3">
            Swaps {list(x.adaptedLift.blocks.filter((b) => b.replaces).map((b) => EXERCISE[b.replaces].name))} for{' '}
            {list(x.adaptedLift.blocks.filter((b) => b.replaces).map((b) => EXERCISE[b.exercise].name))}.
          </p>
        </div>
      )}
      {x.status === 'conflict' && !x.canAdapt && (
        <p className="mt-3 text-xs text-ink-3">
          Swapping lifts will not fix this one: the fatigue is already in your legs. Move the session or keep today very light.
        </p>
      )}
      {x.status === 'adapted' && (
        <div className="mt-4">
          <Button
            variant="secondary"
            icon={<Undo2 size={16} aria-hidden="true" />}
            onClick={() => {
              dispatch({ type: 'restore', date: today });
              notify('Original lift restored');
            }}
          >
            Restore original lift
          </Button>
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── today's plan ───────────────────────── */

function PlanRow({ icon, title, meta, done, onLog, children, tag }) {
  return (
    <div className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-night text-ink-2">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
              {title}
              {tag}
            </p>
            <p className="mt-0.5 text-xs text-ink-3">{meta}</p>
          </div>
          {done ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-primed">
              <Check size={14} aria-hidden="true" /> Logged
            </span>
          ) : (
            onLog && (
              <Button variant="secondary" className="shrink-0 !px-3 !py-1.5 !text-xs whitespace-nowrap" onClick={onLog}>
                Log as done
              </Button>
            )
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function TodayPlan({ state, today, dispatch, notify, className }) {
  const plan = getPlan(state, today);
  const tomorrow = getPlan(state, addDays(today, 1));
  const r = readinessOn(state.workouts, today);
  const limiting = Math.min(r.post.score, r.cns.score);
  const g = plan.row ? rowGuidance(plan.row.type, state.athlete.pr2k.split, limiting) : null;

  const logWith = (type, label) => () => {
    const before = readinessOn(state.workouts, today);
    dispatch({ type, date: today });
    notify(`${label} logged`, before);
  };

  return (
    <Card className={className} title="Today's plan" aside={<span className="text-xs text-ink-3">{weekday(today, 'long')}</span>}>
      <div className="divide-y divide-line">
        {plan.row && (
          <PlanRow
            icon={<Waves size={18} aria-hidden="true" />}
            title={plan.row.title}
            meta={`${ROW_TYPE[plan.row.type].label} · ${int(plan.row.distance)} m · target ${formatSplit(g.fast, 0)}–${formatSplit(g.slow, 0)} · ${g.rate[0]}–${g.rate[1]} spm`}
            done={plan.rowDone}
            onLog={logWith('completeRow', plan.row.title)}
          />
        )}
        {plan.lift && (
          <PlanRow
            icon={<Dumbbell size={18} aria-hidden="true" />}
            title={plan.lift.title}
            tag={plan.adapted && <StatusPill level="primed">Adapted</StatusPill>}
            meta={`${plan.lift.blocks.length} lifts · ${plan.lift.blocks.reduce((t, b) => t + b.sets, 0)} sets`}
            done={plan.liftDone}
            onLog={logWith('completeLift', plan.lift.title)}
          >
            <ul className="mt-2.5 space-y-1.5">
              {plan.lift.blocks.map((b) => (
                <li key={b.exercise} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="text-ink-2">
                    {blockText(b)}
                    {b.replaces && <span className="text-ink-3"> · replaces {EXERCISE[b.replaces].name}</span>}
                  </span>
                  <span className="tnum text-xs text-ink-3">
                    {b.weight > 0 ? `${weight(b.weight, state.units)} ${state.units}` : 'bodyweight'}
                  </span>
                </li>
              ))}
            </ul>
          </PlanRow>
        )}
        {!plan.row && !plan.lift && <p className="py-2 text-sm text-ink-2">Rest day. Nothing scheduled.</p>}
      </div>
      <p className="mt-4 flex items-center gap-2 border-t border-line pt-3.5 text-xs text-ink-3">
        <ArrowRight size={14} aria-hidden="true" />
        Tomorrow:
        <span className="font-medium text-ink-2">
          {[tomorrow.row?.title, tomorrow.lift?.title].filter(Boolean).join(' + ') || 'Rest day'}
        </span>
      </p>
    </Card>
  );
}

/* ───────────────────────── weekly volume ───────────────────────── */

const ERG_SERIES = [
  { key: 'base', label: 'UT2 / steady state', color: 'var(--color-erg-base)' },
  { key: 'hard', label: 'AT / sprint', color: 'var(--color-erg-hard)' },
];
const IRON_SERIES = [
  { key: 'controlled', label: 'Fast to moderate bar speed', color: 'var(--color-iron-base)' },
  { key: 'grindy', label: 'Grindy / near failure', color: 'var(--color-iron-hard)' },
];

function VolumePanel({ icon, title, total, unit, split, series, days, format, tick }) {
  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-ink-3">
            {icon}
            {title}
          </p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="figure text-[34px]">{total}</span>
            <span className="text-sm text-ink-2">{unit}</span>
          </p>
        </div>
        <p className="mt-0.5 text-right text-xs text-ink-3">{split}</p>
      </div>
      <div className="mt-3 mb-4 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <LegendItem key={s.key} color={s.color}>
            {s.label}
          </LegendItem>
        ))}
      </div>
      <DayBars days={days} series={series} format={format} tick={tick} />
    </div>
  );
}

function WeeklyVolume({ state, today, className }) {
  const v = useMemo(() => weeklyVolume(state.workouts, today), [state.workouts, today]);
  const u = state.units;
  const days = (keys) =>
    v.days.map((d) => ({
      date: d.date,
      label: d.date === today ? 'Today' : weekday(d.date).slice(0, 3),
      title: `${weekday(d.date)} ${shortDate(d.date)}`,
      today: d.date === today,
      values: Object.fromEntries(keys.map((k) => [k, d[k]])),
    }));
  const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
  const kgTick = (kg) => compact(u === 'lb' ? Math.round(kg / 0.45359237 / 100) * 100 : kg);

  return (
    <Card className={className} title="Weekly volume & tonnage split" aside={<span className="text-xs text-ink-3">Last 7 days</span>}>
      <div className="grid gap-8 md:grid-cols-2">
        <VolumePanel
          icon={<Waves size={14} aria-hidden="true" />}
          title="Erg and water metres"
          total={int(v.meters)}
          unit="m"
          split={`${pct(v.totals.hard, v.meters)}% at AT or above`}
          series={ERG_SERIES}
          days={days(['base', 'hard'])}
          format={(n) => `${int(n)} m`}
          tick={compact}
        />
        <VolumePanel
          icon={<Dumbbell size={14} aria-hidden="true" />}
          title="Lifting tonnage"
          total={mass(v.tonnage, u)}
          unit={u}
          split={`${pct(v.totals.grindy, v.tonnage)}% grindy`}
          series={IRON_SERIES}
          days={days(['controlled', 'grindy'])}
          format={(kg) => `${mass(kg, u)} ${u}`}
          tick={kgTick}
        />
      </div>
      <details className="mt-5 border-t border-line pt-3 text-xs">
        <summary className="cursor-pointer text-ink-3 select-none hover:text-ink-2">Daily numbers</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="tnum w-full min-w-[460px] text-left">
            <thead className="text-ink-3">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Day</th>
                <th className="py-1.5 pr-3 text-right font-medium">Steady m</th>
                <th className="py-1.5 pr-3 text-right font-medium">AT / sprint m</th>
                <th className="py-1.5 pr-3 text-right font-medium">Controlled {u}</th>
                <th className="py-1.5 text-right font-medium">Grindy {u}</th>
              </tr>
            </thead>
            <tbody className="text-ink-2">
              {v.days.map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="py-1.5 pr-3">
                    {weekday(d.date)} {shortDate(d.date)}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{int(d.base)}</td>
                  <td className="py-1.5 pr-3 text-right">{int(d.hard)}</td>
                  <td className="py-1.5 pr-3 text-right">{mass(d.controlled, u)}</td>
                  <td className="py-1.5 text-right">{mass(d.grindy, u)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

/* ───────────────────────── view ───────────────────────── */

export default function Dashboard({ state, today, dispatch, notify }) {
  return (
    <div className="space-y-4 lg:space-y-5">
      <Benchmarks state={state} />
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        <Readiness className="lg:col-span-7" state={state} today={today} />
        <Interference className="lg:col-span-5" state={state} today={today} dispatch={dispatch} notify={notify} />
        <WeeklyVolume className="lg:col-span-7" state={state} today={today} />
        <TodayPlan className="lg:col-span-5" state={state} today={today} dispatch={dispatch} notify={notify} />
      </div>
    </div>
  );
}
