import type { MoleculeInfo } from '../App';

interface InfoPanelProps {
  moleculeInfo: MoleculeInfo | null;
  error: string | null;
}

export function InfoPanel({ moleculeInfo, error }: InfoPanelProps) {
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

  if (!moleculeInfo) {
    return (
      <div className="info-panel">
        <div className="info-section">
          <h4>Welcome</h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6' }}>
            CYLview-NG is a GPU-native molecular visualization tool.
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginTop: '12px' }}>
            Click "Open File" to load a molecule (XYZ, PDB, SDF formats supported).
          </p>
        </div>
        
        <div className="info-section">
          <h4>Controls</h4>
          <div className="info-row">
            <span className="info-label">Rotate</span>
            <span className="info-value">Left click + drag</span>
          </div>
          <div className="info-row">
            <span className="info-label">Pan</span>
            <span className="info-value">Right click + drag</span>
          </div>
          <div className="info-row">
            <span className="info-label">Zoom</span>
            <span className="info-value">Scroll wheel</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="info-panel">
      <div className="info-section">
        <h4>Molecule Info</h4>
        <div className="info-row">
          <span className="info-label">Name</span>
          <span className="info-value">{moleculeInfo.name}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Atoms</span>
          <span className="info-value">{moleculeInfo.atomCount.toLocaleString()}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Bonds</span>
          <span className="info-value">{moleculeInfo.bondCount.toLocaleString()}</span>
        </div>
      </div>
      
      <div className="info-section">
        <h4>Controls</h4>
        <div className="info-row">
          <span className="info-label">Rotate</span>
          <span className="info-value">Left click + drag</span>
        </div>
        <div className="info-row">
          <span className="info-label">Pan</span>
          <span className="info-value">Right click + drag</span>
        </div>
        <div className="info-row">
          <span className="info-label">Zoom</span>
          <span className="info-value">Scroll wheel</span>
        </div>
        <div className="info-row">
          <span className="info-label">Reset</span>
          <span className="info-value">R key</span>
        </div>
      </div>
      
      <div className="info-section">
        <h4>Status</h4>
        <div className="info-row">
          <span className="info-label">Renderer</span>
          <span className="info-value" style={{ color: '#22c55e' }}>Active</span>
        </div>
      </div>
    </div>
  );
}
