/** 手机倾角：先统一重力方向，再投影到屏幕坐标。 */
import { clamp, TILT } from "./constants.ts";

const IOS_PERM_MS = TILT.iosPermissionMs;

type Permissioned = {
  requestPermission?: () => Promise<PermissionState | string>;
};

type GenericAccel = {
  x: number | null;
  y: number | null;
  start(): void;
  addEventListener(type: "reading" | "error", fn: () => void): void;
};

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

function screenAngle(): number {
  const angle = window.screen?.orientation?.angle;
  if (typeof angle === "number" && Number.isFinite(angle)) return angle;
  return typeof window.orientation === "number" ? window.orientation : 0;
}

function validXY(x: number | null, y: number | null): boolean {
  return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y);
}

async function askPermission(ev: unknown): Promise<void> {
  try {
    const perm = ev as Permissioned | null;
    if (typeof perm?.requestPermission === "function") await perm.requestPermission();
  } catch {
    // 拒绝权限不影响普通玩法，挂起由超时处理。
  }
}

export class TiltSensor {
  theta = 0;
  private target = 0;
  private frozenSec = 0;
  private armed = false;
  private listening = false;
  private lastMotionAt = -Infinity;
  private lastSensorAt = -Infinity;
  private genericAccel: GenericAccel | null = null;

  constructor() {
    // Android 无权限弹窗，保留构造时直接监听。
    if (typeof window !== "undefined" && isAndroid()) this.listen();
  }

  /** iOS 权限请求必须由用户手势同步发起。 */
  startFromGesture(): void {
    if (this.armed) {
      this.listen();
      return;
    }
    this.armed = true;
    if (isIos()) {
      void this.requestIosThenListen();
      return;
    }
    this.listen();
  }

  /** 冻结期间不接收新目标；已有倾角继续平滑靠近原目标。 */
  freeze(sec: number): void {
    if (Number.isFinite(sec)) this.frozenSec = Math.max(this.frozenSec, sec, 0);
  }

  tick(dt: number): void {
    this.frozenSec = Math.max(0, this.frozenSec - dt);
    const a = 1 - Math.exp(-dt / TILT.smoothSec);
    this.theta += (this.target - this.theta) * a;
    if (Math.abs(this.theta) < 1e-4) this.theta = 0;
  }

  private async requestIosThenListen(): Promise<void> {
    const perm = Promise.all([
      askPermission(typeof DeviceOrientationEvent !== "undefined" ? DeviceOrientationEvent : null),
      askPermission(typeof DeviceMotionEvent !== "undefined" ? DeviceMotionEvent : null),
    ]);
    await Promise.race([
      perm,
      new Promise<void>((resolve) => window.setTimeout(resolve, IOS_PERM_MS)),
    ]);
    this.listen();
  }

  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener("deviceorientation", (e) => this.onOrient(e), { passive: true });
    window.addEventListener("devicemotion", (e) => this.onMotion(e), { passive: true });
    this.startGenericAccel();
  }

  private startGenericAccel(): void {
    if (this.genericAccel) return;
    const Ctor = (globalThis as unknown as { Accelerometer?: new (opts: { frequency: number }) => GenericAccel })
      .Accelerometer;
    if (typeof Ctor !== "function") return;
    try {
      const sensor = new Ctor({ frequency: 60 });
      sensor.addEventListener("reading", () => {
        if (!validXY(sensor.x, sensor.y)) return;
        this.lastSensorAt = performance.now();
        if (this.motionFresh()) return;
        // 通用 Accelerometer 使用标准符号，不套用 iOS 事件的历史修正。
        this.updatePlane(sensor.x! * TILT.standardAccelSign, sensor.y! * TILT.standardAccelSign);
      });
      sensor.addEventListener("error", () => {
        this.lastSensorAt = -Infinity;
      });
      sensor.start();
      this.genericAccel = sensor;
    } catch {
      // 无权限或非安全上下文，继续使用事件回退。
    }
  }

  private motionFresh(): boolean {
    return performance.now() - this.lastMotionAt < TILT.sourceStaleMs;
  }

  private onOrient(e: DeviceOrientationEvent): void {
    if (this.motionFresh() || performance.now() - this.lastSensorAt < TILT.sourceStaleMs) return;
    if (!validXY(e.beta, e.gamma)) return;
    const beta = e.beta! * Math.PI / 180;
    const gamma = e.gamma! * Math.PI / 180;
    // 由 beta/gamma 还原设备重力投影，避免直接选一个欧拉角导致横屏反向。
    this.updatePlane(
      TILT.earthGravity * Math.cos(beta) * Math.sin(gamma),
      -TILT.earthGravity * Math.sin(beta),
    );
  }

  private onMotion(e: DeviceMotionEvent): void {
    const g = e.accelerationIncludingGravity;
    if (!g || !validXY(g.x, g.y)) return;
    // 平放也算有效主数据，防止回退抢占造成抖动。
    this.lastMotionAt = performance.now();
    // iOS Safari 历史符号与 Android 相反；假设 iOS 为重力、Android 为支撑力。
    // 需用两平台真机确认：手机向右倾，屏幕重力 x 应为正。
    const sign = isIos() ? TILT.iosMotionSign : TILT.standardAccelSign;
    this.updatePlane(g.x! * sign, g.y! * sign);
  }

  private updatePlane(x: number, y: number): void {
    if (this.frozenSec > 0 || Math.hypot(x, y) < TILT.minPlaneAccel) return;
    const angle = screenAngle() * Math.PI / 180;
    // 设备轴转屏幕轴：90° 与 -90° 必须保留各自符号，也支持倒置竖屏。
    const sx = x * Math.cos(angle) - y * Math.sin(angle);
    const sy = x * Math.sin(angle) + y * Math.cos(angle);
    const deg = Math.atan2(sx, -sy) * 180 / Math.PI;
    this.target = (Math.abs(deg) < TILT.deadzoneDeg ? 0 : clamp(deg, -TILT.maxDeg, TILT.maxDeg)) * Math.PI / 180;
  }
}
