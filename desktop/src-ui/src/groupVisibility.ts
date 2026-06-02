export interface GroupVisibilityTarget {
  id: string;
  atomIndices: number[];
}

function selectedGroups<T extends GroupVisibilityTarget>(groups: T[], groupIds: string[]): T[] {
  const selectedIds = new Set(groupIds);
  return groups.filter((group) => selectedIds.has(group.id));
}

function sortedAtomIndices(indices: Iterable<number>): number[] {
  return Array.from(indices).sort((a, b) => a - b);
}

export function hideGroupAtoms<T extends GroupVisibilityTarget>(
  hiddenAtomIndices: number[],
  groups: T[],
  groupIds: string[],
): number[] {
  const next = new Set(hiddenAtomIndices);
  for (const group of selectedGroups(groups, groupIds)) {
    for (const atomIndex of group.atomIndices) {
      next.add(atomIndex);
    }
  }
  return sortedAtomIndices(next);
}

export function revealGroupAtoms<T extends GroupVisibilityTarget>(
  hiddenAtomIndices: number[],
  groups: T[],
  groupIds: string[],
): number[] {
  const next = new Set(hiddenAtomIndices);
  for (const group of selectedGroups(groups, groupIds)) {
    for (const atomIndex of group.atomIndices) {
      next.delete(atomIndex);
    }
  }
  return sortedAtomIndices(next);
}

