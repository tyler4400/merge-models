/** Phase machine: title / playing / won / dead / hammerAim. */
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { HavokPlugin as HavokPluginCtor } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { Sfx } from "../audio/Sfx";
import { Hud } from "../ui/hud";
import { Ball } from "./Ball";
import { TokenLayer } from "./TokenLayer";
import { DROP, GRAVITY_Y, MERGE_POP, REST, VIEW } from "./constants";
import { FailLine } from "./failLine";
import { HammerStock, ShatterFx, canSmash } from "./hammer";
import { planMerge } from "./merge";
import { bodySettled, clampDropX, keepInLane } from "./physics";
import { firstT800Bonus, mergePoints, t800PairBonus } from "./scoring";
import { createSpawnQueue, type SpawnQueue } from "./spawn";
import { getTier, type TierId } from "./tiers";
import { TiltSensor } from "./tilt";

export type Phase = "title" | "playing" | "won" | "dead" | "hammerAim";

export class Game {
  readonly scene: Scene;
  readonly canvas: HTMLCanvasElement;
  readonly plugin: HavokPlugin;
  readonly hud: Hud;
  readonly sfx: Sfx;
  readonly fail: FailLine;
  readonly hammers = new HammerStock();
  readonly shatter: ShatterFx;
  readonly tokens: TokenLayer;
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
  keyLeft = false;
  keyRight = false;
  smashLock = 0;
  dropLock = 0;
  private grows: Array<{ ball: Ball; t: number }> = [];
  private fades: Array<{ ball: Ball; t: number }> = [];
  pending: Ball | null = null;
  pendingAge = 0;
  pendingSettledFor = 0;
  private idMap = new Map<number, Ball>();
  private bodyMap = new Map<object, Ball>();
  private mergeQueue: Array<readonly [Ball, Ball]> = [];
  private freeze = false;
  private inputBound = false;
  private lastPointer: PointerEvent | null = null;
  readonly tilt = new TiltSensor();

  constructor(scene: Scene, canvas: HTMLCanvasElement, hudRoot: HTMLElement) {
    this.scene = scene;
    this.canvas = canvas;
    const plugin = scene.getPhysicsEngine()?.getPhysicsPlugin();
    if (!(plugin instanceof HavokPluginCtor)) throw new Error("Havok plugin missing");
    this.plugin = plugin;
    this.sfx = new Sfx();
    const line = scene.getMeshByName("fail-line");
    this.fail = new FailLine(scene, line as Mesh);
    this.shatter = new ShatterFx(scene);
    this.tokens = new TokenLayer(canvas);
    this.hud = new Hud(hudRoot, {
      onStart: () => this.start(),
      onContinue: () => this.continueScore(),
      onRestart: () => this.restart(),
      onHammer: () => this.toggleHammer(),
    });

    this.plugin.onCollisionObservable.add((ev) => {
      const a = this.bodyMap.get(ev.collider);
      const b = this.bodyMap.get(ev.collidedAgainst);
      const imp = ev.impulse ?? 0;
      if (a && b) {
        this.mergeQueue.push([a, b]);
        let rel = 0;
        try {
          const va = a.body?.getLinearVelocity();
          const vb = b.body?.getLinearVelocity();
          if (va && vb) rel = Math.hypot(va.x - vb.x, va.y - vb.y);
        } catch {
          /* body gone */
        }
        const piled = a.settleClock > 0.15 && b.settleClock > 0.15;
        if (rel > 1.15 && imp > 2.8 && !piled) this.sfx.collide(imp);
      } else if (a || b) {
        const ball = a ?? b;
        if (ball && imp > 4.8 && ball.dropAge < 0.55) this.sfx.collide(imp * 0.4);
      }
    });

    this.hud.setNext(this.queue.peek() as TierId);
    this.hud.setHammers(this.hammers.left, false);
    this.bindInput();

    if (typeof window !== "undefined") {
      (window as unknown as { __mergeGame: Game }).__mergeGame = this;
    }
    if (typeof location !== "undefined") {
      if (location.search.includes("shot=play")) {
        window.setTimeout(() => this.autoshot(), 350);
      } else if (location.search.includes("shot=drop")) {
        window.setTimeout(() => this.autoshotDrop(), 350);
      }
    }
  }

