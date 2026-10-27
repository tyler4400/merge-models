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
export const FAIL_AIRBORNE_VY = 1.0; // |vy| 超过此值时保留失败时钟，不累积、不判负
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
  ballFriction: 0.35,
  wallRestitution: 0.06,
  wallFriction: 0.35,
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

export const MOTION = {
  staleMs: 1500, // 无 devicemotion 时重挂监听，并启用通用传感器回退
  reattachMinMs: 2000, // watchdog / focus 重挂最小间隔
  focusStaleMs: 1000, // focus 仅在事件静默超过此值时尝试恢复
} as const;

export const TILT = {
  deadzoneDeg: 3, // 小于此角度视为竖直
  smoothSec: 0.1, // 倾角指数平滑时间常数（秒）
  maxDeg: 35, // 最大游戏倾角（度）
  minPlaneAccel: 3, // 屏幕平面重力过小时保持目标角（m/s²）
  wakeDeltaDeg: 1.5, // 相对上次唤醒的角度变化阈值（度）
  wakeIntervalSec: 0.5, // 持续倾斜时的唤醒间隔（秒）
  wakeImpulsePerMass: 0.001, // 向下唤醒冲量除以质量（m/s）
  failGraceDeg: 15, // 启用失败宽限的倾角（度）
  failHoldScale: 2, // 大倾角时失败等待时长倍数
  sourceStaleMs: 800, // 主传感器静默多久后允许回退（毫秒）
  iosPermissionMs: 300, // iOS 权限等待上限，保留原超时（毫秒）
  earthGravity: 9.81, // 姿态回退换算为重力加速度（m/s²）
  iosMotionSign: 1, // iOS Safari 历史上直接报告重力方向，需真机确认
  standardAccelSign: -1, // Android/通用传感器报告支撑加速度，取反得到重力
} as const;

export const SHAKE = {
  highPassSec: 0.1, // 含重力加速度回退的一阶高通时间常数（秒）
  thresholdMs2: 17, // 超过此线加速度才计为峰（m/s²）
  fullMs2: 35, // 强度映射到 1 的线加速度（m/s²）
  windowMs: 500, // 峰与方向反转的统计窗口（毫秒）
  minPeaks: 2, // 最少峰数；仍须满足两次反转（至少三个交替波瓣）
  minReversals: 2, // 窗口内主轴方向反转的最少次数
  cooldownSec: 2, // 两次触发的最小间隔（秒）；v1 防刷分只靠冷却
  impulse: 14, // 单位质量的基础向上冲量，即速度增量（m/s）
  minStrength: 0.75, // 强度 0 对应的冲量倍率，强度 1 对应倍率 1
  jitter: 0.15, // 每颗球速度增量大小的 ± 扰动比例
  angleJitterDeg: 8, // 每颗球相对全缸方向的 ± 角度扰动（度）
  lateralRatio: 0.45, // 全缸首脉冲横向/竖直分量比；每次只选一次正负方向
  sloshEnabled: true, // 启用反向横晃的第二脉冲
  sloshDelayMs: 120, // 第二脉冲延迟（毫秒，由 Game.tick 驱动）
  sloshRatio: 0.6, // 第二脉冲为每球首脉冲横向分量的反向倍率
  destroyEscaped: true, // 落在瓶外或地板以下时碎裂销毁；安全边界不受此开关影响
  maxDeltaV: 18, // 合成速度增量的长度上限（m/s）
  spinScale: 1.2, // 随机旋转强度
  failPauseSec: 3, // 摇晃后暂停失败计时及触发的时间（秒）
  tiltFreezeSec: 0.8, // 首峰及触发后冻结倾斜目标的时间（秒）
  vibrateMs: [30, 40, 30], // 震动、间隔、震动时长（毫秒）
  desktopIntensity: 0.8, // 桌面 KeyS 模拟摇晃的强度
} as const;

export const ESCAPE = {
  belowFloorMargin: 2, // 中心低于地板表面此距离时销毁
  perchSpeed: 0.6, // 停在侧墙顶上的判定速度上限（m/s）
  perchSec: 0.5, // 停在侧墙顶上持续此时长即销毁（秒）
  safetyAbsX: 50,
  safetyMaxY: 200,
  safetyMinY: -50,
} as const;

export const CAMERA = {
  targetY: (VIEW.yMin + VIEW.yMax) / 2,
  radius: 28,
  beta: Math.PI / 2,
  alpha: Math.PI / 2,
} as const;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
