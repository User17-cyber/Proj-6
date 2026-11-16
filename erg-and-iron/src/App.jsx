import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Dumbbell, LayoutDashboard, NotebookPen, RotateCcw, Timer, Waves } from 'lucide-react';
import { Segmented, cx } from './components/ui.jsx';
import { longDate } from './lib/dates.js';
import { formatClock, formatSplit } from './lib/rowing.js';
import { readinessOn } from './lib/load.js';
import { best2k } from './lib/analytics.js';
import { useStore, useToday } from './lib/store.js';
import Dashboard from './views/Dashboard.jsx';
import Logger from './views/Logger.jsx';
import Analytics from './views/Analytics.jsx';
import Primer from './views/Primer.jsx';

const VIEWS = [
  { id: 'dashboard', label: 'Dashboard', nav: 'Command Dashboard', title: 'Command Dashboard', Icon: LayoutDashboard, View: Dashboard },
  { id: 'log', label: 'Log', nav: 'Workout Logger', title: 'Workout Logger', Icon: NotebookPen, View: Logger },
  { id: 'analytics', label: 'Analytics', nav: 'Power Transfer', title: 'Power Transfer & Stroke Phases', Icon: Activity, View: Analytics },
  { id: 'primer', label: 'Primer', nav: 'Micro-Primer', title: 'Pre-Session Micro-Primer', Icon: Timer, View: Primer },
];

function viewFromHash() {
  const id = window.location.hash.replace('#', '');
  return VIEWS.some((v) => v.id === id) ? id : 'dashboard';
}

function useHashView() {
  const [view, setView] = useState(viewFromHash);
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = useCallback((id) => {
    setView(id);
    try {
      window.location.hash = id;
    } catch {
      // Hash routing is a convenience; the view still switches.
    }
    window.scrollTo(0, 0);
  }, []);
  return [view, go];
}

function Brand({ compact }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-night" aria-hidden="true">
        <Waves size={16} strokeWidth={2.5} className="-mr-0.5" />
        <Dumbbell size={14} strokeWidth={2.5} className="-ml-0.5" />
      </span>
      <span className={cx('figure tracking-[0.08em] uppercase', compact ? 'text-xl' : 'text-[22px]')}>Erg &amp; Iron</span>
    </div>
  );
}

/** Two-step reset: the first press arms it, the second confirms. */
function ResetButton({ onReset }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      onClick={() => {
        if (armed) {
          setArmed(false);
          onReset();
        } else {
          setArmed(true);
        }
      }}
      onBlur={() => setArmed(false)}
      className={cx(
        'inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold whitespace-nowrap transition-colors',
        armed ? 'border-high/60 bg-high/15 text-high' : 'border-line-2 bg-panel text-ink-2 hover:border-ink-3 hover:text-ink',
      )}
    >
      <RotateCcw size={14} aria-hidden="true" />
      {armed ? 'Tap again to reset' : 'Reset Demo Data'}
    </button>
  );
}

export default function App() {
  const [state, dispatch] = useStore();
  const today = useToday();
  const [view, go] = useHashView();
  const [toast, setToast] = useState(null);
  const toastId = useRef(0);

  // `before` is the readiness just before the change; the toast shows the shift.
  const notify = useCallback((text, before) => {
    toastId.current += 1;
    setToast({ id: toastId.current, text, before });
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const current = VIEWS.find((v) => v.id === view);
  const { View } = current;
  const pr = best2k(state.workouts, state.athlete);

  let toastDetail = null;
  if (toast?.before) {
    const after = readinessOn(state.workouts, today);
    toastDetail = `Posterior ${toast.before.post.score}% → ${after.post.score}% · CNS ${toast.before.cns.score}% → ${after.cns.score}%`;
  }

  return (
    <div className="lg:pl-60">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-panel px-4 py-5 lg:flex">
        <Brand />
        <nav aria-label="Main" className="mt-8 space-y-1">
          {VIEWS.map(({ id, nav, Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={(e) => {
                e.preventDefault();
                go(id);
              }}
              aria-current={view === id ? 'page' : undefined}
              className={cx(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                view === id ? 'bg-raised text-ink shadow-[inset_0_0_0_1px_var(--color-line-2)]' : 'text-ink-3 hover:bg-raised/60 hover:text-ink-2',
              )}
            >
              <Icon size={18} className={view === id ? 'text-erg-hard' : undefined} aria-hidden="true" />
              {nav}
            </a>
          ))}
        </nav>
        <div className="mt-auto rounded-lg border border-line bg-night p-3.5">
          <p className="text-sm font-semibold text-ink">{state.athlete.name}</p>
          <p className="mt-0.5 text-xs text-ink-3">{state.athlete.squad}</p>
          <p className="tnum mt-2.5 border-t border-line pt-2.5 text-xs text-ink-2">
            2k {formatClock(pr.time, 1)} · {formatSplit(pr.split)}
          </p>
          <p className="mt-2 text-[11px] text-ink-3">Example data. Saved in this browser only.</p>
        </div>
      </aside>

      <main className="gutter mx-auto max-w-[1180px] pt-4 pb-28 lg:pt-7 lg:pb-12">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <div className="mb-3 lg:hidden">
              <Brand compact />
            </div>
            <h1 className="figure text-[30px] tracking-[0.02em] text-ink uppercase lg:text-[34px]">{current.title}</h1>
            <p className="mt-1.5 text-sm text-ink-3">
              {longDate(today)}
              <span className="lg:hidden"> · example data</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Segmented
              size="sm"
              label="Weight units"
              value={state.units}
              onChange={(units) => dispatch({ type: 'units', units })}
              options={[
                { value: 'kg', label: 'kg' },
                { value: 'lb', label: 'lb' },
              ]}
            />
            <ResetButton
              onReset={() => {
                dispatch({ type: 'reset' });
                notify('Demo data reset');
              }}
            />
          </div>
        </header>

        <View state={state} today={today} dispatch={dispatch} notify={notify} />
      </main>

      {/* Phone bottom bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 backdrop-blur lg:hidden"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
      >
        <div className="mx-auto grid max-w-md grid-cols-4">
          {VIEWS.map(({ id, label, Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={(e) => {
                e.preventDefault();
                go(id);
              }}
              aria-current={view === id ? 'page' : undefined}
              className={cx(
                'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium',
                view === id ? 'text-ink' : 'text-ink-3',
              )}
            >
              <Icon size={20} className={view === id ? 'text-erg-hard' : undefined} aria-hidden="true" />
              {label}
            </a>
          ))}
        </div>
      </nav>

      {toast && (
        <div
          className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}
        >
          <div key={toast.id} role="status" className="toast max-w-md rounded-xl border border-line-2 bg-raised px-4 py-3 text-center shadow-2xl shadow-black/50">
            <p className="text-sm font-semibold text-ink">{toast.text}</p>
            {toastDetail && <p className="tnum mt-0.5 text-xs text-ink-2">{toastDetail}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
