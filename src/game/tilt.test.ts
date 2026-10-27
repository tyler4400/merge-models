import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { MOTION, SHAKE, TILT } from "./constants.ts";
import { TiltSensor } from "./tilt.ts";
import { ShakeSensor } from "./shake.ts";

let now = 0;
let screenDeg = 0;
let events: EventTarget;
let docEvents: EventTarget;
let visibility: string;
const originals = new Map<string, PropertyDescriptor | undefined>();
function globalValue(name: string, value: unknown): void {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true });
}
function send(type: string, props: object): void {
  const e = new Event(type);
  Object.assign(e, props);
  events.dispatchEvent(e);
}
function motion(x: number | null, y: number | null): void {
  send("devicemotion", { accelerationIncludingGravity: { x, y } });
}
function near(actual: number, expected: number, epsilon = 1e-7): void {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
}
function angle(sensor: TiltSensor, deg: number): void {
  sensor.tick(3);
  near(sensor.theta, deg * Math.PI / 180);
}

beforeEach(() => {
  now = 0;
  screenDeg = 0;
  events = new EventTarget();
  docEvents = new EventTarget();
  visibility = "visible";
  globalValue("document", Object.assign(docEvents, { onfreeze: null, onresume: null }));
  Object.defineProperty(document, "visibilityState", { get: () => visibility });
  globalValue("window", Object.assign(events, {
    screen: { orientation: { get angle() { return screenDeg; } } },
    orientation: 0,
    setTimeout,
  }));
  globalValue("navigator", { userAgent: "Android", platform: "Linux", maxTouchPoints: 1 });
  globalValue("performance", { now: () => now });
  globalValue("Accelerometer", undefined);
  globalValue("DeviceMotionEvent", undefined);
  globalValue("DeviceOrientationEvent", undefined);
});
afterEach(() => {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  originals.clear();
});

