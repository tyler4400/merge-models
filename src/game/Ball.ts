/** Flat 2D token disc + agent icon. Havok sphere is invisible; collision/spin unchanged. */
import { Color3, Quaternion, Vector3 } from "@babylonjs/core/Maths/math";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PHYS } from "./constants";
import { tuneBallBody } from "./physics";
import { TIERS, getTier, type TierId } from "./tiers";

let nextId = 1;
const tokenCache = new Map<string, DynamicTexture>();
const iconImages = new Map<number, HTMLImageElement>();

/** 1–2 matte (A), 3–4 jelly (B). Higher tiers stay matte until a style is picked. */
function tokenStyle(tier: TierId): "matte" | "jelly" {
  return tier === 3 || tier === 4 ? "jelly" : "matte";
}

function isPhoto(tier: TierId): boolean {
  return tier === 1 || tier === 10;
}

function knockOutDarkBackdrop(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  const dark = (i: number): boolean => d[i] < 40 && d[i + 1] < 40 && d[i + 2] < 40 && d[i + 3] > 10;
  const trans = (i: number): boolean => d[i + 3] < 10;
  const seen = new Uint8Array(size * size);
  const stack: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = y * size + x;
      const i = p * 4;
      if (!dark(i)) continue;
      const edge =
        x === 0 ||
        y === 0 ||
        x === size - 1 ||
        y === size - 1 ||
        (x > 0 && trans((p - 1) * 4)) ||
        (x < size - 1 && trans((p + 1) * 4)) ||
        (y > 0 && trans((p - size) * 4)) ||
        (y < size - 1 && trans((p + size) * 4));
      if (edge) stack.push(p);
    }
  }
  if (!stack.length) return;
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (!dark(i)) continue;
    d[i + 3] = 0;
    const x = p % size;
    const y = (p / size) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < size - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - size);
    if (y < size - 1) stack.push(p + size);
  }
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < 56 && d[i + 1] < 56 && d[i + 2] < 56) d[i + 3] = 0;
  }
  ctx.putImageData(img, 0, 0);
}

function rgb(t: [number, number, number]): string {
  const h = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255);
  return `rgb(${h(t[0])},${h(t[1])},${h(t[2])})`;
}

function paintToken(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  size: number,
  tint: [number, number, number],
  style: "matte" | "jelly",
  photo: boolean,
): void {
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (style === "jelly") {
    const g = ctx.createRadialGradient(cx - R * 0.18, cy - R * 0.22, R * 0.08, cx, cy, R);
    g.addColorStop(0, rgb([Math.min(1, tint[0] + 0.28), Math.min(1, tint[1] + 0.22), Math.min(1, tint[2] + 0.18)]));
    g.addColorStop(0.55, rgb(tint));
    g.addColorStop(1, rgb([tint[0] * 0.72, tint[1] * 0.72, tint[2] * 0.72]));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = rgb(tint);
  }
  ctx.fillRect(0, 0, size, size);

  ctx.beginPath();
  ctx.ellipse(cx - R * 0.18, cy - R * 0.32, R * 0.42, R * 0.22, -0.35, 0, Math.PI * 2);
  ctx.fillStyle = style === "jelly" ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.16)";
  ctx.fill();

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (iw >= 1 && ih >= 1) {
    const src = Math.min(iw, ih);
    const sx = (iw - src) / 2;
    const sy = (ih - src) / 2;
    if (photo) {
      const box = R * 2 * 0.9;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, box / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, sx, sy, src, src, cx - box / 2, cy - box / 2, box, box);
      ctx.restore();
    } else {
      const box = R * 2 * 0.62;
      ctx.drawImage(img, sx, sy, src, src, cx - box / 2, cy - box / 2, box, box);
      knockOutDarkBackdrop(ctx, size);
    }
  }
  ctx.restore();
}

function ensureImage(tier: TierId, url: string): HTMLImageElement {
  const hit = iconImages.get(tier);
  if (hit) return hit;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  iconImages.set(tier, img);
  return img;
}

function tokenTexture(scene: Scene, tier: TierId): DynamicTexture {
  const style = tokenStyle(tier);
  const key = `${tier}-${style}`;
  const hit = tokenCache.get(key);
  if (hit) return hit;
  const def = getTier(tier);
  const size = 512;
  const tex = new DynamicTexture(`token-${key}`, { width: size, height: size }, scene, true);
  tex.hasAlpha = true;
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  tex.update();

  const img = ensureImage(tier, def.iconUrl);
  const draw = (): void => {
    paintToken(ctx, img, size, def.tint, style, isPhoto(tier));
    tex.update();
  };
  if (img.complete && img.naturalWidth > 0) draw();
  else img.addEventListener("load", draw, { once: true });

  tokenCache.set(key, tex);
  return tex;
}