  start(): void {
    this.sfx.unlock();
    this.tilt.startFromGesture();
    this.resetRun(true);
    this.phase = "playing";
    this.hud.hideTitle();
    this.hud.hideResult();
    this.spawnHeld();
  }

  restart(): void {
    this.start();
  }

  continueScore(): void {
    this.sfx.unlock();
    this.tilt.startFromGesture();
    this.phase = "playing";
    this.freeze = false;
    this.hud.hideResult();
    if (!this.held) this.spawnHeld();
  }

  tick(dtMs: number): void {
    const dt = Math.min(dtMs / 1000, 0.05);
    this.tilt.tick(dt);
    const live = this.phase === "playing" || this.phase === "hammerAim";
    this.plugin.setGravity(new Vector3(live ? this.tilt.gx : 0, GRAVITY_Y, 0));
    this.shatter.tick(dt);
    this.stepMergeFx(dt);
    if (this.smashLock > 0) this.smashLock = Math.max(0, this.smashLock - dt);
    if (this.dropLock > 0) this.dropLock = Math.max(0, this.dropLock - dt);
    if (this.phase === "title" || this.freeze) { this.paintTokens(); return; }

    if (this.timing && (this.phase === "playing" || this.phase === "hammerAim")) {
      this.elapsed += dt;
      this.hud.setTime(this.elapsed);
    }

    const axis = (this.keyRight ? 1 : 0) - (this.keyLeft ? 1 : 0);
    if (axis !== 0) this.dropX += axis * DROP.moveSpeed * dt;

    this.stepPending(dt);
    this.syncHeld();

    for (const ball of this.balls) {
      ball.syncVisual(dt);
      if (ball.held || ball.merging || !ball.body) continue;
      ball.dropAge += dt;
      keepInLane(ball.body);
      if (bodySettled(ball.body)) {
        ball.settleClock += dt;
        ball.unrestClock = 0;
      } else {
        ball.settleClock = 0;
        ball.unrestClock += dt;
      }
    }
    this.paintTokens();

    this.flushMerges();

    if (this.phase === "playing" || this.phase === "hammerAim") {
      const { warn, failed } = this.fail.tick(dt, this.balls);
      this.hud.setWarn(warn);
      this.sfx.setAlarm(warn);
      if (failed) this.lose();
    }
  }

  toggleHammer(): void {
    this.sfx.unlock();
    this.tilt.startFromGesture();
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

  private resetRun(full: boolean): void {
    for (const b of [...this.balls]) this.removeBall(b);
    this.held?.dispose();
    this.held = null;
    this.hud.setWarn(false);
    this.balls = [];
    this.idMap.clear();
    this.bodyMap.clear();
    this.mergeQueue = [];
    this.grows = [];
    this.fades = [];
    this.combo = 0;
    this.smashLock = 0;
    this.pending = null;
    this.pendingAge = 0;
    this.pendingSettledFor = 0;
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

  private register(ball: Ball): void {
    this.idMap.set(ball.id, ball);
    if (ball.body) this.bodyMap.set(ball.body, ball);
  }

  private removeBall(ball: Ball): void {
    if (ball.body) this.bodyMap.delete(ball.body);
    this.idMap.delete(ball.id);
    this.balls = this.balls.filter((b) => b.id !== ball.id);
    if (this.held?.id === ball.id) this.held = null;
    ball.dispose();
  }

  private canDrop(): boolean {
    if (this.phase !== "playing" || !this.held || this.smashLock > 0) return false;
    return this.dropLock <= 0;
  }

  private spawnHeld(): void {
    if (this.held) return;
    const tier = this.queue.take() as TierId;
    const pos = new Vector3(this.dropX, DROP.y, 0);
    const held = new Ball(this.scene, tier, pos);
    held.held = true;
    held.mesh.visibility = 1;
    held.setLogoVisible(1);
    this.held = held;
    this.register(held);
    this.syncHeld();
    this.hud.setNext(this.queue.peek() as TierId);
  }

  private syncHeld(): void {
    const radius = this.held?.radius ?? getTier(1).radius;
    this.dropX = clampDropX(this.dropX, radius);
    if (this.held) this.held.mesh.position.set(this.dropX, DROP.y, 0);
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
      }
    } else {
      this.pendingSettledFor = 0;
    }
  }