describe("TiltSensor", () => {
  it("摇晃首峰先于同帧倾斜更新，非游戏阶段不触发且可退订", () => {
    const tilt = new TiltSensor();
    let enabled = true;
    let shakes = 0;
    const sensor = new ShakeSensor(tilt, {
      enabled: () => enabled,
      onPeak: () => tilt.freeze(SHAKE.tiltFreezeSec),
      onShake: () => { shakes++; },
    });
    const push = (x: number) => send("devicemotion", {
      acceleration: { x, y: 0, z: 0 },
      accelerationIncludingGravity: { x: -9.81, y: 0, z: 0 },
    });
    push(26);
    tilt.tick(0.1);
    near(tilt.theta, 0);
    now = 100;
    push(-26);
    now = 200;
    push(26);
    assert.equal(shakes, 1);
    sensor.simulate(0.8);
    assert.equal(shakes, 1);
    enabled = false;
    now = 3000;
    sensor.simulate(0.8);
    push(-26);
    now = 3100;
    push(26);
    enabled = true;
    now = 3200;
    push(-26);
    assert.equal(shakes, 1);
    sensor.dispose();
    now = 3300;
    push(26);
    now = 3400;
    push(-26);
    assert.equal(shakes, 1);
  });

  it("摇晃复用 iOS 手势权限，监听开始前不接收事件，也不重复请求", async () => {
    globalValue("navigator", { userAgent: "iPhone" });
    let requests = 0;
    const permission = { requestPermission: async () => { requests++; return "granted"; } };
    globalValue("DeviceMotionEvent", permission);
    globalValue("DeviceOrientationEvent", permission);
    const tilt = new TiltSensor();
    let peaks = 0;
    const sensor = new ShakeSensor(tilt, {
      enabled: () => true, onPeak: () => { peaks++; }, onShake: () => {},
    });
    const push = () => send("devicemotion", {
      acceleration: { x: 26, y: 0, z: 0 }, accelerationIncludingGravity: null,
    });
    push();
    assert.equal(peaks, 0);
    assert.equal(requests, 0);
    tilt.startFromGesture();
    assert.equal(requests, 2);
    await new Promise((resolve) => setImmediate(resolve));
    push();
    assert.equal(peaks, 1);
    tilt.startFromGesture();
    assert.equal(requests, 2);
    sensor.dispose();
  });

  it("无传感器桌面保持零倾角", () => {
    globalValue("navigator", { userAgent: "Desktop" });
    const sensor = new TiltSensor();
    sensor.startFromGesture();
    angle(sensor, 0);
  });

  for (const deg of [0, 90, 180, 270, -90]) {
    it(`屏幕 ${deg}°：Android 左右倾方向一致`, () => {
      screenDeg = deg;
      const sensor = new TiltSensor();
      for (const lean of [-30, 30]) {
        const theta = lean * Math.PI / 180;
        const a = deg * Math.PI / 180;
        const sx = 9.81 * Math.sin(theta);
        const sy = -9.81 * Math.cos(theta);
        // 屏幕重力逆旋转回设备轴，再变为 Android 支撑力。
        motion(-(sx * Math.cos(a) + sy * Math.sin(a)), -(-sx * Math.sin(a) + sy * Math.cos(a)));
        angle(sensor, lean);
      }
    });
  }

  it("旧 window.orientation 支持 ±90° 和 180°", () => {
    Object.defineProperty(window, "screen", { value: undefined });
    const sensor = new TiltSensor();
    for (const [deg, x, y] of [[90, 8.495709, 4.905], [-90, -8.495709, -4.905], [180, 4.905, -8.495709]]) {
      Object.defineProperty(window, "orientation", { value: deg, configurable: true });
      motion(x, y);
      sensor.tick(3);
      near(sensor.theta, Math.PI / 6, 1e-6);
    }
  });

  it("死区、maxDeg 上限及指数平滑生效", () => {
    const sensor = new TiltSensor();
    motion(-0.2, 9.8);
    angle(sensor, 0);
    motion(-9.81, 0);
    sensor.tick(TILT.smoothSec);
    near(sensor.theta, (TILT.maxDeg * Math.PI / 180) * (1 - Math.exp(-1)));
    angle(sensor, TILT.maxDeg);
    motion(9.81, 0);
    angle(sensor, -TILT.maxDeg);
    motion(0, 9.81);
    angle(sensor, 0);
  });

  it("近平放保持目标且不让姿态回退抢占；无效输入不污染状态", () => {
    const sensor = new TiltSensor();
    motion(-4.905, 9.81 * Math.cos(Math.PI / 6));
    angle(sensor, 30);
    now = 1000;
    motion(0.1, 0.1);
    send("deviceorientation", { beta: 45, gamma: -60 });
    motion(null, 9.8);
    motion(NaN, 9.8);
    angle(sensor, 30);
  });

  it("冻结期间拒绝新目标，解冻后接受新样本", () => {
    const sensor = new TiltSensor();
    motion(-9.81, 0);
    sensor.freeze(1);
    motion(9.81, 0);
    sensor.tick(0.5);
    assert.ok(sensor.theta > 0);
    sensor.tick(0.5);
    motion(9.81, 0);
    angle(sensor, -TILT.maxDeg);
  });

  it("运动数据优先，静默后允许姿态回退", () => {
    const sensor = new TiltSensor();
    motion(0, 9.81);
    send("deviceorientation", { beta: 45, gamma: 90 });
    angle(sensor, 0);
    now = TILT.sourceStaleMs + 1;
    send("deviceorientation", { beta: 45, gamma: 90 });
    angle(sensor, TILT.maxDeg);
    motion(0, 9.81);
    angle(sensor, 0);
  });

  for (const [screen, beta, gamma] of [[0, 60, 90], [90, 30, -90], [-90, -30, 90], [180, -60, -90]]) {
    it(`姿态回退在屏幕 ${screen}° 时正确还原右倾30°`, () => {
      screenDeg = screen;
      const sensor = new TiltSensor();
      send("deviceorientation", { beta, gamma });
      angle(sensor, 30);
      send("deviceorientation", { beta: 0, gamma: 0 });
      angle(sensor, 30);
    });
  }

  it("通用 Accelerometer 只在静默后启动，事件恢复/隐藏时停止释放", () => {
    let starts = 0;
    let stops = 0;
    const sensors: EventTarget[] = [];
    globalValue("Accelerometer", class extends EventTarget {
      x = -9.81;
      y = 0;
      constructor() { super(); sensors.push(this); }
      start() { starts++; }
      stop() { stops++; }
    });
    const sensor = new TiltSensor();
    sensor.tick(0);
    assert.equal(starts, 0);
    now = MOTION.staleMs;
    sensor.tick(0);
    assert.equal(starts, 0);
    now++;
    sensor.tick(0);
    assert.equal(starts, 1);
    sensors[0].dispatchEvent(new Event("reading"));
    angle(sensor, TILT.maxDeg);
    motion(0, 9.81);
    assert.equal(stops, 1);
    assert.equal(sensor.getDiagnostics().genericActive, false);
    sensors[0].dispatchEvent(new Event("reading"));
    angle(sensor, 0);
    now += MOTION.staleMs + 1;
    sensor.tick(0);
    assert.equal(starts, 2);
    visibility = "hidden"; docEvents.dispatchEvent(new Event("visibilitychange"));
    assert.equal(stops, 2);
    visibility = "visible"; docEvents.dispatchEvent(new Event("visibilitychange"));
    sensor.tick(0);
    sensors[2].dispatchEvent(new Event("error"));
    assert.match(sensor.getDiagnostics().lastError!.message, /Accelerometer error/);
    send("deviceorientation", { beta: 45, gamma: -90 });
    angle(sensor, -TILT.maxDeg);
    sensor.dispose();
  });

  it("iOS 手势同步申请两类权限，使用相反运动符号", async () => {
    globalValue("navigator", { userAgent: "iPhone" });
    let requests = 0;
    const permission = { requestPermission: async () => { requests++; return "granted"; } };
    globalValue("DeviceMotionEvent", permission);
    globalValue("DeviceOrientationEvent", permission);
    const sensor = new TiltSensor();
    motion(9.81, 0);
    angle(sensor, 0);
    sensor.startFromGesture();
    assert.equal(requests, 2);
    await new Promise((resolve) => setImmediate(resolve));
    motion(4.905, -9.81 * Math.cos(Math.PI / 6));
    angle(sensor, 30);
    sensor.startFromGesture();
    assert.equal(requests, 2);
  });

  it("iOS 权限请求挂起时超时后仍监听", async () => {
    globalValue("navigator", { userAgent: "iPad" });
    globalValue("DeviceMotionEvent", { requestPermission: () => new Promise(() => {}) });
    const sensor = new TiltSensor();
    sensor.startFromGesture();
    await new Promise((resolve) => setTimeout(resolve, TILT.iosPermissionMs + 30));
    motion(9.81, 0);
    angle(sensor, TILT.maxDeg);
  });
});

