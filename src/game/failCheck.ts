/** Pure fail-line check (no Babylon) so it can be unit-tested. */
import { FAIL_DROP_GRACE, FAIL_HOLD_SEC, FAIL_LINE_Y, WARN_SLACK } from "./constants.ts";

export type FailSample = {
  held: boolean;
  merging: boolean;
  hasBody: boolean;
  dropAge: number;
  topY: number;
  failClock: number;
};

export function tickFail(
  balls: FailSample[],
  dt: number,
): {
  warn: boolean;
  failed: boolean;
  clocks: number[];
} {
  const clocks: number[] = [];
  let warn = false;
  let failed = false;

  for (const b of balls) {
    if (b.held || b.merging || !b.hasBody) {
      clocks.push(0);
      continue;
    }

    if (b.topY > FAIL_LINE_Y - WARN_SLACK) warn = true;

    if (b.dropAge < FAIL_DROP_GRACE) {
      clocks.push(0);
      continue;
    }

    const next = b.topY > FAIL_LINE_Y ? b.failClock + dt : 0;
    clocks.push(next);
    if (next >= FAIL_HOLD_SEC) failed = true;
  }

  return { warn, failed, clocks };
}
