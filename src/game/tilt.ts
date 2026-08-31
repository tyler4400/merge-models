/** Phone tilt → extra X gravity for balls already in the jar. */

const MAX_GX = 2.8;
const DEADZONE_DEG = 4;
const DEADZONE_ACCEL = 0.7;
const TAU = 0.15;
/** Modest lean (~28°) hits the gravity cap; not a marble-run. */
const FULL_DEG = 28;
const FULL_ACCEL = 4.0;

type Permissioned = {
  requestPermission?: () => Promise<PermissionState | string>;
};

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

export class TiltSensor {
  gx = 0;
  private target = 0;
  private armed = false;
  private listening = false;
  private lastOrientAt = 0;

  /** iOS requires this inside a user gesture. Denial is fine — game still plays. */
  startFromGesture(): void {
    if (this.armed) return;
    this.armed = true;
    void this.requestAndListen();
  }

  tick(dt: number): void {
    const a = 1 - Math.exp(-dt / TAU);
    this.gx += (this.target - this.gx) * a;
    if (Math.abs(this.gx) < 1e-4) this.gx = 0;
  }

  private async requestAndListen(): Promise<void> {
    try {
      const orient = DeviceOrientationEvent as unknown as Permissioned;
      if (typeof orient.requestPermission === "function") {
        await orient.requestPermission();
      }
    } catch {
      /* denied — play without tilt */
    }
    try {
      const motion = DeviceMotionEvent as unknown as Permissioned;
      if (typeof motion.requestPermission === "function") {
        await motion.requestPermission();
      }
    } catch {
      /* denied */
    }
    this.listen();
  }

  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener("deviceorientation", (e) => this.onOrient(e), { passive: true });
    window.addEventListener("devicemotion", (e) => this.onMotion(e), { passive: true });
  }

  private onOrient(e: DeviceOrientationEvent): void {
    if (e.gamma == null && e.beta == null) return;
    this.lastOrientAt = performance.now();
    // Portrait: gamma is jar left/right; landscape reports that axis on beta.
    const deg = isLandscape() ? (e.beta ?? 0) : (e.gamma ?? 0);
    this.target = fromDeg(deg);
  }

  private onMotion(e: DeviceMotionEvent): void {
    if (performance.now() - this.lastOrientAt < 800) return;
    const g = e.accelerationIncludingGravity;
    if (!g) return;
    const a = isLandscape() ? (g.y ?? 0) : (g.x ?? 0);
    this.target = fromAccel(a);
  }
}
