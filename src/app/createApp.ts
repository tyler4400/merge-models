/** Scene + Havok + Game. Night leisure lighting; canvas is never blank. */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4, Vector3 } from "@babylonjs/core/Maths/math";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import "@babylonjs/core/Physics/v2/physicsEngineComponent";
import "@babylonjs/core/Materials/PBR/pbrSubSurfaceConfiguration";
import HavokPhysics from "@babylonjs/havok";
import { CAMERA, GRAVITY_Y } from "../game/constants";
import { Game } from "../game/Game";
import { buildContainer } from "../game/physics";

export type App = {
  scene: Scene;
  game: Game;
};

export async function createApp(
  engine: Engine,
  canvas: HTMLCanvasElement,
  hud: HTMLElement,
): Promise<App> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.05, 0.04, 0.035, 1);
  scene.environmentTexture = makeNightEnv(scene);
  scene.environmentIntensity = 0.7;

  const havok = await HavokPhysics({ locateFile: () => "/HavokPhysics.wasm" });
  const plugin = new HavokPlugin(true, havok);
  scene.enablePhysics(new Vector3(0, GRAVITY_Y, 0), plugin);

  const camera = new ArcRotateCamera(
    "cam",
    CAMERA.alpha,
    CAMERA.beta,
    CAMERA.radius,
    new Vector3(0, CAMERA.targetY, 0),
    scene,
  );
  camera.lowerRadiusLimit = CAMERA.radius;
  camera.upperRadiusLimit = CAMERA.radius;
  camera.attachControl(canvas, false);
  camera.inputs.clear();

  const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.35), scene);
  hemi.intensity = 0.5;
  hemi.groundColor = new Color3(0.12, 0.08, 0.06);

  const key = new DirectionalLight("key", new Vector3(-0.35, -1, -0.4), scene);
  key.intensity = 0.8;
  key.position = new Vector3(4, 14, 8);

  const fill = new PointLight("fill", new Vector3(0, 8.5, 3.2), scene);
  fill.intensity = 0.45;
  fill.diffuse = new Color3(1, 0.82, 0.62);

  const rig = buildContainer(scene);
  rig.failLine.isVisible = true;

  const game = new Game(scene, canvas, hud);
  scene.onBeforeRenderObservable.add(() => {
    game.tick(engine.getDeltaTime());
  });

  return { scene, game };
}

/** Tiny procedural cube map — enough IBL for PBR glass without a network HDR. */
function makeNightEnv(scene: Scene): CubeTexture {
  const face = (top: string, bot: string): string => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return c.toDataURL("image/png");
  };
  const px = face("#1a1410", "#0c0908");
  const nx = face("#181210", "#0c0908");
  const py = face("#1c1824", "#141018");
  const ny = face("#2a1c12", "#1a100c");
  const pz = face("#16110e", "#0a0807");
  const nz = face("#16110e", "#0a0807");
  return CubeTexture.CreateFromImages([px, py, pz, nx, ny, nz], scene);
}
