import type { SavedPose } from './types';

/**
 * Window-level commands exchanged between App/panels and MoleculeCanvas.
 * Centralizing the names and payload types keeps the implicit coupling
 * between dispatchers and listeners honest.
 */
export type CameraPresetId = 'front' | 'top' | 'right' | 'iso';

export interface CanvasEventPayloads {
  'reset-camera': undefined;
  'export-png': undefined;
  'clear-selection': undefined;
  'capture-camera-pose': { updatePoseId?: string } | undefined;
  'apply-camera-pose': SavedPose;
  'camera-preset': CameraPresetId;
  'camera-pose-captured': { updatePoseId?: string } & Omit<SavedPose, 'id' | 'name'>;
}

export type CanvasEventName = keyof CanvasEventPayloads;

export function dispatchCanvasEvent<Name extends CanvasEventName>(
  name: Name,
  ...detail: undefined extends CanvasEventPayloads[Name]
    ? [payload?: CanvasEventPayloads[Name]]
    : [payload: CanvasEventPayloads[Name]]
): void {
  window.dispatchEvent(new CustomEvent(name, { detail: detail[0] }));
}

/** Subscribe to a canvas event; returns an unsubscribe function. */
export function listenToCanvasEvent<Name extends CanvasEventName>(
  name: Name,
  handler: (detail: CanvasEventPayloads[Name]) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<CanvasEventPayloads[Name]>).detail);
  };
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}
