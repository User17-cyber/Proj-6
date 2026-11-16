import { useLayoutEffect, useRef, useState } from 'react';
import { cx } from './ui.jsx';

/* ───────────────────────── helpers ───────────────────────── */

export function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Axis maximum that is twice a clean step, so the mid tick is a round number. */
export function niceMax(value) {
  if (!(value > 0)) return 1;
  const half = value / 2;
  const pow = 10 ** Math.floor(Math.log10(half));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * pow >= half - 1e-9) * pow;
  return step * 2;
}

function Tooltip({ children, style, className }) {
  return (
    <div
      role="status"
      className={cx(
        'pointer-events-none absolute z-20 min-w-36 rounded-lg border border-line-2 bg-raised px-3 py-2 text-xs shadow-xl shadow-black/40',
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

export function TipRow({ color, value, label }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span aria-hidden="true" className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: color }} />
      <span className="tnum font-semibold text-ink">{value}</span>
      <span className="text-ink-3">{label}</span>
    </div>
  );
}

/* ───────────────────────── readiness gauge ───────────────────────── */

const G = { w: 176, h: 150, cx: 88, cy: 88, r: 70, sw: 10, start: 135, sweep: 270 };
const polar = (deg, r = G.r) => {
  const a = (deg * Math.PI) / 180;
  return [G.cx + r * Math.cos(a), G.cy + r * Math.sin(a)];
};

/** 270° radial meter. Ticks outside the arc mark the 50% and 75% thresholds. */
export function ReadinessGauge({ score, color, label }) {
  const [sx, sy] = polar(G.start);
  const [ex, ey] = polar(G.start + G.sweep);
  const d = `M ${sx} ${sy} A ${G.r} ${G.r} 0 1 1 ${ex} ${ey}`;
  const len = 2 * Math.PI * G.r * (G.sweep / 360);
  const ticks = [50, 75].map((t) => {
    const deg = G.start + (G.sweep * t) / 100;
    return { t, a: polar(deg, G.r + G.sw / 2 + 3), b: polar(deg, G.r + G.sw / 2 + 8) };
  });
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score}
      aria-label={label}
      className="relative mx-auto w-full max-w-[176px]"
    >
      <svg viewBox={`0 0 ${G.w} ${G.h}`} className="block w-full" aria-hidden="true">
        <path d={d} fill="none" stroke={color} strokeOpacity="0.16" strokeWidth={G.sw} strokeLinecap="round" />
        {score > 0 && (
          <path
            className="gauge-arc"
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={G.sw}
            strokeLinecap="round"
            strokeDasharray={`${(len * score) / 100} ${len}`}
          />
        )}
        {ticks.map(({ t, a, b }) => (
          <line key={t} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--color-ink-3)" strokeWidth="1.5" strokeLinecap="round" />
        ))}
      </svg>
      <div className="absolute inset-x-0 top-[34%] flex items-baseline justify-center">
        <span className="figure text-[56px] text-ink">{score}</span>
        <span className="figure ml-0.5 text-xl text-ink-2">%</span>
      </div>
    </div>
  );
}

/** Seven-day trace with the current value emphasised. */
export function Spark({ values, color, label }) {
  const w = 96;
  const h = 26;
  const pad = 4;
  const x = (i) => pad + (i * (w - pad * 2)) / (values.length - 1);
  const y = (v) => pad + ((100 - v) / 100) * (h - pad * 2);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values.length - 1;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="shrink-0">
      <polyline points={pts} fill="none" stroke="var(--color-ink-3)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r="3.5" fill={color} stroke="var(--color-panel)" strokeWidth="2" />
    </svg>
  );
}

/* ───────────────────────── stacked day bars ───────────────────────── */

/**
 * One column per day, stacked by `series`.
 *  days    [{ date, label, title, today, values: { [key]: number } }]
 *  series  [{ key, label, color }]  (bottom of the stack first)
 */
