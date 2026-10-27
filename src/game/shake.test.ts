import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TiltSensor } from "./tilt.ts";
import { SHAKE } from "./constants.ts";
import { ShakeDetector, ShakeSensor, createShakePulse, jitterShakePulse, sloshPulse, type MotionSample } from "./shake.ts";

const linear = (x: number, y = 0, z = 0): MotionSample => ({
  acceleration: { x, y, z }, accelerationIncludingGravity: null,
});
const gravity = (x: number, y = 9.81, z = 0): MotionSample => ({
  acceleration: null, accelerationIncludingGravity: { x, y, z },
});
function shake(detector: ShakeDetector, at = 0, magnitude = 26): number | null {
  assert.equal(detector.sample(linear(magnitude), at, true).intensity, null);
  assert.equal(detector.sample(linear(-magnitude), at + 100, true).intensity, null);
  return detector.sample(linear(magnitude), at + 200, true).intensity;
}

describe("ShakeDetector", () => {
  it("未就绪时满足条件只积累峰，不触发或耗冷却；就绪后同一波瓣立即可触发", () => {
    const detector = new ShakeDetector();
    for (const [i, x] of [26, -26, 26].entries()) {
      assert.deepEqual(detector.sample(linear(x), i * 100, false), {
        peak: true, intensity: null, dominantSign: null,
      });
      assert.equal(detector.getDiagnostics(i * 100).cooldownSec, 0);
      assert.equal(detector.getDiagnostics(i * 100).triggerCount, 0);
    }
    assert.equal(detector.getDiagnostics(200).peaks, 3);
    assert.equal(detector.getDiagnostics(200).reversals, 2);
    assert.equal(detector.sample(linear(26), 201, true).intensity, 0.5);
    assert.equal(detector.getDiagnostics(201).cooldownSec, SHAKE.cooldownSec);
    assert.equal(detector.getDiagnostics(201).triggerCount, 1);
  });

  it("未就绪时高通继续采样，窗口照常过期，就绪后仍需有效窗口", () => {
    const detector = new ShakeDetector();
    for (const [i, x] of [0, 30, -30, 30].entries()) {
      assert.equal(detector.sample(gravity(x), i * 20, false).intensity, null);
    }
    assert.equal(detector.getDiagnostics(60).source, "high-pass");
    assert.equal(detector.getDiagnostics(60).peaks, 3);
    assert.equal(detector.getDiagnostics(60).cooldownSec, 0);
    assert.notEqual(detector.sample(gravity(-30), 80, true).intensity, null);

    const expired = new ShakeDetector();
    for (const [i, x] of [26, -26, 26].entries()) expired.sample(linear(x), i * 100, false);
    assert.equal(expired.sample(linear(-26), 200 + SHAKE.windowMs + 1, true).intensity, null);
    assert.equal(expired.getDiagnostics(701).peaks, 1);
  });

  it("单个大峰、连续高值平台不触发", () => {
    const detector = new ShakeDetector();
    assert.equal(detector.sample(linear(50), 0, true).peak, true);
    for (let t = 10; t <= 600; t += 10) {
      assert.deepEqual(detector.sample(linear(50), t, true), { peak: false, intensity: null, dominantSign: null });
    }
  });

  it("minPeaks=2 下仍需两次反转触发，x/y 主轴均支持", () => {
    assert.equal(SHAKE.minPeaks, 2);
    assert.equal(SHAKE.minReversals, 2);
    for (const axis of ["x", "y"] as const) {
      const detector = new ShakeDetector();
      const sample = (v: number) => axis === "x" ? linear(v) : linear(0, v);
      assert.equal(detector.sample(sample(26), 0, true).intensity, null);
      assert.equal(detector.sample(sample(-26), 100, true).intensity, null);
      assert.equal(detector.sample(sample(26), 200, true).intensity, 0.5);
    }
  });

  it("无反转、只有一次反转、换轴或纯 z 敲击不触发", () => {
    for (const inputs of [
      [linear(30), linear(30), linear(30)],
      [linear(30), linear(-30), linear(-30)],
      [linear(30), linear(0, -30), linear(30)],
      [linear(0, 0, 30), linear(0, 0, -30), linear(0, 0, 30)],
    ]) {
      const detector = new ShakeDetector();
      inputs.forEach((input, i) => {
        assert.equal(detector.sample(input, i * 100, true).intensity, null);
        detector.sample(linear(0), i * 100 + 50, true);
      });
    }
  });

  it("窗口边界包含 500ms，过期峰和反转不沿用", () => {
    for (const end of [SHAKE.windowMs, SHAKE.windowMs + 1]) {
      const detector = new ShakeDetector();
      detector.sample(linear(26), 0, true);
      detector.sample(linear(-26), 250, true);
      assert.equal(detector.sample(linear(26), end, true).intensity, end === SHAKE.windowMs ? 0.5 : null);
    }
  });

  it("冷却内不触发、不攒峰，冷却后重新三峰可触发", () => {
    const detector = new ShakeDetector();
    assert.equal(shake(detector), 0.5);
    assert.equal(shake(detector, 500), null);
    assert.equal(shake(detector, 1900), null);
    detector.sample(linear(0), 2190, true);
    assert.equal(shake(detector, 2200), 0.5);
  });

  it("强度按窗口最大模长线性映射并封顶，包含同一峰后续更高采样", () => {
    for (const magnitude of [17.01, 26, 35, 70]) {
      const detector = new ShakeDetector();
      const expected = Math.min(1, (magnitude - SHAKE.thresholdMs2) / (SHAKE.fullMs2 - SHAKE.thresholdMs2));
      assert.equal(shake(detector, 0, magnitude), expected);
    }
    const detector = new ShakeDetector();
    detector.sample(linear(18), 0, true);
    detector.sample(linear(35), 30, true);
    detector.sample(linear(-18), 100, true);
    assert.equal(detector.sample(linear(18), 200, true).intensity, 1);
    const below = new ShakeDetector();
    assert.equal(shake(below, 0, SHAKE.thresholdMs2), null);
  });

  it("优先使用无重力 acceleration，即使含重力数据剧烈波动", () => {
    const detector = new ShakeDetector();
    for (let i = 0; i < 10; i++) {
      assert.equal(detector.sample({ ...gravity(i % 2 ? 100 : -100), acceleration: { x: 0, y: 0, z: 0 } }, i * 20, true).peak, false);
    }
  });

  it("高通回退：首帧建立基线，静态重力不触发，交替线加速度能触发", () => {
    const detector = new ShakeDetector();
    assert.equal(detector.sample(gravity(0), 0, true).peak, false);
    assert.equal(detector.sample(gravity(0), 20, true).peak, false);
    assert.equal(detector.sample(gravity(30), 40, true).intensity, null);
    assert.equal(detector.sample(gravity(-30), 60, true).intensity, null);
    const result = detector.sample(gravity(30), 80, true);
    // alpha=5/6；三个峰的模长依次为 25、29.1667、25.6944。
    assert.ok(Math.abs(result.intensity! - ((175 / 6 - 17) / 18)) < 1e-10);
    for (let t = 100; t <= 3000; t += 20) {
      assert.equal(detector.sample(gravity(30), t, true).intensity, null);
    }
  });

  it("无效数据和长断流不沿用旧峰，时钟回退重建窗口", () => {
    const detector = new ShakeDetector();
    detector.sample(linear(30), 0, true);
    assert.equal(detector.sample(linear(-30), -1, true).peak, true);
    assert.equal(detector.sample(linear(-30), NaN, true).peak, false);
    detector.sample(linear(NaN), 10, true);
    detector.sample(linear(-30), 20, true);
    assert.equal(detector.sample(linear(30), 30, true).intensity, null);
    assert.equal(detector.sample(linear(-30), 1000, true).intensity, null);
  });

  it("桌面模拟与传感器共用冷却，清空样本不能绕过冷却", () => {
    const detector = new ShakeDetector();
    assert.equal(detector.trigger(0.8, 0), 0.8);
    detector.resetMotion();
    assert.equal(detector.trigger(0.8, 1), null);
    assert.equal(shake(detector, 100), null);
    assert.equal(shake(detector, 2000), 0.5);
    assert.equal(detector.trigger(0.8, 2201), null);
    assert.equal(detector.trigger(0.8, 4200), 0.8);
  });
});

