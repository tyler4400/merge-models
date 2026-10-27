/** Pure fail-line check (no Babylon) so it can be unit-tested. */
import { FAIL_DROP_GRACE, FAIL_HOLD_SEC, FAIL_LINE_Y, WARN_SLACK } from "./constants.ts";

export type FailSample = {
  held: boolean;
  merging: boolean;
  hasBody: boolean;
  dropAge: number;
  topY: number;
  failClock: number;
  /** Linear velocity Y. Missing is treated as 0 (at rest). */
  vy?: number;
};

export type FailOptions = {
  /** 失败等待时长倍数；省略时保持原来的两秒。 */
  holdScale?: number;
  /** 暂停计时及失败触发，警告和回到线下清零仍有效。 */
  paused?: boolean;
};

export function tickFail(
  balls: FailSample[],
  dt: number,
  opts: FailOptions = {},
): {
  warn: boolean;
  failed: boolean;
  clocks: number[];
} {
  const clocks: number[] = [];
  let warn = false;
  let failed = false;
  const scale = opts.holdScale ?? 1;
  const holdSec = FAIL_HOLD_SEC * (Number.isFinite(scale) && scale > 0 ? scale : 1);

  for (const b of balls) {
    if (b.held || b.merging || !b.hasBody) {
      clocks.push(0);
      continue;
    }

    if (b.dropAge < FAIL_DROP_GRACE) {
      clocks.push(0);
      continue;
    }

    const vy = b.vy ?? 0;
    const falling = vy < -0.25;
    if (!falling && b.topY > FAIL_LINE_Y - WARN_SLACK) warn = true;

    const next = b.topY > FAIL_LINE_Y ? b.failClock + (opts.paused ? 0 : dt) : 0;
    clocks.push(next);
    if (!opts.paused && next >= holdSec) failed = true;
  }

  return { warn, failed, clocks };
}