export function DayBars({ days, series, format, tick = format, totalLabel = 'Total' }) {
  const [active, setActive] = useState(null);
  const totals = days.map((d) => series.reduce((t, s) => t + (d.values[s.key] || 0), 0));
  const max = niceMax(Math.max(...totals));
  const n = days.length;

  return (
    <div className="relative" onMouseLeave={() => setActive(null)}>
      <div className="flex">
        <div className="tnum relative h-[150px] w-10 shrink-0 text-[11px] text-ink-3" aria-hidden="true">
          <span className="absolute top-0 right-2 -translate-y-1/2">{tick(max)}</span>
          <span className="absolute top-1/2 right-2 -translate-y-1/2">{tick(max / 2)}</span>
          <span className="absolute right-2 bottom-0 translate-y-1/2">0</span>
        </div>
        <div className="relative h-[150px] min-w-0 flex-1">
          <div className="absolute inset-x-0 top-0 border-t border-line" />
          <div className="absolute inset-x-0 top-1/2 border-t border-line" />
          <div className="absolute inset-x-0 bottom-0 border-t border-line-2" />
          <div className="absolute inset-0 flex items-end">
            {days.map((d, i) => {
              const shown = series.filter((s) => d.values[s.key] > 0);
              return (
                <button
                  key={d.date}
                  type="button"
                  aria-label={`${d.title}: ${
                    shown.length
                      ? series.map((s) => `${s.label} ${format(d.values[s.key] || 0)}`).join(', ')
                      : 'nothing logged'
                  }`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  onClick={() => setActive(i)}
                  className="flex h-full min-w-0 flex-1 items-end justify-center"
                >
                  <span
                    className="flex h-full w-full max-w-6 flex-col-reverse gap-0.5 transition-[filter,opacity]"
                    style={{
                      filter: active === i ? 'brightness(1.2)' : undefined,
                      opacity: active != null && active !== i ? 0.55 : 1,
                    }}
                  >
                    {shown.map((s, j) => (
                      <span
                        key={s.key}
                        className="bar-seg block w-full"
                        style={{
                          height: `${(d.values[s.key] / max) * 100}%`,
                          minHeight: 2,
                          background: s.color,
                          borderRadius: j === shown.length - 1 ? '4px 4px 0 0' : 0,
                        }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-2 flex pl-10" aria-hidden="true">
        {days.map((d) => (
          <span
            key={d.date}
            className={cx('min-w-0 flex-1 text-center text-[11px]', d.today ? 'font-semibold text-ink' : 'text-ink-3')}
          >
            {d.label}
          </span>
        ))}
      </div>
      {active != null && (
        <Tooltip
          className="top-0"
          style={
            active < n / 2
              ? { left: `calc(40px + (100% - 40px) * ${(active + 0.5) / n} + 18px)` }
              : { right: `calc((100% - 40px) * ${1 - (active + 0.5) / n} + 18px)` }
          }
        >
          <p className="mb-1 font-medium text-ink-2">{days[active].title}</p>
          {[...series].reverse().map((s) => (
            <TipRow key={s.key} color={s.color} value={format(days[active].values[s.key] || 0)} label={s.label} />
          ))}
          <p className="mt-1 border-t border-line-2 pt-1 text-ink-3">
            {totalLabel} <span className="tnum font-semibold text-ink">{format(totals[active])}</span>
          </p>
        </Tooltip>
      )}
    </div>
  );
}

/* ───────────────────────── indexed line chart ───────────────────────── */

function tickStep(span) {
  return [1, 2, 5, 10, 20, 50].find((s) => span / s <= 5) ?? 100;
}

/**
 * Lines on one shared axis with a crosshair readout.
 *  points  [{ label, [key]: number | null }]
 *  series  [{ key, label, color }]
 *  tip     (point) => ReactNode
 */
export function LineChart({ points, series, tip, baseline, height = 230, ariaLabel }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(null);
  const narrow = width > 0 && width < 420;
  const m = { top: 14, right: narrow ? 48 : 110, bottom: 26, left: 34 };
  const plotW = Math.max(10, width - m.left - m.right);
  const plotH = height - m.top - m.bottom;
  const n = points.length;

  const values = points.flatMap((p) => series.map((s) => p[s.key])).filter((v) => v != null);
  if (baseline != null) values.push(baseline);
  const lo0 = values.length ? Math.min(...values) : 0;
  const hi0 = values.length ? Math.max(...values) : 1;
  const step = tickStep(Math.max(hi0 - lo0, 1));
  const lo = Math.floor(lo0 / step) * step;
  const hi = Math.max(Math.ceil(hi0 / step) * step, lo + step);
  const ticks = [];
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(t);

  const x = (i) => m.left + (n > 1 ? (i * plotW) / (n - 1) : plotW / 2);
  const y = (v) => m.top + ((hi - v) / (hi - lo)) * plotH;

  const paths = series.map((s) => {
    let d = '';
    let pen = false;
    let lastIdx = -1;
    points.forEach((p, i) => {
      const v = p[s.key];
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
      lastIdx = i;
    });
    return { ...s, d, lastIdx, lastValue: lastIdx >= 0 ? points[lastIdx][s.key] : null };
  });

  // End labels: keep them at least 16px apart.
  const ends = paths
    .filter((p) => p.lastIdx >= 0)
    .map((p) => ({ ...p, ly: y(p.lastValue) }))
    .sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i].ly - ends[i - 1].ly < 16) {
      const mid = (ends[i].ly + ends[i - 1].ly) / 2;
      ends[i - 1].ly = mid - 8;
      ends[i].ly = mid + 8;
    }
  }

  const pick = (clientX, target) => {
    const rect = target.getBoundingClientRect();
    const rel = (clientX - rect.left - m.left) / plotW;
    setActive(Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1)))));
  };
  const onKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const dir = e.key === 'ArrowLeft' ? -1 : 1;
    setActive((a) => Math.min(n - 1, Math.max(0, (a ?? n - 1) + dir)));
  };
  const labelEvery = narrow ? 2 : 1;

  return (
    <div
      ref={ref}
      className="relative"
      tabIndex={0}
      role="img"
      aria-label={ariaLabel}
      onKeyDown={onKey}
      onFocus={() => setActive((a) => a ?? n - 1)}
      onBlur={() => setActive(null)}
    >
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="block touch-pan-y"
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
          onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={m.left}
                x2={m.left + plotW}
                y1={y(t)}
                y2={y(t)}
                stroke={t === baseline ? 'var(--color-line-2)' : 'var(--color-line)'}
                strokeWidth="1"
              />
              <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--color-ink-3)" className="tnum">
                {t}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            (n - 1 - i) % labelEvery === 0 ? (
              <text
                key={p.label}
                x={x(i)}
                y={height - 6}
                textAnchor={i === 0 ? 'start' : 'middle'}
                fontSize="11"
                fill={i === n - 1 ? 'var(--color-ink)' : 'var(--color-ink-3)'}
                fontWeight={i === n - 1 ? 600 : 400}
              >
                {p.label}
              </text>
            ) : null,
          )}
          {active != null && (
            <line x1={x(active)} x2={x(active)} y1={m.top} y2={m.top + plotH} stroke="var(--color-ink-3)" strokeWidth="1" />
          )}
          {paths.map((p) => (
            <path key={p.key} d={p.d} fill="none" stroke={p.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {active != null &&
            paths.map((p) =>
              points[active][p.key] != null ? (
                <circle key={p.key} cx={x(active)} cy={y(points[active][p.key])} r="4" fill={p.color} stroke="var(--color-panel)" strokeWidth="2" />
              ) : null,
            )}
          {ends.map((p) => (
            <g key={p.key}>
              <circle cx={x(p.lastIdx)} cy={y(p.lastValue)} r="4.5" fill={p.color} stroke="var(--color-panel)" strokeWidth="2" />
              <text x={x(p.lastIdx) + 10} y={p.ly} dy="0.32em" fontSize="12" fill="var(--color-ink)" fontWeight="600" className="tnum">
                {p.lastValue.toFixed(1)}
                {!narrow && (
                  <tspan fill="var(--color-ink-3)" fontWeight="400" dx="5">
                    {p.short}
                  </tspan>
                )}
              </text>
            </g>
          ))}
        </svg>
      )}
      {active != null && width > 0 && (
        <Tooltip
          className="top-1"
          style={
            x(active) < width / 2 ? { left: x(active) + 12 } : { right: width - x(active) + 12 }
          }
        >
          {tip(points[active])}
        </Tooltip>
      )}
    </div>
  );
}

