import { CircleCheck, Flame, Minus, Plus, TriangleAlert } from 'lucide-react';

/** Status styling. Class names are written out in full so Tailwind keeps them. */
export const LEVEL = {
  primed: {
    Icon: CircleCheck,
    color: 'var(--color-primed)',
    text: 'text-primed',
    pill: 'border-primed/40 bg-primed/10 text-primed',
    panel: 'border-primed/35 bg-primed/[0.06]',
  },
  manage: {
    Icon: TriangleAlert,
    color: 'var(--color-manage)',
    text: 'text-manage',
    pill: 'border-manage/40 bg-manage/10 text-manage',
    panel: 'border-manage/40 bg-manage/[0.06]',
  },
  high: {
    Icon: Flame,
    color: 'var(--color-high)',
    text: 'text-high',
    pill: 'border-high/45 bg-high/10 text-high',
    panel: 'border-high/45 bg-high/[0.07]',
  },
};

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function Card({ title, aside, children, className, id }) {
  return (
    <section id={id} className={cx('min-w-0 rounded-xl border border-line bg-panel p-4 sm:p-5', className)}>
      {(title || aside) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {title && <h2 className="label">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatusPill({ level, children }) {
  const { Icon, pill } = LEVEL[level];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap', pill)}>
      <Icon size={13} strokeWidth={2.25} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Icon + text callout tinted by status. */
export function Callout({ level, title, children, className }) {
  const { Icon, panel, text } = LEVEL[level];
  return (
    <div className={cx('flex gap-3 rounded-lg border p-3.5', panel, className)}>
      <Icon size={18} className={cx('mt-0.5 shrink-0', text)} aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold text-ink">{title}</p>}
        <p className="text-sm text-ink-2">{children}</p>
      </div>
    </div>
  );
}

export function Segmented({ options, value, onChange, label, size = 'md', className }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx('inline-flex rounded-lg border border-line bg-night p-0.5', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-2 py-2 text-[13px] sm:px-3.5 sm:text-sm',
              active ? 'bg-raised text-ink shadow-[inset_0_0_0_1px_var(--color-line-2)]' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Button({ variant = 'primary', icon, children, className, ...props }) {
  const styles = {
    primary: 'bg-ink text-night hover:bg-white disabled:bg-line-2 disabled:text-ink-3',
    secondary: 'border border-line-2 bg-raised text-ink hover:border-ink-3 disabled:text-ink-3',
    ghost: 'text-ink-2 hover:bg-raised hover:text-ink',
    danger: 'border border-high/50 bg-high/15 text-high hover:bg-high/25',
  };
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed',
        styles[variant],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export function Field({ label, htmlFor, hint, error, children, className }) {
  return (
    <div className={cx('min-w-0', className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-xs font-medium text-ink-2">
          {label}
        </label>
        {hint && <span className="text-xs text-ink-3">{hint}</span>}
      </div>
      {children}
      {error && <p className="mt-1 text-xs text-high">{error}</p>}
    </div>
  );
}

export const inputClass =
  'tnum h-11 w-full min-w-0 rounded-lg border border-line-2 bg-night px-3 text-base text-ink placeholder:text-ink-3 focus:border-erg-hard focus:outline-none';

/** Number input with − / + buttons sized for thumbs. */
export function Stepper({ id, value, onChange, step = 1, min = 0, max = 9999, unit, invalid }) {
  const clamp = (v) => Math.min(max, Math.max(min, v));
  const bump = (dir) => {
    const next = (Number.isFinite(value) ? value : min) + dir * step;
    onChange(clamp(Math.round(next * 100) / 100));
  };
  const btn =
    'flex h-11 w-10 shrink-0 items-center justify-center text-ink-2 hover:bg-raised hover:text-ink disabled:text-line-2';
  return (
    <div
      className={cx(
        'flex h-11 items-stretch overflow-hidden rounded-lg border bg-night focus-within:border-erg-hard',
        invalid ? 'border-high/70' : 'border-line-2',
      )}
    >
      <button type="button" className={btn} onClick={() => bump(-1)} disabled={value <= min} aria-label="Decrease">
        <Minus size={16} aria-hidden="true" />
      </button>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-1 border-x border-line">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ''}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
          className="tnum w-full min-w-0 bg-transparent text-center text-base font-medium text-ink focus:outline-none"
        />
        {unit && <span className="pr-2 text-xs text-ink-3">{unit}</span>}
      </div>
      <button type="button" className={btn} onClick={() => bump(1)} disabled={value >= max} aria-label="Increase">
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Small label / value pair used in stat rows. */
export function Stat({ label, value, unit, sub }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="figure text-[28px] text-ink">{value}</span>
        {unit && <span className="text-xs text-ink-2">{unit}</span>}
      </p>
      {sub && <p className="mt-1 text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

/** Legend entry: a swatch that mirrors the mark, with the name in text ink. */
export function LegendItem({ color, line, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <span
        aria-hidden="true"
        className={line ? 'h-0.5 w-3.5 rounded-full' : 'h-2.5 w-2.5 rounded-[3px]'}
        style={{ background: color }}
      />
      {children}
    </span>
  );
}
