/** Phase machine: title / playing / won / dead / hammerAim. */
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import "@babylonjs/core/Culling/ray";
import { Ball } from "./Ball";
import { DROP, MERGE_POP, REST } from "./constants";
import { FailLine } from "./failLine";
import { HammerStock, ShatterFx, canSmash } from "./hammer";
import { planMerge } from "./merge";
import { bodySettled, clampDropX, keepInLane } from "./physics";
import { firstT800Bonus, mergePoints, t800PairBonus } from "./scoring";
import { createSpawnQueue, type SpawnQueue } from "./spawn";
import { getTier, type TierId } from "./tiers";
import type { Hud } from "../ui/hud";
import type { Sfx } from "../audio/Sfx";

export type Phase = "title" | "playing" | "won" | "dead" | "hammerAim";

const DROP_PLANE = Plane.FromPositionAndNormal(Vector3.Zero(), new Vector3(0, 0, 1));

export class Game {
  readonly scene: Scene;
  readonly camera: Camera;
  readonly plugin: HavokPlugin;
  readonly hud: Hud;
  readonly sfx: Sfx;
  readonly fail: FailLine;
  readonly hammers = new HammerStock();
  readonly shatter: ShatterFx;
  queue: SpawnQueue = createSpawnQueue();

  phase: Phase = "title";
  score = 0;
  elapsed = 0;
  timing = false;
  cleared = false;
  combo = 0;
  balls: Ball[] = [];
  held: Ball | null = null;
  dropX = 0;
  keys = new Set<string>();
  smashLock = 0;
  pendingAge = 0;
  private idMap = new Map<number, Ball>();
  private bodyMap = new Map<object, Ball>();
  private mergeQueue: Array<readonly [Ball, Ball]> = [];
  private freeze = false;
  private guide: LinesMesh | null = null;

  constructor(opts: {
    scene: Scene;
    camera: Camera;
    plugin: HavokPlugin;
    hud: Hud;
    sfx: Sfx;
    fail: FailLine;
  }) {
    this.scene = opts.scene;
    this.camera = opts.camera;
    this.plugin = opts.plugin;
    this.hud = opts.hud;
    this.sfx = opts.sfx;
    this.fail = opts.fail;
    this.shatter = new ShatterFx(opts.scene);

    this.guide = MeshBuilder.CreateDashedLines(
      "drop-guide",
      {
        points: [new Vector3(0, DROP.y + 0.4, 0), new Vector3(0, 0.15, 0)],
        dashSize: 0.16,
        gapSize: 0.1,
        dashNb: 52,
      },
      this.scene,
    );
    this.guide.color = new Color3(0.95, 0.78, 0.42);
    this.guide.alpha = 0.32;
    this.guide.isPickable = false;

    this.plugin.onCollisionObservable.add((ev) => {
      const a = this.bodyMap.get(ev.collider);
      const b = this.bodyMap.get(ev.collidedAgainst);
      if (a && b) {
        this.mergeQueue.push([a, b]);
        this.sfx.collide(ev.impulse ?? 0.2);
      } else if (a || b) {
        this.sfx.collide(ev.impulse ?? 0.1);
      }
    });

    this.bindInput();
    this.scene.onBeforeRenderObservable.add(() => this.tick());
    this.hud.setNext(this.queue.peek() as TierId);
    this.hud.setHammers(this.hammers.left, false);
  }

  start(): void {
    this.sfx.unlock();
    this.resetRun(true);
    this.phase = "playing";
    this.hud.hideTitle();
    this.hud.hideResult();
    this.ensureHeld();
  }

  restart(): void {
    this.sfx.unlock();
    this.resetRun(true);
    this.phase = "playing";
    this.hud.hideTitle();
    this.hud.hideResult();
    this.ensureHeld();
  }

  continueScore(): void {
    this.sfx.unlock();
    this.phase = "playing";
    this.freeze = false;
    this.hud.hideResult();
    this.ensureHeld();
  }

