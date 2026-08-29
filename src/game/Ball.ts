/** Glass marble: tinted shell + inner core + logos as surface decals that roll with the ball. */
import { Color3, Vector3 } from "@babylonjs/core/Maths/math";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import "@babylonjs/core/Materials/PBR/pbrSubSurfaceConfiguration";
import "@babylonjs/core/Materials/PBR/pbrClearCoatConfiguration";
import { PHYS } from "./constants";
import { tuneBallBody } from "./physics";
import { TIERS, getTier, type TierId } from "./tiers";

let nextId = 1;
const iconCache = new Map<number, DynamicTexture>();
const iconImages = new Map<number, HTMLImageElement>();

function paintIcon(ctx: CanvasRenderingContext2D, img: HTMLImageElement, size: number): void {
  ctx.clearRect(0, 0, size, size);
  const pad = 8;
  const box = size - pad * 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, box / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (iw < 1 || ih < 1) {
    ctx.restore();
    return;
  }
  const src = Math.min(iw, ih);
  const sx = (iw - src) / 2;
  const sy = (ih - src) / 2;
  ctx.drawImage(img, sx, sy, src, src, pad, pad, box, box);
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

function iconTexture(scene: Scene, tier: TierId): DynamicTexture {
  const hit = iconCache.get(tier);
  if (hit) return hit;
  const def = getTier(tier);
  const size = 512;
  const tex = new DynamicTexture(`icon-${tier}`, { width: size, height: size }, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  tex.update();

  const img = ensureImage(tier, def.iconUrl);
  const draw = (): void => {
    paintIcon(ctx, img, size);
    tex.update();
  };
  if (img.complete && img.naturalWidth > 0) draw();
  else img.addEventListener("load", draw, { once: true });

  iconCache.set(tier, tex);
  return tex;
}

/** Decode every logo before the first ball is spawned so autoshot / first drop is not empty. */
export function preloadBallIcons(scene: Scene): Promise<void> {
  const jobs = TIERS.map((def) => {
    iconTexture(scene, def.id);
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

function glassMat(scene: Scene, tier: TierId, id: number): PBRMaterial {
  const def = getTier(tier);
  const tint = new Color3(def.tint[0], def.tint[1], def.tint[2]);
  const m = new PBRMaterial(`glass-${id}`, scene);
  m.albedoColor = tint;
  m.metallic = 0;
  m.roughness = 0.14;
  m.indexOfRefraction = 1.5;
  m.alpha = 1;
  m.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
  m.subSurface.isRefractionEnabled = false;
  m.clearCoat.isEnabled = true;
  m.clearCoat.intensity = 1;
  m.clearCoat.roughness = 0.05;
  m.environmentIntensity = 1.15;
  m.emissiveColor = tint.scale(0.32);
  m.backFaceCulling = true;
  return m;
}

function coreMat(scene: Scene, tier: TierId, id: number): StandardMaterial {
  const def = getTier(tier);
  const tint = new Color3(def.tint[0], def.tint[1], def.tint[2]);
  const m = new StandardMaterial(`core-${id}`, scene);
  m.disableLighting = true;
  m.emissiveColor = tint.scale(0.92);
  m.diffuseColor = tint;
  m.specularColor = new Color3(0, 0, 0);
  return m;
}

function logoMat(scene: Scene, tier: TierId, id: number): StandardMaterial {
  const dm = new StandardMaterial("face-mat-" + String(id), scene);
  const tex = iconTexture(scene, tier);
  dm.diffuseTexture = tex;
  dm.opacityTexture = tex;
  dm.emissiveTexture = tex;
  dm.emissiveColor = new Color3(1, 1, 1);
  dm.specularColor = new Color3(0, 0, 0);
  dm.disableLighting = true;
  dm.backFaceCulling = true;
  dm.useAlphaFromDiffuseTexture = true;
  dm.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  dm.disableDepthWrite = false;
  dm.alphaCutOff = 0.12;
  dm.zOffset = -2;
  return dm;
}

function stampLogo(mesh: Mesh, name: string, radius: number, toward: Vector3, mat: StandardMaterial): Mesh {
  const s = radius * 1.16;
  const decal = MeshBuilder.CreateDecal(name, mesh, {
    position: toward.scale(radius * 0.98),
    normal: toward,
    size: new Vector3(s, s, s),
    localMode: true,
    cullBackFaces: true,
  });
  decal.material = mat;
  decal.isPickable = false;
  return decal;
}

export class Ball {
  readonly id: number;
  readonly tier: TierId;
  readonly radius: number;
  readonly mass: number;
  readonly mesh: Mesh;
  /** Surface decal. Kept as `face` for Game.ts ghost. */
  readonly face: Mesh;
  readonly core: Mesh;
  readonly glint: Mesh;
  aggregate: PhysicsAggregate | null = null;
  merging = false;
  held = false;
  settleClock = 0;
  failClock = 0;
  unrestClock = 0;

  constructor(scene: Scene, tier: TierId, pos: Vector3) {
    const def = getTier(tier);
    this.id = nextId++;
    this.tier = tier;
    this.radius = def.radius;
    this.mass = def.mass;

    const mesh = MeshBuilder.CreateSphere(
      `ball-${this.id}`,
      { diameter: def.radius * 2, segments: 32 },
      scene,
    );
    mesh.position.copyFrom(pos);
    mesh.material = glassMat(scene, tier, this.id);
    mesh.isPickable = true;
    mesh.metadata = { ballId: this.id };
    this.mesh = mesh;

    const core = MeshBuilder.CreateSphere(
      `core-${this.id}`,
      { diameter: def.radius * 2 * 0.96, segments: 24 },
      scene,
    );
    core.parent = mesh;
    core.position.set(0, 0, 0);
    core.material = coreMat(scene, tier, this.id);
    core.isPickable = false;
    this.core = core;

    const dm = logoMat(scene, tier, this.id);
    const dirs: Array<[string, Vector3]> = [
      ["z", new Vector3(0, 0, 1)],
      ["zb", new Vector3(0, 0, -1)],
      ["x", new Vector3(1, 0, 0)],
      ["xb", new Vector3(-1, 0, 0)],
      ["y", new Vector3(0, 1, 0)],
      ["yb", new Vector3(0, -1, 0)],
    ];
    const face = stampLogo(mesh, "face-" + String(this.id), def.radius, dirs[0][1], dm);
    for (const [tag, dir] of dirs.slice(1)) {
      stampLogo(mesh, "face-" + tag + "-" + String(this.id), def.radius, dir, dm);
    }
    this.face = face;

    const glint = MeshBuilder.CreateSphere(
      `glint-${this.id}`,
      { diameter: def.radius * 0.38, segments: 10 },
      scene,
    );
    glint.parent = mesh;
    glint.position.set(def.radius * 0.22, def.radius * 0.38, def.radius * 0.78);
    const gm = new StandardMaterial(`glint-mat-${this.id}`, scene);
    gm.disableLighting = true;
    gm.emissiveColor = new Color3(1, 1, 1);
    gm.diffuseColor = new Color3(0, 0, 0);
    gm.alpha = 0.55;
    gm.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
    gm.disableDepthWrite = true;
    glint.material = gm;
    glint.isPickable = false;
    this.glint = glint;
  }

  enablePhysics(scene: Scene): void {
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
    this.nudgeSpin();
  }

  /** Random tumble so collisions read as glass orbs, not coins. */
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
    this.face.visibility = v;
    for (const c of this.mesh.getChildMeshes()) {
      if (c.name.startsWith("face")) c.visibility = v;
    }
  }

  dispose(): void {
    this.merging = true;
    this.aggregate?.dispose();
    this.aggregate = null;
    this.face.dispose();
    this.glint.dispose();
    this.core.dispose();
    this.mesh.dispose();
  }
}
