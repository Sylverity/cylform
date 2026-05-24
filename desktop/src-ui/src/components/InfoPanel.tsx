import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  ElementColorOverrides,
  HydrogenVisibility,
  MoleculeData,
  PersistentLabel,
  AtomStyleOverride,
  BondStyleOverride,
  BondStyleType,
  MoleculeGroup,
  PoseLibraryEntry,
  SavedPose,
  SelectionMode,
  SelectionSummary,
  SelectedAngleMeasurement,
  SelectedBondMeasurement,
  SelectedDihedralMeasurement,
} from '../App';

const DEFAULT_ELEMENT_COLORS: Record<string, string> = {
  H: '#cfd3d7',
  C: '#8d949c',
  N: '#4b84d8',
  O: '#ea6a1a',
  F: '#33cc55',
  P: '#ff8800',
  S: '#ddaa00',
  Cl: '#22bb44',
  Br: '#aa2200',
  I: '#770088',
};

function defaultElementColor(element: string): string {
  return DEFAULT_ELEMENT_COLORS[element] ?? '#888888';
}

function clearSelection(): void {
  window.dispatchEvent(new CustomEvent('clear-selection'));
}

function selectionModeLabel(mode: SelectionMode): string {
  switch (mode) {
    case 'view':
      return 'View';
    case 'measure':
      return 'Measure';
    case 'atom':
      return 'Atom';
    case 'bond':
      return 'Bond';
    case 'atom-bond':
      return 'Atom+Bond';
    case 'label':
      return 'Label';
  }
}

function hydrogenVisibilityLabel(mode: HydrogenVisibility): string {
  if (mode === 'shown') return 'Shown';
  if (mode === 'hidden') return 'Hidden';
  return 'Hide C-H';
}

function isCarbonHydrogen(atomIndex: number, moleculeData: MoleculeData): boolean {
  const atom = moleculeData.atoms[atomIndex];
  if (!atom || atom.element !== 'H') return false;

  return moleculeData.bonds.some((bond) => {
    if (bond.atom1 === atomIndex) return moleculeData.atoms[bond.atom2]?.element === 'C';
    if (bond.atom2 === atomIndex) return moleculeData.atoms[bond.atom1]?.element === 'C';
    return false;
  });
}

function isAtomVisible(
  atomIndex: number,
  moleculeData: MoleculeData,
  hydrogenVisibility: HydrogenVisibility,
  hiddenAtomSet: Set<number>,
): boolean {
  const atom = moleculeData.atoms[atomIndex];
  if (!atom || hiddenAtomSet.has(atomIndex)) return false;
  if (hydrogenVisibility === 'hidden' && atom.element === 'H') return false;
  if (hydrogenVisibility === 'hide-c-h' && isCarbonHydrogen(atomIndex, moleculeData)) return false;
  return true;
}

function metadataSummary(moleculeData: MoleculeData) {
  const pdbAtoms = moleculeData.atoms.filter((atom) => atom.metadata);
  const chains = new Set<string>();
  const residues = new Set<string>();
  let heteroAtomCount = 0;

  for (const atom of pdbAtoms) {
    const metadata = atom.metadata;
    if (!metadata) continue;

    if (metadata.chainId) chains.add(metadata.chainId);
    if (metadata.residueName || metadata.residueSequence !== undefined || metadata.chainId) {
      residues.add([
        metadata.chainId ?? '',
        metadata.residueName ?? '',
        metadata.residueSequence ?? '',
        metadata.insertionCode ?? '',
      ].join(':'));
    }
    if (metadata.recordType === 'HETATM') heteroAtomCount += 1;
  }

  return {
    chainCount: chains.size,
    residueCount: residues.size,
    heteroAtomCount,
    hasAtomMetadata: pdbAtoms.length > 0,
  };
}

