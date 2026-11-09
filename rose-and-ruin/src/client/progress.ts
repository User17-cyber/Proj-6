// Renown and the orders it unlocks. Renown is earned in battle (every point of a knight's
// renown score, plus a bounty for seeing a battle through and more for winning it) and kept
// in the browser. The renowned orders unlock one after another as it grows.

import { CLASSES, UNLOCK_ORDER, type ClassId } from '../shared/data/classes';

export const isUnlocked = (cls: ClassId, renown: number) => (CLASSES[cls].unlock ?? 0) <= renown;
export const lockedClasses = (renown: number): ClassId[] => UNLOCK_ORDER.filter((c) => !isUnlocked(c, renown));

/** The next order to be won, and how much renown it needs. */
export function nextUnlock(renown: number): { cls: ClassId; need: number; prev: number } | null {
  let prev = 0;
  for (const c of UNLOCK_ORDER) {
    const need = CLASSES[c].unlock ?? 0;
    if (renown < need) return { cls: c, need, prev };
    prev = need;
  }
  return null;
}

/** Renown awarded for finishing a battle (win or lose) and the extra for winning it. */
export const FINISH_BOUNTY = 150, VICTORY_BOUNTY = 500;

/** One line for menus: progress toward the next order, or that all are won. */
export function renownLine(renown: number): string {
  const n = nextUnlock(renown);
  if (!n) return `${renown.toLocaleString()} renown · every order is yours`;
  return `${renown.toLocaleString()} renown · ${CLASSES[n.cls].name} at ${n.need.toLocaleString()}`;
}
