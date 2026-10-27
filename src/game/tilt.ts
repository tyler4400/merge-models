/** 手机倾角：先统一重力方向，再投影到屏幕坐标。 */
import { clamp, MOTION, TILT } from "./constants.ts";
import { MotionLifecycle } from "./motionLifecycle.ts";

const IOS_PERM_MS = TILT.iosPermissionMs;

type Permissioned = {
  requestPermission?: () => Promise<PermissionState | string>;
};

type GenericAccel = {
  x: number | null;
  y: number | null;
  start(): void;
  stop(): void;
  removeEventListener(type: "reading" | "error", fn: (event: Event) => void): void;
  addEventListener(type: "reading" | "error", fn: (event: Event) => void): void;
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
  private permissionPending = false;
  private disposed = false;
  private readonly lifecycle: MotionLifecycle;
  private lastGenericAttempt = -Infinity;
  private resetListeners = new Set<(resumed: boolean) => void>();
  private lastMotionAt = -Infinity;
  private lastSensorAt = -Infinity;
  private genericAccel: GenericAccel | null = null;
  private motionListeners = new Set<(e: DeviceMotionEvent) => void>();

  constructor() {
    this.lifecycle = new MotionLifecycle({
      window,
      document: typeof document === "undefined" ? undefined : document,
      visibility: () => typeof document === "undefined" ? "visible" : document.visibilityState,
      now: () => performance.now(),
      onMotion: this.onMotion,
      onOrientation: this.onOrient,
      onReset: (resumed) => {
        this.lastMotionAt = this.lastSensorAt = -Infinity;
        this.lastGenericAttempt = -Infinity;
        if (resumed) this.frozenSec = 0;
        for (const listener of this.resetListeners) {
          try { listener(resumed); } catch (error) { this.recordError(error); }
        }
      },
      startFallback: () => this.startGenericAccel(),
      stopFallback: () => this.stopGenericAccel(),
    });
    // Android 无权限弹窗，保留构造时直接监听。
    if (typeof window !== "undefined" && isAndroid()) this.listen();
  }

  /** iOS 权限请求必须由用户手势同步发起。 */
  startFromGesture(): void {
    if (this.disposed || this.permissionPending) return;
    if (this.armed) {
      this.listen();
      return;
    }
    this.armed = true;
    if (isIos()) {
      this.permissionPending = true;
      void this.requestIosThenListen();
      return;
    }
    this.listen();
  }

  /** 冻结期间不接收新目标；已有倾角继续平滑靠近原目标。 */
  freeze(sec: number): void {
    if (Number.isFinite(sec)) this.frozenSec = Math.max(this.frozenSec, sec, 0);
  }

  /** 复用 listen() 的权限与事件；先通知订阅者，使首峰能冻结本次倾斜更新。 */
  subscribeMotion(listener: (e: DeviceMotionEvent) => void): () => void {
    this.motionListeners.add(listener);
    return () => { this.motionListeners.delete(listener); };
  }

  subscribeReset(listener: (resumed: boolean) => void): () => void {
    this.resetListeners.add(listener);
    return () => { this.resetListeners.delete(listener); };
  }

  recordError(error: unknown): void { this.lifecycle.recordError(error); }

  getDiagnostics() {
    return Object.freeze({ ...this.lifecycle.getDiagnostics(), thetaDeg: this.theta * 180 / Math.PI, targetDeg: this.target * 180 / Math.PI,
      frozenSec: this.frozenSec, genericActive: this.genericAccel !== null });
  }

  dispose(): void {
    this.disposed = true;
    this.lifecycle.dispose();
    this.motionListeners.clear();
    this.resetListeners.clear();
  }

  tick(dt: number): void {
    this.lifecycle.tick();
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
    this.permissionPending = false;
    if (!this.disposed) this.listen();
  }

  private listen(): void {
    this.lifecycle.start();
  }

  private startGenericAccel(): void {
    const now = performance.now();
    if (this.genericAccel || now - this.lastGenericAttempt < MOTION.reattachMinMs) return;
    const Ctor = (globalThis as unknown as { Accelerometer?: new (opts: { frequency: number }) => GenericAccel }).Accelerometer;
    if (typeof Ctor !== "function") return;
    this.lastGenericAttempt = now;
    try {
      const sensor = new Ctor({ frequency: 60 });
      this.genericAccel = sensor;
      sensor.addEventListener("reading", this.onGenericReading);
      sensor.addEventListener("error", this.onGenericError);
      sensor.start();
    } catch (error) {
      this.recordError(error);
      this.stopGenericAccel();
    }
  }

  private stopGenericAccel(): void {
    const sensor = this.genericAccel;
    this.genericAccel = null;
    this.lastSensorAt = -Infinity;
    if (!sensor) return;
    try { sensor.stop(); } catch (error) { this.recordError(error); }
    try {
      sensor.removeEventListener("reading", this.onGenericReading);
      sensor.removeEventListener("error", this.onGenericError);
    } catch (error) { this.recordError(error); }
  }

  private onGenericReading = (): void => {
    try {
      const sensor = this.genericAccel;
      if (!sensor || !validXY(sensor.x, sensor.y)) return;
      this.lastSensorAt = performance.now();
      if (this.motionFresh()) return;
      this.updatePlane(sensor.x! * TILT.standardAccelSign, sensor.y! * TILT.standardAccelSign);
    } catch (error) { this.recordError(error); }
  };

  private onGenericError = (event: Event): void => {
    try {
      this.recordError((event as Event & { error?: Error }).error ?? "Accelerometer error");
      this.stopGenericAccel();
    } catch (error) { this.recordError(error); }
  };

  private motionFresh(): boolean {
    return performance.now() - this.lastMotionAt < TILT.sourceStaleMs;
  }

  private onOrient = (e: DeviceOrientationEvent): void => {
    try {
      if (this.motionFresh() || performance.now() - this.lastSensorAt < TILT.sourceStaleMs) return;
      if (!validXY(e.beta, e.gamma)) return;
      const beta = e.beta! * Math.PI / 180;
      const gamma = e.gamma! * Math.PI / 180;
      // 由 beta/gamma 还原设备重力投影，避免直接选一个欧拉角导致横屏反向。
      this.updatePlane(
        TILT.earthGravity * Math.cos(beta) * Math.sin(gamma),
        -TILT.earthGravity * Math.sin(beta),
      );
    } catch (error) { this.recordError(error); }
  };

  private onMotion = (e: DeviceMotionEvent): void => {
    try {
      for (const listener of this.motionListeners) {
        try { listener(e); } catch (error) { this.recordError(error); }
      }
      const g = e.accelerationIncludingGravity;
      if (!g || !validXY(g.x, g.y)) return;
      // 平放也算有效主数据，防止回退抢占造成抖动。
      this.lastMotionAt = performance.now();
      // iOS Safari 历史符号与 Android 相反；需两平台真机确认左右倾方向。
      const sign = isIos() ? TILT.iosMotionSign : TILT.standardAccelSign;
      this.updatePlane(g.x! * sign, g.y! * sign);
    } catch (error) { this.recordError(error); }
  };

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
