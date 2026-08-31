/** Phone tilt → extra X gravity for balls already in the jar. */

const MAX_GX = 4.5;
const DEADZONE_DEG = 4;
const DEADZONE_ACCEL = 0.7;
const TAU = 0.15;
/** Modest lean (~28°) hits the gravity cap; not a marble-run. */
const FULL_DEG = 28;
const FULL_ACCEL = 4.0;
const IOS_PERM_MS = 300;
const REAL_ORIENT_MS = 800;

type Permissioned = {
  requestPermission?: () => Promise<PermissionState | string>;
};

type GenericAccel = {
  x: number | null;
  y: number | null;
  start(): void;
  addEventListener(type: "reading", fn: () => void): void;
};

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

function isLandscape(): boolean {
  const wo = window.orientation;
  if (typeof wo === "number") return Math.abs(wo) === 90;
  const type = window.screen?.orientation?.type;
  return !!type && type.startsWith("landscape");
}

function fromDeg(deg: number): number {
  const mag = Math.abs(deg) - DEADZONE_DEG;
  if (mag <= 0) return 0;
  const t = Math.min(1, mag / (FULL_DEG - DEADZONE_DEG));
  return Math.sign(deg) * t * MAX_GX;
}

function fromAccel(a: number): number {
  const mag = Math.abs(a) - DEADZONE_ACCEL;
  if (mag <= 0) return 0;
  const t = Math.min(1, mag / FULL_ACCEL);
  return Math.sign(a) * t * MAX_GX;
}

async function askPermission(ev: unknown): Promise<void> {
  try {
    const perm = ev as Permissioned;
    if (typeof perm.requestPermission === "function") {
      await perm.requestPermission();
    }
  } catch {
    /* denied / missing / WebView hang resolved by timeout */
  }
}

export class TiltSensor {
  gx = 0;
  private target = 0;
  private armed = false;
  private listening = false;
  /** Only stamped when |gamma/beta| is above the deadzone — zeros must not starve motion. */
  private lastRealOrientAt = 0;
  private lastMotionAt = 0;
  private lastSensorAt = 0;
  private genericAccel: GenericAccel | null = null;

  constructor() {
    // Android Chrome/WebView: no permission prompt; events work on HTTPS immediately.
    if (typeof window !== "undefined" && isAndroid()) this.listen();
  }

  /** iOS requires this inside a user gesture. Denial is fine — game still plays. */
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

  tick(dt: number): void {
    const a = 1 - Math.exp(-dt / TAU);
    this.gx += (this.target - this.gx) * a;
    if (Math.abs(this.gx) < 1e-4) this.gx = 0;
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
        this.lastSensorAt = performance.now();
        if (this.realOrientFresh()) return;
        const a = isLandscape() ? (sensor.y ?? 0) : (sensor.x ?? 0);
        this.target = fromAccel(a);
      });
      sensor.start();
      this.genericAccel = sensor;
    } catch {
      /* not allowed / insecure context */
    }
  }

  private realOrientFresh(): boolean {
    return performance.now() - this.lastRealOrientAt < REAL_ORIENT_MS;
  }

  private onOrient(e: DeviceOrientationEvent): void {
    if (e.gamma == null && e.beta == null) return;
    const deg = isLandscape() ? (e.beta ?? 0) : (e.gamma ?? 0);
    if (Math.abs(deg) > DEADZONE_DEG) {
      this.lastRealOrientAt = performance.now();
      this.target = fromDeg(deg);
      return;
    }
    // Near-zero / broken gamma=0 streams must not stamp lastRealOrientAt.
    // If motion/sensor are silent, treat as upright.
    if (performance.now() - this.lastMotionAt >= REAL_ORIENT_MS && performance.now() - this.lastSensorAt >= REAL_ORIENT_MS) {
      this.target = 0;
    }
  }

  private onMotion(e: DeviceMotionEvent): void {
    const g = e.accelerationIncludingGravity;
    if (!g) return;
    this.lastMotionAt = performance.now();
    if (this.realOrientFresh()) return;
    const a = isLandscape() ? (g.y ?? 0) : (g.x ?? 0);
    this.target = fromAccel(a);
  }
}
