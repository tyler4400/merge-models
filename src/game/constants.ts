/** World-space playfield. Screen lock: 390×844, HUD 0–72, jar 80–740, hammer 756–844. */

export const SCREEN = {
  w: 390,
  h: 844,
  hudTop: 72,
  jarTop: 80,
  jarBottom: 740,
  jarInnerW: 366,
  jarInnerH: 660,
  side: 12,
  hammerTop: 756,
} as const;

/** Inner play width in world units; height follows 366:660. */
const INNER_W = 11;

export const TANK = {
  innerWidth: INNER_W,
  innerHeight: INNER_W * (SCREEN.jarInnerH / SCREEN.jarInnerW),
  innerDepth: 4.5,
  wall: INNER_W * (SCREEN.side / SCREEN.jarInnerW),
} as const;

const VIEW_H = TANK.innerHeight * (SCREEN.h / SCREEN.jarInnerH);
const Y_MIN = -TANK.innerHeight * ((SCREEN.h - SCREEN.jarBottom) / SCREEN.jarInnerH);

export const VIEW = {
  halfW: (TANK.innerWidth + TANK.wall * 2) / 2,
  yMin: Y_MIN,
  yMax: Y_MIN + VIEW_H,
} as const;

export const DROP = {
  y: TANK.innerHeight - 0.55,
  moveSpeed: 6.2,
  wallPad: 0.06,
} as const;

/** Caution line ~48px below jar top → 48/660 of inner height from the rim. */
export const FAIL_LINE_Y = TANK.innerHeight * (1 - 48 / SCREEN.jarInnerH);
export const FAIL_HOLD_SEC = 2.0;
export const WARN_SLACK = 1.2;

export const REST = {
  linSpeed: 0.22,
  angSpeed: 0.85,
  holdSec: 0.22,
  maxWaitSec: 5,
} as const;

export const PHYS = {
  ballRestitution: 0.34,
  ballFriction: 0.62,
  wallRestitution: 0.08,
  wallFriction: 0.55,
  linearDamping: 0.08,
  angularDamping: 0.05,
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
  targetY: (VIEW.yMin + VIEW.yMax) / 2,
  radius: 28,
  beta: Math.PI / 2,
  alpha: Math.PI / 2,
} as const;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