describe("ShakeSensor 警告门控", () => {
  it("未就绪时不调用 onPeak/onShake，不清样本；就绪后下一峰立即触发", (t) => {
    let now = 0;
    t.mock.method(performance, "now", () => now);
    let armed = false;
    let push: (event: MotionSample) => void = () => {};
    const tilt = { subscribeMotion(callback: typeof push) { push = callback; return () => {}; },
      subscribeReset() { return () => {}; }, recordError(error: unknown) { throw error; } };
    let peaks = 0;
    let shakes = 0;
    const sensor = new ShakeSensor(tilt as unknown as TiltSensor, {
      enabled: () => true, armed: () => armed,
      onPeak: () => { peaks++; }, onShake: () => { shakes++; },
    });
    for (const x of [26, -26, 26]) { now += 100; push(linear(x)); }
    assert.equal(peaks, 0);
    assert.equal(shakes, 0);
    assert.equal(sensor.detector.getDiagnostics(now).peaks, 3);
    assert.equal(sensor.detector.getDiagnostics(now).cooldownSec, 0);
    armed = true; now++; push(linear(-26));
    assert.equal(peaks, 1);
    assert.equal(shakes, 1);
    armed = false; now++; push(linear(26));
    assert.equal(peaks, 1);
    assert.equal(shakes, 1);
    sensor.dispose();
  });

  it("simulate 未就绪不触发、不耗冷却；就绪立即触发，关闭门控不延长既有冷却", (t) => {
    let now = 0;
    t.mock.method(performance, "now", () => now);
    let armed = false;
    const tilt = { subscribeMotion() { return () => {}; }, subscribeReset() { return () => {}; },
      recordError(error: unknown) { throw error; } };
    let shakes = 0;
    const sensor = new ShakeSensor(tilt as unknown as TiltSensor, {
      enabled: () => true, armed: () => armed,
      onPeak: () => assert.fail("模拟不调用 onPeak"), onShake: () => { shakes++; },
    });
    sensor.simulate(0.8);
    assert.equal(shakes, 0);
    assert.equal(sensor.detector.getDiagnostics(now).triggerCount, 0);
    assert.equal(sensor.detector.getDiagnostics(now).cooldownSec, 0);
    armed = true; sensor.simulate(0.8);
    assert.equal(shakes, 1);
    armed = false; now = 1000; sensor.simulate(0.8);
    assert.equal(shakes, 1);
    assert.equal(sensor.detector.getDiagnostics(now).cooldownSec, 1);
    now = SHAKE.cooldownSec * 1000; sensor.simulate(0.8);
    assert.equal(sensor.detector.getDiagnostics(now).cooldownSec, 0);
    armed = true; sensor.simulate(0.8);
    assert.equal(shakes, 2);
    sensor.dispose();
  });
});


