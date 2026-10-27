/** Boot only: canvas + engine, then hand off to createApp. */
import { Engine } from "@babylonjs/core/Engines/engine";
import { createApp } from "./app/createApp";
import { mountMotionDebug } from "./ui/motionDebug";

const canvas = document.getElementById("game");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("missing #game canvas");
}

const engine = new Engine(canvas, true, {
  alpha: true,
  preserveDrawingBuffer: true,
  stencil: true,
  adaptToDeviceRatio: true,
  antialias: true,
});

const hud = document.getElementById("hud");
if (!hud) throw new Error("missing #hud");

const app = await createApp(engine, canvas, hud);
const disposeMotionDebug = mountMotionDebug(app.game);
app.scene.onDisposeObservable.add(disposeMotionDebug);

engine.runRenderLoop(() => {
  app.scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});
