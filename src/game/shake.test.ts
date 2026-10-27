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
  assert.equal(detector.sample(linear(magnitude), at).intensity, null);
  assert.equal(detector.sample(linear(-magnitude), at + 100).intensity, null);
  return detector.sample(linear(magnitude), at + 200).intensity;
}

describe("ShakeDetector", () => {
  it("单个大峰、连续高值平台不触发", () => {
    const detector = new ShakeDetector();
    assert.equal(detector.sample(linear(50), 0).peak, true);
    for (let t = 10; t <= 600; t += 10) {
      assert.deepEqual(detector.sample(linear(50), t), { peak: false, intensity: null, dominantSign: null });
    }
  });

  it("minPeaks=2 下仍需两次反转触发，x/y 主轴均支持", () => {
    assert.equal(SHAKE.minPeaks, 2);
    assert.equal(SHAKE.minReversals, 2);
    for (const axis of ["x", "y"] as const) {
      const detector = new ShakeDetector();
      const sample = (v: number) => axis === "x" ? linear(v) : linear(0, v);
      assert.equal(detector.sample(sample(26), 0).intensity, null);
      assert.equal(detector.sample(sample(-26), 100).intensity, null);
      assert.equal(detector.sample(sample(26), 200).intensity, 0.5);
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
        assert.equal(detector.sample(input, i * 100).intensity, null);
        detector.sample(linear(0), i * 100 + 50);
      });
    }
  });

  it("窗口边界包含 500ms，过期峰和反转不沿用", () => {
    for (const end of [SHAKE.windowMs, SHAKE.windowMs + 1]) {
      const detector = new ShakeDetector();
      detector.sample(linear(26), 0);
      detector.sample(linear(-26), 250);
      assert.equal(detector.sample(linear(26), end).intensity, end === SHAKE.windowMs ? 0.5 : null);
    }
  });

  it("冷却内不触发、不攒峰，冷却后重新三峰可触发", () => {
    const detector = new ShakeDetector();
    assert.equal(shake(detector), 0.5);
    assert.equal(shake(detector, 500), null);
    assert.equal(shake(detector, 1900), null);
    detector.sample(linear(0), 2190);
    assert.equal(shake(detector, 2200), 0.5);
  });

  it("强度按窗口最大模长线性映射并封顶，包含同一峰后续更高采样", () => {
    for (const magnitude of [17.01, 26, 35, 70]) {
      const detector = new ShakeDetector();
      const expected = Math.min(1, (magnitude - SHAKE.thresholdMs2) / (SHAKE.fullMs2 - SHAKE.thresholdMs2));
      assert.equal(shake(detector, 0, magnitude), expected);
    }
    const detector = new ShakeDetector();
    detector.sample(linear(18), 0);
    detector.sample(linear(35), 30);
    detector.sample(linear(-18), 100);
    assert.equal(detector.sample(linear(18), 200).intensity, 1);
    const below = new ShakeDetector();
    assert.equal(shake(below, 0, SHAKE.thresholdMs2), null);
  });

  it("优先使用无重力 acceleration，即使含重力数据剧烈波动", () => {
    const detector = new ShakeDetector();
    for (let i = 0; i < 10; i++) {
      assert.equal(detector.sample({ ...gravity(i % 2 ? 100 : -100), acceleration: { x: 0, y: 0, z: 0 } }, i * 20).peak, false);
    }
  });

  it("高通回退：首帧建立基线，静态重力不触发，交替线加速度能触发", () => {
    const detector = new ShakeDetector();
    assert.equal(detector.sample(gravity(0), 0).peak, false);
    assert.equal(detector.sample(gravity(0), 20).peak, false);
    assert.equal(detector.sample(gravity(30), 40).intensity, null);
    assert.equal(detector.sample(gravity(-30), 60).intensity, null);
    const result = detector.sample(gravity(30), 80);
    // alpha=5/6；三个峰的模长依次为 25、29.1667、25.6944。
    assert.ok(Math.abs(result.intensity! - ((175 / 6 - 17) / 18)) < 1e-10);
    for (let t = 100; t <= 3000; t += 20) {
      assert.equal(detector.sample(gravity(30), t).intensity, null);
    }
  });

  it("无效数据和长断流不沿用旧峰，非递增时间不污染状态", () => {
    const detector = new ShakeDetector();
    detector.sample(linear(30), 0);
    assert.equal(detector.sample(linear(-30), -1).peak, false);
    assert.equal(detector.sample(linear(-30), NaN).peak, false);
    detector.sample(linear(NaN), 10);
    detector.sample(linear(-30), 20);
    assert.equal(detector.sample(linear(30), 30).intensity, null);
    assert.equal(detector.sample(linear(-30), 1000).intensity, null);
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


describe("摇晃方向与冲量", () => {
  it("触发输出最后波瓣的主轴符号，未触发不提供方向", () => {
    for (const axis of ["x", "y"] as const) for (const sign of [-1, 1]) {
      const detector = new ShakeDetector();
      const sample = (v: number) => axis === "x" ? linear(v, 1) : linear(1, v);
      assert.equal(detector.sample(sample(sign * 26), 0).dominantSign, null);
      assert.equal(detector.sample(sample(-sign * 26), 100).dominantSign, null);
      assert.deepEqual(detector.sample(sample(sign * 26), 200), { peak: true, intensity: (Math.hypot(26, 1) - SHAKE.thresholdMs2) / (SHAKE.fullMs2 - SHAKE.thresholdMs2), dominantSign: sign });
      assert.equal(detector.sample(sample(-sign * 26), 300).dominantSign, null);
    }
  });

  it("浏览器适配传递 dominantSign，桌面缺省方向并共用冷却", (t) => {
    let now = 0;
    t.mock.method(performance, "now", () => now);
    let push: (event: MotionSample) => void = () => {};
    const tilt = { subscribeMotion(callback: typeof push) { push = callback; return () => {}; } };
    const calls: Array<[number, number | null]> = [];
    const sensor = new ShakeSensor(tilt as unknown as TiltSensor, {
      enabled: () => true, onPeak: () => {},
      onShake: (intensity, sign) => calls.push([intensity, sign]),
    });
    push(linear(-26)); now = 100; push(linear(26)); now = 200; push(linear(-26));
    assert.deepEqual(calls, [[0.5, -1]]);
    sensor.simulate(0.8);
    assert.equal(calls.length, 1);
    const desktop = new ShakeSensor(tilt as unknown as TiltSensor, {
      enabled: () => true, onPeak: () => {},
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
