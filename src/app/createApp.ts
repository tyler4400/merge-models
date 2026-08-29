/** Scene + Havok + Game. Scaffold lights a dark night room so the canvas is never blank. */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4, Vector3 } from "@babylonjs/core/Maths/math";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import "@babylonjs/core/Physics/v2/physicsEngineComponent";
import HavokPhysics from "@babylonjs/havok";

export type App = {
  scene: Scene;
};

export async function createApp(
  engine: Engine,
  canvas: HTMLCanvasElement,
  _hud: HTMLElement,
): Promise<App> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.05, 0.04, 0.035, 1);

  const havok = await HavokPhysics({ locateFile: () => "/HavokPhysics.wasm" });
  const plugin = new HavokPlugin(true, havok);
  scene.enablePhysics(new Vector3(0, -9.8, 0), plugin);

  const camera = new ArcRotateCamera(
    "cam",
    Math.PI / 2,
    Math.PI / 2.15,
    18,
    new Vector3(0, 5.4, 0),
    scene,
  );
  camera.lowerRadiusLimit = 18;
  camera.upperRadiusLimit = 18;
  camera.attachControl(canvas, false);
  camera.inputs.clear();

  const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.35), scene);
  hemi.intensity = 0.55;
  hemi.groundColor = new Color3(0.12, 0.08, 0.06);

  const key = new DirectionalLight("key", new Vector3(-0.35, -1, -0.4), scene);
  key.intensity = 0.85;
  key.position = new Vector3(4, 14, 8);

  return { scene };
}
