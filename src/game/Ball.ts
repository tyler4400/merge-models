/** Glass orb: refractive shell + inner core + curved icon (no flat disc). */
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
import { getTier, type TierId } from "./tiers";

let nextId = 1;
const iconCache = new Map<number, DynamicTexture>();

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

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    ctx.clearRect(0, 0, size, size);
    const pad = 28;
    const box = size - pad * 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, box / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fill();
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const src = Math.min(iw, ih);
    const sx = (iw - src) / 2;
    const sy = (ih - src) / 2;
    ctx.drawImage(img, sx, sy, src, src, pad, pad, box, box);
    ctx.restore();
    tex.update();
  };
  img.src = def.iconUrl;
  iconCache.set(tier, tex);
  return tex;
}

function glassMat(scene: Scene, tier: TierId, id: number): PBRMaterial {
  const def = getTier(tier);
  const tint = new Color3(def.tint[0], def.tint[1], def.tint[2]);
  const m = new PBRMaterial(`glass-${id}`, scene);
  m.albedoColor = Color3.Lerp(new Color3(0.65, 0.82, 1), tint, 0.85);
  m.metallic = 0;
  m.roughness = 0.05;
  m.indexOfRefraction = 1.52;
  m.alpha = 0.22;
  m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  m.subSurface.isRefractionEnabled = true;
  m.subSurface.refractionIntensity = 0.45;
  m.subSurface.indexOfRefraction = 1.52;
  m.subSurface.tintColor = Color3.Lerp(new Color3(0.92, 0.96, 1), tint, 0.7);
  m.clearCoat.isEnabled = true;
  m.clearCoat.intensity = 0.9;
  m.clearCoat.roughness = 0.06;
  m.environmentIntensity = 1.15;
  m.emissiveColor = tint.scale(0.28);
  m.backFaceCulling = false;
  return m;
}

function coreMat(scene: Scene, tier: TierId, id: number): StandardMaterial {
  const def = getTier(tier);
  const tint = new Color3(def.tint[0], def.tint[1], def.tint[2]);
  const m = new StandardMaterial(`core-${id}`, scene);
  m.disableLighting = true;
  m.emissiveColor = tint;
  m.diffuseColor = tint;
  m.specularColor = new Color3(0, 0, 0);
  return m;
}

export class Ball {
  readonly id: number;
  readonly tier: TierId;
  readonly radius: number;
  readonly mass: number;
  readonly mesh: Mesh;
  /** Curved icon on the camera-facing side. Kept as `face` for Game.ts. */
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
      { diameter: def.radius * 2 * 0.9, segments: 24 },
      scene,
    );
    core.parent = mesh;
    core.position.set(0, 0, 0);
    core.material = coreMat(scene, tier, this.id);
    core.isPickable = false;
    this.core = core;

    const face = MeshBuilder.CreatePlane("face-" + String(this.id), { size: def.radius * 1.15 }, scene);
    face.parent = mesh;
    face.position.set(0, 0, def.radius * 0.86);
    const dm = new StandardMaterial("face-mat-" + String(this.id), scene);
    const tex = iconTexture(scene, tier);
    dm.diffuseTexture = tex;
    dm.opacityTexture = tex;
    dm.emissiveTexture = tex;
    dm.emissiveColor = new Color3(1, 1, 1);
    dm.specularColor = new Color3(0, 0, 0);
    dm.backFaceCulling = false;
    dm.useAlphaFromDiffuseTexture = true;
    dm.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
    face.material = dm;
    face.isPickable = false;
    this.face = face;

    const glint = MeshBuilder.CreateSphere(
      `glint-${this.id}`,
      { diameter: def.radius * 0.42, segments: 10 },
      scene,
    );
    glint.parent = mesh;
    glint.position.set(def.radius * 0.42, def.radius * 0.38, def.radius * 0.18);
    const gm = new StandardMaterial(`glint-mat-${this.id}`, scene);
    gm.disableLighting = true;
    gm.emissiveColor = new Color3(1, 1, 1);
    gm.diffuseColor = new Color3(0, 0, 0);
    gm.alpha = 0.22;
    gm.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
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
