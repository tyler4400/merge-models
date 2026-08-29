/** Scene + Havok + Game. Bright high-contrast room so glass orbs read clearly. */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4, Vector3 } from "@babylonjs/core/Maths/math";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import "@babylonjs/core/Physics/v2/physicsEngineComponent";
import "@babylonjs/core/Materials/PBR/pbrSubSurfaceConfiguration";
import "@babylonjs/core/Materials/PBR/pbrClearCoatConfiguration";
import HavokPhysics from "@babylonjs/havok";
import { CAMERA, GRAVITY_Y, VIEW } from "../game/constants";
import { Game } from "../game/Game";
import { preloadBallIcons } from "../game/Ball";
import { buildContainer } from "../game/physics";
import { makeSkyBackdrop } from "./skyBackdrop";

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
  scene.clearColor = new Color4(0.55, 0.80, 0.96, 1);
  makeSkyBackdrop(scene);
  scene.environmentTexture = makeDayEnv(scene);
  scene.environmentIntensity = 1.15;

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
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.orthoLeft = -VIEW.halfW;
  camera.orthoRight = VIEW.halfW;
  camera.orthoBottom = -VIEW.halfH;
  camera.orthoTop = VIEW.halfH;

  const hemi = new HemisphericLight("hemi", new Vector3(0.25, 1, 0.4), scene);
  hemi.intensity = 1.05;
  hemi.diffuse = new Color3(1, 0.98, 0.94);
  hemi.groundColor = new Color3(0.72, 0.78, 0.82);

  const key = new DirectionalLight("key", new Vector3(-0.4, -1, -0.25), scene);
  key.intensity = 1.25;
  key.diffuse = new Color3(1, 0.98, 0.92);
  key.position = new Vector3(6, 16, 8);

  const fill = new PointLight("fill", new Vector3(-3.5, 7.5, 4), scene);
  fill.intensity = 0.55;
  fill.diffuse = new Color3(0.55, 0.75, 1);

  const rim = new PointLight("rim", new Vector3(5, 6, -3), scene);
  rim.intensity = 0.4;
  rim.diffuse = new Color3(1, 0.85, 0.55);

  const rig = buildContainer(scene);
  rig.failLine.isVisible = true;

  await preloadBallIcons(scene);
  const game = new Game(scene, canvas, hud);
  scene.onBeforeRenderObservable.add(() => {
    game.tick(engine.getDeltaTime());
  });

  return { scene, game };
}

/** Bright procedural cube map so PBR glass catches highlights. */
function makeDayEnv(scene: Scene): CubeTexture {
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
  const px = face("#dff2ff", "#b7d8f0");
  const nx = face("#e8f6ff", "#c5e0f4");
  const py = face("#ffffff", "#d8eefe");
  const ny = face("#f4efe4", "#d9d0c2");
  const pz = face("#e2f3ff", "#bad7ee");
  const nz = face("#e2f3ff", "#bad7ee");
  return CubeTexture.CreateFromImages([px, py, pz, nx, ny, nz], scene);
}
