/** Caution line: red dashed. Brightens when a ball is near or over. Fail only if settled over ~2s. */
import { Color3 } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { FAIL_HOLD_SEC, FAIL_LINE_Y, REST, WARN_SLACK } from "./constants";
import type { Ball } from "./Ball";

function dashTex(scene: Scene): DynamicTexture {
  const tw = 512;
  const th = 32;
  const tex = new DynamicTexture("fail-dash", { width: tw, height: th }, scene, false);
  tex.hasAlpha = true;
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, tw, th);
  ctx.fillStyle = "#ffffff";
  const dash = 30;
  const gap = 16;
  for (let x = 6; x < tw - 8; x += dash + gap) {
    ctx.beginPath();
    ctx.roundRect(x, 9, dash, 14, 4);
    ctx.fill();
  }
  tex.update();
  return tex;
}

export class FailLine {
  readonly mesh: Mesh;
  private readonly mat: StandardMaterial;
  warning = false;

  constructor(scene: Scene, mesh: Mesh) {
    this.mesh = mesh;
    mesh.position.y = FAIL_LINE_Y;
    const tex = dashTex(scene);
    const mat = new StandardMaterial("fail-line-mat", scene);
    mat.diffuseTexture = tex;
    mat.emissiveTexture = tex;
    mat.opacityTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.diffuseColor = new Color3(1.0, 0.22, 0.16);
    mat.emissiveColor = new Color3(1.0, 0.18, 0.1);
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = true;
    mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
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
      this.mat.emissiveColor.set(1.0, 0.06, 0.04);
      this.mat.diffuseColor.set(1.0, 0.1, 0.08);
    } else {
      this.mat.emissiveColor.set(1.0, 0.18, 0.1);
      this.mat.diffuseColor.set(1.0, 0.22, 0.16);
    }
    return { warn, failed };
  }
}
