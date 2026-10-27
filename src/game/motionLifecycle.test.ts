import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MOTION } from "./constants.ts";
import { MotionLifecycle } from "./motionLifecycle.ts";

class Target extends EventTarget {
  onfreeze = null;
  onresume = null;
  handlers = new Map<string, Set<EventListenerOrEventListenerObject>>();
  adds = 0;
  removals = 0;
  maxMotionHandlers = 0;
  override addEventListener(type: string, handler: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    if (handler) {
      const set = this.handlers.get(type) ?? new Set();
      assert.equal(set.has(handler), false, "必须先移除同一个 handler");
      set.add(handler);
      this.handlers.set(type, set);
      this.adds++;
      if (type === "devicemotion") this.maxMotionHandlers = Math.max(this.maxMotionHandlers, set.size);
    }
    super.addEventListener(type, handler, options);
  }
  override removeEventListener(type: string, handler: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
    if (handler && this.handlers.get(type)?.delete(handler)) this.removals++;
    super.removeEventListener(type, handler, options);
  }
  send(type: string, props = {}) { this.dispatchEvent(Object.assign(new Event(type), props)); }
}
function setup() {
  let now = 0;
  let visibility = "visible";
  let motions = 0;
  let orientations = 0;
  let throws = false;
  let fallback = false;
  const resets: boolean[] = [];
  const win = new Target();
  const doc = new Target();
  const lifecycle = new MotionLifecycle({
    window: win, document: doc, now: () => now, visibility: () => visibility,
    onMotion: () => { motions++; if (throws) throw new Error("broken callback"); },
    onOrientation: () => { orientations++; if (throws) throw new Error("broken orientation"); },
    onReset: (resumed) => { resets.push(resumed); },
    startFallback: () => { fallback = true; }, stopFallback: () => { fallback = false; },
  });
  return { lifecycle, win, doc, resets,
    time: (value: number) => { now = value; },
    visibility: (value: string) => { visibility = value; doc.send("visibilitychange"); },
    throws: (value: boolean) => { throws = value; },
    counts: () => ({ motions, orientations, fallback }),
  };
}

