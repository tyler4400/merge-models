/** World-space tank, drop, rest, fail line, hammers, score. Units are meters-ish. */

export const TANK = {
  /** Inner clear width — wide enough that mid-tiers do not jam. */
  innerWidth: 14.6,
  /** Floor (y = 0) to inner rim. */
  innerHeight: 16.2,
  /** Front–back inner depth; T-800 (r ≈ 2.1) still fits. */
  innerDepth: 4.5,
  wall: 0.16,
} as const;

export const DROP = {
  /** Held-ball center Y, just under the rim. */
  y: 15.55,
  /** A / D / arrow move speed (units per second). */
  moveSpeed: 6.2,
  /** Extra inset so a held ball never clips a wall. */
  wallPad: 0.06,
} as const;

/** Top caution line. Fail only if a settled ball stays over this ~2s. */
export const FAIL_LINE_Y = 13.35;
export const FAIL_HOLD_SEC = 2.0;
/** Start warning when a ball's top is this close to the line. */
export const WARN_SLACK = 0.85;

export const REST = {
  linSpeed: 0.22,
  angSpeed: 0.85,
  /** Must stay under the speed caps this long before the next drop. */
  holdSec: 0.22,
  /** Failsafe so a forever-rolling ball cannot soft-lock drops. */
  maxWaitSec: 5,
} as const;

export const PHYS = {
  ballRestitution: 0.2,
  ballFriction: 0.4,
  wallRestitution: 0.08,
  wallFriction: 0.55,
  linearDamping: 0.14,
  angularDamping: 0.2,
  /** Spring keeping dropped balls in the side-view lane (z ≈ 0). */
  zSpring: 18,
  zDamp: 8,
} as const;

export const HAMMER_COUNT = 3;
export const MERGE_POP = 2.15;

export const COMBO_MULT = 1.25;
export const FIRST_T800_FLAT = 3000;
export const TIME_BONUS_MAX = 2000;
export const TIME_BONUS_PER_SEC = 8;
export const T800_PAIR_BONUS = 5000;

export const GRAVITY_Y = -9.6;

export const CAMERA = {
  targetY: 7.6,
  radius: 19.2,
  beta: Math.PI / 2.14,
  alpha: Math.PI / 2,
} as const;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
