import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FAIL_DROP_GRACE, FAIL_HOLD_SEC, FAIL_LINE_Y, WARN_SLACK } from "./constants.ts";
import { tickFail, type FailSample } from "./failCheck.ts";

function sample(over: Partial<FailSample> = {}): FailSample {
  return {
    held: false,
    merging: false,
    hasBody: true,
    dropAge: FAIL_DROP_GRACE,
    topY: FAIL_LINE_Y + 1,
    failClock: 0,
    ...over,
  };
}

function simulate(
  balls: FailSample[],
  seconds: number,
  opts: { dt?: number; age?: boolean; mutateTopY?: (t: number, b: FailSample, i: number) => void } = {},
): { warn: boolean; failed: boolean; clocks: number[] } {
  const dt = opts.dt ?? 0.05;
  const state = balls.map((b) => ({ ...b }));
  let warn = false;
  let failed = false;
  let clocks = state.map((b) => b.failClock);
  let elapsed = 0;
  let remaining = seconds;
  while (remaining > 1e-12) {
    const step = Math.min(dt, remaining);
    elapsed += step;
    if (opts.age) {
      for (const b of state) {
        if (!b.held && !b.merging && b.hasBody) b.dropAge += step;
      }
    }
    if (opts.mutateTopY) {
      for (let i = 0; i < state.length; i++) opts.mutateTopY(elapsed, state[i]!, i);
    }
    const r = tickFail(state, step);
    warn = r.warn;
    failed = r.failed;
    clocks = r.clocks;
    for (let i = 0; i < state.length; i++) state[i]!.failClock = r.clocks[i]!;
    remaining -= step;
  }
  return { warn, failed, clocks };
}

describe("tickFail", () => {
  it("fails when a ball stays over the line for 2.1s after grace", () => {
    const r = simulate([sample({ vy: 0 })], 2.1);
    assert.equal(r.failed, true);
    assert.equal(r.warn, true);
    assert.ok(r.clocks[0]! >= FAIL_HOLD_SEC);
  });

  it("does not fail when over the line for only 1.5s after grace", () => {
    const r = simulate([sample()], 1.5);
    assert.equal(r.failed, false);
    assert.ok(r.clocks[0]! < FAIL_HOLD_SEC);
    assert.ok(r.clocks[0]! > 1.4);
  });

  it("does not fail under the line for 3s; clock stays 0", () => {
    const r = simulate([sample({ topY: FAIL_LINE_Y - 0.5 })], 3);
    assert.equal(r.failed, false);
    assert.equal(r.clocks[0], 0);
  });

  it("ignores a held ball over the line for 3s", () => {
    const r = simulate([sample({ held: true })], 3);
    assert.equal(r.failed, false);
    assert.equal(r.warn, false);
    assert.equal(r.clocks[0], 0);
  });

  it("keeps clock at 0 while dropAge is 0.5s even if over the line", () => {
    const r = simulate([sample({ dropAge: 0.5 })], 0.5);
    assert.equal(r.failed, false);
    assert.equal(r.clocks[0], 0);
    assert.equal(r.warn, false);
  });

  it("does not warn during grace while falling through the line", () => {
    const r = simulate([sample({ dropAge: 0.5, vy: -5 })], 0.5);
    assert.equal(r.warn, false);
    assert.equal(r.failed, false);
    assert.equal(r.clocks[0], 0);
  });

  it("fails after grace then 2.05s over the line", () => {
    const r = simulate([sample({ dropAge: 0 })], FAIL_DROP_GRACE + 2.05, { age: true });
    assert.equal(r.failed, true);
    assert.ok(r.clocks[0]! >= FAIL_HOLD_SEC);
  });

  it("warns in the slack band without failing", () => {
    const topY = FAIL_LINE_Y - WARN_SLACK / 2;
    const r = simulate([sample({ topY, vy: 0 })], 2.5);
    assert.equal(r.warn, true);
    assert.equal(r.failed, false);
    assert.equal(r.clocks[0], 0);
  });

  it("resets the clock when the ball drops back under the line", () => {
    const over = FAIL_LINE_Y + 1;
    const under = FAIL_LINE_Y - 0.4;
    const r = simulate([sample({ topY: over })], 1.6, {
      mutateTopY: (elapsed, b) => {
        b.topY = elapsed > 1.0 ? under : over;
      },
    });
    assert.equal(r.failed, false);
    assert.equal(r.clocks[0], 0);
  });

  it("fails after 2.1s over the line even while falling; warn stays off", () => {
    // Fail clock ignores vy (high pile can still lose). Warn does not fire while falling through.
    const r = simulate([sample({ vy: -5 })], 2.1);
    assert.equal(r.failed, true);
    assert.equal(r.warn, false);
    assert.ok(r.clocks[0]! >= FAIL_HOLD_SEC);
  });

  it("fails when only one of two balls is over the line for 2.1s", () => {
    const r = simulate(
      [sample(), sample({ topY: FAIL_LINE_Y - 2 })],
      2.1,
    );
    assert.equal(r.failed, true);
    assert.ok(r.clocks[0]! >= FAIL_HOLD_SEC);
    assert.equal(r.clocks[1], 0);
  });
});
