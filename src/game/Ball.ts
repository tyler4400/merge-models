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

/** Punch near-black that touches transparent (clip edge), so K/ChatGPT glyphs sit on glass. */
function knockOutDarkBackdrop(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  const dark = (i: number): boolean => d[i] < 22 && d[i + 1] < 22 && d[i + 2] < 22 && d[i + 3] > 10;
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
  m.roughness = 0.2;
  m.indexOfRefraction = 1.5;
  m.alpha = 1;
  m.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
  m.subSurface.isRefractionEnabled = false;
  m.clearCoat.isEnabled = true;
  m.clearCoat.intensity = 0.72;
  m.clearCoat.roughness = 0.08;
  m.environmentIntensity = 0.22;
  m.directIntensity = 0.18;
  m.emissiveColor = tint.scale(0.82);
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
  dm.transparencyMode = StandardMaterial.MATERIAL_ALPHATESTANDBLEND;
  dm.alphaCutOff = 0.18;
  dm.disableDepthWrite = false;
  dm.zOffset = -4;
  return dm;
}

function stampLogo(mesh: Mesh, name: string, radius: number, toward: Vector3, mat: StandardMaterial): Mesh {
  const s = radius * 1.2;
  const decal = MeshBuilder.CreateDecal(name, mesh, {
    position: toward.scale(radius),
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
      { diameter: def.radius * 0.28, segments: 10 },
      scene,
    );
    glint.parent = mesh;
    glint.position.set(def.radius * 0.22, def.radius * 0.38, def.radius * 0.78);
    const gm = new StandardMaterial(`glint-mat-${this.id}`, scene);
    gm.disableLighting = true;
    gm.emissiveColor = new Color3(1, 1, 1);
    gm.diffuseColor = new Color3(0, 0, 0);
    gm.alpha = 0.45;
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