export function preloadBallIcons(scene: Scene): Promise<void> {
  const jobs = TIERS.map((def) => {
    tokenTexture(scene, def.id);
    const img = iconImages.get(def.id);
    if (!img) return Promise.resolve();
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => resolve(), { once: true });
    });
  });
  return Promise.all(jobs).then(() => undefined);
}

function discMat(scene: Scene, tier: TierId, id: number): StandardMaterial {
  const tex = tokenTexture(scene, tier);
  const m = new StandardMaterial(`token-mat-${id}`, scene);
  m.diffuseTexture = tex;
  m.emissiveTexture = tex;
  m.emissiveColor = new Color3(1, 1, 1);
  m.diffuseColor = new Color3(1, 1, 1);
  m.specularColor = new Color3(0, 0, 0);
  m.disableLighting = true;
  m.backFaceCulling = false;
  m.useAlphaFromDiffuseTexture = true;
  m.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  m.needDepthPrePass = true;
  return m;
}

export class Ball {
  readonly id: number;
  readonly tier: TierId;
  readonly radius: number;
  readonly mass: number;
  /** Invisible Havok sphere. Game still drives this node. */
  readonly mesh: Mesh;
  /** Facing-camera 2D token. Aliased as face/core/glint for old callers. */
  readonly disc: Mesh;
  readonly core: Mesh;
  readonly face: Mesh;
  readonly glint: Mesh;
  aggregate: PhysicsAggregate | null = null;
  merging = false;
  held = false;
  settleClock = 0;
  failClock = 0;
  unrestClock = 0;
  dropAge = 0;
  /** In-plane spin shown on the disc; physics angular velocity is unchanged. */
  private spin = 0;

  constructor(scene: Scene, tier: TierId, pos: Vector3) {
    const def = getTier(tier);
    this.id = nextId++;
    this.tier = tier;
    this.radius = def.radius;
    this.mass = def.mass;
    const r = def.radius;

    const mesh = MeshBuilder.CreateSphere(
      `ball-${this.id}`,
      { diameter: r * 2, segments: 16 },
      scene,
    );
    mesh.position.copyFrom(pos);
    mesh.isPickable = true;
    mesh.metadata = { ballId: this.id };
    mesh.visibility = 0;
    mesh.isVisible = true;
    mesh.renderingGroupId = 0;
    this.mesh = mesh;

    const disc = MeshBuilder.CreateDisc(
      `token-${this.id}`,
      { radius: r, tessellation: 48 },
      scene,
    );
    disc.parent = mesh;
    disc.material = discMat(scene, tier, this.id);
    disc.isPickable = false;
    disc.renderingGroupId = 1;
    disc.visibility = 1;
    this.disc = disc;
    this.face = disc;
    this.core = disc;
    this.glint = disc;
  }

  /** Keep the token facing the camera; roll the icon with the sphere's Z spin. */
  syncVisual(dt: number): void {
    const body = this.aggregate?.body;
    if (body) {
      this.spin += body.getAngularVelocity().z * dt;
    }
    const q = this.mesh.rotationQuaternion;
    const zSpin = Quaternion.RotationAxis(Axis.Z, this.spin);
    if (q) {
      this.disc.rotationQuaternion = q.clone().invert().multiply(zSpin);
    } else {
      this.disc.rotation.set(-this.mesh.rotation.x, -this.mesh.rotation.y, this.spin);
    }
  }

  enablePhysics(scene: Scene, spin = 1): void {
    if (this.aggregate) return;
    const agg = new PhysicsAggregate(
      this.mesh,
      PhysicsShapeType.SPHERE,
      {
        mass: this.mass,
        friction: PHYS.ballFriction,
        restitution: PHYS.ballRestitution,
        radius: this.radius,
      },
      scene,
    );
    tuneBallBody(agg.body);
    this.aggregate = agg;
    this.held = false;
    this.dropAge = 0;
    this.nudgeSpin(spin);
  }

  nudgeSpin(scale = 1): void {
    const body = this.aggregate?.body;
    if (!body) return;
    body.setAngularVelocity(
      new Vector3(
        (Math.random() - 0.5) * 10 * scale,
        (Math.random() - 0.5) * 7 * scale,
        (Math.random() - 0.5) * 10 * scale,
      ),
    );
  }

  applyPop(impulseY: number): void {
    const body = this.aggregate?.body;
    if (!body) return;
    const p = this.mesh.getAbsolutePosition();
    body.applyImpulse(new Vector3(0, impulseY * this.mass, 0), p);
    const side = (Math.random() - 0.5) * 1.4 * this.mass;
    body.applyImpulse(new Vector3(side, 0, 0), p);
    this.nudgeSpin(1.4);
  }

  get body() {
    return this.aggregate?.body ?? null;
  }

  topY(): number {
    return this.mesh.position.y + this.radius;
  }

  setLogoVisible(v: number): void {
    this.disc.visibility = v;
  }

  dispose(): void {
    this.merging = true;
    this.aggregate?.dispose();
    this.aggregate = null;
    this.disc.dispose();
    this.mesh.dispose();
  }
}
