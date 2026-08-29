import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { CAMERA, VIEW } from "../game/constants";
import courtyardUrl from "../assets/levels/01-courtyard.png";

/** Level 1 courtyard card. Later levels swap this asset. */
export function makeSkyBackdrop(scene: Scene): void {
  const tex = new Texture(courtyardUrl, scene);
  tex.hasAlpha = false;
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
