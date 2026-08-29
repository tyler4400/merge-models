/**
 * merge to tier n = 10*n*n.
 * Same-drop combo: from the 2nd merge, each extra ×1.25 (stacks).
 * First T-800 +3000 + max(0, 2000 - seconds*8).
 * Two T-800s vanish +5000. Hammer = 0.
 */
import {
  COMBO_MULT,
  FIRST_T800_FLAT,
  T800_PAIR_BONUS,
  TIME_BONUS_MAX,
  TIME_BONUS_PER_SEC,
} from "./constants";

export function mergePoints(resultTier: number, comboIndex: number): number {
  const base = 10 * resultTier * resultTier;
  const extra = comboIndex <= 0 ? 1 : COMBO_MULT ** comboIndex;
  return Math.round(base * extra);
}

export function firstT800Bonus(elapsedSec: number): number {
  return FIRST_T800_FLAT + Math.max(0, TIME_BONUS_MAX - elapsedSec * TIME_BONUS_PER_SEC);
}

export function t800PairBonus(): number {
  return T800_PAIR_BONUS;
}
