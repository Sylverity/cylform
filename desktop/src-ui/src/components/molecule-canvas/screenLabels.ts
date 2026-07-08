import { Vector3, type Camera } from 'three';
import { formatAngle, formatDistance } from '../../domain/measurements';
import { labelSourceVisible } from '../../domain/visibility';
import type { MoleculeVisibilityIndex, SceneCtx } from './types';
import type {
  HydrogenVisibility,
  MoleculeData,
  PersistentLabel,
  RenderProfileId,
} from '../../types';

export interface ScreenOverlayElements {
  bondLabel: HTMLDivElement | null;
  angleLabel: HTMLDivElement | null;
  dihedralLabel: HTMLDivElement | null;
  linkCanvas: HTMLCanvasElement | null;
  labelElements: Map<string, HTMLDivElement>;
}

export interface ScreenOverlayState {
  persistentLabels: PersistentLabel[];
  moleculeData: MoleculeData | null;
  hydrogenVisibility: HydrogenVisibility;
  hiddenAtomIndices: number[];
  visibilityIndex: MoleculeVisibilityIndex | null;
  showLabelLinkLines: boolean;
  renderProfile: RenderProfileId;
  distancePrecision: number;
  anglePrecision: number;
  useSymbolUnits: boolean;
}

/**
 * Position the HTML measurement labels, persistent label elements, and
 * the label link-line canvas over the WebGL viewport. Runs once per
 * animation frame.
 */
export function updateScreenOverlays(
  ctx: SceneCtx,
  activeCamera: Camera,
  elements: ScreenOverlayElements,
  state: ScreenOverlayState,
): void {
  const { renderer } = ctx;
  const { bondLabel, angleLabel, dihedralLabel, linkCanvas, labelElements } = elements;

  const selectedBond = ctx.selectedBondData;
  if (bondLabel && selectedBond) {
    const projected = selectedBond.midpoint.clone().project(activeCamera);
    const x = ((projected.x + 1) / 2) * renderer.domElement.clientWidth;
    const y = ((-projected.y + 1) / 2) * renderer.domElement.clientHeight;
    const visible = projected.z >= -1 && projected.z <= 1;

    bondLabel.style.display = visible ? 'block' : 'none';
    bondLabel.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    bondLabel.textContent = formatDistance(selectedBond.distance, state.distancePrecision, state.useSymbolUnits);
  } else if (bondLabel) {
    bondLabel.style.display = 'none';
  }

  const anglePosition = ctx.angleLabelPosition;
  const angleDegrees = ctx.angleDegrees;
  if (angleLabel && anglePosition && typeof angleDegrees === 'number') {
    const projected = anglePosition.clone().project(activeCamera);
    const x = ((projected.x + 1) / 2) * renderer.domElement.clientWidth;
    const y = ((-projected.y + 1) / 2) * renderer.domElement.clientHeight;
    const visible = projected.z >= -1 && projected.z <= 1;

    angleLabel.style.display = visible ? 'block' : 'none';
    angleLabel.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    angleLabel.textContent = formatAngle(angleDegrees, state.anglePrecision, state.useSymbolUnits);
  } else if (angleLabel) {
    angleLabel.style.display = 'none';
  }

  const dihedralPosition = ctx.dihedralLabelPosition;
  const dihedralDegrees = ctx.dihedralDegrees;
  if (dihedralLabel && dihedralPosition && typeof dihedralDegrees === 'number') {
    const projected = dihedralPosition.clone().project(activeCamera);
    const x = ((projected.x + 1) / 2) * renderer.domElement.clientWidth;
    const y = ((-projected.y + 1) / 2) * renderer.domElement.clientHeight;
    const visible = projected.z >= -1 && projected.z <= 1;

    dihedralLabel.style.display = visible ? 'block' : 'none';
    dihedralLabel.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    dihedralLabel.textContent = formatAngle(dihedralDegrees, state.anglePrecision, state.useSymbolUnits);
  } else if (dihedralLabel) {
    dihedralLabel.style.display = 'none';
  }

  const hiddenAtomSet = new Set(state.hiddenAtomIndices);

  for (const label of state.persistentLabels) {
    const labelElement = labelElements.get(label.id);
    if (!labelElement) continue;
    if (
      !label.visible ||
      !labelSourceVisible(
        label,
        state.moleculeData,
        state.hydrogenVisibility,
        hiddenAtomSet,
        state.visibilityIndex,
      )
    ) {
      labelElement.style.display = 'none';
      continue;
    }

    const projected = new Vector3(label.anchor.x, label.anchor.y, label.anchor.z)
      .project(activeCamera);
    const x = ((projected.x + 1) / 2) * renderer.domElement.clientWidth;
    const y = ((-projected.y + 1) / 2) * renderer.domElement.clientHeight;
    const visible = projected.z >= -1 && projected.z <= 1;

    labelElement.style.display = visible ? 'block' : 'none';
    labelElement.style.transform = `translate(-50%, -100%) translate(${x}px, ${y - 10}px)`;
  }

  if (linkCanvas && state.showLabelLinkLines) {
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    if (linkCanvas.width !== w || linkCanvas.height !== h) {
      linkCanvas.width = w;
      linkCanvas.height = h;
    }
    const ctx2d = linkCanvas.getContext('2d');
    if (ctx2d) {
      ctx2d.clearRect(0, 0, w, h);
      ctx2d.setLineDash([4, 3]);
      ctx2d.strokeStyle = state.renderProfile === 'houkmol'
        ? 'rgba(0, 0, 0, 0.72)'
        : 'rgba(180, 160, 120, 0.5)';
      ctx2d.lineWidth = 1;
      for (const label of state.persistentLabels) {
        if (!label.visible) continue;
        const projected = new Vector3(label.anchor.x, label.anchor.y, label.anchor.z)
          .project(activeCamera);
        const x = ((projected.x + 1) / 2) * w;
        const y = ((-projected.y + 1) / 2) * h;
        if (projected.z < -1 || projected.z > 1) continue;
        ctx2d.beginPath();
        ctx2d.moveTo(x, y);
        ctx2d.lineTo(x, y - 10);
        ctx2d.stroke();
      }
    }
  } else if (linkCanvas) {
    const ctx2d = linkCanvas.getContext('2d');
    if (ctx2d) ctx2d.clearRect(0, 0, linkCanvas.width, linkCanvas.height);
  }
}
