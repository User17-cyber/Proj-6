// Calendar-day helpers. Dates are stored as local 'YYYY-MM-DD' strings so that
// "today" and "yesterday" mean what the athlete expects in their own timezone.

const pad = (n) => String(n).padStart(2, '0');

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO() {
  return toISO(new Date());
}

// Noon avoids daylight-saving edges when adding days.
export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Whole days from b to a (positive when a is later). */
export function diffDays(a, b) {
  return Math.round((fromISO(a) - fromISO(b)) / 86400000);
}

export function weekday(iso, style = 'short') {
  return fromISO(iso).toLocaleDateString('en-US', { weekday: style });
}

export function shortDate(iso) {
  return fromISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function longDate(iso) {
  return fromISO(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/** "today", "yesterday", "Tuesday", or "Nov 3" relative to `today`. */
export function relDay(iso, today) {
  const d = diffDays(today, iso);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d === -1) return 'tomorrow';
  if (d > 1 && d < 7) return weekday(iso, 'long');
  return shortDate(iso);
}

/** The n days ending on `today`, oldest first. */
export function lastNDays(today, n) {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}