describe("摇晃方向与冲量", () => {
  it("触发输出最后波瓣的主轴符号，未触发不提供方向", () => {
    for (const axis of ["x", "y"] as const) for (const sign of [-1, 1]) {
      const detector = new ShakeDetector();
      const sample = (v: number) => axis === "x" ? linear(v, 1) : linear(1, v);
      assert.equal(detector.sample(sample(sign * 26), 0, true).dominantSign, null);
      assert.equal(detector.sample(sample(-sign * 26), 100, true).dominantSign, null);
      assert.deepEqual(detector.sample(sample(sign * 26), 200, true), { peak: true, intensity: (Math.hypot(26, 1) - SHAKE.thresholdMs2) / (SHAKE.fullMs2 - SHAKE.thresholdMs2), dominantSign: sign });
      assert.equal(detector.sample(sample(-sign * 26), 300, true).dominantSign, null);
    }
  });

  it("浏览器适配传递 dominantSign，桌面缺省方向并共用冷却", (t) => {
    let now = 0;
    t.mock.method(performance, "now", () => now);
    let push: (event: MotionSample) => void = () => {};
    const tilt = { subscribeMotion(callback: typeof push) { push = callback; return () => {}; },
      subscribeReset() { return () => {}; }, recordError(error: unknown) { throw error; } };
    const calls: Array<[number, number | null]> = [];
    const sensor = new ShakeSensor(tilt as unknown as TiltSensor, {
      enabled: () => true, armed: () => true, onPeak: () => {},
      onShake: (intensity, sign) => calls.push([intensity, sign]),
    });
    push(linear(-26)); now = 100; push(linear(26)); now = 200; push(linear(-26));
    assert.deepEqual(calls, [[0.5, -1]]);
    sensor.simulate(0.8);
    assert.equal(calls.length, 1);
    const desktop = new ShakeSensor(tilt as unknown as TiltSensor, {
      enabled: () => true, armed: () => true, onPeak: () => {},
      onShake: (intensity, sign) => calls.push([intensity, sign]),
    });
    desktop.simulate(0.8);
    assert.deepEqual(calls[1], [0.8, null]);
    sensor.dispose(); desktop.dispose();
  });

  it("主轴符号优先；无符号时只在创建全缸脉冲时随机选一次", () => {
    const noRandom = () => { throw new Error("检测器已有方向，不应随机"); };
    for (const sign of [-1, 1]) {
      const pulse = createShakePulse(1, sign, noRandom);
      assert.equal(pulse.y, SHAKE.impulse);
      assert.equal(pulse.x / pulse.y, sign * SHAKE.lateralRatio);
    }
    let calls = 0;
    const pulse = createShakePulse(0, null, () => { calls++; return 0; });
    assert.equal(calls, 1);
    assert.equal(pulse.y, SHAKE.impulse * SHAKE.minStrength);
    assert.ok(pulse.x < 0);
    assert.ok(createShakePulse(0, null, () => 1).x > 0);
    assert.deepEqual(createShakePulse(-1, 1), createShakePulse(0, 1));
    assert.deepEqual(createShakePulse(2, 1), createShakePulse(1, 1));
  });

  it("每球共用左右方向且向上为主，长度 ±15%、角度 ±8°", () => {
    for (const sign of [-1, 1]) for (const intensity of [0, 0.8, 1]) {
      const pulse = createShakePulse(intensity, sign);
      const baseLength = Math.hypot(pulse.x, pulse.y);
      const baseAngle = Math.atan2(pulse.x, pulse.y);
      for (const size of [0, 0.25, 0.5, 0.75, 1]) for (const angle of [0, 0.25, 0.5, 0.75, 1]) {
        const samples = [size, angle];
        const v = jitterShakePulse(pulse, () => samples.shift()!);
        assert.equal(Math.sign(v.x), sign);
        assert.ok(v.y > Math.abs(v.x));
        assert.equal(v.z, 0);
        const expectedLength = Math.min(SHAKE.maxDeltaV, baseLength * (1 + (size * 2 - 1) * SHAKE.jitter));
        assert.ok(Math.abs(Math.hypot(v.x, v.y) - expectedLength) < 1e-10);
        const expectedAngle = baseAngle + (angle * 2 - 1) * SHAKE.angleJitterDeg * Math.PI / 180;
        assert.ok(Math.abs(Math.atan2(v.x, v.y) - expectedAngle) < 1e-10);
      }
    }
  });

  it("Δv 上限 14，二段晃仅为首脉冲横向的反向 0.6 倍", () => {
    const large = jitterShakePulse({ x: 45, y: 100, z: 0 }, () => 0.5);
    assert.ok(Math.abs(Math.hypot(large.x, large.y) - SHAKE.maxDeltaV) < 1e-10);
    for (const sign of [-1, 1]) {
      const first = jitterShakePulse(createShakePulse(0.8, sign), () => 0.5);
      assert.deepEqual(sloshPulse(first), { x: -first.x * SHAKE.sloshRatio, y: 0, z: 0 });
    }
  });
});

