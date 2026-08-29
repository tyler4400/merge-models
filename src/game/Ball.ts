/** Glass PBR sphere + official icon / short name on the surface. */
import { Color3, Vector3 } from "@babylonjs/core/Maths/math";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PHYS } from "./constants";
import { tuneBallBody } from "./physics";
import { getTier, type TierId } from "./tiers";

let nextId = 1;
const faceCache = new Map<number, DynamicTexture>();

function faceTexture(scene: Scene, tier: TierId): DynamicTexture {
  const hit = faceCache.get(tier);
  if (hit) return hit;
  const def = getTier(tier);
  const size = 512;
  const tex = new DynamicTexture(`face-${tier}`, { width: size, height: size }, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    ctx.clearRect(0, 0, size, size);
    const pad = 36;
    const iconBox = size - pad * 2 - 72;
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, pad + iconBox / 2, iconBox / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const src = Math.min(iw, ih);
    const sx = (iw - src) / 2;
    const sy = (ih - src) / 2;
    ctx.drawImage(img, sx, sy, src, src, pad, pad, iconBox, iconBox);
    ctx.restore();

    ctx.font = "700 54px 'PingFang SC','Noto Sans SC',system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(20,12,8,0.65)";
    ctx.fillStyle = "#f4e7d4";
    const nameY = size - 48;
    ctx.strokeText(def.name, size / 2, nameY);
    ctx.fillText(def.name, size / 2, nameY);
    tex.update();
  };
  img.src = def.iconUrl;

  faceCache.set(tier, tex);
  return tex;
}

function glassMat(scene: Scene, tier: TierId): PBRMaterial {
  const def = getTier(tier);
  const m = new PBRMaterial(`glass-${tier}-${nextId}`, scene);
  m.albedoColor = new Color3(def.tint[0], def.tint[1], def.tint[2]);
  m.metallic = 0.04;
  m.roughness = 0.09;
  m.indexOfRefraction = 1.5;
  m.alpha = 0.38;
  m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  m.subSurface.isRefractionEnabled = true;
  m.subSurface.refractionIntensity = 0.45;
  m.subSurface.tintColor = new Color3(def.tint[0], def.tint[1], def.tint[2]);
  m.emissiveColor = new Color3(def.tint[0], def.tint[1], def.tint[2]).scale(0.1);
  m.environmentIntensity = 0.55;
  return m;
}

export class Ball {
  readonly id: number;
  readonly tier: TierId;
  readonly radius: number;
  readonly mass: number;
  readonly mesh: Mesh;
  readonly face: Mesh;
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
      { diameter: def.radius * 2, segments: 24 },
      scene,
    );
    mesh.position.copyFrom(pos);
    mesh.material = glassMat(scene, tier);
    mesh.isPickable = true;
    mesh.metadata = { ballId: this.id };
    this.mesh = mesh;

    const face = MeshBuilder.CreateDisc(
      `face-${this.id}`,
      { radius: def.radius * 0.78, tessellation: 40 },
      scene,
    );
    face.parent = mesh;
    face.position.set(0, 0, def.radius * 0.78);
    const fm = new StandardMaterial(`face-mat-${this.id}`, scene);
    const tex = faceTexture(scene, tier);
    fm.diffuseTexture = tex;
    fm.opacityTexture = tex;
    fm.emissiveTexture = tex;
    fm.emissiveColor = new Color3(0.55, 0.5, 0.44);
    fm.specularColor = new Color3(0, 0, 0);
    fm.backFaceCulling = false;
    fm.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
    face.material = fm;
    face.isPickable = false;
    this.face = face;
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
  }

  applyPop(impulseY: number): void {
    const body = this.aggregate?.body;
    if (!body) return;
    const p = this.mesh.getAbsolutePosition();
    body.applyImpulse(new Vector3(0, impulseY * this.mass, 0), p);
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
    this.mesh.dispose();
  }
}
