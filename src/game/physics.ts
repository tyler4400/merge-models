/** Havok walls plus a visible glass jar (rim + wooden base) like the ChatGPT mock. */
import { Color3, Vector3 } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
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

function edgeGlassMat(scene: Scene, name: string, alpha: number, glow: Color3): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.diffuseColor = glow;
  m.specularColor = new Color3(0, 0, 0);
  m.emissiveColor = glow;
  m.alpha = alpha;
  m.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  m.needDepthPrePass = true;
  m.disableDepthWrite = true;
  m.backFaceCulling = false;
  return m;
}

/** Curved glass wall slice — only the left/right of the cylinder, never a filled pane. */
function glassRibbon(
  scene: Scene,
  name: string,
  radius: number,
  y0: number,
  y1: number,
  a0: number,
  a1: number,
  mat: StandardMaterial,
): Mesh {
  const segs = 16;
  const path1: Vector3[] = [];
  const path2: Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + (a1 - a0) * (i / segs);
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    path1.push(new Vector3(x, y0, z));
    path2.push(new Vector3(x, y1, z));
  }
  const mesh = MeshBuilder.CreateRibbon(
    name,
    { pathArray: [path1, path2], sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );
  mesh.material = mat;
  mesh.isPickable = false;
  return mesh;
}