function summarizeGroups(groups: MoleculeGroup[], hiddenAtomSet: Set<number>) {
  const summaries = new Map<string, {
    ids: string[];
    label: string;
    residueName: string;
    moleculeCount: number;
    atomCount: number;
    hiddenCount: number;
  }>();

  for (const group of groups) {
    const residueName = group.residueName ?? 'Group';
    const summary = summaries.get(residueName) ?? {
      ids: [],
      label: residueName,
      residueName,
      moleculeCount: 0,
      atomCount: 0,
      hiddenCount: 0,
    };
    summary.ids.push(group.id);
    summary.moleculeCount += 1;
    summary.atomCount += group.atomIndices.length;
    if (group.atomIndices.every((atomIndex) => hiddenAtomSet.has(atomIndex))) {
      summary.hiddenCount += 1;
    }
    summaries.set(residueName, summary);
  }

  return Array.from(summaries.values())
    .sort((a, b) => b.moleculeCount - a.moleculeCount || a.label.localeCompare(b.label));
}

interface InfoPanelProps {
  moleculeData: MoleculeData | null;
  hydrogenVisibility: HydrogenVisibility;
  hiddenAtomIndices: number[];
  selectedBond: SelectedBondMeasurement | null;
  selectedAngle: SelectedAngleMeasurement | null;
  selectedDihedral: SelectedDihedralMeasurement | null;
  persistentLabels: PersistentLabel[];
  selectionMode: SelectionMode;
  selectionSummary: SelectionSummary;
  elementColorOverrides: ElementColorOverrides;
  atomStyleOverrides: Record<string, AtomStyleOverride>;
  bondStyleOverrides: Record<string, BondStyleOverride>;
  atomSizeScale: number;
  savedPoses: SavedPose[];
  poseLibrary: PoseLibraryEntry[];
  onElementColorChange: (element: string, color: string) => void;
  onResetElementColor: (element: string) => void;
  onResetAllElementColors: () => void;
  onAtomSizeScaleChange: (scale: number) => void;
  onHydrogenVisibilityChange: (mode: HydrogenVisibility) => void;
  onHideSelectedAtoms: () => void;
  onHideGroups: (groupIds: string[]) => void;
  onHighlightGroups: (groupIds: string[]) => void;
  onShowAllAtoms: () => void;
  onStyleSelectedAtoms: (color: string) => void;
  onSizeSelectedAtoms: () => void;
  onResetSelectedAtomStyles: () => void;
  onRestyleSelectedBonds: (type: BondStyleType) => void;
  onResetSelectedBondStyles: () => void;
  onSavePose: () => void;
  onApplyPose: (pose: SavedPose) => void;
  onUpdatePose: (pose: SavedPose) => void;
  onRenamePose: (id: string, name: string) => void;
  onDeletePose: (id: string) => void;
  onAddPoseToLibrary: (pose: SavedPose) => void;
  onOpenPoseLibraryEntry: (entry: PoseLibraryEntry) => void;
  onRenamePoseLibraryEntry: (id: string, name: string) => void;
  onDeletePoseLibraryEntry: (id: string) => void;
  onGeneratePosePreview: (entry: PoseLibraryEntry) => void;
  onClearSavedState: () => void;
  onAddMeasurementLabel: () => void;
  onTogglePersistentLabel: (id: string) => void;
  onRenamePersistentLabel: (id: string, text: string) => void;
  onDeletePersistentLabel: (id: string) => void;
  onClearPersistentLabels: () => void;
  error: string | null;
  hiddenAtomCount: number;
  hasSavedPresentationState: boolean;
}


function CollapsibleSection({
  title,
  children,
  collapsed,
  onToggle,
}: {
  title: string;
  children: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="info-section">
      <button type="button" className="section-toggle" onClick={onToggle} aria-expanded={!collapsed}>
        <h4>{title}</h4>
        <span className="section-chevron" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && children}
    </div>
  );
}

