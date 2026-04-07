import type {
  MoleculeData,
  SelectedAngleMeasurement,
  SelectedBondMeasurement,
} from '../App';

interface InfoPanelProps {
  moleculeData: MoleculeData | null;
  showHydrogens: boolean;
  selectedBond: SelectedBondMeasurement | null;
  selectedAngle: SelectedAngleMeasurement | null;
  error: string | null;
}

export function InfoPanel({
  moleculeData,
  showHydrogens,
  selectedBond,
  selectedAngle,
  error,
}: InfoPanelProps) {
  const visibleAtoms = moleculeData
    ? moleculeData.atoms.filter((atom) => showHydrogens || atom.element !== 'H')
    : [];
  const visibleBonds = moleculeData
    ? moleculeData.bonds.filter((bond) => {
        if (showHydrogens) return true;
        const atom1 = moleculeData.atoms[bond.atom1];
        const atom2 = moleculeData.atoms[bond.atom2];
        return atom1?.element !== 'H' && atom2?.element !== 'H';
      })
    : [];

  if (error) {
    return (
      <div className="info-panel">
        <div className="error-message">
          <strong>Error</strong>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!moleculeData) {
    return (
      <div className="info-panel">
        <div className="info-section">
          <h4>Welcome</h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6' }}>
            CYLview-NG — molecular visualization tool.
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginTop: '12px' }}>
            Click "Open File" to load a molecule (XYZ, PDB supported).
          </p>
        </div>

        <div className="info-section">
          <h4>Controls</h4>
          <div className="info-row">
            <span className="info-label">Rotate</span>
            <span className="info-value">Left drag</span>
          </div>
          <div className="info-row">
            <span className="info-label">Pan</span>
            <span className="info-value">Right drag</span>
          </div>
          <div className="info-row">
            <span className="info-label">Zoom</span>
            <span className="info-value">Scroll</span>
          </div>
          <div className="info-row">
            <span className="info-label">Reset</span>
            <span className="info-value">R key</span>
          </div>
        </div>
      </div>
    );
  }

  const anglePrompt =
    selectedAngle?.stage === 1
      ? `First atom: ${selectedAngle.atomElements[0]}`
      : selectedAngle?.stage === 2
        ? `Next: ${selectedAngle.atomElements[0]}-${selectedAngle.atomElements[1]}-?`
        : selectedAngle
          ? `${selectedAngle.angleDegrees.toFixed(2)} deg`
          : 'Click three atoms';

  return (
    <div className="info-panel">
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
      </div>

      <div className="info-section">
        <h4>Controls</h4>
        <div className="info-row">
          <span className="info-label">Rotate</span>
          <span className="info-value">Left drag</span>
        </div>
        <div className="info-row">
          <span className="info-label">Pan</span>
          <span className="info-value">Right drag</span>
        </div>
        <div className="info-row">
          <span className="info-label">Zoom</span>
          <span className="info-value">Scroll</span>
        </div>
        <div className="info-row">
          <span className="info-label">Reset</span>
          <span className="info-value">R key</span>
        </div>
      </div>

      <div className="info-section">
        <h4>Renderer</h4>
        <div className="info-row">
          <span className="info-label">Engine</span>
          <span className="info-value" style={{ color: '#22c55e' }}>WebGL · Three.js</span>
        </div>
      </div>

      <div className="info-section">
        <h4>Selection</h4>
        <div className="info-row">
          <span className="info-label">Bond</span>
          <span className="info-value">
            {!selectedAngle && selectedBond
              ? `${selectedBond.atom1Element}-${selectedBond.atom2Element}`
              : 'None'}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">Distance</span>
          <span className="info-value">
            {!selectedAngle && selectedBond ? `${selectedBond.distance.toFixed(2)} A` : 'Click bond'}
          </span>
        </div>
      </div>

      <div className="info-section">
        <h4>Angle</h4>
        <div className="info-row">
          <span className="info-label">Atoms</span>
          <span className="info-value">
            {selectedAngle
              ? selectedAngle.stage === 1
                ? `${selectedAngle.atomElements[0]}`
                : selectedAngle.stage === 2
                  ? `${selectedAngle.atomElements[0]}-${selectedAngle.atomElements[1]}`
                  : selectedAngle.atomElements.join('-')
              : 'None'}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">Value</span>
          <span className="info-value">
            {anglePrompt}
          </span>
        </div>
      </div>
    </div>
  );
}
