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
export type ShakeResult = { peak: boolean; intensity: number | null; dominantSign: number | null };

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
  private source: "acceleration" | "high-pass" | "none" = "none";
  private magnitude = 0;
  private triggerCount = 0;

  /** 清除跨阶段/长时间断流的样本，但保留冷却，不能通过重开绕过。 */
  resetMotion(): void {
    this.peaks = [];
    this.activePeak = null;
    this.previousGravity = null;
    this.highPass = { x: 0, y: 0, z: 0 };
    this.lastAt = -Infinity;
    this.source = "none";
    this.magnitude = 0;
  }

  /** 页面恢复清除旧冷却；普通重开仍使用 resetMotion 保留冷却。 */
  resetAll(): void {
    this.resetMotion();
    this.cooldownUntil = -Infinity;
  }

  private repairCooldown(nowMs: number): void {
    if (this.cooldownUntil !== -Infinity && (!Number.isFinite(this.cooldownUntil) ||
      this.cooldownUntil - nowMs > SHAKE.cooldownSec * 1000 + SHAKE.windowMs)) {
      this.cooldownUntil = -Infinity;
    }
  }

  private reversals(peaks: readonly Peak[]): number {
    let count = 0;
    for (let i = 1; i < peaks.length; i++) {
      if (peaks[i - 1].axis === peaks[i].axis && peaks[i - 1].sign * peaks[i].sign < 0) count++;
    }
    return count;
  }

  getDiagnostics(nowMs = performance.now()) {
    const peaks = this.peaks.filter((p) => p.at <= nowMs && nowMs - p.at <= SHAKE.windowMs);
    return Object.freeze({ source: this.source, magnitude: this.magnitude, peaks: peaks.length,
      reversals: this.reversals(peaks), cooldownSec: Math.max(0, (this.cooldownUntil - nowMs) / 1000),
      triggerCount: this.triggerCount });
  }

  /** 真机与桌面共用冷却入口；调用前须通过警告门控，不限制次数或合成得分。 */
  trigger(intensity: number, nowMs: number): number | null {
    if (!Number.isFinite(nowMs) || !Number.isFinite(intensity)) return null;
    this.repairCooldown(nowMs);
    if (nowMs < this.cooldownUntil) return null;
    this.triggerCount++;
    this.cooldownUntil = nowMs + SHAKE.cooldownSec * 1000;
    this.peaks = [];
    return clamp(intensity, 0, 1);
  }

  sample(sample: MotionSample, nowMs: number, armed: boolean): ShakeResult {
    const result: ShakeResult = { peak: false, intensity: null, dominantSign: null };
    if (!Number.isFinite(nowMs)) return result;
    this.repairCooldown(nowMs);
    if (nowMs < this.lastAt || nowMs - this.lastAt > SHAKE.windowMs ||
      !valid(this.highPass) || (this.previousGravity !== null && !valid(this.previousGravity))) this.resetMotion();
    if (nowMs === this.lastAt) return result;
    const dt = (nowMs - this.lastAt) / 1000;
    this.lastAt = nowMs;
    this.peaks = this.peaks.filter((p) => nowMs - p.at <= SHAKE.windowMs);

    let a: Vector;
    if (valid(sample.acceleration)) {
      this.source = "acceleration";
      a = sample.acceleration;
      // 数据源切换时重新建立重力基线，避免把来源差异当成摇晃。
      this.previousGravity = null;
      this.highPass = { x: 0, y: 0, z: 0 };
    } else if (valid(sample.accelerationIncludingGravity)) {
      this.source = "high-pass";
      const g = sample.accelerationIncludingGravity;
      if (!this.previousGravity) {
        this.previousGravity = { ...g };
        this.magnitude = 0;
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
    if (!valid(a) || !Number.isFinite(magnitude)) { this.resetMotion(); return result; }
    this.magnitude = magnitude;
    if (magnitude <= SHAKE.thresholdMs2) {
      this.activePeak = null;
      return result;
    }
    const axis = Math.abs(a.x) >= Math.abs(a.y) ? "x" : "y";
    const sign = Math.sign(a[axis]);
    // 同一超阈值波瓣只算一个峰；跨零反向即使漏采低谷也可算新峰。
    if (this.activePeak?.axis === axis && this.activePeak.sign === sign) {
      this.activePeak.magnitude = Math.max(this.activePeak.magnitude, magnitude);
    } else {
      const peak: Peak = { at: nowMs, axis, sign, magnitude };
      this.activePeak = peak;
      result.peak = true;
      if (nowMs >= this.cooldownUntil) this.peaks.push(peak);
    }
    // 未就绪仍积累窗口和峰，警告出现后下一个有效高值样本即可触发；不消耗冷却。
    // 冷却中不攒峰；是否响应首峰冻结倾斜由适配层按同一门控决定。
    if (!armed || nowMs < this.cooldownUntil) return result;
    const reversals = this.reversals(this.peaks);
    if (this.peaks.length >= SHAKE.minPeaks && reversals >= SHAKE.minReversals) {
      const max = Math.max(...this.peaks.map((p) => p.magnitude));
      // 采用完成触发的最后一个波瓣的 x/y 主轴符号，传给全缸共用方向。
      result.dominantSign = sign;
      result.intensity = this.trigger((max - SHAKE.thresholdMs2) / (SHAKE.fullMs2 - SHAKE.thresholdMs2), nowMs);
    }
    return result;
  }
}

/** 薄浏览器适配：通过 TiltSensor 的 devicemotion 订阅，不再次请求权限。 */
export class ShakeSensor {
  readonly detector = new ShakeDetector();
  private unsubscribe: () => void;
  private unsubscribeReset: () => void;
  private reportError: (error: unknown) => void;
  private enabled: () => boolean;
  private armed: () => boolean;
  private onShake: (intensity: number, dominantSign: number | null) => void;

  constructor(tilt: TiltSensor, callbacks: {
    enabled: () => boolean;
    armed: () => boolean;
    onPeak: () => void;
    onShake: (intensity: number, dominantSign: number | null) => void;
  }) {
    this.reportError = (error) => tilt.recordError(error);
    this.unsubscribeReset = tilt.subscribeReset((resumed) => {
      if (resumed) this.detector.resetAll();
      else this.detector.resetMotion();
    });
    this.enabled = callbacks.enabled;
    this.armed = callbacks.armed;
    this.onShake = callbacks.onShake;
    this.unsubscribe = tilt.subscribeMotion((event) => {
      this.safely(() => {
        if (!this.enabled()) { this.detector.resetMotion(); return; }
        const armed = this.armed();
        const result = this.detector.sample(event, performance.now(), armed);
        if (armed && result.peak) this.safely(callbacks.onPeak);
        const intensity = result.intensity;
        if (intensity !== null) this.safely(() => this.onShake(intensity, result.dominantSign));
      });
    });
  }

  private safely(action: () => void): void {
    try { action(); } catch (error) { this.reportError(error); }
  }

  simulate(intensity: number): void {
    this.safely(() => {
      if (!this.enabled() || !this.armed()) return;
      const accepted = this.detector.trigger(intensity, performance.now());
      if (accepted !== null) this.onShake(accepted, null);
    });
  }

  dispose(): void { this.unsubscribe(); this.unsubscribeReset(); }
}

/** 一次摇晃只创建一次基准速度向量；桌面没有主轴时才随机选左右。 */
export function createShakePulse(intensity: number, dominantSign: number | null, random = Math.random): Vector {
  const sign = dominantSign === 1 || dominantSign === -1 ? dominantSign : (random() < 0.5 ? -1 : 1);
  const dy = SHAKE.impulse * (SHAKE.minStrength + (1 - SHAKE.minStrength) * clamp(intensity, 0, 1));
  return { x: sign * dy * SHAKE.lateralRatio, y: dy, z: 0 };
}

/** 每球只对共同向量施加小幅长度/角度扰动，最后限制合成 Δv。 */
export function jitterShakePulse(pulse: Vector, random = Math.random): Vector {
  const magnitude = Math.min(SHAKE.maxDeltaV, Math.hypot(pulse.x, pulse.y) * (1 + (random() * 2 - 1) * SHAKE.jitter));
  const angle = Math.atan2(pulse.x, pulse.y) + (random() * 2 - 1) * SHAKE.angleJitterDeg * Math.PI / 180;
  return { x: magnitude * Math.sin(angle), y: magnitude * Math.cos(angle), z: 0 };
}

export function sloshPulse(first: Vector): Vector {
  return { x: -first.x * SHAKE.sloshRatio, y: 0, z: 0 };
}
