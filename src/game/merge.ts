/** Same-tier contact → next tier with an upward pop. Two T-800s vanish, no tier 11. */
import { Vector3 } from "@babylonjs/core/Maths/math";
import { MERGE_POP } from "./constants";
import { nextTier } from "./tiers";
import type { Ball } from "./Ball";

export type MergeKind = "upgrade" | "t800-pair";

export type MergePlan = {
  kind: MergeKind;
  a: Ball;
  b: Ball;
  mid: Vector3;
  next: ReturnType<typeof nextTier>;
};

export function planMerge(a: Ball, b: Ball): MergePlan | null {
  if (a.merging || b.merging) return null;
  if (a.held || b.held) return null;
  if (a.tier !== b.tier) return null;
  if (a.id === b.id) return null;
  const pa = a.mesh.getAbsolutePosition();
  const pb = b.mesh.getAbsolutePosition();
  const mid = Vector3.Center(pa, pb);
  if (a.tier === 10) {
    return { kind: "t800-pair", a, b, mid, next: null };
  }
  return { kind: "upgrade", a, b, mid, next: nextTier(a.tier) };
}

export function popImpulse(): number {
  return MERGE_POP;
}
