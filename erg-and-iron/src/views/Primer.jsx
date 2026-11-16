import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Dumbbell, Pause, Play, RotateCcw, Shuffle, SkipBack, SkipForward, Volume2, VolumeX, Waves } from 'lucide-react';
import { Button, Card, Segmented, cx } from '../components/ui.jsx';
import { relDay } from '../lib/dates.js';
import { ROW_TYPE, durationSec, formatClock, rowTitle } from '../lib/rowing.js';
import { readinessOn, workoutTitle } from '../lib/load.js';
import { getPlan } from '../lib/plan.js';
import { PRIMER_MODES, PRIMER_TOTAL, generatePrimer } from '../lib/primer.js';

/* ───────────────────────── sound ───────────────────────── */

function useBeep(enabled) {
  const ctxRef = useRef(null);
  // Must be called from a click so the browser allows audio.
  const unlock = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!ctxRef.current && Ctx) ctxRef.current = new Ctx();
      ctxRef.current?.resume?.();
    } catch {
      // No audio available: the timer still works silently.
    }
  };
  const beep = (count = 1) => {
    const ctx = ctxRef.current;
    if (!enabled || !ctx) return;
    try {
      for (let i = 0; i < count; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = ctx.currentTime + i * 0.22;
        osc.frequency.value = i === count - 1 && count > 1 ? 1175 : 880;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.2);
      }
    } catch {
      // Ignore audio failures.
    }
  };
  return { unlock, beep };
}

/* ───────────────────────── context ───────────────────────── */

/** What the athlete has just done or is about to do, to tailor the primer. */
function usePrimerContext(state, today, mode) {
  return useMemo(() => {
    const r = readinessOn(state.workouts, today);
    const tired = Math.min(r.post.score, r.cns.score) < 60;
    if (mode === 'erg-to-lift') {
      const lastRow = [...state.workouts].reverse().find((w) => w.kind === 'row' && w.date <= today);
      const plan = getPlan(state, today);
      const mins = lastRow ? Math.round(durationSec(lastRow.distance, lastRow.split) / 60) : 0;
      return {
        easy: tired,
        from: lastRow ? `${rowTitle(lastRow)}, ${relDay(lastRow.date, today)} (${mins} min on the seat)` : 'No row logged yet',
        to: plan.lift && !plan.liftDone ? plan.lift.title : 'Your next lift',
        note: tired
          ? 'Readiness is below 60%, so every drill here is sub-maximal.'
          : mins >= 45
            ? 'A long piece shortens the hip flexors most, so that slot gets the full 90 seconds.'
            : null,
      };
    }
    const lastLift = [...state.workouts].reverse().find((w) => w.kind === 'lift' && w.date <= today);
    const plan = getPlan(state, today);
    const nextRow = plan.row && !plan.rowDone ? plan.row : null;
    const hardNext = nextRow && ROW_TYPE[nextRow.type].band === 'hard';
    const easy = tired || !hardNext;
    return {
      easy,
      from: lastLift ? `${workoutTitle(lastLift)}, ${relDay(lastLift.date, today)}` : 'No lift logged yet',
      to: nextRow ? nextRow.title : 'Your next row',
      note: tired
        ? 'Readiness is below 60%, so priming stays sub-maximal: no jumps or practice starts.'
        : hardNext
          ? 'Hard pieces next, so the priming drills are allowed to be sharp.'
          : 'Steady work next, so priming stays sub-maximal: no jumps or practice starts.',
    };
  }, [state, today, mode]);
}

/* ───────────────────────── timer ring ───────────────────────── */

