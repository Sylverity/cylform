import { InstancedMesh, Intersection, Mesh } from 'three';
import type { SceneCtx, PickResult, AtomSelectionData, BondSelectionData } from './types';
import type { SelectionMode } from '../../App';

export function resolveAtomHit(hit: Intersection | undefined): AtomSelectionData | null {
  if (!hit || !(hit.object instanceof InstancedMesh) || typeof hit.instanceId !== 'number') {
    return null;
  }
  const atoms = hit.object.userData.atoms as AtomSelectionData[] | undefined;
  return atoms?.[hit.instanceId] ?? null;
}

export function resolveBondHit(hit: Intersection | undefined): BondSelectionData | null {
  if (!hit) return null;
  if (hit.object instanceof InstancedMesh && typeof hit.instanceId === 'number') {
    const bonds = hit.object.userData.bonds as BondSelectionData[] | undefined;
    return bonds?.[hit.instanceId] ?? null;
  }
  if (hit.object instanceof Mesh) {
    return (hit.object.userData.bond as BondSelectionData | undefined) ?? null;
  }
  return null;
}

export function pickScene(ctx: SceneCtx, mode: SelectionMode): PickResult {
  const totalStart = performance.now();
  let atomHit: Intersection | undefined;
  let bondHit: Intersection | undefined;
  let pickAtomMs: number | null = null;
  let pickBondMs: number | null = null;

  const pickAtoms = () => {
    const startedAt = performance.now();
    atomHit = ctx.raycaster.intersectObjects(ctx.atomPickObjects, false)[0];
    pickAtomMs = performance.now() - startedAt;
    return resolveAtomHit(atomHit);
  };

  const pickBonds = () => {
    const startedAt = performance.now();
    bondHit = ctx.raycaster.intersectObjects(ctx.bondPickObjects, false)[0];
    pickBondMs = performance.now() - startedAt;
    return resolveBondHit(bondHit);
  };

  let atom: AtomSelectionData | null = null;
  let bond: BondSelectionData | null = null;

  if (mode === 'label' || mode === 'atom') {
    atom = pickAtoms();
  } else if (mode === 'bond') {
    bond = pickBonds();
  } else if (mode === 'atom-bond' || mode === 'measure') {
    atom = pickAtoms();
    if (!atom) {
      bond = pickBonds();
    }
  }

  const pickTotalMs = performance.now() - totalStart;
  return {
    atom,
    bond,
    pickAtomMs,
    pickBondMs,
    pickTotalMs,
    pickHitType: atom ? 'atom' : bond ? 'bond' : 'none',
    pickAtomCandidates: ctx.atomPickObjects.reduce((sum, object) => sum + object.count, 0),
    pickBondCandidates: ctx.bondPickObjects.reduce((sum, object) => (
      sum + (object instanceof InstancedMesh ? object.count : 1)
    ), 0),
  };
}