  private tryDrop(): void {
    if (!this.canDrop() || !this.held) return;
    this.syncHeld();
    const ball = this.held;
    ball.held = false;
    ball.mesh.visibility = 1;
    ball.enablePhysics(this.scene);
    if (ball.body) this.bodyMap.set(ball.body, ball);
    this.balls.push(ball);
    this.held = null;
    this.pending = ball;
    this.pendingAge = 0;
    this.pendingSettledFor = 0;
    this.dropLock = 0.16;
    this.combo = 0;
    if (!this.timing) this.timing = true;
    this.spawnHeld();
  }

  private smash(ball: Ball): void {
    if (!canSmash(ball)) return;
    if (!this.hammers.consume()) return;
    this.tokens.burst(ball);
    this.sfx.shatter();
    if (this.pending?.id === ball.id) this.pending = null;
    this.removeBall(ball);
    this.phase = "playing";
    this.smashLock = 0.4;
    this.hud.setHammers(this.hammers.left, false);
  }

  private pointerToX(e?: PointerEvent): void {
    const ev = e ?? this.lastPointer;
    if (!ev) return;
    this.lastPointer = ev;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const nx = (ev.clientX - rect.left) / w;
    this.dropX = nx * 2 * VIEW.halfW - VIEW.halfW;
  }

  private paintTokens(): void {
    const list = this.held ? this.balls.concat(this.held) : this.balls.slice();
    const showGuide = this.phase === "playing" || this.phase === "hammerAim";
    this.tokens.draw(list, {
      dropX: this.dropX,
      guideAlpha: showGuide ? (this.canDrop() ? 0.55 : 0.2) : 0,
      warn: this.fail.warning,
    });
  }

  private pickBall(e: PointerEvent): Ball | null {
    return this.tokens.hitTestCss(e.clientX, e.clientY, this.balls);
  }

  private isHudChrome(e: Event): boolean {
    const t = e.target;
    if (!(t instanceof Element)) return false;
    return !!t.closest("button, .overlay, a, input");
  }