function PosePreviewImage({ previewImagePath }: { previewImagePath: string | null }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!previewImagePath) {
      setDataUrl(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setFailed(false);

    const loadPreview = async () => {
      try {
        const loaded = await invoke<string | null>('get_pose_preview_data_url', { previewImagePath });
        if (!cancelled) setDataUrl(loaded);
      } catch {
        if (!cancelled) {
          setDataUrl(null);
          setFailed(true);
        }
      }
    };

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [previewImagePath]);

  if (!previewImagePath || !dataUrl || failed) {
    return <div className="pose-library-preview placeholder" aria-hidden="true" />;
  }

  return (
    <img
      className="pose-library-preview"
      src={dataUrl}
      alt=""
      aria-hidden="true"
      onError={() => setFailed(true)}
    />
  );
}

export function InfoPanel({
  moleculeData,
  hydrogenVisibility,
  hiddenAtomIndices,
  selectedBond,
  selectedAngle,
  selectedDihedral,
  persistentLabels,
  selectionMode,
  selectionSummary,
  elementColorOverrides,
  atomStyleOverrides,
  bondStyleOverrides,
  atomSizeScale,
  savedPoses,
  poseLibrary,
  onElementColorChange,
  onResetElementColor,
  onResetAllElementColors,
  onAtomSizeScaleChange,
  onHydrogenVisibilityChange,
  onHideSelectedAtoms,
  onHideGroups,
  onHighlightGroups,
  onShowAllAtoms,
  onStyleSelectedAtoms,
  onSizeSelectedAtoms,
  onResetSelectedAtomStyles,
  onRestyleSelectedBonds,
  onResetSelectedBondStyles,
  onSavePose,
  onApplyPose,
  onUpdatePose,
  onRenamePose,
  onDeletePose,
  onAddPoseToLibrary,
  onOpenPoseLibraryEntry,
  onRenamePoseLibraryEntry,
  onDeletePoseLibraryEntry,
  onGeneratePosePreview,
  onClearSavedState,
  onAddMeasurementLabel,
  onTogglePersistentLabel,
  onRenamePersistentLabel,
  onDeletePersistentLabel,
  onClearPersistentLabels,
  error,
  hiddenAtomCount,
  hasSavedPresentationState,
}: InfoPanelProps) {
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const activeError = error && error !== dismissedError ? error : null;

  useEffect(() => {
    if (error) setDismissedError(null);
  }, [error]);

  function toggleSection(name: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }
  const hiddenAtomSet = new Set(hiddenAtomIndices);
  const visibleAtoms = moleculeData
    ? moleculeData.atoms.filter((_, atomIndex) => (
        isAtomVisible(atomIndex, moleculeData, hydrogenVisibility, hiddenAtomSet)
      ))
    : [];
  const visibleElements = Array.from(new Set(visibleAtoms.map((atom) => atom.element))).sort();
  const visibleBonds = moleculeData
    ? moleculeData.bonds.filter((bond) => {
        return (
          isAtomVisible(bond.atom1, moleculeData, hydrogenVisibility, hiddenAtomSet) &&
          isAtomVisible(bond.atom2, moleculeData, hydrogenVisibility, hiddenAtomSet)
        );
      })
    : [];
  const hasSelection = Boolean(
    selectedBond ||
    selectedAngle ||
    selectedDihedral ||
    selectionSummary.atomCount > 0 ||
    selectionSummary.bondCount > 0,
  );
  const hasColorOverrides = Object.keys(elementColorOverrides).length > 0;
  const hasAtomStyleOverrides = Object.keys(atomStyleOverrides).length > 0;
  const hasBondStyleOverrides = Object.keys(bondStyleOverrides).length > 0;
  const sourceMetadata = moleculeData ? metadataSummary(moleculeData) : null;
  const groupSummaries = moleculeData ? summarizeGroups(moleculeData.groups, hiddenAtomSet) : [];
  const canAddMeasurementLabel = Boolean(
    selectedBond ||
    (selectedAngle?.stage === 3 && selectedAngle.anchor) ||
    (selectedDihedral?.stage === 4 && selectedDihedral.anchor),
  );
  const visibilityFilterActive = hydrogenVisibility !== 'shown' || hiddenAtomCount > 0;
  const canHideSelectedAtoms = (
    (selectionMode === 'atom' || selectionMode === 'atom-bond') &&
    selectionSummary.atomCount > 0
  );
  const canStyleSelectedAtoms = canHideSelectedAtoms;
  const canStyleSelectedBonds = (
    (selectionMode === 'bond' || selectionMode === 'atom-bond') &&
    selectionSummary.bondCount > 0
  );

  if (!moleculeData) {
    return (
      <div className="info-panel">
        {error && (
          <div className="error-message">
            <strong>Error</strong>
            <p>{error}</p>
          </div>
        )}

        <div className="info-section">
          <h4>Molecule</h4>
          <div className="info-row">
            <span className="info-label">File</span>
            <span className="info-value muted">No molecule loaded</span>
          </div>
          <div className="info-row">
            <span className="info-label">Formats</span>
            <span className="info-value">XYZ, PDB</span>
          </div>
        </div>

        <div className="info-section">
          <h4>Measure</h4>
          <div className="info-row">
            <span className="info-label">Mode</span>
            <span className="info-value">{selectionModeLabel(selectionMode)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Distance</span>
            <span className="info-value muted">Load molecule</span>
          </div>
          <div className="info-row">
            <span className="info-label">Angle</span>
            <span className="info-value muted">Load molecule</span>
          </div>
          <div className="info-row">
            <span className="info-label">Dihedral</span>
            <span className="info-value muted">Load molecule</span>
          </div>
        </div>

        <div className="info-section">
          <h4>Style</h4>
          <div className="info-row">
            <span className="info-label">Hydrogens</span>
            <span className="info-value">{hydrogenVisibilityLabel(hydrogenVisibility)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Colours</span>
            <span className="info-value muted">Load molecule</span>
          </div>
        </div>
      </div>
    );
  }

  const anglePrompt =
    selectedDihedral
      ? selectedDihedral.stage < 3
        ? 'Click three atoms'
        : `${selectedAngle?.angleDegrees.toFixed(2) ?? '0.00'} deg`
      : selectedAngle?.stage === 1
      ? `First atom: ${selectedAngle.atomElements[0]}`
      : selectedAngle?.stage === 2
        ? `Next: ${selectedAngle.atomElements[0]}-${selectedAngle.atomElements[1]}-?`
        : selectedAngle
          ? `${selectedAngle.angleDegrees.toFixed(2)} deg`
          : 'Click three atoms';
  const dihedralPrompt =
    selectedDihedral?.stage === 1
      ? `First atom: ${selectedDihedral.atomElements[0]}`
      : selectedDihedral?.stage === 2
        ? `Next: ${selectedDihedral.atomElements[0]}-${selectedDihedral.atomElements[1]}-?`
        : selectedDihedral?.stage === 3
          ? `Next: ${selectedDihedral.atomElements.slice(0, 3).join('-')}-?`
          : selectedDihedral
            ? `${selectedDihedral.dihedralDegrees.toFixed(2)} deg`
            : 'Click four atoms';

  return (
    <div className="info-panel">
      {activeError && (
        <div className="error-message">
          <div className="error-header">
            <strong>Error</strong>
            <button
              type="button"
              className="error-dismiss"
              onClick={() => setDismissedError(activeError)}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
          <p>{activeError}</p>
        </div>
      )}

      <CollapsibleSection title="Molecule" collapsed={collapsedSections.has('Molecule')} onToggle={() => toggleSection('Molecule')}>
        <div className="info-row">
          <span className="info-label">Name</span>
          <span className="info-value" title={moleculeData.name}>
            {moleculeData.name.length > 22
              ? moleculeData.name.slice(0, 22) + '…'
              : moleculeData.name}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">Atoms</span>
          <span className="info-value">
            {visibleAtoms.length.toLocaleString()}
            {visibilityFilterActive && ` / ${moleculeData.atoms.length.toLocaleString()}`}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">Bonds</span>
          <span className="info-value">
            {visibleBonds.length.toLocaleString()}
            {visibilityFilterActive && ` / ${moleculeData.bonds.length.toLocaleString()}`}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">Hydrogens</span>
          <span className="info-value">
            {hydrogenVisibilityLabel(hydrogenVisibility)}
          </span>
        </div>
        {visibilityFilterActive && (
          <div className="info-row">
            <span className="info-label">Visibility</span>
            <span className="info-value">
              {hiddenAtomCount > 0 ? `${hiddenAtomCount} hidden atoms` : 'Hydrogen filter'}
            </span>
          </div>
        )}
        <div className="info-row">
          <span className="info-label">Engine</span>
          <span className="info-value" style={{ color: '#22c55e' }}>WebGL · Three.js</span>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Metadata" collapsed={collapsedSections.has('Metadata')} onToggle={() => toggleSection('Metadata')}>
        <div className="info-row">
          <span className="info-label">Format</span>
          <span className="info-value">{moleculeData.metadata.sourceFormat ?? 'Unknown'}</span>
        </div>
        {moleculeData.metadata.title && moleculeData.metadata.title !== moleculeData.name && (
          <div className="info-row">
            <span className="info-label">Title</span>
            <span className="info-value" title={moleculeData.metadata.title}>
              {moleculeData.metadata.title.length > 22
                ? moleculeData.metadata.title.slice(0, 22) + '…'
                : moleculeData.metadata.title}
            </span>
          </div>
        )}
        {moleculeData.metadata.frameCount && moleculeData.metadata.frameCount > 1 && (
          <div className="info-row">
            <span className="info-label">
              {moleculeData.metadata.sourceFormat === 'PDB' ? 'Models' : 'Frames'}
            </span>
            <span className="info-value">
              {(moleculeData.metadata.loadedFrameIndex ?? 0) + 1} / {moleculeData.metadata.frameCount}
            </span>
          </div>
        )}
        {typeof moleculeData.metadata.energy === 'number' && (
          <div className="info-row">
            <span className="info-label">Energy</span>
            <span className="info-value">
              {moleculeData.metadata.energy.toPrecision(8)}
              {moleculeData.metadata.energyUnit && moleculeData.metadata.energyUnit !== 'unknown'
                ? ` ${moleculeData.metadata.energyUnit}`
                : ''}
            </span>
          </div>
        )}
        {sourceMetadata?.hasAtomMetadata && (
          <>
            <div className="info-row">
              <span className="info-label">Chains</span>
              <span className="info-value">
                {sourceMetadata.chainCount || 'None'}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Residues</span>
              <span className="info-value">
                {sourceMetadata.residueCount || 'None'}
              </span>
            </div>
            {sourceMetadata.heteroAtomCount > 0 && (
              <div className="info-row">
                <span className="info-label">HETATM</span>
                <span className="info-value">{sourceMetadata.heteroAtomCount}</span>
              </div>
            )}
          </>
        )}
        {moleculeData.metadata.warnings.length > 0 && (
          <div className="metadata-warnings">
            {moleculeData.metadata.warnings.slice(0, 2).map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {groupSummaries.length > 0 && (
        <CollapsibleSection title="Molecules" collapsed={collapsedSections.has('Molecules')} onToggle={() => toggleSection('Molecules')}>
          <div className="style-control-header">
            <span className="info-label">Groups</span>
            <span className="info-value">
              {moleculeData.groups.length.toLocaleString()} molecules
            </span>
          </div>
          <div className="group-list">
            {groupSummaries.slice(0, 12).map((group) => (
              <div key={group.residueName} className="group-row">
                <div className="group-row-main">
                  <span className={group.hiddenCount === group.moleculeCount ? 'group-name muted' : 'group-name'}>
                    {group.label}
                  </span>
                  <span className="group-detail">
                    {group.moleculeCount.toLocaleString()} mol · {group.atomCount.toLocaleString()} atoms
                    {group.hiddenCount > 0 && ` · ${group.hiddenCount.toLocaleString()} hidden`}
                  </span>
                </div>
                <div className="group-actions">
                  <button
                    type="button"
                    className="color-reset"
                    onClick={() => onHighlightGroups(group.ids)}
                  >
                    Highlight
                  </button>
                  <button
                    type="button"
                    className="color-reset"
                    onClick={() => onHideGroups(group.ids)}
                  >
                    Hide
                  </button>
                </div>
              </div>
            ))}
          </div>
          {groupSummaries.length > 12 && (
            <p className="info-note">
              Showing the 12 most common molecule types.
            </p>
          )}
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Measure" collapsed={collapsedSections.has('Measure')} onToggle={() => toggleSection('Measure')}>
        <div className="info-row">
          <span className="info-label">Mode</span>
          <span className="info-value">{selectionModeLabel(selectionMode)}</span>
        </div>
        {selectionMode !== 'measure' && (
          <div className="info-row">
            <span className="info-label">Selected</span>
            <span className="info-value">
              {selectionSummary.atomCount} atoms · {selectionSummary.bondCount} bonds
            </span>
          </div>
        )}
        <div className="info-row">
          <span className="info-label">Distance</span>
          <span className="info-value">
            {!selectedAngle && selectedBond
              ? `${selectedBond.atom1Element}-${selectedBond.atom2Element} · ${selectedBond.distance.toFixed(2)} A`
              : 'Click bond'}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">Angle</span>
          <span className="info-value">
            {anglePrompt}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">Dihedral</span>
          <span className="info-value">
            {dihedralPrompt}
          </span>
        </div>
        {selectedAngle && (
          <div className="info-row">
            <span className="info-label">Angle atoms</span>
            <span className="info-value">
              {selectedAngle.stage === 1
                ? selectedAngle.atomElements[0]
                : selectedAngle.stage === 2
                  ? `${selectedAngle.atomElements[0]}-${selectedAngle.atomElements[1]}`
                  : selectedAngle.atomElements.join('-')}
            </span>
          </div>
        )}
        {selectedDihedral && (
          <div className="info-row">
            <span className="info-label">Dihedral atoms</span>
            <span className="info-value">
              {selectedDihedral.atomElements
                .filter(Boolean)
                .join('-')}
            </span>
          </div>
        )}
        {hasSelection && (
          <button
            type="button"
            className="panel-action"
            onClick={clearSelection}
          >
            Clear Selection
          </button>
        )}
        {canHideSelectedAtoms && (
          <button
            type="button"
            className="panel-action"
            onClick={onHideSelectedAtoms}
          >
            Hide Selected Atoms
          </button>
        )}
        {selectionMode === 'measure' && canAddMeasurementLabel && (
          <button
            type="button"
            className="panel-action"
            onClick={onAddMeasurementLabel}
          >
            Add Label
          </button>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Annotations" collapsed={collapsedSections.has('Labels')} onToggle={() => toggleSection('Labels')}>
        <div className="style-control-header">
          <h4>Annotations</h4>
          {persistentLabels.length > 0 && (
            <button
              type="button"
              className="color-reset-all"
              onClick={onClearPersistentLabels}
            >
              Clear annotations
            </button>
          )}
        </div>
        {persistentLabels.length === 0 ? (
          <p className="info-note">
            Use Label mode to click atoms, or save active measurements as annotations.
          </p>
        ) : (
          <div className="label-list">
            {persistentLabels.map((label) => (
              <div key={label.id} className="label-row">
                <div className="label-row-text">
                  <span className="label-type">{label.type}</span>
                  <input
                    className={label.visible ? 'label-edit-input' : 'label-edit-input muted'}
                    value={label.text}
                    onChange={(event) => onRenamePersistentLabel(label.id, event.target.value)}
                    aria-label={`${label.type} annotation text`}
                  />
                </div>
                <div className="label-actions">
                  <button
                    type="button"
                    className="color-reset"
                    onClick={() => onTogglePersistentLabel(label.id)}
                  >
                    {label.visible ? 'Hide' : 'Show'}
                  </button>
                  <button
                    type="button"
                    className="color-reset"
                    onClick={() => onDeletePersistentLabel(label.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Poses" collapsed={collapsedSections.has('Poses')} onToggle={() => toggleSection('Poses')}>
        <div className="style-control-header">
          <h4>Poses</h4>
          <button
            type="button"
            className="color-reset-all"
            onClick={onSavePose}
          >
            Save pose
          </button>
        </div>
        {savedPoses.length === 0 ? (
          <p className="info-note">Save reusable camera views for publication figures.</p>
        ) : (
          <div className="label-list">
            {savedPoses.map((pose) => (
              <div key={pose.id} className="pose-row">
                <input
                  className="pose-name-input"
                  value={pose.name}
                  onChange={(event) => onRenamePose(pose.id, event.target.value)}
                  aria-label="Pose name"
                />
                <div className="label-actions">
                  <button type="button" className="color-reset" onClick={() => onApplyPose(pose)}>
                    Load
                  </button>
                  <button type="button" className="color-reset" onClick={() => onUpdatePose(pose)}>
                    Update
                  </button>
                  <button type="button" className="color-reset" onClick={() => onAddPoseToLibrary(pose)}>
                    Add to Library
                  </button>
                  <button type="button" className="color-reset" onClick={() => onDeletePose(pose.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Pose Library" collapsed={collapsedSections.has('Pose Library')} onToggle={() => toggleSection('Pose Library')}>
        {poseLibrary.length === 0 ? (
          <p className="info-note">Promoted poses will appear here across molecule files.</p>
        ) : (
          <div className="label-list">
            {poseLibrary.map((entry) => (
              <div key={entry.id} className="pose-library-row">
                <PosePreviewImage previewImagePath={entry.previewImagePath} />
                <input
                  className="pose-name-input"
                  value={entry.name}
                  onChange={(event) => onRenamePoseLibraryEntry(entry.id, event.target.value)}
                  aria-label="Library pose name"
                />
                <button
                  type="button"
                  className="library-molecule-button"
                  onClick={() => onOpenPoseLibraryEntry(entry)}
                  title={entry.moleculePath}
                >
                  <span>{entry.moleculeDisplayName}</span>
                  <small>
                    {entry.atomCount ? `${entry.atomCount} atoms` : 'Open molecule'}
                    {entry.sourceFormat ? ` · ${entry.sourceFormat.toUpperCase()}` : ''}
                  </small>
                </button>
                <div className="label-actions">
                  <button type="button" className="color-reset" onClick={() => onOpenPoseLibraryEntry(entry)}>
                    Load
                  </button>
                  <button type="button" className="color-reset" onClick={() => onGeneratePosePreview(entry)}>
                    {entry.previewImagePath ? 'Refresh Preview' : 'Generate Preview'}
                  </button>
                  <button type="button" className="color-reset" onClick={() => onDeletePoseLibraryEntry(entry.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Files" collapsed={collapsedSections.has('Files')} onToggle={() => toggleSection('Files')}>
        {hasSavedPresentationState && (
          <button
            type="button"
            className="panel-action"
            onClick={onClearSavedState}
          >
            Reset Saved Presentation
          </button>
        )}
        {!hasSavedPresentationState && (
          <p className="info-note">Presentation state is stored per molecule when you save poses, labels, styles, or camera changes.</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Style" collapsed={collapsedSections.has('Style')} onToggle={() => toggleSection('Style')}>
        <div className="info-row">
          <span className="info-label">Hydrogens</span>
          <span className="info-value">{hydrogenVisibilityLabel(hydrogenVisibility)}</span>
        </div>
        <div className="visibility-mode-grid" aria-label="Hydrogen visibility">
          {([
            ['shown', 'Show H'],
            ['hidden', 'Hide H'],
            ['hide-c-h', 'Hide C-H H'],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={hydrogenVisibility === mode ? 'visibility-mode active' : 'visibility-mode'}
              onClick={() => onHydrogenVisibilityChange(mode)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="info-row">
          <span className="info-label">Hidden atoms</span>
          <span className="info-value">
            {hiddenAtomCount > 0 ? hiddenAtomCount.toLocaleString() : 'None'}
          </span>
        </div>
        {visibilityFilterActive && (
          <button
            type="button"
            className="panel-action"
            onClick={onShowAllAtoms}
          >
            Show All Atoms
          </button>
        )}
        <div className="style-control">
          <div className="style-control-header">
            <span className="info-label">Atom size</span>
            <span className="info-value">{atomSizeScale.toFixed(2)}x</span>
          </div>
          <input
            className="style-range"
            type="range"
            min="0.6"
            max="1.8"
            step="0.05"
            value={atomSizeScale}
            onChange={(event) => onAtomSizeScaleChange(Number(event.target.value))}
            aria-label="Atom size"
          />
        </div>
        {visibleElements.length === 0 ? (
          <p className="info-note">Load a molecule to adjust atom colours.</p>
        ) : (
          <>
            <div className="style-control-header color-header">
              <span className="info-label">Element colours</span>
              {hasColorOverrides && (
                <button
                  type="button"
                  className="color-reset-all"
                  onClick={onResetAllElementColors}
                >
                  Reset all
                </button>
              )}
            </div>
            <div className="color-list">
              {visibleElements.map((element) => {
                const color = elementColorOverrides[element] ?? defaultElementColor(element);
                const isCustom = Boolean(elementColorOverrides[element]);

                return (
                  <div key={element} className="color-row">
                    <span className="color-label">{element}</span>
                    <input
                      className="color-input"
                      type="color"
                      value={color}
                      onChange={(event) => onElementColorChange(element, event.target.value)}
                      aria-label={`${element} colour`}
                    />
                    <span className={isCustom ? 'color-status custom' : 'color-status'}>
                      {isCustom ? color.toUpperCase() : 'Default'}
                    </span>
                    {isCustom && (
                      <button
                        type="button"
                        className="color-reset"
                        onClick={() => onResetElementColor(element)}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
        {(canStyleSelectedAtoms || canStyleSelectedBonds || hasAtomStyleOverrides || hasBondStyleOverrides) && (
          <div className="selection-style-box">
            <div className="style-control-header">
              <span className="info-label">Selected styling</span>
              <span className="info-value">
                {selectionSummary.atomCount} atoms · {selectionSummary.bondCount} bonds
              </span>
            </div>
            {canStyleSelectedAtoms && (
              <div className="selection-style-row">
                <input
                  className="color-input"
                  type="color"
                  defaultValue="#ffbf73"
                  onChange={(event) => onStyleSelectedAtoms(event.target.value)}
                  aria-label="Selected atom colour"
                />
                <button type="button" className="color-reset" onClick={onResetSelectedAtomStyles}>
                  Reset atom style
                </button>
                <button type="button" className="color-reset" onClick={onSizeSelectedAtoms}>
                  Apply size
                </button>
              </div>
            )}
            {canStyleSelectedBonds && (
              <div className="bond-style-grid">
                {([
                  ['full', 'Full'],
                  ['ts', 'TS'],
                  ['dative', 'Dative'],
                  ['interaction', 'Inter'],
                  ['thin', 'Thin'],
                ] as const).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    className="visibility-mode"
                    onClick={() => onRestyleSelectedBonds(type)}
                  >
                    {label}
                  </button>
                ))}
                <button type="button" className="visibility-mode" onClick={onResetSelectedBondStyles}>
                  Reset
                </button>
              </div>
            )}
            {!canStyleSelectedAtoms && !canStyleSelectedBonds && (
              <p className="info-note">Select atoms or bonds to apply local visual styles.</p>
            )}
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
