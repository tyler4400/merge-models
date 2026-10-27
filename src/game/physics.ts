/** Invisible Havok box walls. The painted jar lives on the courtyard backdrop. */
import { Color3, Vector3 } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
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

function ghostMat(scene: Scene, name: string): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = new Color3(0.8, 0.9, 1);
  m.specularColor = new Color3(0, 0, 0);
  m.alpha = 0;
  m.disableLighting = true;
  m.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  m.disableDepthWrite = true;
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
  mesh.isVisible = false;
  mesh.visibility = 0;
  new PhysicsAggregate(
    mesh,
    PhysicsShapeType.BOX,
    { mass: 0, friction: PHYS.wallFriction, restitution: PHYS.wallRestitution },
    scene,
  );
  return mesh;
}

export function buildContainer(scene: Scene): ContainerRig {
  const w = TANK.innerWidth;
  const h = TANK.innerHeight;
  const d = TANK.innerDepth;
  const t = TANK.wall;
  const midY = h / 2;

  const mat = ghostMat(scene, "wall-ghost");

  const root = MeshBuilder.CreateBox("container-root", { width: 0.01, height: 0.01, depth: 0.01 }, scene);
  root.isVisible = false;

  const floor = boxWall(scene, "floor", new Vector3(w + t * 2, t, d + t * 2), new Vector3(0, -t / 2, 0), mat);
  const left = boxWall(scene, "wall-L", new Vector3(t, h + t, d + t * 2), new Vector3(-w / 2 - t / 2, midY, 0), mat);
  const right = boxWall(scene, "wall-R", new Vector3(t, h + t, d + t * 2), new Vector3(w / 2 + t / 2, midY, 0), mat);
  const backW = boxWall(scene, "wall-B", new Vector3(w, h + t, t), new Vector3(0, midY, -d / 2 - t / 2), mat);
  const front = boxWall(scene, "wall-F", new Vector3(w, h + t, t), new Vector3(0, midY, d / 2 + t / 2), mat);

  for (const m of [floor, left, right, backW, front]) m.parent = root;

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
  return Math.hypot(v.x, v.y) < REST.linSpeed;
}

export function clampDropX(x: number, radius: number): number {
  const limit = TANK.innerWidth / 2 - radius - DROP.wallPad;
  return clamp(x, -limit, limit);
}

/** z 越界时一步（约 1/60s）拉回所需的速度增益。 */
const Z_SNAP_PER_SEC = 60;

export function keepInLane(body: PhysicsBody): void {
  const p = body.transformNode.getAbsolutePosition();
  const v = body.getLinearVelocity();
  const z = clamp(p.z, -PHYS.zClamp, PHYS.zClamp);
  // 只用 z 速度把球拉回薄层，保留 x/y 速度。
  // 旧实现用 setTargetTransform，会把整条线速度改成“一步到目标”，
  // 挤在薄层边缘的球因此每帧丢掉摇晃冲量和倾斜滚动（无头 Chrome 实测：|z|≥0.18 的球冲量后 vy≈0）。
  const vz = Math.abs(p.z - z) > 1e-4 ? (z - p.z) * Z_SNAP_PER_SEC : 0;
  if (v.z !== vz) body.setLinearVelocity(new Vector3(v.x, v.y, vz));
}

export const isBodySettled = bodySettled;
export const createTank = buildContainer;