  private bindInput(): void {
    if (this.inputBound) return;
    this.inputBound = true;
    // #game is opacity:0; some mobile browsers skip events on it. Bind once on #stage.
    const stage = this.canvas.parentElement ?? this.canvas;

    const onPointerMove = (e: PointerEvent): void => {
      if (this.phase === "title" || this.phase === "won" || this.phase === "dead") return;
      this.pointerToX(e);
      if (this.phase === "playing" || this.phase === "hammerAim") this.syncHeld();
    };
    const onPointerDown = (e: PointerEvent): void => {
      this.sfx.unlock();
      this.tilt.startFromGesture();
      if (this.isHudChrome(e)) return;
      if (e.pointerType !== "touch" && e.button !== 0) return;
      this.pointerToX(e);
      if (this.phase === "playing" || this.phase === "hammerAim") this.syncHeld();
    };
    const onPointerUp = (e: PointerEvent): void => {
      this.sfx.unlock();
      this.tilt.startFromGesture();
      if (this.isHudChrome(e)) return;
      if (e.pointerType !== "touch" && e.button !== 0) return;
      this.pointerToX(e);
      if (this.phase === "hammerAim") {
        const ball = this.pickBall(e);
        if (ball) this.smash(ball);
        else {
          this.phase = "playing";
          this.hud.setHammers(this.hammers.left, false);
        }
        return;
      }
      if (this.phase === "playing") this.tryDrop();
    };

    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointerup", onPointerUp);
    stage.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => {
      this.sfx.unlock();
      if (e.code === "ArrowLeft" || e.code === "KeyA") {
        this.keyLeft = true;
        e.preventDefault();
      } else if (e.code === "ArrowRight" || e.code === "KeyD") {
        this.keyRight = true;
        e.preventDefault();
      } else if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat && this.phase === "playing") this.tryDrop();
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") this.keyLeft = false;
      if (e.code === "ArrowRight" || e.code === "KeyD") this.keyRight = false;
    });
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
    if (this.pending?.id === a.id || this.pending?.id === b.id) this.pending = null;
    if (a.body) this.bodyMap.delete(a.body);
    if (b.body) this.bodyMap.delete(b.body);
    a.aggregate?.dispose();
    a.aggregate = null;
    b.aggregate?.dispose();
    b.aggregate = null;
    this.fades.push({ ball: a, t: 0 }, { ball: b, t: 0 });

    if (plan.kind === "t800-pair") {
      this.score += t800PairBonus();
      this.hud.setScore(this.score);
      this.hud.toast("T-800 对撞 +5000");
      this.sfx.merge(10);
      this.shatter.ring(mid, 1.7);
      return;
    }

    const next = plan.next;
    if (!next) return;
    this.score += mergePoints(next, this.combo);
    this.combo += 1;
    this.hud.setScore(this.score);
    this.hud.toast(getTier(next).name);
    this.sfx.merge(next);
    this.shatter.ring(mid, getTier(next).radius);

    const spawned = new Ball(this.scene, next, mid.add(new Vector3(0, 0.12, 0)));
    spawned.mesh.scaling.setAll(0.08);
    spawned.enablePhysics(this.scene);
    this.balls.push(spawned);
    this.register(spawned);
    spawned.applyPop(MERGE_POP * 1.15);
    this.grows.push({ ball: spawned, t: 0 });
    if (next === 10 && !this.cleared) this.winFirst();
  }

  private stepMergeFx(dt: number): void {
    for (let i = this.fades.length - 1; i >= 0; i--) {
      const f = this.fades[i];
      f.t += dt;
      const s = Math.max(0, 1 - f.t / 0.16);
      f.ball.mesh.scaling.setAll(s);
      if (f.t >= 0.16) {
        this.removeBall(f.ball);
        this.fades.splice(i, 1);
      }
    }
    for (let i = this.grows.length - 1; i >= 0; i--) {
      const g = this.grows[i];
      g.t += dt;
      const x = Math.min(1, g.t / 0.28);
      const c1 = 1.70158;
      const c3 = c1 + 1;
      const back = 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
      g.ball.mesh.scaling.setAll(back);
      if (x >= 1) {
        g.ball.mesh.scaling.setAll(1);
        this.grows.splice(i, 1);
      }
    }
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

  /** Headless confirmation shot: start with several balls already in the tank. */
  autoshot(): void {
    this.start();
    const spots: Array<[number, number, TierId]> = [
      [-2.6, 1.2, 1],
      [-0.9, 1.3, 2],
      [1.1, 1.4, 3],
      [2.8, 1.2, 1],
      [-1.8, 2.6, 2],
      [0.4, 2.7, 4],
      [-1.2, DROP.y, 2],
      [1.6, DROP.y, 3],
    ];
    for (const [x, y, tier] of spots) {
      const ball = new Ball(this.scene, tier, new Vector3(x, y, 0));
      ball.enablePhysics(this.scene, 0);
      this.balls.push(ball);
      this.register(ball);
    }
  }

  /** Spawn balls at DROP.y with physics so a headless shot can prove they fall. */
  autoshotDrop(): void {
    this.start();
    const spots: Array<[number, TierId]> = [
      [-1.5, 2],
      [1.3, 3],
    ];
    for (const [x, tier] of spots) {
      const ball = new Ball(this.scene, tier, new Vector3(x, DROP.y, 0));
      ball.enablePhysics(this.scene, 0);
      this.balls.push(ball);
      this.register(ball);
    }
  }
}
