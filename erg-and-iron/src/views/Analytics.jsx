import { useMemo, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Callout, Card, LegendItem, Segmented, Stat, cx } from '../components/ui.jsx';
import { LineChart, PhaseWheel, TipRow } from '../components/charts.jsx';
import { shortDate } from '../lib/dates.js';
import { formatClock, formatSplit } from '../lib/rowing.js';
import { EXERCISE } from '../lib/exercises.js';
import {
  ERG_BUCKETS,
  KEY_LIFTS,
  NEGLECT_THRESHOLD,
  TRANSFER_BAND,
  TREND_WEEKS,
  best2k,
  bestLift,
  peakWatts,
  phaseBalance,
  transferRatio,
  transferTrend,
} from '../lib/analytics.js';
import { int, mass, signed, weight } from '../lib/format.js';

/* ───────────────────────── wattage-to-weight translator ───────────────────────── */

const RATIO_SCALE = [1.8, 3.6];

function RatioBand({ ratio }) {
  const [lo, hi] = RATIO_SCALE;
  const pos = (v) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`;
  return (
    <div className="mt-4">
      <div className="relative h-2.5 rounded-full bg-line">
        <div
          className="absolute inset-y-0 rounded-full bg-primed/35"
          style={{ left: pos(TRANSFER_BAND[0]), right: `calc(100% - ${pos(TRANSFER_BAND[1])})` }}
        />
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-ink"
          style={{ left: pos(ratio) }}
        />
      </div>
      <div className="mt-2 grid grid-cols-3 text-[11px] text-ink-3">
        <span>Strength-rich</span>
        <span className="text-center">
          Balanced {TRANSFER_BAND[0].toFixed(1)}–{TRANSFER_BAND[1].toFixed(1)}
        </span>
        <span className="text-right">Strength-limited</span>
      </div>
    </div>
  );
}

function Translator({ state, today }) {
  const u = state.units;
  const bw = state.athlete.bodyweight;
  const pr = best2k(state.workouts, state.athlete);
  const peak = peakWatts(state.workouts);
  const lifts = KEY_LIFTS.map((id) => ({ id, ex: EXERCISE[id], best: bestLift(state.workouts, id, bw) }));
  const deadlift = lifts[0].best;
  const t = transferRatio(pr.watts, deadlift?.e1rm);
  const maxE1 = Math.max(...lifts.map((l) => l.best?.e1rm ?? 0), 1);
  // Shown per kg or per lb, to match the unit toggle.
  const perUnit = (kg) => (u === 'lb' ? kg / 2.20462262 : kg);

  return (
    <Card title="Wattage-to-weight translator">
      <div className="grid grid-cols-3 gap-4 border-b border-line pb-5">
        <Stat label="2k power" value={Math.round(pr.watts)} unit="W" sub={`${formatClock(pr.time, 1)} · ${formatSplit(pr.split)} /500m`} />
        <Stat
          label="Peak erg power"
          value={peak ? Math.round(peak.watts) : '–'}
          unit="W"
          sub={peak ? `${formatSplit(peak.split)} over ${int(peak.distance)} m` : 'No pieces logged'}
        />
        <Stat label="2k power to weight" value={(pr.watts / bw).toFixed(2)} unit="W/kg" sub={`at ${weight(bw, u)} ${u}`} />
      </div>

      <div className="py-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-xs text-ink-3">Power Transfer Ratio</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="figure text-[56px]">{t ? perUnit(t.ratio).toFixed(2) : '–'}</span>
              <span className="text-sm text-ink-2">W per {u} of deadlift 1RM</span>
            </p>
          </div>
          {t && <p className="pb-1.5 text-sm font-semibold text-ink">{t.label}</p>}
        </div>
        {t ? (
          <>
            <RatioBand ratio={t.ratio} />
            <p className="mt-3 text-sm text-ink-2">{t.text}</p>
            <p className="mt-2 text-[11px] text-ink-3">
              2k watts ÷ trap bar deadlift estimated 1RM. The balanced band is a coaching rule of thumb, not a validated norm.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-2">Log a trap bar deadlift to calculate your ratio.</p>
        )}
      </div>

      <div className="border-t border-line pt-4">
        <div className="tnum hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1.25fr)_minmax(0,0.95fr)_minmax(0,0.6fr)_minmax(0,0.8fr)] gap-2 pb-2 text-[11px] whitespace-nowrap text-ink-3 sm:grid">
          <span>Key lift</span>
          <span>Best set</span>
          <span>Est. 1RM</span>
          <span>× BW</span>
          <span className="text-right">2k W per {u}</span>
        </div>
        <ul className="divide-y divide-line">
          {lifts.map(({ id, ex, best }) => (
            <li key={id} className="py-3 last:pb-0">
              <div className="tnum grid grid-cols-2 items-baseline gap-x-2 gap-y-1 text-sm whitespace-nowrap sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.25fr)_minmax(0,0.95fr)_minmax(0,0.6fr)_minmax(0,0.8fr)]">
                <span className="col-span-2 font-medium text-ink sm:col-span-1">{ex.name}</span>
                {best ? (
                  <>
                    <span className="text-ink-2">
                      <span className="text-ink-3 sm:hidden">Best </span>
                      {ex.bodyweight ? '+' : ''}
                      {weight(best.weight, u)} {u} × {best.reps}
                    </span>
                    <span className="text-right text-ink-2 sm:text-left">
                      <span className="text-ink-3 sm:hidden">1RM </span>
                      {weight(best.e1rm, u)} {u}
                    </span>
                    <span className="text-ink-2">
                      {(best.e1rm / bw).toFixed(2)}
                      <span className="text-ink-3">×</span>
                      <span className="text-ink-3 sm:hidden"> bodyweight</span>
                    </span>
                    <span className="text-right font-semibold text-ink">
                      {perUnit(pr.watts / best.e1rm).toFixed(2)}
                      <span className="font-normal text-ink-3 sm:hidden"> W/{u}</span>
                    </span>
                  </>
                ) : (
                  <span className="col-span-2 text-ink-3 sm:col-span-4">Not logged yet</span>
                )}
              </div>
              {best && (
                <div className="mt-2 h-1.5 rounded-full bg-line">
                  <div className="h-full rounded-full bg-iron" style={{ width: `${(best.e1rm / maxE1) * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-ink-3">
          Estimated 1RM uses the Epley formula. Pull-ups include bodyweight. Bars compare 1RM across the three lifts.
        </p>
      </div>
    </Card>
  );
}

