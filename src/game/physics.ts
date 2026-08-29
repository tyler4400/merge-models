/** Havok walls plus a visible glass jar (rim + wooden base) like the ChatGPT mock. */
import { Color3, Vector3 } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { FresnelParameters } from "@babylonjs/core/Materials/fresnelParameters";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { DROP, PHYS, REST, TANK, clamp } from "./constants";

export type ContainerRig = {
  root: Mesh;
  floor: Mesh;
  failLine: Mesh;
};

function wallMat(scene: Scene, name: string, color: Color3, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.specularColor = new Color3(0.95, 0.98, 1);
  m.specularPower = 64;
  m.emissiveColor = color.scale(0.22);
  m.alpha = alpha;
  m.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  m.needDepthPrePass = true;
  m.backFaceCulling = false;
  return m;
}

function boxWall(
  scene: Scene,
  name: string,
  size: Vector3,
  pos: Vector3,
  mat: StandardMaterial,
): Mesh {
  const mesh = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, scene);
  mesh.position.copyFrom(pos);
  mesh.material = mat;
  mesh.isPickable = false;
  new PhysicsAggregate(
    mesh,
    PhysicsShapeType.BOX,
    { mass: 0, friction: PHYS.wallFriction, restitution: PHYS.wallRestitution },
    scene,
  );
  return mesh;
}

/** Camera-facing fill stays faint; grazing tube walls pick up a bright glass edge. */
function tubeGlassMat(scene: Scene, name: string): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = new Color3(0.72, 0.9, 1);
  m.specularColor = new Color3(1, 1, 1);
  m.specularPower = 128;
  m.emissiveColor = new Color3(0.42, 0.62, 0.78);
  m.alpha = 0.16;
  m.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  m.needDepthPrePass = true;
  m.backFaceCulling = false;
  m.opacityFresnelParameters = new FresnelParameters({
    isEnabled: true,
    power: 2.4,
    bias: 0.08,
    leftColor: new Color3(1, 1, 1),
    rightColor: new Color3(0.06, 0.06, 0.06),
  });
  m.emissiveFresnelParameters = new FresnelParameters({
    isEnabled: true,
    power: 2.1,
    bias: 0.12,
    leftColor: new Color3(0.92, 0.98, 1),
    rightColor: new Color3(0.1, 0.16, 0.22),
  });
  return m;
}

function glassSide(scene: Scene, name: string, h: number): Mesh {
  const mesh = MeshBuilder.CreateBox(name, { width: 0.34, height: h * 0.97, depth: 1.35 }, scene);
  const mat = new StandardMaterial(name + "-mat", scene);
  mat.disableLighting = true;
  mat.diffuseColor = new Color3(0.78, 0.93, 1);
  mat.emissiveColor = new Color3(0.7, 0.88, 0.98);
  mat.specularColor = new Color3(0, 0, 0);
  mat.alpha = 0.48;
  mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  mat.needDepthPrePass = true;
  mat.disableDepthWrite = true;
  mat.backFaceCulling = false;
  mesh.material = mat;
  mesh.isPickable = false;
  return mesh;
}

function verticalStreak(scene: Scene, name: string, h: number, width: number, alpha: number): Mesh {
  const mesh = MeshBuilder.CreateBox(name, { width, height: h * 0.9, depth: 0.18 }, scene);
  const mat = new StandardMaterial(name + "-mat", scene);
  mat.disableLighting = true;
  mat.diffuseColor = new Color3(0.9, 0.97, 1);
  mat.emissiveColor = new Color3(0.95, 0.99, 1);
  mat.specularColor = new Color3(0, 0, 0);
  mat.alpha = alpha;
  mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  mat.disableDepthWrite = true;
  mat.backFaceCulling = false;
  mesh.material = mat;
  mesh.isPickable = false;
  return mesh;
}

type WoodKind = "lip" | "base";

