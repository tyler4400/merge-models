/** Havok walls plus a visible glass jar (rim + wooden base) like the ChatGPT mock. */
import { Color3, Vector3 } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
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

function paintWood(ctx: CanvasRenderingContext2D, tw: number, th: number, kind: "lip" | "base"): void {
  ctx.fillStyle = "#7a4520";
  ctx.fillRect(0, 0, tw, th);
  ctx.lineCap = "butt";
  // Grain is U-periodic (integer cycles over tw) so WRAP at u=0/1 is seamless.
  for (let i = 0; i < 90; i++) {
    const y0 = (i / 90) * th;
    const wobble = Math.sin(i * 1.37) * 5 + Math.sin(i * 0.41) * 9;
    const r = 156 + (i % 9) * 12;
    const g = 92 + (i % 5) * 8;
    const b = 36 + (i % 3) * 6;
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.22 + (i % 4) * 0.05})`;
    ctx.lineWidth = 1.2 + (i % 4);
    const c1 = 4 + (i % 3);
    const c2 = 1 + (i % 2);
    ctx.beginPath();
    const pad = 12;
    for (let x = -pad; x <= tw + pad; x += 4) {
      const t = (x / tw) * Math.PI * 2;
      const y = y0 + wobble + Math.sin(t * c1 + i * 0.7) * 4.5 + Math.sin(t * c2 + i) * 10;
      if (x === -pad) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let k = 0; k < 5; k++) {
    const kx = 40 + k * 90 + (k % 2) * 20;
    const ky = 30 + (k * 47) % (th - 50);
    ctx.fillStyle = "rgba(90, 42, 16, 0.18)";
    for (const ox of [-tw, 0, tw]) {
      ctx.beginPath();
      ctx.ellipse(kx + ox, ky, 11, 5.5, k * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (kind === "lip") {
    // V wraps the tube: v=0.5 is the outer equator (camera-facing on the front arc).
    const g = ctx.createLinearGradient(0, 0, 0, th);
    g.addColorStop(0, "rgba(50,22,8,0.28)");
    g.addColorStop(0.22, "rgba(120,58,18,0.12)");
    g.addColorStop(0.5, "rgba(255,224,168,0.50)");
    g.addColorStop(0.72, "rgba(255,196,120,0.18)");
    g.addColorStop(1, "rgba(48,20,8,0.30)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, tw, th);
  } else {
    const img = ctx.getImageData(0, 0, tw, th);
    const d = img.data;
    for (let x = 0; x < tw; x++) {
      const theta = (x / tw) * Math.PI * 2;
      const facing = Math.abs(Math.sin(theta));
      const mul = 0.92 + 0.78 * facing;
      for (let y = 0; y < th; y++) {
        const i = (y * tw + x) * 4;
        d[i] = Math.min(255, d[i] * mul + facing * 78);
        d[i + 1] = Math.min(255, d[i + 1] * mul + facing * 42);
        d[i + 2] = Math.min(255, d[i + 2] * mul + facing * 14);
      }
    }
    ctx.putImageData(img, 0, 0);
    const v = ctx.createLinearGradient(0, 0, 0, th);
    v.addColorStop(0, "rgba(255,224,170,0.34)");
    v.addColorStop(0.45, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(40,16,6,0.28)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, tw, th);
  }
}

function woodMat(scene: Scene, name: string, kind: "lip" | "base"): StandardMaterial {
  const tw = 512;
  const th = kind === "lip" ? 140 : 256;
  const tex = new DynamicTexture(name + "-tex", { width: tw, height: th }, scene, true);
  tex.hasAlpha = false;
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  if (kind === "lip") tex.uScale = 2;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  paintWood(ctx, tw, th, kind);
  tex.update();
  const m = new StandardMaterial(name, scene);
  m.diffuseTexture = tex;
  m.emissiveTexture = tex;
  m.diffuseColor = new Color3(1, 1, 1);
  m.specularColor = new Color3(0.28, 0.18, 0.08);
  m.specularPower = 40;
  m.disableLighting = true;
  m.emissiveColor = new Color3(1, 1, 1);
  return m;
}

/** Wrap-around glass: soft fresnel at ±X, almost clear on ±Z (camera). */
function paintGlassWrap(ctx: CanvasRenderingContext2D, tw: number, th: number, kind: "outer" | "inner"): void {
  const alpha = new Float32Array(tw);
  const rgb = new Float32Array(tw * 3);
  for (let x = 0; x < tw; x++) {
    // u=0 at -Z (back, seam hidden), u=0.25 at +X, u=0.5 at +Z, u=0.75 at -X
    const theta = (x / tw) * Math.PI * 2 - Math.PI / 2;
    // 1 at ±X silhouette, 0 at ±Z — same as abs(sin) of camera azimuth
    const edge = Math.abs(Math.cos(theta));
    // Front hemisphere (incl. ±X) carries the fresnel; back stays faint so
    // front+back walls don't stack into two neon bars.
    const front = theta >= 0 && theta <= Math.PI ? 1 : 0.18;
    const dist = 1 - edge;
    const lobe = Math.exp(-dist * dist * 4.2);
    let a: number;
    if (kind === "inner") {
      a = 0.01 + 0.08 * lobe * front;
    } else {
      a = 0.04 + 0.34 * lobe * front;
    }
    const glow = lobe;
    rgb[x * 3] = 210 + 32 * glow;
    rgb[x * 3 + 1] = 232 + 16 * glow;
    rgb[x * 3 + 2] = 242 + 8 * glow;
    alpha[x] = a;
  }
  // Wrap-around 1D blur so the lobe eases instead of reading as two cyan strips.
  const rad = kind === "outer" ? 36 : 20;
  const aBlur = new Float32Array(tw);
  const cBlur = new Float32Array(tw * 3);
  let wtot = 0;
  const wts: number[] = [];
  for (let k = -rad; k <= rad; k++) {
    const w = 1 - Math.abs(k) / (rad + 1);
    wts.push(w);
    wtot += w;
  }
  for (let x = 0; x < tw; x++) {
    let sa = 0;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    for (let k = -rad; k <= rad; k++) {
      const i = (x + k + tw * 4) % tw;
      const w = wts[k + rad];
      sa += alpha[i] * w;
      sr += rgb[i * 3] * w;
      sg += rgb[i * 3 + 1] * w;
      sb += rgb[i * 3 + 2] * w;
    }
    aBlur[x] = sa / wtot;
    cBlur[x * 3] = sr / wtot;
    cBlur[x * 3 + 1] = sg / wtot;
    cBlur[x * 3 + 2] = sb / wtot;
  }
  const img = ctx.createImageData(tw, th);
  const d = img.data;
  for (let x = 0; x < tw; x++) {
    const r = cBlur[x * 3];
    const g = cBlur[x * 3 + 1];
    const b = cBlur[x * 3 + 2];
    const a = Math.min(255, aBlur[x] * 255);
    for (let y = 0; y < th; y++) {
      const i = (y * tw + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function glassTubeMat(scene: Scene, name: string, kind: "outer" | "inner"): StandardMaterial {
  const tw = 512;
  const th = 64;
  const tex = new DynamicTexture(name + "-tex", { width: tw, height: th }, scene, true);
  tex.hasAlpha = true;
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  paintGlassWrap(ctx, tw, th, kind);
  tex.update();
  const m = new StandardMaterial(name, scene);
  m.diffuseTexture = tex;
  m.emissiveTexture = tex;
  m.opacityTexture = tex;
  m.useAlphaFromDiffuseTexture = true;
  m.diffuseColor = new Color3(1, 1, 1);
  m.emissiveColor = new Color3(1, 1, 1);
  m.specularColor = new Color3(0.9, 0.96, 1);
  m.specularPower = 96;
  m.disableLighting = true;
  m.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  m.needDepthPrePass = true;
  m.disableDepthWrite = true;
  m.backFaceCulling = false;
  m.separateCullingPass = true;
  return m;
}

/** U around circumference (seam at -Z); V along height. Matches paintGlassWrap. */
function wrapTubeUvs(mesh: Mesh, y0: number, y1: number): void {
  const pos = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!pos) return;
  const uvs: number[] = [];
  const h = Math.max(1e-4, y1 - y0);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i];
    const y = pos[i + 1];
    const z = pos[i + 2];
    const theta = Math.atan2(z, x);
    let u = (theta + Math.PI / 2) / (Math.PI * 2);
    if (u < 0) u += 1;
    uvs.push(u, (y - y0) / h);
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uvs);
}

function makeTube(
  scene: Scene,
  name: string,
  radius: number,
  y0: number,
  y1: number,
  mat: StandardMaterial,
): Mesh {
  const mesh = MeshBuilder.CreateTube(
    name,
    {
      path: [new Vector3(0, y0, 0), new Vector3(0, y1, 0)],
      radius,
      tessellation: 96,
      cap: 0,
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene,
  );
  mesh.material = mat;
  mesh.isPickable = false;
  wrapTubeUvs(mesh, y0, y1);
  return mesh;
}

export function buildContainer(scene: Scene): ContainerRig {
  const w = TANK.innerWidth;
  const h = TANK.innerHeight;
  const d = TANK.innerDepth;
  const t = TANK.wall;
  const midY = h / 2;
  const outerR = (w + t) / 2;
  const innerR = outerR - 0.2;
  const y0 = 0.08;
  const y1 = h - 0.04;

  const physGlass = wallMat(scene, "wall-glass", new Color3(0.78, 0.93, 1), 0.62);
  const floorMat = wallMat(scene, "wall-floor", new Color3(0.78, 0.92, 1), 0.5);
  const back = wallMat(scene, "wall-back", new Color3(0.8, 0.92, 1), 0.16);
  const ghost = wallMat(scene, "wall-front", new Color3(0.85, 0.95, 1), 0.08);

  const rimWood = woodMat(scene, "jar-wood-rim", "lip");
  const baseWood = woodMat(scene, "jar-wood-base", "base");
  const outerGlass = glassTubeMat(scene, "jar-glass-outer", "outer");
  const innerGlass = glassTubeMat(scene, "jar-glass-inner", "inner");

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

  const wallOuter = makeTube(scene, "jar-wall-outer", outerR, y0, y1, outerGlass);
  const wallInner = makeTube(scene, "jar-wall-inner", innerR, y0 + 0.04, y1 - 0.04, innerGlass);

  // Babylon 8 CreateTorus already lies in XZ (hole along +Y) — a bagel on the table.
  // Do NOT rotation.x = PI/2: that flips the hole toward the camera (the forbidden dark O).
  const rimThick = 0.68;
  const rim = MeshBuilder.CreateTorus(
    "jar-rim",
    { diameter: outerR * 2, thickness: rimThick, tessellation: 64 },
    scene,
  );
  rim.position.set(0, h + 0.08, 0);
  // CreateTorus UV u=0 is at +Z; rotate so the wrap sits at -Z (away from camera).
  rim.rotation.y = Math.PI;
  rim.material = rimWood;
  rim.isPickable = false;

  const base = MeshBuilder.CreateCylinder(
    "jar-base",
    { diameter: w + t * 2.55, height: 0.62, tessellation: 48 },
    scene,
  );
  base.position.set(0, -0.34, 0);
  base.material = baseWood;
  base.isPickable = false;

  const foot = MeshBuilder.CreateCylinder(
    "jar-foot",
    { diameter: w + t * 3.7, height: 0.7, tessellation: 48 },
    scene,
  );
  foot.position.set(0, -1.0, 0);
  foot.material = baseWood;
  foot.isPickable = false;

  const baseRing = MeshBuilder.CreateTorus(
    "jar-base-ring",
    { diameter: w + t * 3.05, thickness: 0.32, tessellation: 48 },
    scene,
  );
  baseRing.position.set(0, -0.64, 0);
  baseRing.rotation.y = Math.PI; // same UV seam hide as the lip
  baseRing.material = rimWood;
  baseRing.isPickable = false;

  const visuals = [wallOuter, wallInner, rim, base, foot, baseRing];
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