describe("长期运行与异常恢复", () => {
  it("10分钟60Hz噪声+每6秒真摇晃，跨无效数据/高通/时钟回退/30秒断流均不漏触", () => {
    const detector = new ShakeDetector();
    let seed = 0x12345678;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    let offset = 0;
    let triggers = 0;
    for (let frame = 0; frame < 60 * 60 * 10; frame++) {
      const cycle = Math.floor(frame / 360);
      const pos = frame % 360;
      if (frame === 18001) offset -= 300_000;
      if (frame === 25201) offset += 30_000;
      const now = frame * 1000 / 60 + offset;
      const wave = pos >= 180 && pos < 198;
      const x = wave ? (pos < 186 || pos >= 192 ? 30 : -30) : (random() - 0.5) * 0.6;
      let sample = cycle % 2 ? gravity(x) : linear(x);
      if (frame === 6001) sample = { acceleration: null, accelerationIncludingGravity: null };
      if (frame === 9601) sample = linear(NaN);
      const result = detector.sample(sample, now, true);
      if (result.intensity !== null) {
        assert.equal(wave, true, `安静噪声误触 frame=${frame}`);
        triggers++;
      }
      if (pos === 359) assert.equal(triggers, cycle + 1, `第${cycle + 1}次摇晃漏触/重复`);
    }
    assert.equal(triggers, 100);
    assert.equal(detector.getDiagnostics().triggerCount, 100);
  });

  it("从大时钟回退立即重建窗口并清异常冷却，resetAll后无需等待冷却", () => {
    const detector = new ShakeDetector();
    assert.equal(shake(detector, 600_000), 0.5);
    assert.equal(shake(detector, 0), 0.5);
    detector.resetAll();
    assert.equal(shake(detector, 201), 0.5);
    detector.resetMotion();
    assert.equal(shake(detector, 402), null);
    assert.equal(detector.getDiagnostics(603).triggerCount, 3);
  });

  it("有限极值运算溢出不污染高通，后续普通高通摇晃仍有效", () => {
    const detector = new ShakeDetector();
    detector.sample(gravity(-Number.MAX_VALUE), 0, true);
    detector.sample(gravity(Number.MAX_VALUE), 20, true);
    assert.equal(detector.getDiagnostics(20).source, "none");
    detector.sample(gravity(0), 40, true);
    detector.sample(gravity(30), 60, true);
    detector.sample(gravity(-30), 80, true);
    assert.notEqual(detector.sample(gravity(30), 100, true).intensity, null);
    assert.ok(Number.isFinite(detector.getDiagnostics(100).magnitude));
  });

  it("诊断窗口随时间过期，返回只读快照", () => {
    const detector = new ShakeDetector();
    detector.sample(linear(30), 0, true);
    detector.sample(linear(-30), 100, true);
    const before = detector.getDiagnostics(100);
    assert.equal(before.peaks, 2); assert.equal(before.reversals, 1);
    assert.equal(Object.isFrozen(before), true);
    const after = detector.getDiagnostics(601);
    assert.equal(after.peaks, 0); assert.equal(after.reversals, 0);
    assert.equal(before.peaks, 2);
  });
});
