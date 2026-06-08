import { useState, useEffect, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  HydrogenVisibility,
  MoleculeData,
  PersistentLabel,
  MoleculeGroup,
  PoseLibraryEntry,
  SavedPose,
  SelectionMode,
  SelectionSummary,
  SelectedAngleMeasurement,
  SelectedBondMeasurement,
  SelectedDihedralMeasurement,
} from '../App';

function clearSelection(): void {
  window.dispatchEvent(new CustomEvent('clear-selection'));
}

function selectionModeLabel(mode: SelectionMode): string {
  switch (mode) {
    case 'view': return 'View';
    case 'measure': return 'Measure';
    case 'atom': return 'Atom';
    case 'bond': return 'Bond';
    case 'atom-bond': return 'Atom+Bond';
    case 'label': return 'Label';
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
  distancePrecision: number;
  anglePrecision: number;
  savedPoses: SavedPose[];
  poseLibrary: PoseLibraryEntry[];
  onHideSelectedAtoms: () => void;
  onHideGroups: (groupIds: string[]) => void;
  onHighlightGroups: (groupIds: string[]) => void;
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

function clampPrecision(precision: number): number {
  return Math.min(4, Math.max(1, Math.round(precision)));
}

function formatDistance(value: number, precision: number): string {
  return `${value.toFixed(clampPrecision(precision))} A`;
}

function formatAngle(value: number, precision: number): string {
  return `${value.toFixed(clampPrecision(precision))} deg`;
}

function CollapsibleSection({
  title,
  children,
  collapsed,
  onToggle,
}: {
  title: string;
  children: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="info-section">
      <button type="button" className="section-toggle" onClick={onToggle} aria-expanded={!collapsed}>
        <h4>{title}</h4>
        <span className="section-chevron" aria-hidden="true">▼</span>
      </button>
      {!collapsed && children}
    </div>
  );
}

function SummaryChip({
  label,
  value,
  title,
  muted = false,
}: {
  label: string;
  value: ReactNode;
  title?: string;
  muted?: boolean;
}) {
  return (
    <div className="summary-chip" title={title}>
      <span>{label}</span>
      <strong className={muted ? 'muted' : undefined}>{value}</strong>
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
  distancePrecision,
  anglePrecision,
  savedPoses,
  poseLibrary,
  onHideSelectedAtoms,
  onHideGroups,
  onHighlightGroups,
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
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set([
    'Metadata',
    'Molecules',
    'Annotations',
    'Poses',
  ]));
  const [poseTab, setPoseTab] = useState<'local' | 'library'>('local');

  const activeError = error && error !== dismissedError ? error : null;

  useEffect(() => {
    if (error) setDismissedError(null);
  }, [error]);

  // Auto-expand relevant sections based on activity
  useEffect(() => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      // Expand Measure if there's an active measurement
      if (selectedBond || selectedAngle || selectedDihedral) {
        next.delete('Measure');
      }
      // Expand Annotations if in label mode with no annotations
      if (selectionMode === 'label' && persistentLabels.length === 0) {
        next.delete('Annotations');
      }
      return next;
    });
  }, [selectedBond, selectedAngle, selectedDihedral, selectionMode, persistentLabels.length]);

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

  if (!moleculeData) {
    return (
      <div className="info-panel">
        {error && (
          <div className="error-message">
            <strong>Error</strong>
            <p>{error}</p>
          </div>
        )}

        <section className="molecule-overview">
          <div className="molecule-overview-header">
            <span className="molecule-kicker">Ready</span>
            <strong>No molecule loaded</strong>
          </div>
          <div className="summary-chip-grid">
            <SummaryChip label="Formats" value="XYZ, PDB" />
            <SummaryChip label="Mode" value={selectionModeLabel(selectionMode)} />
            <SummaryChip label="Hydrogens" value={hydrogenVisibilityLabel(hydrogenVisibility)} />
            <SummaryChip label="Colours" value="Load molecule" muted />
          </div>
        </section>

        <div className="info-section">
          <h4>Measure</h4>
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
      </div>
    );
  }

  const anglePrompt =
    selectedDihedral
      ? selectedDihedral.stage < 3
        ? 'Click three atoms'
        : selectedAngle
          ? formatAngle(selectedAngle.angleDegrees, anglePrecision)
          : formatAngle(0, anglePrecision)
      : selectedAngle?.stage === 1
      ? `First atom: ${selectedAngle.atomElements[0]}`
      : selectedAngle?.stage === 2
        ? `Next: ${selectedAngle.atomElements[0]}-${selectedAngle.atomElements[1]}-?`
        : selectedAngle
          ? formatAngle(selectedAngle.angleDegrees, anglePrecision)
          : 'Click three atoms';

  const dihedralPrompt =
    selectedDihedral?.stage === 1
      ? `First atom: ${selectedDihedral.atomElements[0]}`
      : selectedDihedral?.stage === 2
        ? `Next: ${selectedDihedral.atomElements[0]}-${selectedDihedral.atomElements[1]}-?`
        : selectedDihedral?.stage === 3
          ? `Next: ${selectedDihedral.atomElements.slice(0, 3).join('-')}-?`
          : selectedDihedral
            ? formatAngle(selectedDihedral.dihedralDegrees, anglePrecision)
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

      {/* Molecule Overview — always expanded */}
      <section className="molecule-overview">
        <div className="molecule-overview-header">
          <span className="molecule-kicker">
            {moleculeData.metadata.sourceFormat ?? 'Molecule'} · WebGL
          </span>
          <strong title={moleculeData.name}>{moleculeData.name}</strong>
        </div>
        <div className="summary-chip-grid">
          <SummaryChip
            label="Atoms"
            value={(
              <>
                {visibleAtoms.length.toLocaleString()}
                {visibilityFilterActive && ` / ${moleculeData.atoms.length.toLocaleString()}`}
              </>
            )}
            title={`${visibleAtoms.length.toLocaleString()} visible atoms`}
          />
          <SummaryChip
            label="Bonds"
            value={(
              <>
                {visibleBonds.length.toLocaleString()}
                {visibilityFilterActive && ` / ${moleculeData.bonds.length.toLocaleString()}`}
              </>
            )}
            title={`${visibleBonds.length.toLocaleString()} visible bonds`}
          />
          <SummaryChip label="Hydrogens" value={hydrogenVisibilityLabel(hydrogenVisibility)} />
          <SummaryChip
            label="Saved"
            value={hasSavedPresentationState ? 'Yes' : 'No'}
            muted={!hasSavedPresentationState}
          />
        </div>
        {visibilityFilterActive && (
          <div className="compact-status-row">
            <span>Visibility</span>
            <strong>{hiddenAtomCount > 0 ? `${hiddenAtomCount} hidden atoms` : 'Hydrogen filter'}</strong>
          </div>
        )}
        {hasSavedPresentationState && (
          <div className="compact-status-row">
            <span>Presentation</span>
            <button
              type="button"
              className="appearance-mini-button"
              onClick={onClearSavedState}
              style={{ marginTop: 0 }}
            >
              Reset saved state
            </button>
          </div>
        )}
      </section>

      {/* Measure */}
      <CollapsibleSection
        title="Measure"
        collapsed={collapsedSections.has('Measure')}
        onToggle={() => toggleSection('Measure')}
      >
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
              ? `${selectedBond.atom1Element}-${selectedBond.atom2Element} · ${formatDistance(selectedBond.distance, distancePrecision)}`
              : 'Click bond'}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">Angle</span>
          <span className="info-value">{anglePrompt}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Dihedral</span>
          <span className="info-value">{dihedralPrompt}</span>
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
              {selectedDihedral.atomElements.filter(Boolean).join('-')}
            </span>
          </div>
        )}
        {(hasSelection || canHideSelectedAtoms || (selectionMode === 'measure' && canAddMeasurementLabel)) && (
          <div className="panel-action-row">
            {hasSelection && (
              <button type="button" className="panel-action compact" onClick={clearSelection}>
                Clear
              </button>
            )}
            {canHideSelectedAtoms && (
              <button type="button" className="panel-action compact" onClick={onHideSelectedAtoms}>
                Hide Atoms
              </button>
            )}
            {selectionMode === 'measure' && canAddMeasurementLabel && (
              <button type="button" className="panel-action compact" onClick={onAddMeasurementLabel}>
                Add Label
              </button>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* Annotations */}
      <CollapsibleSection
        title="Annotations"
        collapsed={collapsedSections.has('Annotations')}
        onToggle={() => toggleSection('Annotations')}
      >
        <div className="style-control-header">
          <span className="info-label">{persistentLabels.length.toLocaleString()} saved</span>
          {persistentLabels.length > 0 && (
            <button type="button" className="color-reset-all" onClick={onClearPersistentLabels}>
              Clear all
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

      {/* Poses — unified with tabs for local + library */}
      <CollapsibleSection
        title="Poses"
        collapsed={collapsedSections.has('Poses')}
        onToggle={() => toggleSection('Poses')}
      >
        {/* Tabs */}
        <div className="view-toggle-row" style={{ marginBottom: '8px' }}>
          <button
            type="button"
            className={poseTab === 'local' ? 'view-toggle active' : 'view-toggle'}
            onClick={() => setPoseTab('local')}
          >
            This Molecule ({savedPoses.length})
          </button>
          <button
            type="button"
            className={poseTab === 'library' ? 'view-toggle active' : 'view-toggle'}
            onClick={() => setPoseTab('library')}
          >
            Library ({poseLibrary.length})
          </button>
        </div>

        {poseTab === 'local' && (
          <>
            <div className="style-control-header">
              <span className="info-label">Saved camera views</span>
              <button type="button" className="color-reset-all" onClick={onSavePose}>
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
                        Library
                      </button>
                      <button type="button" className="color-reset" onClick={() => onDeletePose(pose.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {poseTab === 'library' && (
          <>
            {poseLibrary.length === 0 ? (
              <p className="info-note">Promote poses here to use them across molecule files.</p>
            ) : (
              <div className="label-list">
                {poseLibrary.map((entry) => (
                  <div key={entry.id} className="pose-library-row">
                    <PosePreviewImage previewImagePath={entry.previewImagePath} />
                    <div className="pose-library-details">
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
                          {entry.previewImagePath ? 'Refresh' : 'Preview'}
                        </button>
                        <button type="button" className="color-reset" onClick={() => onDeletePoseLibraryEntry(entry.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CollapsibleSection>

      {/* Metadata */}
      <CollapsibleSection
        title="Metadata"
        collapsed={collapsedSections.has('Metadata')}
        onToggle={() => toggleSection('Metadata')}
      >
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
              <span className="info-value">{sourceMetadata.chainCount || 'None'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Residues</span>
              <span className="info-value">{sourceMetadata.residueCount || 'None'}</span>
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

      {/* Molecules (groups) */}
      {groupSummaries.length > 0 && (
        <CollapsibleSection
          title="Molecules"
          collapsed={collapsedSections.has('Molecules')}
          onToggle={() => toggleSection('Molecules')}
        >
          <div className="style-control-header">
            <span className="info-label">Groups</span>
            <span className="info-value">{moleculeData.groups.length.toLocaleString()} molecules</span>
          </div>
          <div className="group-list">
            {groupSummaries.slice(0, 200).map((group) => (
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
                  <button type="button" className="color-reset" onClick={() => onHighlightGroups(group.ids)}>
                    Highlight
                  </button>
                  <button type="button" className="color-reset" onClick={() => onHideGroups(group.ids)}>
                    Hide
                  </button>
                </div>
              </div>
            ))}
          </div>
          {groupSummaries.length > 200 && (
            <p className="info-note">Showing the 200 most common molecule types.</p>
          )}
        </CollapsibleSection>
      )}
    </div>
  );
}