function paintWood(ctx: CanvasRenderingContext2D, tw: number, th: number, kind: WoodKind): void {
  ctx.fillStyle = "#4a2a12";
  ctx.fillRect(0, 0, tw, th);
  for (let i = 0; i < 90; i++) {
    const y0 = (i / 90) * th;
    const wobble = Math.sin(i * 1.37) * 5 + Math.sin(i * 0.41) * 9;
    const r = 92 + (i % 9) * 10;
    const g = 52 + (i % 5) * 6;
    const b = 18 + (i % 3) * 4;
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.22 + (i % 4) * 0.05})`;
    ctx.lineWidth = 1.2 + (i % 4);
    ctx.beginPath();
    ctx.moveTo(0, y0 + wobble);
    for (let x = 0; x <= tw; x += 6) {
      const y = y0 + wobble + Math.sin(x * 0.045 + i * 0.7) * 4.5 + Math.sin(x * 0.012 + i) * 10;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let k = 0; k < 5; k++) {
    const kx = 40 + k * 90 + (k % 2) * 20;
    const ky = 30 + (k * 47) % (th - 50);
    ctx.fillStyle = "rgba(30, 14, 6, 0.22)";
    ctx.beginPath();
    ctx.ellipse(kx, ky, 11, 5.5, k * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (kind === "lip") {
    const g = ctx.createLinearGradient(0, 0, 0, th);
    g.addColorStop(0, "rgba(0,0,0,0.5)");
    g.addColorStop(0.16, "rgba(255,220,160,0.34)");
    g.addColorStop(0.38, "rgba(255,255,255,0.1)");
    g.addColorStop(0.62, "rgba(80,40,12,0.08)");
    g.addColorStop(0.86, "rgba(20,10,4,0.28)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, tw, th);
  } else {
    const g = ctx.createLinearGradient(0, 0, tw, 0);
    g.addColorStop(0, "rgba(0,0,0,0.48)");
    g.addColorStop(0.16, "rgba(0,0,0,0.08)");
    g.addColorStop(0.5, "rgba(255,224,170,0.16)");
    g.addColorStop(0.84, "rgba(0,0,0,0.08)");
    g.addColorStop(1, "rgba(0,0,0,0.48)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, tw, th);
    const v = ctx.createLinearGradient(0, 0, 0, th);
    v.addColorStop(0, "rgba(255,210,150,0.18)");
    v.addColorStop(0.45, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, tw, th);
  }
}

function woodMat(scene: Scene, name: string, kind: WoodKind): StandardMaterial {
  const tw = 512;
  const th = kind === "lip" ? 128 : 256;
  const tex = new DynamicTexture(name + "-tex", { width: tw, height: th }, scene, true);
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  paintWood(ctx, tw, th, kind);
  tex.update();
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.diffuseTexture = tex;
  m.emissiveTexture = tex;
  m.emissiveColor = new Color3(1, 1, 1);
  m.specularColor = new Color3(0, 0, 0);
  m.diffuseColor = new Color3(1, 1, 1);
  return m;
}

export function buildContainer(scene: Scene): ContainerRig {
  const w = TANK.innerWidth;
  const h = TANK.innerHeight;
  const d = TANK.innerDepth;
  const t = TANK.wall;
  const midY = h / 2;
  const outerR = (w + t) / 2;

  const physGlass = wallMat(scene, "wall-glass", new Color3(0.78, 0.93, 1), 0.62);
  const floorMat = wallMat(scene, "wall-floor", new Color3(0.78, 0.92, 1), 0.5);
  const back = wallMat(scene, "wall-back", new Color3(0.8, 0.92, 1), 0.16);
  const ghost = wallMat(scene, "wall-front", new Color3(0.85, 0.95, 1), 0.08);

  const rimWood = woodMat(scene, "jar-wood-rim", "lip");
  const baseWood = woodMat(scene, "jar-wood-base", "base");
  const tubeMat = tubeGlassMat(scene, "jar-tube-glass");

  const root = MeshBuilder.CreateBox("container-root", { width: 0.01, height: 0.01, depth: 0.01 }, scene);
  root.isVisible = false;

  const floor = boxWall(scene, "floor", new Vector3(w + t * 2, t, d + t * 2), new Vector3(0, -t / 2, 0), floorMat);
  const left = boxWall(scene, "wall-L", new Vector3(t, h + t, d + t * 2), new Vector3(-w / 2 - t / 2, midY, 0), physGlass);
  const right = boxWall(scene, "wall-R", new Vector3(t, h + t, d + t * 2), new Vector3(w / 2 + t / 2, midY, 0), physGlass);
  const backW = boxWall(scene, "wall-B", new Vector3(w, h + t, t), new Vector3(0, midY, -d / 2 - t / 2), back);
  const front = boxWall(scene, "wall-F", new Vector3(w, h + t, t), new Vector3(0, midY, d / 2 + t / 2), ghost);
  front.visibility = 0;
  left.visibility = 0;
  right.visibility = 0;
  backW.visibility = 0;
  floor.visibility = 0;

  const body = MeshBuilder.CreateTube(
    "jar-body",
    {
      path: [new Vector3(0, 0.06, 0), new Vector3(0, h - 0.05, 0)],
      radius: outerR,
      tessellation: 56,
      cap: 0,
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene,
  );
  body.material = tubeMat;
  body.isPickable = false;

  const inner = MeshBuilder.CreateTube(
    "jar-inner",
    {
      path: [new Vector3(0, 0.1, 0), new Vector3(0, h - 0.08, 0)],
      radius: outerR - 0.2,
      tessellation: 56,
      cap: 0,
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene,
  );
  inner.material = tubeMat;
  inner.isPickable = false;

  const sideL = glassSide(scene, "jar-side-L", h);
  sideL.position.set(-outerR, midY, 0.04);
  const sideR = glassSide(scene, "jar-side-R", h);
  sideR.position.set(outerR, midY, 0.04);

  const rimH = 0.52;
  const rim = MeshBuilder.CreateBox(
    "jar-rim",
    { width: w + t * 2.35, height: rimH, depth: d + t * 2.5 },
    scene,
  );
  rim.position.set(0, h + rimH * 0.28, 0);
  rim.material = rimWood;
  rim.isPickable = false;

  const rimBevel = MeshBuilder.CreateBox(
    "jar-rim-bevel",
    { width: w + t * 2.15, height: rimH * 0.38, depth: d + t * 2.2 },
    scene,
  );
  rimBevel.position.set(0, h + rimH * 0.58, 0.02);
  rimBevel.material = rimWood;
  rimBevel.isPickable = false;

  const base = MeshBuilder.CreateCylinder(
    "jar-base",
    { diameter: w + t * 2.7, height: 0.78, tessellation: 48 },
    scene,
  );
  base.position.set(0, -0.48, 0);
  base.material = baseWood;
  base.isPickable = false;

  const foot = MeshBuilder.CreateCylinder(
    "jar-foot",
    { diameter: w + t * 3.05, height: 0.22, tessellation: 48 },
    scene,
  );
  foot.position.set(0, -0.86, 0);
  foot.material = baseWood;
  foot.isPickable = false;

  const streakL = verticalStreak(scene, "jar-streak-L", h, 0.14, 0.62);
  streakL.position.set(-outerR + 0.08, midY, 0.22);
  const streakR = verticalStreak(scene, "jar-streak-R", h, 0.14, 0.62);
  streakR.position.set(outerR - 0.08, midY, 0.22);
  const streakL2 = verticalStreak(scene, "jar-streak-L2", h, 0.07, 0.38);
  streakL2.position.set(-outerR + 0.22, midY, 0.18);
  const streakR2 = verticalStreak(scene, "jar-streak-R2", h, 0.07, 0.38);
  streakR2.position.set(outerR - 0.22, midY, 0.18);

  const visuals = [
    body,
    inner,
    sideL,
    sideR,
    rim,
    rimBevel,
    base,
    foot,
    streakL,
    streakR,
    streakL2,
    streakR2,
  ];
  for (const m of [floor, left, right, backW, front, ...visuals]) m.parent = root;

  const failLine = MeshBuilder.CreatePlane("fail-line", { width: w - 0.25, height: 0.09 }, scene);
  failLine.position.set(0, 0, 0.55);
  failLine.isPickable = false;
  failLine.parent = root;

  return { root, floor, failLine };
}

export function tuneBallBody(body: PhysicsBody): void {
  body.setLinearDamping(PHYS.linearDamping);
  body.setAngularDamping(PHYS.angularDamping);
  body.setCollisionCallbackEnabled(true);
}

export function bodySettled(body: PhysicsBody): boolean {
  const v = body.getLinearVelocity();
  const w = body.getAngularVelocity();
  return v.length() < REST.linSpeed && w.length() < REST.angSpeed;
}

export function clampDropX(x: number, radius: number): number {
  const limit = TANK.innerWidth / 2 - radius - DROP.wallPad;
  return clamp(x, -limit, limit);
}

export function keepInLane(body: PhysicsBody, z?: number): void {
  const zz = z ?? body.transformNode.getAbsolutePosition().z;
  const v = body.getLinearVelocity();
  const force = -zz * PHYS.zSpring - v.z * PHYS.zDamp;
  if (Math.abs(force) < 0.01) return;
  body.applyForce(new Vector3(0, 0, force), body.transformNode.getAbsolutePosition());
}

export const isBodySettled = bodySettled;
export const createTank = buildContainer;
