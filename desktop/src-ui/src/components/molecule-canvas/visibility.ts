import { Box3, Vector3 } from 'three';
import type { MoleculeData } from '../../types';
import type { MoleculeVisibilityIndex } from './types';
import { atomDisplayRadius } from './visualStyle';

export { isAtomVisible, labelSourceVisible } from '../../domain/visibility';

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
