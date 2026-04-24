import type {
  ElementColorOverrides,
  MoleculeData,
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

interface InfoPanelProps {
  moleculeData: MoleculeData | null;
  showHydrogens: boolean;
  selectedBond: SelectedBondMeasurement | null;
  selectedAngle: SelectedAngleMeasurement | null;
  selectedDihedral: SelectedDihedralMeasurement | null;
  selectionMode: SelectionMode;
  selectionSummary: SelectionSummary;
  elementColorOverrides: ElementColorOverrides;
  atomSizeScale: number;
  onElementColorChange: (element: string, color: string) => void;
  onResetElementColor: (element: string) => void;
  onResetAllElementColors: () => void;
  onAtomSizeScaleChange: (scale: number) => void;
  error: string | null;
}

export function InfoPanel({
  moleculeData,
  showHydrogens,
  selectedBond,
  selectedAngle,
  selectedDihedral,
  selectionMode,
  selectionSummary,
  elementColorOverrides,
  atomSizeScale,
  onElementColorChange,
  onResetElementColor,
  onResetAllElementColors,
  onAtomSizeScaleChange,
  error,
}: InfoPanelProps) {
  const visibleAtoms = moleculeData
    ? moleculeData.atoms.filter((atom) => showHydrogens || atom.element !== 'H')
    : [];
  const visibleElements = Array.from(new Set(visibleAtoms.map((atom) => atom.element))).sort();
  const visibleBonds = moleculeData
    ? moleculeData.bonds.filter((bond) => {
        if (showHydrogens) return true;
        const atom1 = moleculeData.atoms[bond.atom1];
        const atom2 = moleculeData.atoms[bond.atom2];
        return atom1?.element !== 'H' && atom2?.element !== 'H';
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
            <span className="info-value">{showHydrogens ? 'Shown' : 'Hidden'}</span>
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
      {error && (
        <div className="error-message">
          <strong>Error</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="info-section">
        <h4>Molecule</h4>
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
            {!showHydrogens && ` / ${moleculeData.atoms.length.toLocaleString()}`}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">Bonds</span>
          <span className="info-value">
            {visibleBonds.length.toLocaleString()}
            {!showHydrogens && ` / ${moleculeData.bonds.length.toLocaleString()}`}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">Hydrogens</span>
          <span className="info-value">
            {showHydrogens ? 'Shown' : 'Hidden'}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">Engine</span>
          <span className="info-value" style={{ color: '#22c55e' }}>WebGL · Three.js</span>
        </div>
      </div>

      <div className="info-section">
        <h4>Measure</h4>
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
      </div>

      <div className="info-section">
        <h4>Style</h4>
        <div className="info-row">
          <span className="info-label">Hydrogens</span>
          <span className="info-value">{showHydrogens ? 'Shown' : 'Hidden'}</span>
        </div>
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
      </div>
    </div>
  );
}
