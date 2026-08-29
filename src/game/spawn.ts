/** Next-ball queue. Only tiers 1–4, weights 35 / 30 / 20 / 15. */

import { MAX_DROP_TIER } from "./tiers";

const WEIGHTS = [35, 30, 20, 15] as const;

export function rollDropTier(rand: () => number = Math.random): number {
  const r = rand() * 100;
  let acc = 0;
  for (let i = 0; i < MAX_DROP_TIER; i++) {
    acc += WEIGHTS[i];
    if (r < acc) return i + 1;
  }
  return MAX_DROP_TIER;
}

/** One-ahead queue so NEXT stays stable until the held ball is spent. */
export function createSpawnQueue() {
  let next = rollDropTier();
  return {
    peek(): number {
      return next;
    },
    take(): number {
      const cur = next;
      next = rollDropTier();
      return cur;
    },
  };
}

export type SpawnQueue = ReturnType<typeof createSpawnQueue>;

export class NextQueue {
  private q = createSpawnQueue();
  get current(): number {
    return this.q.peek();
  }
  get next(): number {
    return this.q.peek();
  }
  take(): number {
    return this.q.take();
  }
  reset(): void {
    this.q = createSpawnQueue();
  }
}
