import {
  InstancedMesh,
  Matrix4,
  MeshPhongMaterial,
  Vector3,
} from 'three';
import { isAtomVisible } from '../../domain/visibility';
import {
  atomColorHex,
  atomDisplayRadius,
  atomMaterial,
  bondKey,
  bondKindToStyleType,
  bondMaterialForType,
  bondTransform,
  legacyAtomColorHex,
  legacyBondMaterial,
  legacyBondSplit,
  moleculeBatchGeometries,
  renderProfileShowsAtomSpheres,
  renderProfileUsesSplitCylinderBonds,
  segmentTransform,
} from './visualStyle';
import type {
  AtomSelectionData,
  BondRenderInstance,
  BondSelectionData,
  MoleculeVisibilityIndex,
  RenderQualityProfile,
  SceneCtx,
} from './types';
import type {
  AtomStyleOverride,
  BondStyleOverride,
  BondStyleType,
  ElementColorOverrides,
  HydrogenVisibility,
  MoleculeData,
  RenderProfileId,
} from '../../types';

export interface MoleculeBatchParams {
  moleculeData: MoleculeData;
  visibilityIndex: MoleculeVisibilityIndex | null;
  hydrogenVisibility: HydrogenVisibility;
  hiddenAtomSet: Set<number>;
  renderProfile: RenderProfileId;
  elementColorOverrides: ElementColorOverrides;
  atomStyleOverrides: Record<string, AtomStyleOverride>;
  bondStyleOverrides: Record<string, BondStyleOverride>;
  atomSizeScale: number;
  bondSizeScale: number;
}

export interface MoleculeBatchResult {
  visibleAtomCount: number;
  visibleBondCount: number;
  qualityProfile: RenderQualityProfile;
}

/**
 * Build the instanced bond and atom meshes for the current molecule and
 * add them to ctx.molGroup, registering pick objects as it goes.
 * Assumes the group was already cleared by the caller.
 */
