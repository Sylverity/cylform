import {
  BufferGeometry,
  CatmullRomCurve3,
  Mesh,
  MeshBasicMaterial,
  TubeGeometry,
  Vector3,
  Scene,
} from 'three';
import type { SceneCtx, AtomSelectionData, BondSelectionData } from './types';
import { clamp } from './visualStyle';

export function createAngleArcMesh(
  vertex: Vector3,
  armA: Vector3,
  armC: Vector3,
  scene: Scene,
): Mesh {
  const ba = new Vector3().subVectors(armA, vertex);
  const bc = new Vector3().subVectors(armC, vertex);
  const baLen = ba.length();
  const bcLen = bc.length();
  const radius = Math.min(baLen, bcLen) * 0.35;
  if (radius < 0.01) {
    return new Mesh(new BufferGeometry(), new MeshBasicMaterial());
  }

  const u = ba.clone().normalize();
  const normal = new Vector3().crossVectors(ba, bc).normalize();
  const v = new Vector3().crossVectors(normal, u).normalize();

  const angleRad = Math.acos(clamp(ba.normalize().dot(bc.normalize()), -1, 1));
  const segments = Math.max(8, Math.round(angleRad * 20));
  const points: Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * angleRad;
    points.push(
      vertex.clone().add(
        u.clone().multiplyScalar(Math.cos(t) * radius).add(
          v.clone().multiplyScalar(Math.sin(t) * radius),
        ),
      ),
    );
  }

  const curve = new CatmullRomCurve3(points);
  const geometry = new TubeGeometry(curve, segments, 0.018, 8, false);
  const material = new MeshBasicMaterial({ color: 0xffa24c, transparent: true, opacity: 0.85 });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  return mesh;
}

export function removeAngleArcMesh(ctx: SceneCtx) {
  if (ctx.angleArcMesh) {
    ctx.scene.remove(ctx.angleArcMesh);
    ctx.angleArcMesh.geometry.dispose();
    (ctx.angleArcMesh.material as MeshBasicMaterial).dispose();
    ctx.angleArcMesh = null;
  }
}

export function removeOverlay(ctx: SceneCtx, mesh: Mesh | null): void {
  if (!mesh) return;
  ctx.molGroup.remove(mesh);
}

export function clearOverlays(ctx: SceneCtx, overlays: Mesh[]): void {
  for (const overlay of overlays) {
    ctx.molGroup.remove(overlay);
  }
  overlays.length = 0;
}

export function createAtomOverlay(ctx: SceneCtx, atom: AtomSelectionData): Mesh {
  const overlay = new Mesh(ctx.sphereGeom, ctx.selectedAtomMat);
  overlay.position.copy(atom.position);
  overlay.scale.setScalar(atom.baseRadius * 1.45);
  overlay.userData.atom = atom;
  ctx.molGroup.add(overlay);
  return overlay;
}

export function createBondOverlay(ctx: SceneCtx, bond: BondSelectionData): Mesh {
  const overlay = new Mesh(ctx.cylGeom, ctx.selectedBondMat);
  overlay.applyMatrix4(bond.matrix);
  overlay.scale.multiplyScalar(1.22);
  overlay.userData.bond = bond;
  ctx.molGroup.add(overlay);
  return overlay;
}
