import { describe, expect, it } from 'vitest';
import {
  effectiveHiddenAtomIndices,
  groupAtomIndices,
  summarizeMoleculeGroups,
  toggleGroupHidden,
  toggleGroupHighlighted,
} from './groupVisibility';

const groups = [
  { id: 'a:ala:1:', residueName: 'ALA', atomIndices: [0, 1, 2] },
  { id: 'a:gly:2:', residueName: 'GLY', atomIndices: [3, 4] },
  { id: 'b:gly:9:', residueName: 'GLY', atomIndices: [8, 9] },
  { id: 'a:ser:3:', residueName: 'SER', atomIndices: [5, 6, 7] },
];

describe('group presentation helpers', () => {
  it('toggles group hiding without mutating manual hidden atoms', () => {
    const hiddenGroups = toggleGroupHidden([], groups, ['a:ala:1:', 'a:gly:2:']);

    expect(hiddenGroups).toEqual(['a:ala:1:', 'a:gly:2:']);
    expect(effectiveHiddenAtomIndices([6], groups, hiddenGroups)).toEqual([0, 1, 2, 3, 4, 6]);
    expect(toggleGroupHidden(hiddenGroups, groups, ['a:ala:1:'])).toEqual(['a:gly:2:']);
  });

  it('treats a mixed row toggle as hide all, then show all', () => {
    const mixed = ['a:gly:2:'];
    const allGly = toggleGroupHidden(mixed, groups, ['a:gly:2:', 'b:gly:9:']);

    expect(allGly).toEqual(['a:gly:2:', 'b:gly:9:']);
    expect(toggleGroupHidden(allGly, groups, ['a:gly:2:', 'b:gly:9:'])).toEqual([]);
  });

  it('toggles highlights independently from hidden groups', () => {
    const hiddenGroups = toggleGroupHidden([], groups, ['a:gly:2:']);
    const highlightedGroups = toggleGroupHighlighted([], groups, ['a:gly:2:']);

    expect(hiddenGroups).toEqual(['a:gly:2:']);
    expect(highlightedGroups).toEqual(['a:gly:2:']);
    expect(toggleGroupHighlighted(highlightedGroups, groups, ['a:gly:2:'])).toEqual([]);
  });

  it('resolves atoms for valid groups only', () => {
    expect(groupAtomIndices(groups, ['missing', 'b:gly:9:', 'a:ala:1:'])).toEqual([0, 1, 2, 8, 9]);
  });

  it('summarizes grouped residue names with mixed hide and highlight counts', () => {
    const summaries = summarizeMoleculeGroups(groups, ['a:gly:2:'], ['a:gly:2:', 'b:gly:9:']);
    const gly = summaries.find((summary) => summary.key === 'GLY');

    expect(gly).toMatchObject({
      ids: ['a:gly:2:', 'b:gly:9:'],
      moleculeCount: 2,
      atomCount: 4,
      hiddenCount: 1,
      highlightedCount: 2,
      allHidden: false,
      allHighlighted: true,
      partiallyHidden: true,
      partiallyHighlighted: false,
    });
  });
});
