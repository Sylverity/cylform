import { describe, expect, it } from 'vitest';
import type { MoleculeData } from '../../App';
import { resolveHighlightTargets } from './highlights';

const molecule = {
  path: '/tmp/residues.pdb',
  name: 'residues',
  atoms: [
    { x: 0, y: 0, z: 0, element: 'C', radius: 0.7 },
    { x: 1, y: 0, z: 0, element: 'O', radius: 0.66 },
    { x: 2, y: 0, z: 0, element: 'H', radius: 0.31 },
    { x: 4, y: 0, z: 0, element: 'N', radius: 0.65 },
  ],
  bonds: [
    { atom1: 0, atom2: 1, radius: 0.08, kind: 'Normal' },
    { atom1: 1, atom2: 2, radius: 0.08, kind: 'Normal' },
    { atom1: 2, atom2: 3, radius: 0.08, kind: 'Normal' },
  ],
  groups: [
    {
      id: 'A:ALA:1:',
      label: 'ALA A1',
      residueName: 'ALA',
      atomIndices: [0, 1, 2],
      centroid: { x: 1, y: 0, z: 0 },
    },
    {
      id: 'A:GLY:2:',
      label: 'GLY A2',
      residueName: 'GLY',
      atomIndices: [3],
      centroid: { x: 4, y: 0, z: 0 },
    },
  ],
  metadata: { warnings: [] },
} satisfies MoleculeData;

describe('highlight target resolution', () => {
  it('selects visible atoms and only bonds fully inside highlighted groups', () => {
    expect(resolveHighlightTargets(molecule, ['A:ALA:1:'], new Set(), 'shown', null)).toEqual({
      atomIndices: [0, 1, 2],
      bondIndices: [0, 1],
    });
  });

  it('excludes manually hidden atoms and any bonds connected to them', () => {
    expect(resolveHighlightTargets(molecule, ['A:ALA:1:'], new Set([1]), 'shown', null)).toEqual({
      atomIndices: [0, 2],
      bondIndices: [],
    });
  });

  it('respects hydrogen visibility without depending on render profile', () => {
    expect(resolveHighlightTargets(molecule, ['A:ALA:1:'], new Set(), 'hidden', null)).toEqual({
      atomIndices: [0, 1],
      bondIndices: [0],
    });
  });
});
