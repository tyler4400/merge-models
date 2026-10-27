/** 390×844 手机视图；物理盒按 01-courtyard.webp 的缸内壁对齐，因此转换图片时不能改变尺寸。 */

export const SCREEN = {
  w: 390,
  h: 844,
  hudTop: 118,
  // 基于 01-courtyard.webp（1536×1024）测量：以缸为中心裁取 473×1024 竖窗
  // （原图 x 519–992）映射至 390×844 视图，保持画面与隐形物理墙对齐。
  // 玻璃内壁约在原图 x 572–938，缸口约 y 200，木底座顶部约 y 852。
  jarTop: 165,
  jarBottom: 702,
  jarInnerW: 302,
  jarInnerH: 537,
  side: 44,
  hammerTop: 720,
} as const;

const INNER_W = 8;

export const TANK = {
  innerWidth: INNER_W,
  innerHeight: INNER_W * (SCREEN.jarInnerH / SCREEN.jarInnerW),
  innerDepth: 6.5, // T-800 diameter ~5.0 + slack; front/back must not pinch
  wall: INNER_W * (28 / SCREEN.jarInnerW),
} as const;

const WORLD_PER_PX = TANK.innerWidth / SCREEN.jarInnerW;

export const VIEW = {
  halfW: (SCREEN.w * WORLD_PER_PX) / 2,
  halfH: (SCREEN.h * WORLD_PER_PX) / 2,
  yMin: TANK.innerHeight - (SCREEN.h - SCREEN.jarTop) * WORLD_PER_PX,
  yMax: TANK.innerHeight + SCREEN.jarTop * WORLD_PER_PX,
} as const;

export const FAIL_LINE_Y = TANK.innerHeight * 0.9;
export const FAIL_HOLD_SEC = 2.0;
export const FAIL_DROP_GRACE = 0.8;
export const WARN_SLACK = 1.2;

export const DROP = {
  y: FAIL_LINE_Y + 0.5,
  moveSpeed: 9.4,
  wallPad: 0.05,
} as const;

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
  zSpring: 52,
  zDamp: 22,
  zClamp: 0.18,
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
