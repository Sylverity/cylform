import type { HydrogenVisibility, MoleculeData, PersistentLabel } from '../types';

/** Precomputed per-atom flags; MoleculeVisibilityIndex satisfies this structurally. */
export interface AtomVisibilityFlags {
  isHydrogen: boolean[];
  isCarbonHydrogen: boolean[];
}

export function isCarbonHydrogen(atomIndex: number, moleculeData: MoleculeData): boolean {
  const atom = moleculeData.atoms[atomIndex];
  if (!atom || atom.element !== 'H') return false;

  return moleculeData.bonds.some((bond) => {
    if (bond.atom1 === atomIndex) return moleculeData.atoms[bond.atom2]?.element === 'C';
    if (bond.atom2 === atomIndex) return moleculeData.atoms[bond.atom1]?.element === 'C';
    return false;
  });
}

export function isAtomVisible(
  atomIndex: number,
  moleculeData: MoleculeData,
  hydrogenVisibility: HydrogenVisibility,
  hiddenAtomSet: Set<number>,
  visibilityFlags: AtomVisibilityFlags | null = null,
): boolean {
  const atom = moleculeData.atoms[atomIndex];
  if (!atom || hiddenAtomSet.has(atomIndex)) return false;
  if (hydrogenVisibility === 'hidden' && (visibilityFlags?.isHydrogen[atomIndex] ?? atom.element === 'H')) {
    return false;
  }
  if (
    hydrogenVisibility === 'hide-c-h'
    && (visibilityFlags?.isCarbonHydrogen[atomIndex] ?? isCarbonHydrogen(atomIndex, moleculeData))
  ) {
    return false;
  }
  return true;
}

export function labelSourceVisible(
  label: PersistentLabel,
  moleculeData: MoleculeData | null,
  hydrogenVisibility: HydrogenVisibility,
  hiddenAtomSet: Set<number>,
  visibilityFlags: AtomVisibilityFlags | null = null,
): boolean {
  if (!moleculeData) return false;
  const atomIndices = label.source?.atomIndices
    ?? (typeof label.source?.atomIndex === 'number' ? [label.source.atomIndex] : undefined)
    ?? label.source?.bond;

  if (!atomIndices || atomIndices.length === 0) return true;
  return atomIndices.every((atomIndex) => (
    isAtomVisible(atomIndex, moleculeData, hydrogenVisibility, hiddenAtomSet, visibilityFlags)
  ));
}
