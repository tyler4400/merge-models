/** Caution line: red dashed. Brightens when a ball is near or over. */
import { Color3 } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { FAIL_LINE_Y } from "./constants";
import { tickFail, type FailSample } from "./failCheck";
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
    const samples: FailSample[] = balls.map((b) => ({
      held: b.held,
      merging: b.merging,
      hasBody: !!b.aggregate,
      dropAge: b.dropAge,
      topY: b.topY(),
      failClock: b.failClock,
    }));
    const { warn, failed, clocks } = tickFail(samples, dt);
    for (let i = 0; i < balls.length; i++) balls[i]!.failClock = clocks[i]!;

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
