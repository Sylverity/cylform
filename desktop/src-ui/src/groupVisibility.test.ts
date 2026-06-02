import { describe, expect, it } from 'vitest';
import { hideGroupAtoms, revealGroupAtoms } from './groupVisibility';

const groups = [
  { id: 'ala:1', atomIndices: [0, 1, 2] },
  { id: 'gly:2', atomIndices: [3, 4] },
  { id: 'ser:3', atomIndices: [5, 6, 7] },
];

describe('group visibility helpers', () => {
  it('hides selected group atoms without dropping existing hidden atoms', () => {
    expect(hideGroupAtoms([6], groups, ['ala:1', 'gly:2'])).toEqual([0, 1, 2, 3, 4, 6]);
  });

  it('reveals highlighted group atoms after every group has been hidden', () => {
    const allHidden = hideGroupAtoms([], groups, groups.map((group) => group.id));

    expect(revealGroupAtoms(allHidden, groups, ['gly:2'])).toEqual([0, 1, 2, 5, 6, 7]);
  });

  it('keeps unrelated hidden atoms hidden when revealing a group', () => {
    expect(revealGroupAtoms([0, 1, 2, 3, 4, 8], groups, ['ala:1'])).toEqual([3, 4, 8]);
  });
});