/* ───────────────────────── transfer trend ───────────────────────── */

const TREND_SERIES = [
  { key: 'strengthIdx', label: 'Strength index (key-lift 1RM)', short: 'Strength', color: 'var(--color-iron)' },
  { key: 'ergIdx', label: 'Erg power index (best hard-piece watts)', short: 'Erg', color: 'var(--color-erg)' },
];

function Trend({ state, today }) {
  const u = state.units;
  const t = useMemo(
    () => transferTrend(state.workouts, today, state.athlete.bodyweight),
    [state.workouts, today, state.athlete.bodyweight],
  );
  const points = t.points.map((p) => ({ ...p, label: p.index === 0 ? 'This wk' : `−${p.index}w` }));
  const tip = (p) => (
    <>
      <p className="mb-1 font-medium text-ink-2">
        {shortDate(p.from)} – {shortDate(p.to)}
      </p>
      <TipRow
        color="var(--color-iron)"
        value={p.strengthIdx != null ? p.strengthIdx.toFixed(1) : '–'}
        label={p.strength ? `${mass(p.strength, u)} ${u} combined 1RM` : 'no lifts yet'}
      />
      <TipRow
        color="var(--color-erg)"
        value={p.ergIdx != null ? p.ergIdx.toFixed(1) : '–'}
        label={ERG_BUCKETS.filter((b) => p.erg[b.id]).map((b) => `${b.label} ${Math.round(p.erg[b.id])} W`).join(' · ') || 'no hard pieces yet'}
      />
    </>
  );
  return (
    <Card title="Is strength reaching the handle?" aside={<span className="text-xs text-ink-3">{TREND_WEEKS} weeks, first week = 100</span>}>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1">
        {TREND_SERIES.map((s) => (
          <LegendItem key={s.key} color={s.color} line>
            {s.label}
          </LegendItem>
        ))}
      </div>
      <LineChart
        points={points}
        series={TREND_SERIES}
        baseline={100}
        tip={tip}
        ariaLabel={`Strength index and erg power index over ${TREND_WEEKS} weeks. Use the arrow keys to read each week.`}
      />
      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-line pt-4">
        <Stat label="Strength" value={t.strengthChange != null ? `${signed(t.strengthChange)}%` : '–'} sub="key-lift 1RM" />
        <Stat label="Erg power" value={t.ergChange != null ? `${signed(t.ergChange)}%` : '–'} sub="hard-piece watts" />
        <Stat label="Avg readiness" value={`${t.avgReadiness}%`} sub="posterior, 7 days" />
      </div>
      <Callout level={t.verdict.level} title={t.verdict.title} className="mt-4">
        {t.verdict.text}
      </Callout>
      <details className="mt-4 border-t border-line pt-3 text-xs">
        <summary className="cursor-pointer text-ink-3 select-none hover:text-ink-2">Weekly numbers</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="tnum w-full min-w-[500px] text-left">
            <thead className="text-ink-3">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Week ending</th>
                <th className="py-1.5 pr-3 text-right font-medium">Combined 1RM ({u})</th>
                {ERG_BUCKETS.map((b) => (
                  <th key={b.id} className="py-1.5 pr-3 text-right font-medium">
                    {b.label} W
                  </th>
                ))}
                <th className="py-1.5 pr-3 text-right font-medium">Strength</th>
                <th className="py-1.5 text-right font-medium">Erg</th>
              </tr>
            </thead>
            <tbody className="text-ink-2">
              {t.points.map((p) => (
                <tr key={p.to} className="border-t border-line">
                  <td className="py-1.5 pr-3">{shortDate(p.to)}</td>
                  <td className="py-1.5 pr-3 text-right">{p.strength ? mass(p.strength, u) : '–'}</td>
                  {ERG_BUCKETS.map((b) => (
                    <td key={b.id} className="py-1.5 pr-3 text-right">
                      {p.erg[b.id] ? Math.round(p.erg[b.id]) : '–'}
                    </td>
                  ))}
                  <td className="py-1.5 pr-3 text-right">{p.strengthIdx != null ? p.strengthIdx.toFixed(1) : '–'}</td>
                  <td className="py-1.5 text-right">{p.ergIdx != null ? p.ergIdx.toFixed(1) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

/* ───────────────────────── stroke-phase balance ───────────────────────── */

function PhaseBalance({ state, today }) {
  const u = state.units;
  const [metric, setMetric] = useState('sets');
  const [active, setActive] = useState(null);
  const b = useMemo(() => phaseBalance(state.workouts, today, metric), [state.workouts, today, metric]);
  const fmt = (v) => (metric === 'sets' ? `${int(v)} sets` : `${mass(v, u)} ${u}`);

  return (
    <Card
      title="Stroke-phase balance"
      aside={
        <Segmented
          size="sm"
          label="Volume measure"
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'sets', label: 'By sets' },
            { value: 'tonnage', label: 'By tonnage' },
          ]}
        />
      }
    >
      <div className="grid items-center gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
        <PhaseWheel
          phases={b.phases}
          active={active}
          onActive={setActive}
          caption={`Lifting volume by stroke phase: ${b.phases.map((p) => `${p.short} ${Math.round(p.pct)}%`).join(', ')}`}
          center={
            <>
              <span className="figure text-[34px]">{metric === 'sets' ? int(b.total) : mass(b.total, u)}</span>
              <span className="mt-1 text-xs text-ink-3">{metric === 'sets' ? 'working sets' : `${u} lifted`}</span>
              <span className="text-[11px] text-ink-3">last 7 days</span>
            </>
          }
        />
        <ul className="min-w-0 space-y-4">
          {b.phases.map((p) => {
            const low = b.total > 0 && p.pct < NEGLECT_THRESHOLD;
            return (
              <li
                key={p.id}
                onMouseEnter={() => setActive(p.id)}
                onMouseLeave={() => setActive(null)}
                className={cx('transition-opacity', active && active !== p.id && 'opacity-50')}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
                    <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
                    {p.short}
                    {low && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-manage">
                        <TriangleAlert size={12} aria-hidden="true" /> Under {NEGLECT_THRESHOLD}%
                      </span>
                    )}
                  </p>
                  <p className="tnum shrink-0 text-sm">
                    <span className="font-semibold text-ink">{low ? p.pct.toFixed(1) : Math.round(p.pct)}%</span>
                    <span className="ml-2 text-xs text-ink-3">{fmt(p.value)}</span>
                  </p>
                </div>
                <div className="relative mt-2 h-2 rounded-full bg-line">
                  <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${p.pct}%`, background: p.color }} />
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-ink-3"
                    style={{ left: `${NEGLECT_THRESHOLD}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-ink-3">{p.blurb}</p>
              </li>
            );
          })}
        </ul>
      </div>
      <Callout
        level={b.callout.level}
        title={b.callout.level === 'primed' ? 'Balanced across the stroke' : 'Injury-prevention flag'}
        className="mt-5"
      >
        {b.callout.text}
      </Callout>
      <p className="mt-3 text-[11px] text-ink-3">
        The marker on each bar is the {NEGLECT_THRESHOLD}% floor.
        {b.push > 0 && ` Antagonist push work (${fmt(b.push)}) is logged but sits outside the stroke, so it is not part of this split.`}
      </p>
    </Card>
  );
}

/* ───────────────────────── view ───────────────────────── */

export default function Analytics({ state, today }) {
  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="grid gap-4 lg:gap-5 xl:grid-cols-2">
        <Translator state={state} today={today} />
        <Trend state={state} today={today} />
      </div>
      <PhaseBalance state={state} today={today} />
    </div>
  );
}