function paintWood(ctx: CanvasRenderingContext2D, tw: number, th: number, kind: "lip" | "base"): void {
  ctx.fillStyle = "#4a2a12";
  ctx.fillRect(0, 0, tw, th);
  for (let i = 0; i < 90; i++) {
    const y0 = (i / 90) * th;
    const wobble = Math.sin(i * 1.37) * 5 + Math.sin(i * 0.41) * 9;
    const r = 98 + (i % 9) * 11;
    const g = 56 + (i % 5) * 7;
    const b = 20 + (i % 3) * 5;
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.24 + (i % 4) * 0.05})`;
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
    g.addColorStop(0, "rgba(0,0,0,0.58)");
    g.addColorStop(0.14, "rgba(255,224,170,0.42)");
    g.addColorStop(0.36, "rgba(255,255,255,0.14)");
    g.addColorStop(0.58, "rgba(90,45,14,0.08)");
    g.addColorStop(0.82, "rgba(20,10,4,0.32)");
    g.addColorStop(1, "rgba(0,0,0,0.62)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, tw, th);
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = "#fff";
    const rr = Math.min(th * 0.48, 52);
    ctx.beginPath();
    ctx.roundRect(1, 1, tw - 2, th - 2, rr);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  } else {
    const img = ctx.getImageData(0, 0, tw, th);
    const d = img.data;
    for (let x = 0; x < tw; x++) {
      const theta = (x / tw) * Math.PI * 2;
      const facing = Math.abs(Math.sin(theta));
      const mul = 0.75 + 1.05 * facing;
      for (let y = 0; y < th; y++) {
        const i = (y * tw + x) * 4;
        d[i] = Math.min(255, d[i] * mul + facing * 62);
        d[i + 1] = Math.min(255, d[i + 1] * mul + facing * 28);
        d[i + 2] = Math.min(255, d[i + 2] * mul + facing * 8);
      }
    }
    ctx.putImageData(img, 0, 0);
    const v = ctx.createLinearGradient(0, 0, 0, th);
    v.addColorStop(0, "rgba(255,220,160,0.28)");
    v.addColorStop(0.45, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, tw, th);
  }
}

function woodMat(scene: Scene, name: string, kind: "lip" | "base"): StandardMaterial {
  const tw = 512;
  const th = kind === "lip" ? 140 : 256;
  const tex = new DynamicTexture(name + "-tex", { width: tw, height: th }, scene, true);
  tex.hasAlpha = kind === "lip";
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  paintWood(ctx, tw, th, kind);
  tex.update();
  const m = new StandardMaterial(name, scene);
  m.diffuseTexture = tex;
  m.emissiveTexture = tex;
  m.diffuseColor = new Color3(1, 1, 1);
  m.specularColor = new Color3(0.22, 0.16, 0.08);
  m.specularPower = 36;
  if (kind === "lip") {
    m.useAlphaFromDiffuseTexture = true;
    m.transparencyMode = StandardMaterial.MATERIAL_ALPHATESTANDBLEND;
    m.alphaCutOff = 0.2;
    m.disableLighting = true;
    m.emissiveColor = new Color3(1, 1, 1);
  } else {
    m.disableLighting = true;
    m.emissiveColor = new Color3(1, 1, 1);
  }
  return m;
}

export function buildContainer(scene: Scene): ContainerRig {
  const w = TANK.innerWidth;
  const h = TANK.innerHeight;
  const d = TANK.innerDepth;
  const t = TANK.wall;
  const midY = h / 2;
  const outerR = (w + t) / 2;
  const innerR = outerR - 0.18;
  const y0 = 0.08;
  const y1 = h - 0.04;
  const span = 0.52;

  const physGlass = wallMat(scene, "wall-glass", new Color3(0.78, 0.93, 1), 0.62);
  const floorMat = wallMat(scene, "wall-floor", new Color3(0.78, 0.92, 1), 0.5);
  const back = wallMat(scene, "wall-back", new Color3(0.8, 0.92, 1), 0.16);
  const ghost = wallMat(scene, "wall-front", new Color3(0.85, 0.95, 1), 0.08);

  const rimWood = woodMat(scene, "jar-wood-rim", "lip");
  const baseWood = woodMat(scene, "jar-wood-base", "base");
  const outerGlass = edgeGlassMat(scene, "jar-glass-outer", 0.34, new Color3(0.55, 0.78, 0.92));
  const innerGlass = edgeGlassMat(scene, "jar-glass-inner", 0.22, new Color3(0.42, 0.68, 0.86));
  const rimLight = edgeGlassMat(scene, "jar-glass-rimlight", 0.42, new Color3(0.82, 0.93, 1));

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

  const rightA0 = -span;
  const rightA1 = span;
  const leftA0 = Math.PI - span;
  const leftA1 = Math.PI + span;

  const wallRO = glassRibbon(scene, "jar-wall-RO", outerR, y0, y1, rightA0, rightA1, outerGlass);
  const wallRI = glassRibbon(scene, "jar-wall-RI", innerR, y0 + 0.04, y1 - 0.04, rightA0, rightA1, innerGlass);
  const wallLO = glassRibbon(scene, "jar-wall-LO", outerR, y0, y1, leftA0, leftA1, outerGlass);
  const wallLI = glassRibbon(scene, "jar-wall-LI", innerR, y0 + 0.04, y1 - 0.04, leftA0, leftA1, innerGlass);

  const hiR = glassRibbon(scene, "jar-hi-R", outerR + 0.03, y0 + 0.15, y1 - 0.15, -0.12, 0.12, rimLight);
  const hiL = glassRibbon(scene, "jar-hi-L", outerR + 0.03, y0 + 0.15, y1 - 0.15, Math.PI - 0.12, Math.PI + 0.12, rimLight);

  const rimH = 0.78;
  const rim = MeshBuilder.CreateBox(
    "jar-rim",
    { width: w + t * 2.45, height: rimH, depth: d + t * 2.2 },
    scene,
  );
  rim.position.set(0, h + 0.28, 0);
  rim.material = rimWood;
  rim.isPickable = false;

  const base = MeshBuilder.CreateCylinder(
    "jar-base",
    { diameter: w + t * 2.75, height: 0.82, tessellation: 48 },
    scene,
  );
  base.position.set(0, -0.5, 0);
  base.material = baseWood;
  base.isPickable = false;

  const foot = MeshBuilder.CreateCylinder(
    "jar-foot",
    { diameter: w + t * 3.15, height: 0.24, tessellation: 48 },
    scene,
  );
  foot.position.set(0, -0.9, 0);
  foot.material = baseWood;
  foot.isPickable = false;

  const visuals = [wallRO, wallRI, wallLO, wallLI, hiR, hiL, rim, base, foot];
  for (const m of [floor, left, right, backW, front, ...visuals]) m.parent = root;

  const failLine = MeshBuilder.CreatePlane("fail-line", { width: w - 0.2, height: 0.11 }, scene);
  failLine.position.set(0, 0, 0.7);
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