function Ring({ fraction, children }) {
  const size = 232;
  const r = 104;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto w-full max-w-[232px]">
      <svg viewBox={`0 0 ${size} ${size}`} className="block w-full -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth="8" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.001, c * fraction)} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

/* ───────────────────────── view ───────────────────────── */

export default function Primer({ state, today }) {
  const [mode, setMode] = useState('erg-to-lift');
  const [variant, setVariant] = useState(0);
  const [sound, setSound] = useState(true);
  const info = PRIMER_MODES.find((m) => m.id === mode);
  const ctx = usePrimerContext(state, today, mode);
  const drills = useMemo(() => generatePrimer(mode, variant, { easy: ctx.easy }), [mode, variant, ctx.easy]);

  const [idx, setIdx] = useState(0);
  const [remaining, setRemaining] = useState(drills[0].seconds);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [nonce, setNonce] = useState(0);
  const remainingRef = useRef(remaining);
  remainingRef.current = remaining;
  const { unlock, beep } = useBeep(sound);
  const beepRef = useRef(beep);
  beepRef.current = beep;

  // A new sequence always starts stopped at drill one.
  useEffect(() => {
    setIdx(0);
    setRemaining(drills[0].seconds);
    setRunning(false);
    setDone(false);
  }, [drills]);

  // Countdown against a wall-clock deadline so it stays accurate in a background tab.
  useEffect(() => {
    if (!running) return undefined;
    const deadline = performance.now() + remainingRef.current * 1000;
    const timer = setInterval(() => {
      const left = (deadline - performance.now()) / 1000;
      if (left > 0) {
        setRemaining(left);
        return;
      }
      clearInterval(timer);
      if (idx < drills.length - 1) {
        beepRef.current(1);
        setIdx(idx + 1);
        setRemaining(drills[idx + 1].seconds);
      } else {
        beepRef.current(2);
        setRemaining(0);
        setRunning(false);
        setDone(true);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [running, idx, drills, nonce]);

  // Keep the phone awake while the timer runs, where the browser allows it.
  useEffect(() => {
    if (!running || !navigator.wakeLock?.request) return undefined;
    let lock = null;
    let released = false;
    navigator.wakeLock
      .request('screen')
      .then((l) => {
        if (released) l.release().catch(() => {});
        else lock = l;
      })
      .catch(() => {});
    return () => {
      released = true;
      lock?.release().catch(() => {});
    };
  }, [running]);

  const jump = (i) => {
    setIdx(i);
    setRemaining(drills[i].seconds);
    setDone(false);
    setNonce((n) => n + 1);
  };
  const toggle = () => {
    unlock();
    if (done) {
      jump(0);
      setRunning(true);
    } else {
      setRunning((r) => !r);
    }
  };
  const restart = () => {
    setRunning(false);
    jump(0);
  };

  const drill = drills[idx];
  const elapsed = drills.slice(0, idx).reduce((t, d) => t + d.seconds, 0) + (drill.seconds - remaining);
  const shownSeconds = Math.ceil(remaining - 0.001);

  return (
    <div className="space-y-4 lg:space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label="Transition"
            className="flex w-full sm:inline-flex sm:w-auto"
            value={mode}
            onChange={setMode}
            options={PRIMER_MODES.map((m) => ({
              value: m.id,
              label: m.label,
              icon: m.id === 'erg-to-lift' ? <Waves size={15} className="hidden sm:block" aria-hidden="true" /> : <Dumbbell size={15} className="hidden sm:block" aria-hidden="true" />,
            }))}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={<Shuffle size={15} aria-hidden="true" />}
              onClick={() => setVariant((v) => v + 1)}
            >
              New mix
            </Button>
            <button
              type="button"
              aria-pressed={sound}
              aria-label={sound ? 'Mute timer sound' : 'Turn timer sound on'}
              onClick={() => setSound((s) => !s)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-2 bg-raised text-ink-2 hover:text-ink"
            >
              {sound ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
            </button>
          </div>
        </div>
        <p className="mt-4 max-w-[65ch] text-[15px] text-ink">{info.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {info.focuses.map((f) => (
            <span key={f} className="rounded-full border border-line-2 bg-night px-2.5 py-1 text-xs text-ink-2">
              {f}
            </span>
          ))}
        </div>
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-3.5 text-xs text-ink-3">
          <span className="text-ink-2">{ctx.from}</span>
          <ArrowRight size={13} aria-hidden="true" />
          <span className="text-ink-2">{ctx.to}</span>
          {ctx.note && <span className="basis-full">{ctx.note}</span>}
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-5">
        <Card className="flex flex-col">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="label">
              Drill {idx + 1} of {drills.length}
            </h2>
            <span className="tnum text-xs text-ink-3" aria-label="Elapsed of total">
              {formatClock(Math.min(elapsed, PRIMER_TOTAL))} / {formatClock(PRIMER_TOTAL)}
            </span>
          </div>

          <div className="mb-5 flex gap-1" aria-hidden="true">
            {drills.map((d, i) => {
              const fill = i < idx || done ? 1 : i === idx ? (d.seconds - remaining) / d.seconds : 0;
              return (
                <div key={d.id} className="h-1.5 overflow-hidden rounded-full bg-line" style={{ flex: d.seconds }}>
                  <div className="h-full rounded-full bg-ink" style={{ width: `${fill * 100}%` }} />
                </div>
              );
            })}
          </div>

          <Ring fraction={done ? 0 : remaining / drill.seconds}>
            {done ? (
              <>
                <Check size={36} className="text-primed" aria-hidden="true" />
                <span className="figure mt-2 text-3xl">Primed</span>
                <span className="mt-1 text-xs text-ink-3">6:00 complete</span>
              </>
            ) : (
              <>
                <span className="text-xs text-ink-3">{drill.focus}</span>
                <span className="figure mt-1 text-[72px]" role="timer" aria-live="off" data-testid="timer">
                  {formatClock(shownSeconds)}
                </span>
                <span className="mt-1 text-xs text-ink-3">{running ? 'Running' : remaining < drill.seconds ? 'Paused' : `${drill.seconds} s drill`}</span>
              </>
            )}
          </Ring>

          <div className="mt-5 min-h-[7.5rem] text-center" aria-live="polite">
            <h3 className="text-lg font-semibold text-ink">{done ? `Ready for ${ctx.to}` : drill.name}</h3>
            {done ? (
              <p className="mx-auto mt-1.5 max-w-[46ch] text-sm text-ink-2">Start the session within a few minutes while the tissue is warm and the pattern is fresh.</p>
            ) : (
              <>
                <p className="mt-1 text-sm font-medium text-ink-2">{drill.cue}</p>
                <p className="mx-auto mt-1.5 max-w-[46ch] text-sm text-ink-3">{drill.detail}</p>
              </>
            )}
          </div>

          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              aria-label="Previous drill"
              disabled={idx === 0 && !done}
              onClick={() => jump(done ? drills.length - 1 : idx - 1)}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-line-2 bg-raised text-ink-2 hover:text-ink disabled:text-line-2"
            >
              <SkipBack size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={toggle}
              className="flex h-14 min-w-36 items-center justify-center gap-2 rounded-full bg-ink px-6 text-base font-semibold text-night hover:bg-white"
            >
              {running ? <Pause size={19} aria-hidden="true" /> : <Play size={19} aria-hidden="true" />}
              {running ? 'Pause' : done ? 'Run again' : remaining < drill.seconds || idx > 0 ? 'Resume' : 'Start'}
            </button>
            <button
              type="button"
              aria-label="Next drill"
              disabled={idx === drills.length - 1}
              onClick={() => jump(idx + 1)}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-line-2 bg-raised text-ink-2 hover:text-ink disabled:text-line-2"
            >
              <SkipForward size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="mt-3 flex justify-center">
            <Button variant="ghost" icon={<RotateCcw size={14} aria-hidden="true" />} onClick={restart} className="!text-xs">
              Restart from drill 1
            </Button>
          </div>
        </Card>

        <Card title="Six-minute sequence" aside={<span className="text-xs text-ink-3">Tap a drill to jump to it</span>}>
          <ol className="space-y-2">
            {drills.map((d, i) => {
              const current = i === idx && !done;
              const finished = i < idx || done;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    aria-current={current ? 'step' : undefined}
                    onClick={() => jump(i)}
                    className={cx(
                      'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                      current ? 'border-ink-3 bg-raised' : 'border-line bg-night hover:border-line-2',
                    )}
                  >
                    <span
                      className={cx(
                        'tnum mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                        finished ? 'border-primed/50 bg-primed/10 text-primed' : current ? 'border-ink bg-ink text-night' : 'border-line-2 text-ink-3',
                      )}
                    >
                      {finished ? <Check size={14} aria-hidden="true" /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{d.name}</span>
                      <span className="mt-0.5 block text-xs text-ink-3">
                        {d.focus} · {d.cue}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-sm font-medium text-ink-2">{d.seconds}s</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </div>
  );
}
