/** 摇晃识别与滤波均为纯逻辑；时间由调用方传入，不依赖 DOM 或时钟。 */
import { clamp, SHAKE } from "./constants.ts";
import type { TiltSensor } from "./tilt.ts";

type Acceleration = { x: number | null; y: number | null; z: number | null };
type Vector = { x: number; y: number; z: number };
export type MotionSample = {
  acceleration: Acceleration | null;
  accelerationIncludingGravity: Acceleration | null;
};
type Peak = { at: number; axis: "x" | "y"; sign: number; magnitude: number };
export type ShakeResult = { peak: boolean; intensity: number | null };

function valid(a: Acceleration | null): a is Vector {
  return !!a && [a.x, a.y, a.z].every((v) => typeof v === "number" && Number.isFinite(v));
}

export class ShakeDetector {
  private peaks: Peak[] = [];
  private activePeak: Peak | null = null;
  private previousGravity: Vector | null = null;
  private highPass: Vector = { x: 0, y: 0, z: 0 };
  private lastAt = -Infinity;
  private cooldownUntil = -Infinity;

  /** 清除跨阶段/长时间断流的样本，但保留冷却，不能通过重开绕过。 */
  resetMotion(): void {
    this.peaks = [];
    this.activePeak = null;
    this.previousGravity = null;
    this.highPass = { x: 0, y: 0, z: 0 };
    this.lastAt = -Infinity;
  }

  /** 真机与桌面共用入口；v1 防刷分只靠冷却，不限制次数或合成得分。 */
  trigger(intensity: number, nowMs: number): number | null {
    if (!Number.isFinite(nowMs) || !Number.isFinite(intensity) || nowMs < this.cooldownUntil) return null;
    this.cooldownUntil = nowMs + SHAKE.cooldownSec * 1000;
    this.peaks = [];
    return clamp(intensity, 0, 1);
  }

  sample(sample: MotionSample, nowMs: number): ShakeResult {
    const result: ShakeResult = { peak: false, intensity: null };
    if (!Number.isFinite(nowMs) || nowMs <= this.lastAt) return result;
    if (nowMs - this.lastAt > SHAKE.windowMs) this.resetMotion();
    const dt = (nowMs - this.lastAt) / 1000;
    this.lastAt = nowMs;
    this.peaks = this.peaks.filter((p) => nowMs - p.at <= SHAKE.windowMs);

    let a: Vector;
    if (valid(sample.acceleration)) {
      a = sample.acceleration;
      // 数据源切换时重新建立重力基线，避免把来源差异当成摇晃。
      this.previousGravity = null;
      this.highPass = { x: 0, y: 0, z: 0 };
    } else if (valid(sample.accelerationIncludingGravity)) {
      const g = sample.accelerationIncludingGravity;
      if (!this.previousGravity) {
        this.previousGravity = { ...g };
        this.activePeak = null;
        return result;
      }
      const alpha = SHAKE.highPassSec / (SHAKE.highPassSec + dt);
      for (const axis of ["x", "y", "z"] as const) {
        this.highPass[axis] = alpha * (this.highPass[axis] + g[axis] - this.previousGravity[axis]);
      }
      this.previousGravity = { ...g };
      a = this.highPass;
    } else {
      this.resetMotion();
      return result;
    }

    const magnitude = Math.hypot(a.x, a.y, a.z);
    if (magnitude <= SHAKE.thresholdMs2) {
      this.activePeak = null;
      return result;
    }
    const axis = Math.abs(a.x) >= Math.abs(a.y) ? "x" : "y";
    const sign = Math.sign(a[axis]);
    // 同一超阈值波瓣只算一个峰；跨零反向即使漏采低谷也可算新峰。
    if (this.activePeak?.axis === axis && this.activePeak.sign === sign) {
      this.activePeak.magnitude = Math.max(this.activePeak.magnitude, magnitude);
      return result;
    }
    const peak: Peak = { at: nowMs, axis, sign, magnitude };
    this.activePeak = peak;
    result.peak = true;
    // 冷却中仍通知首峰冻结倾斜，但不能积累下一次触发所需的峰。
    if (nowMs < this.cooldownUntil) return result;
    this.peaks.push(peak);
    let reversals = 0;
    for (let i = 1; i < this.peaks.length; i++) {
      const prev = this.peaks[i - 1];
      const curr = this.peaks[i];
      // 换轴不是反转；纯 z 方向敲击也不能满足 x/y 反转条件。
      if (prev.axis === curr.axis && prev.sign * curr.sign < 0) reversals++;
    }
    if (this.peaks.length >= SHAKE.minPeaks && reversals >= SHAKE.minReversals) {
      const max = Math.max(...this.peaks.map((p) => p.magnitude));
      result.intensity = this.trigger((max - SHAKE.thresholdMs2) / (SHAKE.fullMs2 - SHAKE.thresholdMs2), nowMs);
    }
    return result;
  }
}

/** 薄浏览器适配：通过 TiltSensor 的 devicemotion 订阅，不再次请求权限。 */
export class ShakeSensor {
  readonly detector = new ShakeDetector();
  private unsubscribe: () => void;
  private enabled: () => boolean;
  private onShake: (intensity: number) => void;

  constructor(tilt: TiltSensor, callbacks: {
    enabled: () => boolean;
    onPeak: () => void;
    onShake: (intensity: number) => void;
  }) {
    this.enabled = callbacks.enabled;
    this.onShake = callbacks.onShake;
    this.unsubscribe = tilt.subscribeMotion((event) => {
      if (!this.enabled()) { this.detector.resetMotion(); return; }
      const result = this.detector.sample(event, performance.now());
      if (result.peak) callbacks.onPeak();
      if (result.intensity !== null) this.onShake(result.intensity);
    });
  }

  simulate(intensity: number): void {
    if (!this.enabled()) return;
    const accepted = this.detector.trigger(intensity, performance.now());
    if (accepted !== null) this.onShake(accepted);
  }

  dispose(): void { this.unsubscribe(); }
}
