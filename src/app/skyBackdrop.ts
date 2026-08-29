import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { CAMERA, VIEW } from "../game/constants";

/** Default sky to grass card. Level art can replace this later. */
export function makeSkyBackdrop(scene: Scene): void {
  const tex = new DynamicTexture("sky", { width: 256, height: 512 }, scene, false);
  const ctx = tex.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#7ec4f4");
  g.addColorStop(0.42, "#d7eefc");
  g.addColorStop(0.58, "#d5edb0");
  g.addColorStop(1, "#8fc45e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 512);
  tex.update();
  const mat = new StandardMaterial("skyMat", scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  const plane = MeshBuilder.CreatePlane("sky", { width: VIEW.halfW * 2.2, height: VIEW.halfH * 2.2 }, scene);
  plane.position.set(0, CAMERA.targetY, -12);
  plane.material = mat;
  plane.isPickable = false;
}