  private resetRun(full: boolean): void {
    for (const b of [...this.balls]) b.dispose();
    this.balls = [];
    this.held?.dispose();
    this.held = null;
    this.idMap.clear();
    this.bodyMap.clear();
    this.mergeQueue = [];
    this.combo = 0;
    this.smashLock = 0;
    this.pendingAge = 0;
    this.freeze = false;
    this.timing = false;
    this.elapsed = 0;
    if (full) {
      this.score = 0;
      this.cleared = false;
      this.hammers.reset();
      this.queue = createSpawnQueue();
    }
    this.hud.setScore(this.score);
    this.hud.setTime(0);
    this.hud.setNext(this.queue.peek() as TierId);
    this.hud.setHammers(this.hammers.left, false);
    this.sfx.setAlarm(false);
  }

  private addBall(tier: TierId, pos: Vector3, physics: boolean): Ball {
    const ball = new Ball(this.scene, tier, pos);
    this.balls.push(ball);
    this.idMap.set(ball.id, ball);
    if (physics) {
      ball.enablePhysics(this.scene);
      if (ball.body) this.bodyMap.set(ball.body, ball);
    }
    return ball;
  }

  private removeBall(ball: Ball): void {
    if (ball.body) this.bodyMap.delete(ball.body);
    this.idMap.delete(ball.id);
    this.balls = this.balls.filter((b) => b.id !== ball.id);
    if (this.held?.id === ball.id) this.held = null;
    ball.dispose();
  }

  private worldQuiet(): boolean {
    if (this.smashLock > 0) return false;
    for (const b of this.balls) {
      if (b.held || b.merging) continue;
      if (!b.body) return false;
      if (b.unrestClock > REST.maxWaitSec) continue;
      if (!bodySettled(b.body)) return false;
    }
    return true;
  }

  private ensureHeld(): void {
    if (this.held || this.phase !== "playing") return;
    if (!this.worldQuiet()) return;
    const tier = this.queue.take() as TierId;
    const ball = this.addBall(tier, new Vector3(this.dropX, DROP.y, 0), false);
    ball.held = true;
    this.held = ball;
    this.hud.setNext(this.queue.peek() as TierId);
  }

  private dropHeld(): void {
    if (this.phase !== "playing" || !this.held) return;
    if (!this.worldQuiet()) return;
    const ball = this.held;
    ball.held = false;
    ball.enablePhysics(this.scene);
    if (ball.body) this.bodyMap.set(ball.body, ball);
    this.held = null;
    this.combo = 0;
    this.pendingAge = 0;
    if (!this.timing) this.timing = true;
    this.smashLock = 0.15;
  }

  toggleHammer(): void {
    this.sfx.unlock();
    if (this.phase === "hammerAim") {
      this.phase = "playing";
      this.hud.setHammers(this.hammers.left, false);
      return;
    }
    if (this.phase !== "playing") return;
    if (!this.hammers.canUse()) return;
    this.phase = "hammerAim";
    this.hud.setHammers(this.hammers.left, true);
  }

  private smash(ball: Ball): void {
    if (!canSmash(ball)) return;
    if (!this.hammers.consume()) return;
    const at = ball.mesh.getAbsolutePosition().clone();
    this.shatter.burst(at, ball.radius);
    this.sfx.shatter();
    this.removeBall(ball);
    this.phase = "playing";
    this.smashLock = 0.45;
    this.hud.setHammers(this.hammers.left, false);
  }

  private pointerWorldX(): number {
    const ray = this.scene.createPickingRay(
      this.scene.pointerX,
      this.scene.pointerY,
      Matrix.Identity(),
      this.camera,
    );
    const dist = ray.intersectsPlane(DROP_PLANE);
    if (dist === null) return this.dropX;
    return ray.origin.add(ray.direction.scale(dist)).x;
  }

