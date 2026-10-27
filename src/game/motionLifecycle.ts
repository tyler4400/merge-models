/** 可注入事件目标和单调时钟；不请求权限，不依赖游戏或浏览器全局。 */
import { MOTION } from "./constants.ts";

type Target = Pick<EventTarget, "addEventListener" | "removeEventListener">;
export type MotionError = Readonly<{ message: string; atMs: number }>;
type Options = {
  window: Target;
  document?: Target;
  visibility: () => string;
  now: () => number;
  onMotion: (event: DeviceMotionEvent) => void;
  onOrientation: (event: DeviceOrientationEvent) => void;
  onReset: (resumed: boolean) => void;
  startFallback: () => void;
  stopFallback: () => void;
};

export class MotionLifecycle {
  private readonly options: Options;
  private readonly pageLifecycle: boolean;
  private enabled = false;
  private listening = false;
  private suspended = false;
  private disposed = false;
  private startedAt = 0;
  private lastMotionAt: number | null = null;
  private lastReattachAt = -Infinity;
  private reattachCount = 0;
  private eventTimes: number[] = [];
  private lastError: MotionError | null = null;

  constructor(options: Options) {
    this.options = options;
    this.pageLifecycle = !!options.document && ("onfreeze" in options.document || "onresume" in options.document);
    options.document?.addEventListener("visibilitychange", this.onVisibility);
    if (this.pageLifecycle) {
      options.document?.addEventListener("freeze", this.onSuspend);
      options.document?.addEventListener("resume", this.onResume);
    }
    options.window.addEventListener("pagehide", this.onSuspend);
    options.window.addEventListener("pageshow", this.onResume);
    options.window.addEventListener("focus", this.onFocus);
  }

  recordError(error: unknown): void {
    this.lastError = { message: error instanceof Error ? `${error.name}: ${error.message}` : String(error), atMs: this.options.now() };
  }

  private safely(action: () => void): void {
    try { action(); } catch (error) { this.recordError(error); }
  }

  start(): void {
    if (this.disposed || this.enabled) return;
    this.enabled = true;
    this.startedAt = this.options.now();
    this.attach();
  }

  /** detach 不撤销授权意图；恢复只重挂这些固定引用，不调用权限 API。 */
  attach(): void {
    if (!this.enabled || this.disposed || this.suspended || this.options.visibility() !== "visible") return;
    this.options.window.removeEventListener("devicemotion", this.onMotion);
    this.options.window.removeEventListener("deviceorientation", this.onOrientation);
    this.options.window.addEventListener("devicemotion", this.onMotion, { passive: true });
    this.options.window.addEventListener("deviceorientation", this.onOrientation, { passive: true });
    this.listening = true;
  }

  detach(): void {
    this.options.window.removeEventListener("devicemotion", this.onMotion);
    this.options.window.removeEventListener("deviceorientation", this.onOrientation);
    this.listening = false;
    this.safely(this.options.stopFallback);
  }

  private onMotion = (event: Event): void => {
    this.safely(() => {
      if (!this.listening) return;
      const now = this.options.now();
      this.lastMotionAt = now; // 任意事件均算心跳，不能由无效数据/订阅者异常吞掉。
      this.eventTimes = this.eventTimes.filter((at) => now - at < 1000 && at <= now);
      this.eventTimes.push(now);
      this.safely(this.options.stopFallback);
      this.options.onMotion(event as DeviceMotionEvent);
    });
  };
  private onOrientation = (event: Event): void => {
    this.safely(() => { if (this.listening) this.options.onOrientation(event as DeviceOrientationEvent); });
  };
  private onSuspend = (): void => {
    this.safely(() => {
      this.suspended = true;
      this.detach();
      if (this.enabled) this.options.onReset(false);
    });
  };
  private onResume = (): void => {
    this.safely(() => {
      if (this.options.visibility() !== "visible") return;
      this.suspended = false;
      if (this.enabled && !this.disposed) this.reattach(true);
    });
  };
  private onVisibility = (): void => {
    this.safely(() => {
      if (this.options.visibility() === "visible") this.onResume();
      else this.onSuspend();
    });
  };
  private onFocus = (): void => {
    this.safely(() => {
      const now = this.options.now();
      if (this.listening && this.options.visibility() === "visible" &&
        now - (this.lastMotionAt ?? this.startedAt) > MOTION.focusStaleMs && this.canRetry(now)) {
        this.reattach(false);
      }
    });
  };

  private canRetry(now: number): boolean {
    return now < this.lastReattachAt || now - this.lastReattachAt >= MOTION.reattachMinMs;
  }

  private reattach(resumed: boolean): void {
    this.lastReattachAt = this.options.now();
    this.reattachCount++;
    this.detach();
    this.safely(() => this.options.onReset(resumed));
    this.attach();
  }

  tick(): void {
    this.safely(() => {
      if (!this.listening || this.options.visibility() !== "visible") return;
      const now = this.options.now();
      if (now - (this.lastMotionAt ?? this.startedAt) <= MOTION.staleMs) return;
      // 从未收到事件的桌面不反复重挂，但允许使用 Accelerometer 回退。
      if (this.lastMotionAt !== null && this.canRetry(now)) this.reattach(false);
      this.options.startFallback();
    });
  }

  getDiagnostics() {
    const now = this.options.now();
    return Object.freeze({
      listening: this.listening, visibilityState: this.options.visibility(),
      eventsPerSecond: this.eventTimes.filter((at) => now - at < 1000 && at <= now).length,
      lastMotionAgoMs: this.lastMotionAt === null ? null : Math.max(0, now - this.lastMotionAt),
      reattachCount: this.reattachCount, lastError: this.lastError ? Object.freeze({ ...this.lastError }) : null,
    });
  }

  dispose(): void {
    this.enabled = false;
    this.disposed = true;
    this.detach();
    const o = this.options;
    o.document?.removeEventListener("visibilitychange", this.onVisibility);
    if (this.pageLifecycle) {
      o.document?.removeEventListener("freeze", this.onSuspend);
      o.document?.removeEventListener("resume", this.onResume);
    }
    o.window.removeEventListener("pagehide", this.onSuspend);
    o.window.removeEventListener("pageshow", this.onResume);
    o.window.removeEventListener("focus", this.onFocus);
  }
}