/* ───────────────────────── stroke-phase wheel ───────────────────────── */

/** Donut of three phases with a surface gap between segments. */
export function PhaseWheel({ phases, active, onActive, center, caption }) {
  const size = 184;
  const r = 72;
  const sw = 20;
  const c = 2 * Math.PI * r;
  const total = phases.reduce((t, p) => t + p.value, 0);
  const nonZero = phases.filter((p) => p.value > 0).length;
  const gap = nonZero > 1 ? 3 : 0;
  let offset = 0;
  return (
    <div className="relative mx-auto w-full max-w-[184px]" onMouseLeave={() => onActive(null)}>
      <svg viewBox={`0 0 ${size} ${size}`} className="block w-full -rotate-90" role="img" aria-label={caption}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={sw} />
        {total > 0 &&
          phases.map((p) => {
            const len = (p.value / total) * c;
            const seg = (
              <circle
                key={p.id}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth={sw}
                strokeDasharray={`${Math.max(len - gap, 0)} ${c}`}
                strokeDashoffset={-(offset + gap / 2)}
                opacity={active && active !== p.id ? 0.35 : 1}
                style={{ transition: 'opacity 150ms' }}
                onMouseEnter={() => onActive(p.id)}
              />
            );
            offset += len;
            return p.value > 0 ? seg : null;
          })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {center}
      </div>
    </div>
  );
}

/** Thin horizontal meter with an optional threshold marker. */
export function Meter({ value, max = 100, color, mark, className }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cx('relative h-2 rounded-full', className)} style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
      {mark != null && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-ink"
          style={{ left: `calc(${(mark / max) * 100}% - 1px)` }}
        />
      )}
    </div>
  );
}