  private pickBall(): Ball | null {
    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m: AbstractMesh) => {
      return typeof m.metadata?.ballId === "number";
    });
    const id = pick?.pickedMesh?.metadata?.ballId as number | undefined;
    return id != null ? this.idMap.get(id) ?? null : null;
  }

  private bindInput(): void {
    const canvas = this.scene.getEngine().getRenderingCanvas();
    if (!canvas) return;

    canvas.addEventListener("pointerdown", (e) => {
      this.sfx.unlock();
      if (e.target instanceof HTMLElement && e.target.closest("#hud button, #hud .overlay")) return;
      this.dropX = clampDropX(this.pointerWorldX(), this.held?.radius ?? getTier(1).radius);
      if (this.phase === "hammerAim") {
        const ball = this.pickBall();
        if (ball) this.smash(ball);
        else {
          this.phase = "playing";
          this.hud.setHammers(this.hammers.left, false);
        }
      }
    });
    window.addEventListener("pointermove", () => {
      if (this.phase === "title" || this.phase === "won" || this.phase === "dead") return;
      this.dropX = clampDropX(this.pointerWorldX(), this.held?.radius ?? getTier(1).radius);
    });
    window.addEventListener("pointerup", (e) => {
      if (e.target instanceof HTMLElement && e.target.closest("#hud button, #hud .overlay")) return;
      if (this.phase === "playing") this.dropHeld();
    });
    window.addEventListener("keydown", (e) => {
      this.sfx.unlock();
      this.keys.add(e.code);
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat && this.phase === "playing") this.dropHeld();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private tick(): void {
    const dt = Math.min(0.05, this.scene.getEngine().getDeltaTime() / 1000);
    this.shatter.tick(dt);
    if (this.smashLock > 0) this.smashLock = Math.max(0, this.smashLock - dt);
    if (this.phase === "title" || this.freeze) return;

    if (this.timing && (this.phase === "playing" || this.phase === "hammerAim")) {
      this.elapsed += dt;
      this.hud.setTime(this.elapsed);
    }

    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) this.dropX -= DROP.moveSpeed * dt;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) this.dropX += DROP.moveSpeed * dt;

    if (this.held) {
      this.dropX = clampDropX(this.dropX, this.held.radius);
      this.held.mesh.position.set(this.dropX, DROP.y, 0);
      this.held.mesh.visibility = 0.72;
    }
    if (this.guide) {
      this.guide.position.x = this.dropX;
      this.guide.alpha = this.held && this.worldQuiet() ? 0.38 : 0.12;
    }

    for (const b of this.balls) {
      if (b.held || b.merging || !b.body) continue;
      keepInLane(b.body);
      if (bodySettled(b.body)) {
        b.settleClock += dt;
        b.unrestClock = 0;
      } else {
        b.settleClock = 0;
        b.unrestClock += dt;
      }
    }

    this.flushMerges();

    if (this.phase === "playing" || this.phase === "hammerAim") {
      const { warn, failed } = this.fail.tick(dt, this.balls);
      this.sfx.setAlarm(warn);
      if (failed) this.lose();
    }

    if (this.phase === "playing") this.ensureHeld();
  }

  private flushMerges(): void {
    const seen = new Set<number>();
    const pairs = this.mergeQueue;
    this.mergeQueue = [];
    for (const [a, b] of pairs) {
      if (seen.has(a.id) || seen.has(b.id)) continue;
      if (!planMerge(a, b)) continue;
      seen.add(a.id);
      seen.add(b.id);
      this.applyMerge(a, b);
    }
  }

  private applyMerge(a: Ball, b: Ball): void {
    const plan = planMerge(a, b);
    if (!plan) return;
    a.merging = true;
    b.merging = true;
    const mid = plan.mid.clone();
    this.removeBall(a);
    this.removeBall(b);

    if (plan.kind === "t800-pair") {
      this.score += t800PairBonus();
      this.hud.setScore(this.score);
      this.hud.toast("T-800 对撞 +5000");
      this.sfx.merge(10);
      this.shatter.burst(mid, 1.7);
      return;
    }

    const next = plan.next;
    if (!next) return;
    this.score += mergePoints(next, this.combo);
    this.combo += 1;
    this.hud.setScore(this.score);
    this.hud.toast(getTier(next).name);
    this.sfx.merge(next);

    const spawned = this.addBall(next, mid.add(new Vector3(0, 0.1, 0)), true);
    spawned.applyPop(MERGE_POP);
    if (next === 10 && !this.cleared) this.winFirst();
  }

  private winFirst(): void {
    this.cleared = true;
    this.score += firstT800Bonus(this.elapsed);
    this.hud.setScore(this.score);
    this.sfx.win();
    this.phase = "won";
    window.setTimeout(() => {
      if (this.phase === "won") this.hud.showWin(this.score, this.elapsed, this.hammers.left);
    }, 1100);
  }

  private lose(): void {
    this.phase = "dead";
    this.freeze = true;
    this.sfx.setAlarm(false);
    this.hud.showLose(this.score, this.elapsed, this.hammers.left);
  }
}
