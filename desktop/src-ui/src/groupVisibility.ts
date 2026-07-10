export interface MoleculeGroupTarget {
  id: string;
  residueName?: string;
  label?: string;
  atomIndices: number[];
}

export interface MoleculeGroupSummary {
  key: string;
  ids: string[];
  label: string;
  moleculeCount: number;
  atomCount: number;
  hiddenCount: number;
  highlightedCount: number;
  allHidden: boolean;
  allHighlighted: boolean;
  partiallyHidden: boolean;
  partiallyHighlighted: boolean;
}

function sortedAtomIndices(indices: Iterable<number>): number[] {
  return Array.from(indices).sort((a, b) => a - b);
}

function orderedValidGroupIds<T extends MoleculeGroupTarget>(groups: T[], groupIds: Iterable<string>): string[] {
  const requested = new Set(groupIds);
  const next: string[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    if (!requested.has(group.id) || seen.has(group.id)) continue;
    seen.add(group.id);
    next.push(group.id);
  }

  return next;
}

export function normalizeGroupIds<T extends MoleculeGroupTarget>(groups: T[], groupIds: Iterable<string>): string[] {
  return orderedValidGroupIds(groups, groupIds);
}

export function toggleGroupIds<T extends MoleculeGroupTarget>(
  activeGroupIds: string[],
  groups: T[],
  groupIds: string[],
): string[] {
  const targetIds = orderedValidGroupIds(groups, groupIds);
  if (targetIds.length === 0) return normalizeGroupIds(groups, activeGroupIds);

  const active = new Set(normalizeGroupIds(groups, activeGroupIds));
  const shouldDeactivate = targetIds.every((id) => active.has(id));
  for (const id of targetIds) {
    if (shouldDeactivate) active.delete(id);
    else active.add(id);
  }

  return normalizeGroupIds(groups, active);
}

export function toggleGroupHidden<T extends MoleculeGroupTarget>(
  hiddenGroupIds: string[],
  groups: T[],
  groupIds: string[],
): string[] {
  return toggleGroupIds(hiddenGroupIds, groups, groupIds);
}

export function toggleGroupHighlighted<T extends MoleculeGroupTarget>(
  highlightedGroupIds: string[],
  groups: T[],
  groupIds: string[],
): string[] {
  return toggleGroupIds(highlightedGroupIds, groups, groupIds);
}

export function groupAtomIndices<T extends MoleculeGroupTarget>(
  groups: T[],
  groupIds: Iterable<string>,
): number[] {
  const targetIds = new Set(groupIds);
  const atomIndices = new Set<number>();

  for (const group of groups) {
    if (!targetIds.has(group.id)) continue;
    for (const atomIndex of group.atomIndices) atomIndices.add(atomIndex);
  }

  return sortedAtomIndices(atomIndices);
}

export function effectiveHiddenAtomIndices<T extends MoleculeGroupTarget>(
  manualHiddenAtomIndices: number[],
  groups: T[],
  hiddenGroupIds: string[],
): number[] {
  const atomIndices = new Set(manualHiddenAtomIndices);

  for (const atomIndex of groupAtomIndices(groups, hiddenGroupIds)) {
    atomIndices.add(atomIndex);
  }

  return sortedAtomIndices(atomIndices);
}

export function summarizeMoleculeGroups<T extends MoleculeGroupTarget>(
  groups: T[],
  hiddenGroupIds: string[],
  highlightedGroupIds: string[],
): MoleculeGroupSummary[] {
  const hiddenIds = new Set(hiddenGroupIds);
  const highlightedIds = new Set(highlightedGroupIds);
  const summaries = new Map<string, MoleculeGroupSummary>();

  for (const group of groups) {
    const key = group.residueName ?? 'Group';
    const summary = summaries.get(key) ?? {
      key,
      ids: [],
      label: group.residueName ?? group.label ?? 'Group',
      moleculeCount: 0,
      atomCount: 0,
      hiddenCount: 0,
      highlightedCount: 0,
      allHidden: false,
      allHighlighted: false,
      partiallyHidden: false,
      partiallyHighlighted: false,
    };

    summary.ids.push(group.id);
    summary.moleculeCount += 1;
    summary.atomCount += group.atomIndices.length;
    if (hiddenIds.has(group.id)) summary.hiddenCount += 1;
    if (highlightedIds.has(group.id)) summary.highlightedCount += 1;
    summaries.set(key, summary);
  }

  return Array.from(summaries.values())
    .map((summary) => ({
      ...summary,
      allHidden: summary.moleculeCount > 0 && summary.hiddenCount === summary.moleculeCount,
      allHighlighted: summary.moleculeCount > 0 && summary.highlightedCount === summary.moleculeCount,
      partiallyHidden: summary.hiddenCount > 0 && summary.hiddenCount < summary.moleculeCount,
      partiallyHighlighted: summary.highlightedCount > 0 && summary.highlightedCount < summary.moleculeCount,
    }))
    .sort((a, b) => b.moleculeCount - a.moleculeCount || a.label.localeCompare(b.label));
}
