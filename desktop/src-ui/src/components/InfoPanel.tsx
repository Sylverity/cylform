import type { MoleculeData } from '../App';

interface InfoPanelProps {
  moleculeData: MoleculeData | null;
  error: string | null;
}

export function InfoPanel({ moleculeData, error }: InfoPanelProps) {
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
          <span className="info-value">{moleculeData.atoms.length.toLocaleString()}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Bonds</span>
          <span className="info-value">{moleculeData.bonds.length.toLocaleString()}</span>
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
    </div>
  );
}
