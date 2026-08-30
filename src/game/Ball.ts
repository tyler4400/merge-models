/** Whisper-tinted glass shell; a distinct 3D core sits in the geometric center with the icon on it. */
import { Color3, Vector3 } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { FresnelParameters } from "@babylonjs/core/Materials/fresnelParameters";
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
const iconCache = new Map<number, DynamicTexture>();
const iconImages = new Map<number, HTMLImageElement>();

/** Inner figurine ~ half the marble, so glass thickness reads around it. */
const CORE_RATIO = 0.5;

/** Punch near-black that touches transparent (clip edge), so K/ChatGPT glyphs sit on the marble. */
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
  knockOutDarkBackdrop(ctx, size);
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
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  tex.vScale = -1;
  tex.vOffset = 1;
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

function tintOf(tier: TierId): Color3 {
  const t = getTier(tier).tint;
  return new Color3(t[0], t[1], t[2]);
}

/** Saturated figurine — identity even with the logo ignored. */
function coreMat(scene: Scene, tier: TierId, id: number): StandardMaterial {
  const tint = tintOf(tier);
  const m = new StandardMaterial(`core-${id}`, scene);
  m.diffuseColor = tint;
  m.emissiveColor = tint.scale(0.42);
  m.specularColor = new Color3(0.55, 0.5, 0.4);
  m.specularPower = 48;
  m.alpha = 1;
  m.transparencyMode = StandardMaterial.MATERIAL_OPAQUE;
  m.backFaceCulling = true;
  m.disableLighting = false;
  return m;
}

/**
 * Whisper-tinted crystal. StandardMaterial + opacity Fresnel (not PBR refraction)
 * so the rim stays visible on mobile while the center stays see-through.
 */
function glassMat(scene: Scene, tier: TierId, id: number): StandardMaterial {
  const tint = tintOf(tier);
  const pale = Color3.Lerp(tint, new Color3(1, 1, 1), 0.78);
  const m = new StandardMaterial(`glass-${id}`, scene);
  m.diffuseColor = pale;
  m.emissiveColor = tint.scale(0.08);
  m.specularColor = new Color3(1, 1, 1);
  m.specularPower = 128;
  m.alpha = 0.16;
  m.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  m.needDepthPrePass = true;
  m.backFaceCulling = false;
  m.separateCullingPass = true;
  m.disableLighting = false;
  const op = new FresnelParameters();
  op.isEnabled = true;
  op.power = 2.4;
  op.bias = 0.08;
  op.leftColor = new Color3(1, 1, 1);
  op.rightColor = new Color3(0.04, 0.04, 0.04);
  m.opacityFresnelParameters = op;
  const em = new FresnelParameters();
  em.isEnabled = true;
  em.power = 1.8;
  em.bias = 0.1;
  em.leftColor = new Color3(0.92, 0.96, 1);
  em.rightColor = tint.scale(0.06);
  m.emissiveFresnelParameters = em;
  return m;
}

function logoMat(scene: Scene, tier: TierId, id: number): StandardMaterial {
  const dm = new StandardMaterial("face-mat-" + String(id), scene);
  const tex = iconTexture(scene, tier);
  dm.diffuseTexture = tex;
  dm.emissiveTexture = tex;
  dm.emissiveColor = new Color3(1, 1, 1);
  dm.zOffset = -2;
  dm.diffuseColor = new Color3(1, 1, 1);
  dm.specularColor = new Color3(0, 0, 0);
  dm.disableLighting = true;
  dm.backFaceCulling = true;
  dm.useAlphaFromDiffuseTexture = true;
  dm.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  dm.needDepthPrePass = true;
  return dm;
}

function backingMat(scene: Scene, tier: TierId, id: number): StandardMaterial {
  const tint = tintOf(tier);
  const m = new StandardMaterial("back-mat-" + String(id), scene);
  m.diffuseColor = Color3.Lerp(tint, new Color3(1, 1, 1), 0.28);
  m.emissiveColor = tint.scale(0.35);
  m.specularColor = new Color3(0.2, 0.2, 0.2);
  m.specularPower = 32;
  m.alpha = 1;
  m.transparencyMode = StandardMaterial.MATERIAL_OPAQUE;
  m.backFaceCulling = true;
  return m;
}

function glintMat(scene: Scene, id: number): StandardMaterial {
  const gm = new StandardMaterial(`glint-mat-${id}`, scene);
  gm.disableLighting = true;
  gm.emissiveColor = new Color3(1, 1, 1);
  gm.diffuseColor = new Color3(1, 1, 1);
  gm.specularColor = new Color3(0, 0, 0);
  gm.alpha = 0.7;
  gm.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  gm.disableDepthWrite = true;
  return gm;
}