export function buildMoleculeBatches(ctx: SceneCtx, params: MoleculeBatchParams): MoleculeBatchResult {
  const {
    moleculeData,
    visibilityIndex,
    hydrogenVisibility,
    hiddenAtomSet,
    renderProfile,
    elementColorOverrides,
    atomStyleOverrides,
    bondStyleOverrides,
    atomSizeScale,
    bondSizeScale,
  } = params;
  const { molGroup, atomMats, bondMat } = ctx;

  let visibleBondCount = 0;
  let visibleAtomCount = 0;
  const { sphereGeom, cylGeom, qualityProfile } = moleculeBatchGeometries(
    ctx,
    moleculeData.atoms.length,
    moleculeData.bonds.length,
  );
  const useSplitCylinderBonds = renderProfileUsesSplitCylinderBonds(renderProfile);
  const showAtomSpheres = renderProfileShowsAtomSpheres(renderProfile);
  const atomBuckets = new Map<string, { material: MeshPhongMaterial; atoms: AtomSelectionData[] }>();
  const bondBuckets = new Map<string, { material: MeshPhongMaterial; bonds: BondRenderInstance[] }>();
  const legacyBondMats = new Map<string, MeshPhongMaterial>();

  const addBondInstance = (
    bucketKey: string,
    material: MeshPhongMaterial,
    selection: BondSelectionData,
    matrix: Matrix4,
  ) => {
    let bucket = bondBuckets.get(bucketKey);
    if (!bucket) {
      bucket = { material, bonds: [] };
      bondBuckets.set(bucketKey, bucket);
    }
    bucket.bonds.push({ matrix, selection });
  };

  const addUniformBond = (styleType: BondStyleType, bondData: BondSelectionData) => {
    addBondInstance(
      `uniform|${styleType}`,
      styleType === 'full' ? bondMat : bondMaterialForType(styleType, bondMat),
      bondData,
      bondData.matrix,
    );
  };

  const legacyMaterialFor = (color: string, styleType: BondStyleType) => {
    const key = `${color.toLowerCase()}|${styleType}`;
    let material = legacyBondMats.get(key);
    if (!material) {
      material = legacyBondMaterial(color, styleType);
      legacyBondMats.set(key, material);
    }
    return { key: `legacy|${key}`, material };
  };

  const addLegacyBond = (
    styleType: BondStyleType,
    bondData: BondSelectionData,
    start: Vector3,
    end: Vector3,
    atom1Index: number,
    atom2Index: number,
    atom1Element: string,
    atom2Element: string,
  ) => {
    const startColor = legacyAtomColorHex(atom1Index, atom1Element, elementColorOverrides, atomStyleOverrides);
    const endColor = legacyAtomColorHex(atom2Index, atom2Element, elementColorOverrides, atomStyleOverrides);
    if (startColor.toLowerCase() === endColor.toLowerCase()) {
      const bucket = legacyMaterialFor(startColor, styleType);
      addBondInstance(bucket.key, bucket.material, bondData, bondData.matrix);
      return;
    }

    const split = legacyBondSplit(atom1Element, atom2Element);
    const startMatrix = segmentTransform(start, end, 0, split, bondData.displayRadius, { overlapStart: true, overlapEnd: false });
    const endMatrix = segmentTransform(start, end, split, 1, bondData.displayRadius, { overlapStart: false, overlapEnd: true });
    if (startMatrix) {
      const bucket = legacyMaterialFor(startColor, styleType);
      addBondInstance(bucket.key, bucket.material, bondData, startMatrix);
    }
    if (endMatrix) {
      const bucket = legacyMaterialFor(endColor, styleType);
      addBondInstance(bucket.key, bucket.material, bondData, endMatrix);
    }
  };

  // --- Bonds first (atoms rendered on top) ---
  for (const bond of moleculeData.bonds) {
    const a1 = moleculeData.atoms[bond.atom1];
    const a2 = moleculeData.atoms[bond.atom2];
    if (!a1 || !a2) continue;
    if (
      !isAtomVisible(bond.atom1, moleculeData, hydrogenVisibility, hiddenAtomSet, visibilityIndex) ||
      !isAtomVisible(bond.atom2, moleculeData, hydrogenVisibility, hiddenAtomSet, visibilityIndex)
    ) {
      continue;
    }

    const start   = new Vector3(a1.x, a1.y, a1.z);
    const end     = new Vector3(a2.x, a2.y, a2.z);
    const dir     = new Vector3().subVectors(end, start);
    const len     = dir.length();
    if (len < 0.01) continue;

    const styleType = bondStyleOverrides[bondKey(bond.atom1, bond.atom2)]?.type ?? bondKindToStyleType(bond.kind);
    const displayRadius = (styleType === 'thin'
      ? Math.max(0.026, bond.radius * 0.38)
      : Math.max(0.055, bond.radius * 0.82)) * bondSizeScale;
    const bondData = {
      atom1Element: a1.element,
      atom2Element: a2.element,
      distance: len,
      midpoint: new Vector3().addVectors(start, end).multiplyScalar(0.5),
      atom1Index: bond.atom1,
      atom2Index: bond.atom2,
      displayRadius,
      matrix: bondTransform(start, end, displayRadius, { overlapStart: true, overlapEnd: true }),
    } satisfies BondSelectionData;

    if (useSplitCylinderBonds) {
      addLegacyBond(styleType, bondData, start, end, bond.atom1, bond.atom2, a1.element, a2.element);
    } else {
      addUniformBond(styleType, bondData);
    }

    visibleBondCount += 1;
  }

  for (const bucket of bondBuckets.values()) {
    const bondBatch = new InstancedMesh(cylGeom, bucket.material, bucket.bonds.length);
    bucket.bonds.forEach((bond, index) => {
      bondBatch.setMatrixAt(index, bond.matrix);
    });
    bondBatch.instanceMatrix.needsUpdate = true;
    bondBatch.userData.bonds = bucket.bonds.map((bond) => bond.selection);
    molGroup.add(bondBatch);
    ctx.bondPickObjects.push(bondBatch);
  }

  // --- Atoms on top ---
  for (const [atomIndex, atom] of moleculeData.atoms.entries()) {
    if (!isAtomVisible(atomIndex, moleculeData, hydrogenVisibility, hiddenAtomSet, visibilityIndex)) continue;

    const atomStyle = atomStyleOverrides[String(atomIndex)];
    const color = atomStyle?.color ?? elementColorOverrides[atom.element] ?? atomColorHex(atom.element);
    const r = atomDisplayRadius(atom.element) * (atomStyle?.sizeScale ?? 1) * atomSizeScale;
    const bucketKey = `${atom.element}|${color}|${r.toFixed(4)}`;
    let bucket = atomBuckets.get(bucketKey);
    if (!bucket) {
      const material = atomStyle?.color || elementColorOverrides[atom.element]
        ? atomMaterial(color, renderProfile)
        : (atomMats.get(atom.element) ?? atomMaterial(color, renderProfile));
      if (!atomStyle?.color && !elementColorOverrides[atom.element] && !atomMats.has(atom.element)) {
        atomMats.set(atom.element, material);
      }
      bucket = { material, atoms: [] };
      atomBuckets.set(bucketKey, bucket);
    }
    bucket.atoms.push({
      element: atom.element,
      atomIndex,
      position: new Vector3(atom.x, atom.y, atom.z),
      baseRadius: r,
    });
    visibleAtomCount += 1;
  }

  const atomMatrix = new Matrix4();
  for (const bucket of atomBuckets.values()) {
    const atomBatch = new InstancedMesh(sphereGeom, bucket.material, bucket.atoms.length);
    bucket.atoms.forEach((atom, index) => {
      atomMatrix.makeScale(atom.baseRadius, atom.baseRadius, atom.baseRadius);
      atomMatrix.setPosition(atom.position);
      atomBatch.setMatrixAt(index, atomMatrix);
    });
    atomBatch.instanceMatrix.needsUpdate = true;
    atomBatch.userData.atoms = bucket.atoms;
    atomBatch.visible = showAtomSpheres;
    molGroup.add(atomBatch);
    ctx.atomPickObjects.push(atomBatch);
  }

  return { visibleAtomCount, visibleBondCount, qualityProfile };
}
