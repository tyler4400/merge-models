/** Caution line: amber idle, red + alarm when a ball is near or over. Fail only if settled over ~2s. */
import { Color3 } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { FAIL_HOLD_SEC, FAIL_LINE_Y, REST, WARN_SLACK } from "./constants";
import type { Ball } from "./Ball";

export class FailLine {
  readonly mesh: Mesh;
  private readonly mat: StandardMaterial;
  warning = false;

  constructor(scene: Scene, mesh: Mesh) {
    this.mesh = mesh;
    mesh.position.y = FAIL_LINE_Y;
    const mat = new StandardMaterial("fail-line-mat", scene);
    mat.diffuseColor = new Color3(1.0, 0.45, 0.08);
    mat.emissiveColor = new Color3(1.0, 0.42, 0.05);
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = true;
    mesh.material = mat;
    this.mat = mat;
  }

  tick(dt: number, balls: readonly Ball[]): { warn: boolean; failed: boolean } {
    let warn = false;
    let failed = false;

    for (const b of balls) {
      if (b.held || b.merging || !b.aggregate) continue;
      const over = b.topY() > FAIL_LINE_Y;
      const near = b.topY() > FAIL_LINE_Y - WARN_SLACK;
      if (near) warn = true;
      const settled = b.settleClock >= REST.holdSec;
      if (over && settled) {
        b.failClock += dt;
        if (b.failClock >= FAIL_HOLD_SEC) failed = true;
      } else {
        b.failClock = 0;
      }
    }

    this.warning = warn;
    if (warn) {
      this.mat.emissiveColor.set(1.0, 0.08, 0.05);
      this.mat.diffuseColor.set(1.0, 0.12, 0.08);
    } else {
      this.mat.emissiveColor.set(1.0, 0.42, 0.05);
      this.mat.diffuseColor.set(1.0, 0.45, 0.08);
    }
    return { warn, failed };
  }
}
