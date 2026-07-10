import {
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import type {
  AtomStyleOverride,
  HydrogenVisibility,
  MoleculeData,
} from '../../types';
import type { MoleculeVisibilityIndex, SceneCtx } from './types';
import { isAtomVisible } from './visibility';
import { atomDisplayRadius, bondTransform } from './visualStyle';

export interface HighlightTargets {
  atomIndices: number[];
  bondIndices: number[];
}

export function resolveHighlightTargets(
  moleculeData: MoleculeData,
  highlightedGroupIds: string[],
  hiddenAtomSet: Set<number>,
  hydrogenVisibility: HydrogenVisibility,
  visibilityIndex: MoleculeVisibilityIndex | null,
): HighlightTargets {
  if (highlightedGroupIds.length === 0) {
    return { atomIndices: [], bondIndices: [] };
  }

  const highlightedGroupSet = new Set(highlightedGroupIds);
  const highlightedAtoms = new Set<number>();

  for (const group of moleculeData.groups) {
    if (!highlightedGroupSet.has(group.id)) continue;
    for (const atomIndex of group.atomIndices) {
      if (isAtomVisible(atomIndex, moleculeData, hydrogenVisibility, hiddenAtomSet, visibilityIndex)) {
        highlightedAtoms.add(atomIndex);
      }
    }
  }

  const atomIndices = Array.from(highlightedAtoms).sort((a, b) => a - b);
  const visibleHighlightedAtoms = new Set(atomIndices);
  const bondIndices: number[] = [];

  moleculeData.bonds.forEach((bond, bondIndex) => {
    if (visibleHighlightedAtoms.has(bond.atom1) && visibleHighlightedAtoms.has(bond.atom2)) {
      bondIndices.push(bondIndex);
    }
  });

  return { atomIndices, bondIndices };
}

export function addHighlightLayer(
  ctx: SceneCtx,
  moleculeData: MoleculeData,
  highlightedGroupIds: string[],
  hiddenAtomSet: Set<number>,
  hydrogenVisibility: HydrogenVisibility,
  visibilityIndex: MoleculeVisibilityIndex | null,
  atomStyleOverrides: Record<string, AtomStyleOverride>,
  atomSizeScale: number,
  bondSizeScale: number,
): void {
  const targets = resolveHighlightTargets(
    moleculeData,
    highlightedGroupIds,
    hiddenAtomSet,
    hydrogenVisibility,
    visibilityIndex,
  );
  if (targets.atomIndices.length === 0 && targets.bondIndices.length === 0) return;

  const atomHighlightMat = new MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const bondHighlightMat = new MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  atomHighlightMat.toneMapped = false;
  bondHighlightMat.toneMapped = false;

  if (targets.bondIndices.length > 0) {
    const bondBatch = new InstancedMesh(ctx.cylGeom, bondHighlightMat, targets.bondIndices.length);
    targets.bondIndices.forEach((bondIndex, instanceIndex) => {
      const bond = moleculeData.bonds[bondIndex];
      const atom1 = moleculeData.atoms[bond.atom1];
      const atom2 = moleculeData.atoms[bond.atom2];
      if (!atom1 || !atom2) return;

      const start = new Vector3(atom1.x, atom1.y, atom1.z);
      const end = new Vector3(atom2.x, atom2.y, atom2.z);
      const sleeveRadius = Math.max(0.09, bond.radius * 1.45 * bondSizeScale);
      bondBatch.setMatrixAt(instanceIndex, bondTransform(start, end, sleeveRadius, {
        overlapStart: true,
        overlapEnd: true,
      }));
    });
    bondBatch.instanceMatrix.needsUpdate = true;
    bondBatch.renderOrder = 9;
    bondBatch.userData.highlightLayer = true;
    ctx.molGroup.add(bondBatch);
  } else {
    bondHighlightMat.dispose();
  }

  if (targets.atomIndices.length > 0) {
    const atomBatch = new InstancedMesh(ctx.sphereGeom, atomHighlightMat, targets.atomIndices.length);
    const atomMatrix = new Matrix4();
    targets.atomIndices.forEach((atomIndex, instanceIndex) => {
      const atom = moleculeData.atoms[atomIndex];
      if (!atom) return;

      const atomStyle = atomStyleOverrides[String(atomIndex)];
      const baseRadius = atomDisplayRadius(atom.element) * (atomStyle?.sizeScale ?? 1) * atomSizeScale;
      const haloRadius = Math.max(0.16, baseRadius * 2.35);
      atomMatrix.makeScale(haloRadius, haloRadius, haloRadius);
      atomMatrix.setPosition(new Vector3(atom.x, atom.y, atom.z));
      atomBatch.setMatrixAt(instanceIndex, atomMatrix);
    });
    atomBatch.instanceMatrix.needsUpdate = true;
    atomBatch.renderOrder = 10;
    atomBatch.userData.highlightLayer = true;
    ctx.molGroup.add(atomBatch);
  } else {
    atomHighlightMat.dispose();
  }
}
