import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SHAKE } from "./constants.ts";
import { ShakeDetector, type MotionSample } from "./shake.ts";

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
      assert.deepEqual(detector.sample(linear(50), t), { peak: false, intensity: null });
    }
  });

  it("窗口内三个峰、两次反转触发，x/y 主轴均支持", () => {
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