/** Unique inner silhouette per tier, fitted inside a sphere of radius coreR. */
function innerCore(scene: Scene, id: number, tier: TierId, coreR: number): { mesh: Mesh; faceZ: number } {
  const name = `core-${id}`;
  let mesh: Mesh;
  switch (tier) {
    case 1:
      mesh = MeshBuilder.CreateSphere(name, { diameter: 2, segments: 24 }, scene);
      break;
    case 2:
      mesh = MeshBuilder.CreateBox(name, { width: 2.35, height: 0.92, depth: 1.35 }, scene);
      break;
    case 3: {
      mesh = MeshBuilder.CreateCylinder(
        name,
        { height: 1.2, diameter: 2, tessellation: 6 },
        scene,
      );
      mesh.rotation.x = Math.PI / 2;
      break;
    }
    case 4:
      mesh = MeshBuilder.CreateCapsule(name, { height: 2.2, radius: 0.6, tessellation: 12 }, scene);
      break;
    case 5:
      mesh = MeshBuilder.CreateIcoSphere(name, { radius: 1, subdivisions: 1 }, scene);
      break;
    case 6:
      mesh = MeshBuilder.CreatePolyhedron(name, { type: 1, size: 1 }, scene);
      break;
    case 7:
      mesh = MeshBuilder.CreateTorus(
        name,
        { diameter: 1.6, thickness: 0.52, tessellation: 28 },
        scene,
      );
      mesh.rotation.x = Math.PI / 2;
      break;
    case 8:
      mesh = MeshBuilder.CreateCylinder(
        name,
        { height: 1.75, diameter: 1.5, tessellation: 24 },
        scene,
      );
      break;
    case 9:
      mesh = MeshBuilder.CreateCylinder(
        name,
        { height: 2.05, diameterTop: 0.08, diameterBottom: 1.9, tessellation: 24 },
        scene,
      );
      break;
    default:
      mesh = MeshBuilder.CreateBox(name, { width: 1.5, height: 1.7, depth: 1.35 }, scene);
      break;
  }
  mesh.computeWorldMatrix(true);
  const br = mesh.getBoundingInfo().boundingSphere.radius;
  if (br > 1e-6) mesh.scaling.scaleInPlace(coreR / br);
  mesh.computeWorldMatrix(true);
  const faceZ = Math.abs(mesh.getBoundingInfo().boundingBox.extendSize.z) * Math.abs(mesh.scaling.z);
  return { mesh, faceZ: Math.max(faceZ, coreR * 0.32) };
}

function coreCap(
  scene: Scene,
  name: string,
  radius: number,
  z: number,
  zSign: number,
  mat: StandardMaterial,
): Mesh {
  const disc = MeshBuilder.CreateDisc(name, { radius, tessellation: 48 }, scene);
  disc.material = mat;
  disc.isPickable = false;
  disc.billboardMode = 0;
  disc.position.z = zSign * z;
  disc.rotation.y = zSign < 0 ? Math.PI : 0;
  disc.renderingGroupId = 0;
  return disc;
}

export class Ball {
  readonly id: number;
  readonly tier: TierId;
  readonly radius: number;
  readonly mass: number;
  /** Outer glass shell — Havok sphere is attached here. */
  readonly mesh: Mesh;
  readonly core: Mesh;
  /** Front (+Z) inner logo, on the figurine, behind the glass. */
  readonly face: Mesh;
  readonly glint: Mesh;
  aggregate: PhysicsAggregate | null = null;
  merging = false;
  held = false;
  settleClock = 0;
  failClock = 0;
  unrestClock = 0;
  dropAge = 0;

  constructor(scene: Scene, tier: TierId, pos: Vector3) {
    const def = getTier(tier);
    this.id = nextId++;
    this.tier = tier;
    this.radius = def.radius;
    this.mass = def.mass;
    const r = def.radius;
    const coreR = r * CORE_RATIO;

    const mesh = MeshBuilder.CreateSphere(
      `ball-${this.id}`,
      { diameter: r * 2, segments: 32 },
      scene,
    );
    mesh.position.copyFrom(pos);
    mesh.material = glassMat(scene, tier, this.id);
    mesh.isPickable = true;
    mesh.metadata = { ballId: this.id };
    mesh.visibility = 1;
    mesh.renderingGroupId = 1;
    this.mesh = mesh;

    const inner = innerCore(scene, this.id, tier, coreR);
    inner.mesh.parent = mesh;
    inner.mesh.material = coreMat(scene, tier, this.id);
    inner.mesh.isPickable = false;
    inner.mesh.renderingGroupId = 0;
    this.core = inner.mesh;

    const bm = backingMat(scene, tier, this.id);
    const dm = logoMat(scene, tier, this.id);
    const logoR = coreR * 0.72;
    const faceZ = inner.faceZ * 1.04;
    coreCap(scene, "back-" + String(this.id), logoR, faceZ, 1, bm).parent = mesh;
    coreCap(scene, "back-zb-" + String(this.id), logoR, faceZ, -1, bm).parent = mesh;
    const face = coreCap(scene, "face-" + String(this.id), logoR, faceZ, 1, dm);
    face.parent = mesh;
    coreCap(scene, "face-zb-" + String(this.id), logoR, faceZ, -1, dm).parent = mesh;
    this.face = face;

    const glint = MeshBuilder.CreateSphere(
      `glint-${this.id}`,
      { diameter: r * 0.11, segments: 8 },
      scene,
    );
    glint.parent = mesh;
    glint.position.set(r * -0.22, r * 0.38, r * 0.82);
    glint.material = glintMat(scene, this.id);
    glint.isPickable = false;
    glint.renderingGroupId = 1;
    this.glint = glint;
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
    this.core.visibility = v;
    for (const c of this.mesh.getChildMeshes()) {
      if (c.name.startsWith("face") || c.name.startsWith("back")) c.visibility = v;
    }
  }

  dispose(): void {
    this.merging = true;
    this.aggregate?.dispose();
    this.aggregate = null;
    this.face.dispose();
    this.core.dispose();
    this.glint.dispose();
    this.mesh.dispose();
  }
}
