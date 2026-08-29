/** 390x844 phone. Jar sits inset like Suika, courtyard shows around it. */

export const SCREEN = {
  w: 390,
  h: 844,
  hudTop: 108,
  jarTop: 132,
  jarBottom: 668,
  jarInnerW: 286,
  jarInnerH: 536,
  side: 52,
  hammerTop: 700,
} as const;

const INNER_W = 8;

export const TANK = {
  innerWidth: INNER_W,
  innerHeight: INNER_W * (SCREEN.jarInnerH / SCREEN.jarInnerW),
  innerDepth: 4.5,
  wall: INNER_W * (28 / SCREEN.jarInnerW),
} as const;

const WORLD_PER_PX = TANK.innerWidth / SCREEN.jarInnerW;

export const VIEW = {
  halfW: (SCREEN.w * WORLD_PER_PX) / 2,
  halfH: (SCREEN.h * WORLD_PER_PX) / 2,
  yMin: TANK.innerHeight - (SCREEN.h - SCREEN.jarTop) * WORLD_PER_PX,
  yMax: TANK.innerHeight + SCREEN.jarTop * WORLD_PER_PX,
} as const;

export const DROP = {
  y: TANK.innerHeight - 0.42,
  moveSpeed: 9.4,
  wallPad: 0.05,
} as const;

export const FAIL_LINE_Y = TANK.innerHeight * (1 - 48 / SCREEN.jarInnerH);
export const FAIL_HOLD_SEC = 2.0;
export const WARN_SLACK = 1.2;

export const REST = {
  linSpeed: 0.28,
  angSpeed: 0.95,
  holdSec: 0.18,
  maxWaitSec: 5,
} as const;

export const PHYS = {
  ballRestitution: 0.28,
  ballFriction: 0.58,
  wallRestitution: 0.06,
  wallFriction: 0.6,
  linearDamping: 0.1,
  angularDamping: 0.08,
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

export const GRAVITY_Y = -24;

export const CAMERA = {
  targetY: (VIEW.yMin + VIEW.yMax) / 2,
  radius: 28,
  beta: Math.PI / 2,
  alpha: Math.PI / 2,
} as const;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
