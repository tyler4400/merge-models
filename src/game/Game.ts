/**
 * Phase 1 play loop: hold a 1–4 ball, slide it, ghost-preview, drop into Havok.
 * Later phases add merge / score / hammer / win-lose on top of this.
 */
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Culling/ray";
import { Ball } from "./Ball";
import { DROP, REST } from "./constants";
import { bodySettled, clampDropX, keepInLane } from "./physics";
import { createSpawnQueue, type SpawnQueue } from "./spawn";
import { getTier, type TierId } from "./tiers";

const DROP_PLANE = Plane.FromPositionAndNormal(Vector3.Zero(), new Vector3(0, 0, 1));

export class Game {
  readonly balls: Ball[] = [];
  private readonly queue: SpawnQueue = createSpawnQueue();
  private held: Ball | null = null;
  private ghost: Ball | null = null;
  private guide: LinesMesh | null = null;
  private dropX = 0;
  private keyLeft = false;
  private keyRight = false;
  /** Last dropped ball that must settle before the next drop. */
  private pending: Ball | null = null;
  private pendingAge = 0;
  private pendingSettledFor = 0;
  private nextIcon: HTMLImageElement | null = null;
  private nextName: HTMLElement | null = null;
  private waitHint: HTMLElement | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly canvas: HTMLCanvasElement,
    private readonly hud: HTMLElement,
  ) {}

  start(): void {
    this.mountHud();
    this.guide = MeshBuilder.CreateDashedLines(
      "drop-guide",
      {
        points: [new Vector3(0, DROP.y + 0.35, 0), new Vector3(0, 0.12, 0)],
        dashSize: 0.16,
        gapSize: 0.1,
        dashNb: 48,
      },
      this.scene,
    );
    this.guide.color = new Color3(0.95, 0.78, 0.42);
    this.guide.alpha = 0.38;
    this.guide.isPickable = false;
    this.spawnHeld();
    this.bindInput();
  }

  /** Drive off the engine delta — never assume a fixed frame rate. */
  tick(dtMs: number): void {
    const dt = Math.min(dtMs / 1000, 0.05);
    const axis = (this.keyRight ? 1 : 0) - (this.keyLeft ? 1 : 0);
    if (axis !== 0) this.dropX += axis * DROP.moveSpeed * dt;
    this.stepPending(dt);
    this.syncHeld();
    for (const ball of this.balls) {
      if (ball.held || !ball.body) continue;
      keepInLane(ball.body);
    }
  }

  private mountHud(): void {
    this.hud.innerHTML = `
      <div class="hud-top">
        <div class="hud-title">合成大模型</div>
        <div class="hud-next">
          <div class="hud-next-label">NEXT</div>
          <img class="hud-next-icon" id="hud-next-icon" alt="" />
          <div class="hud-next-name" id="hud-next-name"></div>
        </div>
      </div>
      <div class="hud-hint">A / D 或方向键或鼠标移动 · 点击或空格投放</div>
      <div class="hud-wait" id="hud-wait" hidden>球还在滚动…</div>
    `;
    this.nextIcon = this.hud.querySelector("#hud-next-icon");
    this.nextName = this.hud.querySelector("#hud-next-name");
    this.waitHint = this.hud.querySelector("#hud-wait");
    this.refreshHud();
  }

  private refreshHud(): void {
    const next = getTier(this.queue.peek());
    if (this.nextIcon) {
      this.nextIcon.src = next.iconUrl;
      this.nextIcon.alt = next.name;
    }
    if (this.nextName) this.nextName.textContent = next.name;
    this.syncWaitHint();
  }

  private syncWaitHint(): void {
    if (this.waitHint) this.waitHint.hidden = this.canDrop();
  }

  private canDrop(): boolean {
    return this.pending === null && this.held !== null;
  }

  private spawnHeld(): void {
    this.ghost?.dispose();
    this.ghost = null;
    const tier = this.queue.take() as TierId;
    const pos = new Vector3(this.dropX, DROP.y, 0);
    const held = new Ball(this.scene, tier, pos);
    held.held = true;
    this.held = held;

    const ghost = new Ball(this.scene, tier, pos);
    ghost.held = true;
    ghost.mesh.visibility = 0.18;
    ghost.face.visibility = 0;
    this.ghost = ghost;
    this.syncHeld();
    this.refreshHud();
  }

  private syncHeld(): void {
    const radius = this.held?.radius ?? getTier(1).radius;
    this.dropX = clampDropX(this.dropX, radius);
    if (this.held) {
      this.held.mesh.position.set(this.dropX, DROP.y, 0);
    }
    if (this.ghost) {
      this.ghost.mesh.position.set(this.dropX, DROP.y - 0.04, 0.02);
    }
    if (this.guide) {
      this.guide.position.x = this.dropX;
      this.guide.alpha = this.canDrop() ? 0.38 : 0.14;
    }
  }

  private stepPending(dt: number): void {
    if (!this.pending) return;
    this.pendingAge += dt;
    const body = this.pending.body;
    const settled = body ? bodySettled(body) : true;
    if (settled || this.pendingAge >= REST.maxWaitSec) {
      this.pendingSettledFor += dt;
      if (this.pendingSettledFor >= REST.holdSec || this.pendingAge >= REST.maxWaitSec) {
        this.pending = null;
        this.pendingAge = 0;
        this.pendingSettledFor = 0;
        this.syncWaitHint();
      }
    } else {
      this.pendingSettledFor = 0;
    }
  }

  private tryDrop(): void {
    if (!this.canDrop() || !this.held) return;
    const ball = this.held;
    ball.held = false;
    ball.enablePhysics(this.scene);
    this.balls.push(ball);
    this.held = null;
    this.pending = ball;
    this.pendingAge = 0;
    this.pendingSettledFor = 0;
    this.syncWaitHint();
    this.spawnHeld();
  }

  private pointerToX(): void {
    const cam = this.scene.activeCamera;
    if (!cam) return;
    const ray = this.scene.createPickingRay(this.scene.pointerX, this.scene.pointerY, Matrix.Identity(), cam);
    const dist = ray.intersectsPlane(DROP_PLANE);
    if (dist === null) return;
    this.dropX = ray.origin.add(ray.direction.scale(dist)).x;
  }

  private bindInput(): void {
    this.canvas.addEventListener("pointermove", () => this.pointerToX());
    this.canvas.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "touch" && e.button !== 0) return;
      this.pointerToX();
      this.tryDrop();
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("keydown", (e) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") {
        this.keyLeft = true;
        e.preventDefault();
      } else if (e.code === "ArrowRight" || e.code === "KeyD") {
        this.keyRight = true;
        e.preventDefault();
      } else if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) this.tryDrop();
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") this.keyLeft = false;
      if (e.code === "ArrowRight" || e.code === "KeyD") this.keyRight = false;
    });
  }
}
