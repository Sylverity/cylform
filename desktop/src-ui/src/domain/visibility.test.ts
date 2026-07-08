import { describe, expect, it } from 'vitest';
import { isAtomVisible, isCarbonHydrogen, labelSourceVisible } from './visibility';
import type { MoleculeData, PersistentLabel } from '../types';

function molecule(): MoleculeData {
  // Methane-like fragment plus an O-H hydrogen: C(0)-H(1), O(2)-H(3)
  return {
    path: '/tmp/mol.xyz',
    name: 'mol.xyz',
    atoms: [
      { x: 0, y: 0, z: 0, element: 'C', radius: 0.7 },
      { x: 1, y: 0, z: 0, element: 'H', radius: 0.3 },
      { x: 0, y: 1, z: 0, element: 'O', radius: 0.6 },
      { x: 0, y: 2, z: 0, element: 'H', radius: 0.3 },
    ],
    bonds: [
      { atom1: 0, atom2: 1, radius: 0.1, kind: 'Normal' },
      { atom1: 2, atom2: 3, radius: 0.1, kind: 'Normal' },
    ],
    groups: [],
    metadata: { warnings: [] },
  };
}

describe('isCarbonHydrogen', () => {
  it('flags hydrogens bonded to carbon only', () => {
    const data = molecule();
    expect(isCarbonHydrogen(1, data)).toBe(true);
    expect(isCarbonHydrogen(3, data)).toBe(false);
    expect(isCarbonHydrogen(0, data)).toBe(false);
  });
});

describe('isAtomVisible', () => {
  it('hides explicitly hidden atoms', () => {
    expect(isAtomVisible(0, molecule(), 'shown', new Set([0]))).toBe(false);
  });

  it('hides all hydrogens when hydrogen visibility is hidden', () => {
    const data = molecule();
    expect(isAtomVisible(1, data, 'hidden', new Set())).toBe(false);
    expect(isAtomVisible(3, data, 'hidden', new Set())).toBe(false);
    expect(isAtomVisible(0, data, 'hidden', new Set())).toBe(true);
  });

  it('hides only carbon-bound hydrogens in hide-c-h mode', () => {
    const data = molecule();
    expect(isAtomVisible(1, data, 'hide-c-h', new Set())).toBe(false);
    expect(isAtomVisible(3, data, 'hide-c-h', new Set())).toBe(true);
  });

  it('prefers precomputed visibility flags when provided', () => {
    const data = molecule();
    const flags = {
      isHydrogen: [false, true, false, true],
      isCarbonHydrogen: [false, false, false, true],
    };
    expect(isAtomVisible(3, data, 'hide-c-h', new Set(), flags)).toBe(false);
  });
});

describe('labelSourceVisible', () => {
  const label = (source: PersistentLabel['source']): PersistentLabel => ({
    id: 'label-1',
    type: 'Distance',
    text: 'C-H 1.09 A',
    anchor: { x: 0, y: 0, z: 0 },
    visible: true,
    source,
  });

  it('is hidden without molecule data', () => {
    expect(labelSourceVisible(label({ bond: [0, 1] }), null, 'shown', new Set())).toBe(false);
  });

  it('stays visible when the label has no source atoms', () => {
    expect(labelSourceVisible(label(undefined), molecule(), 'hidden', new Set())).toBe(true);
  });

  it('hides the label when any source atom is hidden', () => {
    const data = molecule();
    expect(labelSourceVisible(label({ bond: [0, 1] }), data, 'shown', new Set())).toBe(true);
    expect(labelSourceVisible(label({ bond: [0, 1] }), data, 'hide-c-h', new Set())).toBe(false);
    expect(labelSourceVisible(label({ atomIndex: 2 }), data, 'shown', new Set([2]))).toBe(false);
  });
});
