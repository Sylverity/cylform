import { useMemo, useState } from 'react';
import type {
  AtomStyleOverride,
  BondStyleOverride,
  BondStyleType,
  ElementColorOverrides,
  MaterialPresetId,
  MoleculeData,
  SelectionMode,
  SelectionSummary,
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

const LEGACY_ELEMENT_COLORS: Record<string, string> = {
  H: '#c8ccd0',
  C: '#129bdd',
  N: '#3f7fd6',
  O: '#e86a1a',
  F: '#6fcf80',
  P: '#f6a23a',
  S: '#d8a21e',
  Cl: '#45b86b',
  Br: '#a9492e',
  I: '#7f4a96',
};

const BOND_STYLE_OPTIONS: Array<{ value: BondStyleType; label: string }> = [
  { value: 'full', label: 'Full' },
  { value: 'ts', label: 'TS' },
  { value: 'dative', label: 'Dative' },
  { value: 'interaction', label: 'Interaction' },
  { value: 'thin', label: 'Thin' },
];

function defaultElementColor(element: string, materialPreset: MaterialPresetId): string {
  const colors = materialPreset === 'CYLviewLegacy' ? LEGACY_ELEMENT_COLORS : DEFAULT_ELEMENT_COLORS;
  return colors[element] ?? '#888888';
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
  hydrogenVisibility: 'shown' | 'hidden' | 'hide-c-h',
  hiddenAtomSet: Set<number>,
): boolean {
  const atom = moleculeData.atoms[atomIndex];
  if (!atom || hiddenAtomSet.has(atomIndex)) return false;
  if (hydrogenVisibility === 'hidden' && atom.element === 'H') return false;
  if (hydrogenVisibility === 'hide-c-h' && isCarbonHydrogen(atomIndex, moleculeData)) return false;
  return true;
}

interface AppearancePanelProps {
  moleculeData: MoleculeData | null;
  hydrogenVisibility: 'shown' | 'hidden' | 'hide-c-h';
  hiddenAtomIndices: number[];
  elementColorOverrides: ElementColorOverrides;
  atomStyleOverrides: Record<string, AtomStyleOverride>;
  bondStyleOverrides: Record<string, BondStyleOverride>;
  atomSizeScale: number;
  labelFontScale: number;
  bondSizeScale: number;
  materialPreset: MaterialPresetId;
  selectionMode: SelectionMode;
  selectionSummary: SelectionSummary;
  onElementColorChange: (element: string, color: string) => void;
  onResetElementColor: (element: string) => void;
  onResetAllElementColors: () => void;
  onAtomSizeScaleChange: (scale: number) => void;
  onLabelFontScaleChange: (scale: number) => void;
  onBondSizeScaleChange: (scale: number) => void;
  onStyleSelectedAtoms: (color: string) => void;
  onSizeSelectedAtoms: () => void;
  onResetSelectedAtomStyles: () => void;
  onRestyleSelectedBonds: (type: BondStyleType) => void;
  onResetSelectedBondStyles: () => void;
}

export function AppearancePanel({
  moleculeData,
  hydrogenVisibility,
  hiddenAtomIndices,
  elementColorOverrides,
  atomStyleOverrides,
  bondStyleOverrides,
  atomSizeScale,
  labelFontScale,
  bondSizeScale,
  materialPreset,
  selectionMode,
  selectionSummary,
  onElementColorChange,
  onResetElementColor,
  onResetAllElementColors,
  onAtomSizeScaleChange,
  onLabelFontScaleChange,
  onBondSizeScaleChange,
  onStyleSelectedAtoms,
  onSizeSelectedAtoms,
  onResetSelectedAtomStyles,
  onRestyleSelectedBonds,
  onResetSelectedBondStyles,
}: AppearancePanelProps) {
  const [bondStyleDraft, setBondStyleDraft] = useState<BondStyleType>('full');
  const visibleElements = useMemo(() => {
    if (!moleculeData) return [];
    const hiddenAtomSet = new Set(hiddenAtomIndices);
    return Array.from(new Set(
      moleculeData.atoms
        .filter((_, atomIndex) => isAtomVisible(atomIndex, moleculeData, hydrogenVisibility, hiddenAtomSet))
        .map((atom) => atom.element),
    )).sort();
  }, [hiddenAtomIndices, hydrogenVisibility, moleculeData]);

  const hasColorOverrides = Object.keys(elementColorOverrides).length > 0;
  const hasAtomStyleOverrides = Object.keys(atomStyleOverrides).length > 0;
  const hasBondStyleOverrides = Object.keys(bondStyleOverrides).length > 0;
  const canStyleSelectedAtoms = (
    (selectionMode === 'atom' || selectionMode === 'atom-bond') &&
    selectionSummary.atomCount > 0
  );
  const canStyleSelectedBonds = (
    (selectionMode === 'bond' || selectionMode === 'atom-bond') &&
    selectionSummary.bondCount > 0
  );
  const hasLocalStyles = hasAtomStyleOverrides || hasBondStyleOverrides;

  return (
    <aside className="appearance-options-panel" aria-label="Appearance options">
      <div className="view-panel-header">
        <span>Appearance</span>
        <span className="view-panel-status">Style</span>
      </div>

      <div className="view-split-row">
        <span>Atom size</span>
        <span>{atomSizeScale.toFixed(2)}x</span>
      </div>
      <input
        className="view-range"
        type="range"
        min="0.6"
        max="1.8"
        step="0.05"
        value={atomSizeScale}
        aria-label="Atom size"
        onChange={(event) => onAtomSizeScaleChange(Number(event.target.value))}
      />

      <div className="view-split-row">
        <span>Label size</span>
        <span>{labelFontScale.toFixed(2)}x</span>
      </div>
      <input
        className="view-range"
        type="range"
        min="0.75"
        max="1.5"
        step="0.05"
        value={labelFontScale}
        aria-label="Label font size"
        onChange={(event) => onLabelFontScaleChange(Number(event.target.value))}
      />

      <div className="view-split-row">
        <span>Bond size</span>
        <span>{bondSizeScale.toFixed(2)}x</span>
      </div>
      <input
        className="view-range"
        type="range"
        min="0.5"
        max="1.5"
        step="0.05"
        value={bondSizeScale}
        aria-label="Bond size"
        onChange={(event) => onBondSizeScaleChange(Number(event.target.value))}
      />

      <section className="appearance-section">
        <div className="view-split-row">
          <span>Element colours</span>
          {hasColorOverrides && (
            <button type="button" className="appearance-mini-button" onClick={onResetAllElementColors}>
              Reset all
            </button>
          )}
        </div>
        {visibleElements.length === 0 ? (
          <p className="appearance-note">Load a molecule to edit element colours.</p>
        ) : (
          <div className="appearance-color-list">
            {visibleElements.map((element) => {
              const color = elementColorOverrides[element] ?? defaultElementColor(element, materialPreset);
              const isCustom = Boolean(elementColorOverrides[element]);

              return (
                <div key={element} className="appearance-color-row">
                  <span className="appearance-color-label">{element}</span>
                  <input
                    className="appearance-color-input"
                    type="color"
                    value={color}
                    onChange={(event) => onElementColorChange(element, event.target.value)}
                    aria-label={`${element} colour`}
                  />
                  <span className={isCustom ? 'appearance-color-status custom' : 'appearance-color-status'}>
                    {isCustom ? color.toUpperCase() : 'Default'}
                  </span>
                  {isCustom && (
                    <button type="button" className="appearance-mini-button" onClick={() => onResetElementColor(element)}>
                      Reset
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {canStyleSelectedAtoms && (
        <section className="appearance-section">
          <div className="view-split-row">
            <span>Selected atoms</span>
            <span className="appearance-color-status">{selectionSummary.atomCount} selected</span>
          </div>
          <div className="appearance-selected-row">
            <input
              className="appearance-color-input"
              type="color"
              value="#10b981"
              onChange={(event) => onStyleSelectedAtoms(event.target.value)}
              aria-label="Selected atom colour"
              title="Colour selected atoms"
            />
            <button type="button" className="appearance-mini-button" onClick={onSizeSelectedAtoms}>
              Size
            </button>
            <button type="button" className="appearance-mini-button" onClick={onResetSelectedAtomStyles}>
              Reset
            </button>
          </div>
        </section>
      )}

      {canStyleSelectedBonds && (
        <section className="appearance-section">
          <div className="view-split-row">
            <span>Selected bonds</span>
            <span className="appearance-color-status">{selectionSummary.bondCount} selected</span>
          </div>
          <div className="appearance-bond-style">
            <select
              value={bondStyleDraft}
              onChange={(event) => {
                setBondStyleDraft(event.target.value as BondStyleType);
                onRestyleSelectedBonds(event.target.value as BondStyleType);
              }}
              aria-label="Bond style"
            >
              {BOND_STYLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="appearance-action-row">
            <button type="button" className="appearance-mini-button" onClick={onResetSelectedBondStyles}>
              Reset bond styles
            </button>
          </div>
        </section>
      )}

      {hasLocalStyles && !canStyleSelectedAtoms && !canStyleSelectedBonds && (
        <section className="appearance-section">
          <div className="appearance-action-row">
            <button type="button" className="appearance-mini-button" onClick={onResetSelectedAtomStyles}>
              Reset atom styles
            </button>
            <button type="button" className="appearance-mini-button" onClick={onResetSelectedBondStyles}>
              Reset bond styles
            </button>
          </div>
        </section>
      )}
    </aside>
  );
}
