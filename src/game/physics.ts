/** Havok container walls + settle helper. Front wall is invisible so the side view stays open. */
import { Color3, Vector3 } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
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
  m.specularColor = new Color3(0.08, 0.06, 0.04);
  m.emissiveColor = color.scale(0.12);
  m.alpha = alpha;
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

export function buildContainer(scene: Scene): ContainerRig {
  const w = TANK.innerWidth;
  const h = TANK.innerHeight;
  const d = TANK.innerDepth;
  const t = TANK.wall;
  const midY = h / 2;

  const wood = wallMat(scene, "wall-wood", new Color3(0.16, 0.11, 0.08));
  const stone = wallMat(scene, "wall-stone", new Color3(0.1, 0.09, 0.08));
  const back = wallMat(scene, "wall-back", new Color3(0.07, 0.06, 0.055));
  const ghost = wallMat(scene, "wall-front", new Color3(0.12, 0.1, 0.08), 0.04);
  ghost.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  ghost.needDepthPrePass = true;

  const root = MeshBuilder.CreateBox("container-root", { width: 0.01, height: 0.01, depth: 0.01 }, scene);
  root.isVisible = false;

  const floor = boxWall(
    scene,
    "floor",
    new Vector3(w + t * 2, t, d + t * 2),
    new Vector3(0, -t / 2, 0),
    stone,
  );
  const left = boxWall(scene, "wall-L", new Vector3(t, h + t, d + t * 2), new Vector3(-w / 2 - t / 2, midY, 0), wood);
  const right = boxWall(scene, "wall-R", new Vector3(t, h + t, d + t * 2), new Vector3(w / 2 + t / 2, midY, 0), wood);
  const backW = boxWall(scene, "wall-B", new Vector3(w, h + t, t), new Vector3(0, midY, -d / 2 - t / 2), back);
  const front = boxWall(scene, "wall-F", new Vector3(w, h + t, t), new Vector3(0, midY, d / 2 + t / 2), ghost);
  front.visibility = 0.08;

  for (const m of [floor, left, right, backW, front]) m.parent = root;

  const failLine = MeshBuilder.CreateBox(
    "fail-line",
    { width: w - 0.08, height: 0.04, depth: d + 0.2 },
    scene,
  );
  failLine.position.set(0, 0, 0);
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