describe("传感器恢复集成", () => {
  it("隐藏清样本、恢复清冷却/冻结；继续接收事件且生命周期不重申请iOS权限", async () => {
    globalValue("navigator", { userAgent: "iPhone" });
    let requests = 0;
    const permission = { requestPermission: async () => { requests++; return "granted"; } };
    globalValue("DeviceMotionEvent", permission); globalValue("DeviceOrientationEvent", permission);
    const tilt = new TiltSensor();
    let shakes = 0;
    const shake = new ShakeSensor(tilt, {
      enabled: () => true, onPeak: () => tilt.freeze(0.8), onShake: () => { shakes++; },
    });
    tilt.startFromGesture(); tilt.startFromGesture();
    await new Promise((resolve) => setImmediate(resolve));
    const burst = () => {
      for (const x of [26, -26, 26]) {
        now += 20;
        send("devicemotion", { acceleration: { x, y: 0, z: 0 }, accelerationIncludingGravity: null });
      }
    };
    burst(); assert.equal(shakes, 1);
    visibility = "hidden"; docEvents.dispatchEvent(new Event("visibilitychange"));
    assert.equal(shake.detector.getDiagnostics().peaks, 0);
    burst(); assert.equal(shakes, 1);
    visibility = "visible"; docEvents.dispatchEvent(new Event("visibilitychange"));
    assert.equal(tilt.getDiagnostics().frozenSec, 0);
    assert.equal(shake.detector.getDiagnostics().cooldownSec, 0);
    burst(); assert.equal(shakes, 2);
    send("pageshow", { persisted: true }); docEvents.dispatchEvent(new Event("resume"));
    assert.equal(requests, 2);
    shake.dispose(); tilt.dispose();
  });

  it("onPeak/onShake异常隔离，其他订阅者和后续摇晃继续工作", () => {
    const tilt = new TiltSensor();
    let calls = 0;
    let other = 0;
    const shake = new ShakeSensor(tilt, {
      enabled: () => true,
      onPeak: () => { throw new Error("onPeak broken"); },
      onShake: () => { calls++; if (calls === 1) throw new Error("applyShake broken"); },
    });
    tilt.subscribeMotion(() => { throw new Error("subscriber broken"); });
    tilt.subscribeMotion(() => { other++; });
    const burst = (at: number) => {
      for (const [i, x] of [26, -26, 26].entries()) {
        now = at + i * 100;
        send("devicemotion", { acceleration: { x, y: 0, z: 0 }, accelerationIncludingGravity: { x: 0, y: 9.81, z: 0 } });
      }
    };
    burst(0); burst(3000);
    assert.equal(calls, 2); assert.equal(other, 6);
    assert.equal(tilt.getDiagnostics().lastMotionAgoMs, 0);
    assert.match(tilt.getDiagnostics().lastError!.message, /subscriber broken/);
    shake.dispose(); tilt.dispose();
  });

  it("各游戏阶段切回playing/hammerAim后enabled动态恢复", () => {
    const tilt = new TiltSensor();
    let phase = "title";
    let calls = 0;
    const shake = new ShakeSensor(tilt, {
      enabled: () => phase === "playing" || phase === "hammerAim",
      onPeak: () => {}, onShake: () => { calls++; },
    });
    for (const next of ["title", "playing", "won", "playing", "hammerAim", "playing", "dead", "playing"]) {
      phase = next;
      now += 3000;
      const before = calls;
      shake.simulate(0.8);
      assert.equal(calls - before, next === "playing" || next === "hammerAim" ? 1 : 0);
    }
    shake.dispose(); tilt.dispose();
  });
});
