import { Box3, Vector3 } from 'three';
import type { MoleculeData, HydrogenVisibility, PersistentLabel } from '../../types';
import type { MoleculeVisibilityIndex } from './types';
import { atomDisplayRadius } from './visualStyle';

export function buildMoleculeVisibilityIndex(moleculeData: MoleculeData | null): MoleculeVisibilityIndex | null {
  if (!moleculeData || moleculeData.atoms.length === 0) return null;

  const adjacency = moleculeData.atoms.map(() => [] as number[]);
  const isHydrogen = moleculeData.atoms.map((atom) => atom.element === 'H');
  const isCarbonHydrogen = moleculeData.atoms.map(() => false);
  const bounds = new Box3();

  moleculeData.atoms.forEach((atom) => {
    const radius = Math.max(atomDisplayRadius(atom.element), atom.radius, 0.15);
    bounds.expandByPoint(new Vector3(atom.x - radius, atom.y - radius, atom.z - radius));
    bounds.expandByPoint(new Vector3(atom.x + radius, atom.y + radius, atom.z + radius));
  });

  for (const bond of moleculeData.bonds) {
    if (!moleculeData.atoms[bond.atom1] || !moleculeData.atoms[bond.atom2]) continue;
    adjacency[bond.atom1].push(bond.atom2);
    adjacency[bond.atom2].push(bond.atom1);
  }

  for (const [atomIndex, atom] of moleculeData.atoms.entries()) {
    if (atom.element !== 'H') continue;
    isCarbonHydrogen[atomIndex] = adjacency[atomIndex].some((neighborIndex) => (
      moleculeData.atoms[neighborIndex]?.element === 'C'
    ));
  }

  return {
    moleculeData,
    adjacency,
    isHydrogen,
    isCarbonHydrogen,
    bounds: bounds.isEmpty() ? null : bounds,
  };
}

export function isAtomVisible(
  atomIndex: number,
  moleculeData: MoleculeData,
  hydrogenVisibility: HydrogenVisibility,
  hiddenAtomSet: Set<number>,
  visibilityIndex: MoleculeVisibilityIndex | null,
): boolean {
  const atom = moleculeData.atoms[atomIndex];
  if (!atom || hiddenAtomSet.has(atomIndex)) return false;
  if (hydrogenVisibility === 'hidden' && (visibilityIndex?.isHydrogen[atomIndex] ?? atom.element === 'H')) return false;
  if (hydrogenVisibility === 'hide-c-h' && (visibilityIndex?.isCarbonHydrogen[atomIndex] ?? false)) return false;
  return true;
}

export function labelSourceVisible(
  label: PersistentLabel,
  moleculeData: MoleculeData | null,
  hydrogenVisibility: HydrogenVisibility,
  hiddenAtomSet: Set<number>,
  visibilityIndex: MoleculeVisibilityIndex | null,
): boolean {
  if (!moleculeData) return false;
  const atomIndices = label.source?.atomIndices
    ?? (typeof label.source?.atomIndex === 'number' ? [label.source.atomIndex] : undefined)
    ?? label.source?.bond;

  if (!atomIndices || atomIndices.length === 0) return true;
  return atomIndices.every((atomIndex) => (
    isAtomVisible(atomIndex, moleculeData, hydrogenVisibility, hiddenAtomSet, visibilityIndex)
  ));
}