describe("MotionLifecycle", () => {
  it("hidden→visible 反复重挂固定引用，无重复；释放后 add/remove 平衡", () => {
    const h = setup();
    h.lifecycle.start();
    const handler = [...h.win.handlers.get("devicemotion")!][0];
    for (let i = 0; i < 10; i++) {
      h.lifecycle.attach();
      h.win.send("devicemotion");
      h.visibility("hidden");
      assert.equal(h.lifecycle.getDiagnostics().listening, false);
      h.win.send("devicemotion");
      h.visibility("visible");
      assert.equal([...h.win.handlers.get("devicemotion")!][0], handler);
    }
    assert.equal(h.counts().motions, 10);
    assert.deepEqual(h.resets, Array.from({ length: 10 }, () => [false, true]).flat());
    assert.equal(h.win.maxMotionHandlers, 1);
    h.lifecycle.dispose(); h.lifecycle.dispose();
    assert.equal(h.win.adds, h.win.removals);
    assert.equal(h.doc.adds, h.doc.removals);
    h.lifecycle.start(); h.lifecycle.attach(); h.win.send("pageshow");
    assert.equal(h.lifecycle.getDiagnostics().listening, false);
  });

  it("watchdog 只对收到过事件的可见页面工作，1500ms 静默后重挂且限频2000ms", () => {
    const h = setup(); h.lifecycle.start();
    h.time(10_000); h.lifecycle.tick();
    assert.equal(h.lifecycle.getDiagnostics().reattachCount, 0);
    assert.equal(h.counts().fallback, true);
    h.win.send("devicemotion");
    assert.equal(h.counts().fallback, false);
    h.time(10_000 + MOTION.staleMs); h.lifecycle.tick();
    assert.equal(h.lifecycle.getDiagnostics().reattachCount, 0);
    h.time(11_501); h.lifecycle.tick();
    assert.equal(h.lifecycle.getDiagnostics().reattachCount, 1);
    h.time(13_500); h.lifecycle.tick(); h.win.send("focus");
    assert.equal(h.lifecycle.getDiagnostics().reattachCount, 1);
    h.time(13_501); h.lifecycle.tick();
    assert.equal(h.lifecycle.getDiagnostics().reattachCount, 2);
    h.visibility("hidden"); h.time(30_000); h.lifecycle.tick();
    assert.equal(h.lifecycle.getDiagnostics().reattachCount, 2);
    assert.equal(h.counts().fallback, false);
    h.lifecycle.dispose();
  });

  it("pagehide/pageshow persisted 和 freeze/resume 恢复；未开始监听不被生命周期自动启用", () => {
    const h = setup();
    h.win.send("pageshow", { persisted: true }); h.doc.send("resume");
    assert.equal(h.lifecycle.getDiagnostics().listening, false);
    h.lifecycle.start();
    for (const [target, hide, show] of [[h.win, "pagehide", "pageshow"], [h.doc, "freeze", "resume"]] as const) {
      target.send(hide); h.time(9000); h.lifecycle.tick();
      assert.equal(h.lifecycle.getDiagnostics().listening, false);
      target.send(show, { persisted: true });
      assert.equal(h.lifecycle.getDiagnostics().listening, true);
    }
    assert.equal(h.lifecycle.getDiagnostics().reattachCount, 2);
    assert.deepEqual(h.resets, [false, true, false, true]);
    h.lifecycle.dispose();
  });

  it("模拟后台丢掉运动监听，恢复和watchdog都能重新收到事件", () => {
    const h = setup(); h.lifecycle.start(); h.win.send("devicemotion");
    const loseHandler = () => {
      const handler = [...h.win.handlers.get("devicemotion")!][0];
      h.win.removeEventListener("devicemotion", handler);
    };
    loseHandler(); h.win.send("devicemotion");
    assert.equal(h.counts().motions, 1);
    h.visibility("hidden"); h.visibility("visible");
    h.win.send("devicemotion");
    assert.equal(h.counts().motions, 2);
    loseHandler();
    h.time(MOTION.reattachMinMs); h.lifecycle.tick();
    h.win.send("devicemotion");
    assert.equal(h.counts().motions, 3);
    assert.equal(h.win.maxMotionHandlers, 1);
    h.lifecycle.dispose();
  });

  it("focus 仅在超过1秒无事件时重挂，共用 watchdog 限频", () => {
    const h = setup(); h.lifecycle.start(); h.win.send("devicemotion");
    h.time(1000); h.win.send("focus");
    assert.equal(h.lifecycle.getDiagnostics().reattachCount, 0);
    h.time(1001); h.win.send("focus");
    assert.equal(h.lifecycle.getDiagnostics().reattachCount, 1);
    h.time(2500); h.win.send("focus"); h.lifecycle.tick();
    assert.equal(h.lifecycle.getDiagnostics().reattachCount, 1);
    h.lifecycle.dispose();
  });

  it("处理器异常留下时间和错误，心跳仍计数，后续事件继续处理", () => {
    const h = setup(); h.lifecycle.start(); h.throws(true);
    h.time(42); h.win.send("devicemotion"); h.win.send("deviceorientation");
    assert.match(h.lifecycle.getDiagnostics().lastError!.message, /broken orientation/);
    assert.equal(h.lifecycle.getDiagnostics().lastError!.atMs, 42);
    h.throws(false); h.time(50); h.win.send("devicemotion"); h.win.send("deviceorientation");
    assert.equal(h.counts().motions, 2); assert.equal(h.counts().orientations, 2);
    assert.equal(h.lifecycle.getDiagnostics().eventsPerSecond, 2);
    h.time(1050);
    assert.equal(h.lifecycle.getDiagnostics().eventsPerSecond, 0);
    assert.equal(h.lifecycle.getDiagnostics().lastMotionAgoMs, 1000);
    h.lifecycle.dispose();
  });
});
