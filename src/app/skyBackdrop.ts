import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { CAMERA, VIEW } from "../game/constants";
import courtyardUrl from "../assets/levels/01-courtyard.png";

/** Level 1 courtyard card (painted jar + wood foot). Portrait window of the landscape PNG. */
export function makeSkyBackdrop(scene: Scene): void {
  const tex = new Texture(courtyardUrl, scene);
  tex.hasAlpha = false;
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  // Source is 1536×1024. Show the 473×1024 portrait strip centered on the jar
  // (x 519–992) so aspect matches the 390×844 view with no stretch.
  tex.uScale = 473 / 1536;
  tex.uOffset = 519 / 1536;
  const mat = new StandardMaterial("skyMat", scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  const plane = MeshBuilder.CreatePlane("sky", { width: VIEW.halfW * 2, height: VIEW.halfH * 2 }, scene);
  plane.position.set(0, CAMERA.targetY, -12);
  plane.material = mat;
  plane.isPickable = false;
}
