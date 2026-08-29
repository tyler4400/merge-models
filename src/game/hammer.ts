/** Three hammers: aim, tap a settled ball, glass shatter VFX. Empty tap cancels. */
import { Color3, Vector3 } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { HAMMER_COUNT, REST } from "./constants";
import type { Ball } from "./Ball";

export class HammerStock {
  left = HAMMER_COUNT;

  canUse(): boolean {
    return this.left > 0;
  }

  consume(): boolean {
    if (this.left <= 0) return false;
    this.left -= 1;
    return true;
  }

  reset(): void {
    this.left = HAMMER_COUNT;
  }
}

type Shard = { mesh: Mesh; vel: Vector3; life: number; mat: StandardMaterial };
type Ring = { mesh: Mesh; mat: StandardMaterial; t: number; dur: number; r0: number; r1: number };

export class ShatterFx {
  private shards: Shard[] = [];
  private rings: Ring[] = [];
  private readonly scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  burst(at: Vector3, radius: number): void {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const mesh = MeshBuilder.CreatePolyhedron(
        `shard-${i}-${Math.random().toString(36).slice(2, 6)}`,
        { type: 0, size: radius * (0.12 + Math.random() * 0.16) },
        this.scene,
      );
      mesh.position.copyFrom(at);
      mesh.position.addInPlace(
        new Vector3((Math.random() - 0.5) * radius, (Math.random() - 0.5) * radius, (Math.random() - 0.5) * radius * 0.5),
      );
      const mat = new StandardMaterial(`shard-mat-${i}-${mesh.uniqueId}`, this.scene);
      mat.diffuseColor = new Color3(0.85, 0.78, 0.68);
      mat.emissiveColor = new Color3(0.18, 0.14, 0.1);
      mat.alpha = 0.7;
      mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
      mesh.material = mat;
      mesh.isPickable = false;
      const vel = new Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 5, (Math.random() - 0.5) * 3);
      this.shards.push({ mesh, vel, life: 0.7 + Math.random() * 0.35, mat });
    }
  }

  /** Glass refraction ring — no sticker stars. */
  ring(at: Vector3, radius: number): void {
    const mesh = MeshBuilder.CreateTorus(
      `ring-${Math.random().toString(36).slice(2, 7)}`,
      { diameter: radius * 0.7, thickness: radius * 0.07, tessellation: 40 },
      this.scene,
    );
    mesh.position.copyFrom(at);
    mesh.rotation.z = Math.PI / 2;
    const mat = new StandardMaterial(`ring-mat-${mesh.uniqueId}`, this.scene);
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(0.75, 0.95, 1);
    mat.alpha = 0.85;
    mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
    mesh.material = mat;
    mesh.isPickable = false;
    this.rings.push({ mesh, mat, t: 0, dur: 0.38, r0: 0.35, r1: 2.15 });
  }

  tick(dt: number): void {
    const grav = -14;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const x = Math.min(1, r.t / r.dur);
      const s = r.r0 + (r.r1 - r.r0) * x;
      r.mesh.scaling.setAll(s);
      r.mat.alpha = 0.85 * (1 - x);
      if (x >= 1) {
        r.mesh.dispose();
        r.mat.dispose();
        this.rings.splice(i, 1);
      }
    }
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.life -= dt;
      s.vel.y += grav * dt;
      s.mesh.position.addInPlace(s.vel.scale(dt));
      s.mesh.rotation.x += dt * 8;
      s.mesh.rotation.z += dt * 6;
      s.mat.alpha = Math.max(0, s.life * 1.1);
      if (s.life <= 0) {
        s.mesh.dispose();
        s.mat.dispose();
        this.shards.splice(i, 1);
      }
    }
  }
}

export function canSmash(ball: Ball): boolean {
  if (ball.held || ball.merging || !ball.aggregate) return false;
  return ball.settleClock >= REST.holdSec;
}
