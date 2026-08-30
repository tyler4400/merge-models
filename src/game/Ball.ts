/** Physics sphere only. The token picture is drawn on the 2D overlay. */
import { Color3, Vector3 } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PHYS } from "./constants";
import { tuneBallBody } from "./physics";
import { getTier, type TierId } from "./tiers";

let nextId = 1;
let sharedHide: StandardMaterial | null = null;

function hideMat(scene: Scene): StandardMaterial {
  if (sharedHide) return sharedHide;
  const m = new StandardMaterial("ball-phys-hide", scene);
  m.diffuseColor = new Color3(0, 0, 0);
  m.alpha = 0;
  m.disableDepthWrite = true;
  m.disableLighting = true;
  m.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  sharedHide = m;
  return m;
}

export class Ball {
  readonly id: number;
  readonly tier: TierId;
  readonly radius: number;
  readonly mass: number;
  readonly mesh: Mesh;
  aggregate: PhysicsAggregate | null = null;
  merging = false;
  held = false;
  settleClock = 0;
  failClock = 0;
  unrestClock = 0;
  dropAge = 0;
  spin = 0;
  logoAlpha = 1;

  constructor(scene: Scene, tier: TierId, pos: Vector3) {
    const def = getTier(tier);
    this.id = nextId++;
    this.tier = tier;
    this.radius = def.radius;
    this.mass = def.mass;
    const mesh = MeshBuilder.CreateSphere(
      `ball-${this.id}`,
      { diameter: def.radius * 2, segments: 8 },
      scene,
    );
    mesh.position.copyFrom(pos);
    mesh.isPickable = true;
    mesh.metadata = { ballId: this.id };
    mesh.isVisible = true;
    mesh.visibility = 1;
    mesh.material = hideMat(scene);
    this.mesh = mesh;
  }

  syncVisual(dt: number): void {
    const body = this.aggregate?.body;
    if (!body) return;
    try {
      this.spin += body.getAngularVelocity().z * dt;
    } catch {
      /* body gone */
    }
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
    this.logoAlpha = v;
  }

  dispose(): void {
    this.merging = true;
    this.aggregate?.dispose();
    this.aggregate = null;
    this.mesh.dispose();
  }
}
