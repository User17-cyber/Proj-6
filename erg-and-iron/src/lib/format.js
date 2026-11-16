// Display formatting. Weights are stored in kg and converted for display.

export const KG_PER_LB = 0.45359237;

export function toDisplay(kg, units) {
  return units === 'lb' ? kg / KG_PER_LB : kg;
}

export function fromDisplay(value, units) {
  return units === 'lb' ? value * KG_PER_LB : value;
}

/** 140 → "140", 102.5 → "102.5"; pounds round to the nearest whole. */
export function weight(kg, units) {
  const v = toDisplay(kg, units);
  if (units === 'lb') return Math.round(v).toLocaleString('en-US');
  return (Math.round(v * 10) / 10).toLocaleString('en-US');
}

export function weightUnit(kg, units) {
  return `${weight(kg, units)} ${units}`;
}

/** Whole-number tonnage with thousands separators. */
export function mass(kg, units) {
  return Math.round(toDisplay(kg, units)).toLocaleString('en-US');
}

export function int(n) {
  return Math.round(n).toLocaleString('en-US');
}

/** 16000 → "16k", 12500 → "12.5k", 800 → "800" */
export function compact(n) {
  if (Math.abs(n) >= 1000) {
    const k = n / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return String(Math.round(n));
}

export function signed(n, digits = 1) {
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}`;
}
